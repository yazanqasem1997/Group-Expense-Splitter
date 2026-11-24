import type { Request, Response } from "express";
import { and, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { db, pool, idempotencyKeysTable } from "@workspace/db";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How long to consider a pending reservation stale (crashed worker). */
const LOCK_TTL_MS = 30_000;

/** How long to wait between poll attempts while another worker holds the lock. */
const POLL_INTERVAL_MS = 150;

/** Maximum total time a waiter will poll before giving up with 409. */
const POLL_TIMEOUT_MS = 29_000;

// ---------------------------------------------------------------------------
// Public helpers (used by tests / other modules)
// ---------------------------------------------------------------------------

export function getIdempotencyKey(req: Request): string | null {
  const raw = req.header("Idempotency-Key");
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Internal reservation helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to atomically claim a pending reservation for (userId, key, method,
 * path).  Uses a raw pool client so the INSERT is never nested inside a
 * handler-level `db.transaction()`, which would make it invisible to concurrent
 * connections until the outer transaction committed.
 *
 * Returns:
 *   - `{ owned: true }`  – this caller owns the reservation; it must call
 *     `finaliseReservation` when done.
 *   - `{ owned: false, completed: { status, body } }` – a completed response
 *     was already stored; replay it.
 *   - `{ owned: false, completed: null }` – another worker owns a live pending
 *     reservation; the caller should poll.
 */
async function tryReserve(
  client: PoolClient,
  userId: string,
  key: string,
  method: string,
  path: string,
): Promise<
  | { owned: true }
  | { owned: false; completed: { status: number; body: unknown } | null }
> {
  // Step 1: attempt to INSERT the pending placeholder.
  // ON CONFLICT DO NOTHING means only the first concurrent caller wins.
  const insertRes = await client.query<{ id: string }>(
    `INSERT INTO idempotency_keys (user_id, key, method, path, locked_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ON CONSTRAINT idempotency_user_key_uq DO NOTHING
     RETURNING id`,
    [userId, key, method, path],
  );

  if (insertRes.rowCount === 1) {
    // We own the reservation.
    return { owned: true };
  }

  // Step 2: someone else already has a row.  Read its current state.
  const selectRes = await client.query<{
    response_status: number | null;
    response_body: unknown;
    locked_at: Date | null;
  }>(
    `SELECT response_status, response_body, locked_at
     FROM idempotency_keys
     WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4
     LIMIT 1`,
    [userId, key, method, path],
  );

  const row = selectRes.rows[0];
  if (!row) {
    // Extremely unlikely (deleted between the two queries); let the caller retry.
    return { owned: false, completed: null };
  }

  if (row.response_status != null) {
    // Already completed – replay.
    return {
      owned: false,
      completed: { status: row.response_status, body: row.response_body },
    };
  }

  // Pending.  Check for stale lock.
  if (row.locked_at) {
    const ageMs = Date.now() - row.locked_at.getTime();
    if (ageMs > LOCK_TTL_MS) {
      // Steal the stale reservation by updating locked_at to NOW().
      // Use a conditional UPDATE so only one concurrent stealer wins.
      // Compare at millisecond precision: JS Date loses sub-ms precision on
      // round-trip through pg, so exact equality fails for microsecond-precise
      // DB timestamps.
      const stealRes = await client.query<{ id: string }>(
        `UPDATE idempotency_keys
         SET locked_at = NOW()
         WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4
           AND date_trunc('milliseconds', locked_at) = date_trunc('milliseconds', $5::timestamptz)
           AND response_status IS NULL
         RETURNING id`,
        [userId, key, method, path, row.locked_at],
      );
      if ((stealRes.rowCount ?? 0) === 1) {
        return { owned: true };
      }
      // Another stealer won; fall through to poll.
    }
  }

  return { owned: false, completed: null };
}

/**
 * Write the final response into the reservation row and clear the lock.
 * Must be called on the same pool client used for `tryReserve`.
 */
async function finaliseReservation(
  client: PoolClient,
  userId: string,
  key: string,
  method: string,
  path: string,
  status: number,
  body: unknown,
): Promise<void> {
  await client.query(
    `UPDATE idempotency_keys
     SET response_status = $5,
         response_body   = $6,
         locked_at       = NULL
     WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4`,
    [userId, key, method, path, status, JSON.stringify(body)],
  );
}

/**
 * Poll until another worker completes (or goes stale) the pending reservation
 * for this key.  Returns the completed response, or null if we timed out.
 */
async function waitForCompletion(
  userId: string,
  key: string,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown } | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const rows = await db
      .select({
        responseStatus: idempotencyKeysTable.responseStatus,
        responseBody: idempotencyKeysTable.responseBody,
        lockedAt: idempotencyKeysTable.lockedAt,
      })
      .from(idempotencyKeysTable)
      .where(
        and(
          eq(idempotencyKeysTable.userId, userId),
          eq(idempotencyKeysTable.key, key),
          eq(idempotencyKeysTable.method, method),
          eq(idempotencyKeysTable.path, path),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null; // deleted; caller should re-try from scratch

    if (row.responseStatus != null) {
      return { status: row.responseStatus, body: row.responseBody };
    }

    // Still pending – check for stale lock; if stale, try to steal on next loop.
    if (row.lockedAt) {
      const ageMs = Date.now() - row.lockedAt.getTime();
      if (ageMs > LOCK_TTL_MS) {
        // Re-enter the reservation race.
        return null;
      }
    }
  }
  return null; // timed out
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a previously-completed idempotent response for (user, key, method,
 * path).  Returns the cached response envelope if found, else null.
 *
 * NOTE: prefer `withIdempotency` for write handlers – it also handles the
 * concurrent-in-flight case.  This function is useful for read-only probes.
 */
export async function lookupIdempotent(
  userId: string,
  key: string,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown } | null> {
  const existing = await db
    .select()
    .from(idempotencyKeysTable)
    .where(
      and(
        eq(idempotencyKeysTable.userId, userId),
        eq(idempotencyKeysTable.key, key),
        eq(idempotencyKeysTable.method, method),
        eq(idempotencyKeysTable.path, path),
        isNotNull(idempotencyKeysTable.responseStatus),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (!row || row.responseStatus == null) return null;
  return { status: row.responseStatus, body: row.responseBody };
}

/**
 * Persist an idempotent response envelope directly (no pending phase).
 *
 * @deprecated Use `withIdempotency` for write handlers which provides
 * race-safe reservation.  This helper is kept for backward compatibility with
 * any external callers but should not be used in new code.
 */
export async function storeIdempotent(
  userId: string,
  key: string,
  method: string,
  path: string,
  status: number,
  body: unknown,
): Promise<void> {
  await db
    .insert(idempotencyKeysTable)
    .values({
      userId,
      key,
      method,
      path,
      responseStatus: status,
      responseBody: body as never,
    })
    .onConflictDoNothing({
      target: [
        idempotencyKeysTable.userId,
        idempotencyKeysTable.key,
        idempotencyKeysTable.method,
        idempotencyKeysTable.path,
      ],
    });
}

/**
 * Wraps a write handler with race-safe idempotency.
 *
 * Protocol (atomic pending-reservation):
 *   1. If no Idempotency-Key header is present, execute the handler normally.
 *   2. INSERT a pending row (responseStatus = NULL, lockedAt = NOW()) atomically.
 *      Only the first concurrent request for a given key wins the INSERT.
 *   3. Winner executes the handler, then UPDATEs the row with the real response.
 *   4. Losers poll until the row is completed, then replay the stored response.
 *   5. If the winning request crashes, its lock goes stale after LOCK_TTL_MS and
 *      the next poller can steal the reservation and re-run the handler.
 *
 * Handler-level `db.transaction()` calls are safe because the reservation
 * INSERT/UPDATE use a *separate* raw pool connection, so they are always
 * immediately visible to other connections regardless of outer transaction state.
 *
 * Usage:
 *   await withIdempotency(req, res, async (record) => {
 *     const created = await db.transaction(async (tx) => { ... });
 *     record(201, payload);
 *     res.status(201).json(payload);
 *   });
 */
export async function withIdempotency(
  req: Request,
  res: Response,
  handler: (record: (status: number, body: unknown) => void) => Promise<void>,
): Promise<void> {
  const key = getIdempotencyKey(req);
  const userId = req.localUser!.id;
  const method = req.method;
  const reqPath = req.baseUrl + req.path;

  // No idempotency key – execute normally.
  if (!key) {
    const noop = (_s: number, _b: unknown): void => {};
    await handler(noop);
    return;
  }

  // Reservation loop: handles the stale-lock steal path where we may need to
  // retry the reservation after losing a steal race.
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await pool.connect();
    let owned = false;
    try {
      const result = await tryReserve(client, userId, key, method, reqPath);

      if (!result.owned) {
        if (result.completed) {
          // Fast path: already done, replay immediately.
          res.status(result.completed.status).json(result.completed.body);
          return;
        }
        // Another worker holds a live pending lock – poll for completion.
        const completed = await waitForCompletion(
          userId,
          key,
          method,
          reqPath,
        );
        if (completed) {
          res.status(completed.status).json(completed.body);
          return;
        }
        // Timed out or lock went stale – retry the reservation loop.
        continue;
      }

      owned = true;

      // We own the reservation.  Run the handler.
      let captured: { status: number; body: unknown } | null = null;
      const record = (status: number, body: unknown): void => {
        captured = { status, body };
      };

      try {
        await handler(record);
      } catch (handlerErr) {
        // Handler threw – delete the reservation so retries can re-run cleanly.
        try {
          await client.query(
            `DELETE FROM idempotency_keys
             WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4
               AND response_status IS NULL`,
            [userId, key, method, reqPath],
          );
        } catch {
          // Best-effort cleanup; stale-lock recovery will handle it otherwise.
        }
        throw handlerErr;
      }

      if (captured) {
        const c = captured as { status: number; body: unknown };
        await finaliseReservation(
          client,
          userId,
          key,
          method,
          reqPath,
          c.status,
          c.body,
        );
      } else {
        // Handler ran but never called record() – release the pending lock
        // without storing a result so future retries can re-run.
        try {
          await client.query(
            `DELETE FROM idempotency_keys
             WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4
               AND response_status IS NULL`,
            [userId, key, method, reqPath],
          );
        } catch {
          // Best-effort.
        }
      }
      return;
    } finally {
      client.release();
    }
  }

  // All reservation attempts exhausted (extremely unlikely in practice).
  res.status(409).json({
    error: "Concurrent request with the same Idempotency-Key is still in flight. Retry shortly.",
  });
}
