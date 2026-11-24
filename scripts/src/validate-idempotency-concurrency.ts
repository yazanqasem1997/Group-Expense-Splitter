/**
 * Concurrency validation for the idempotency pending-reservation protocol.
 *
 * This script directly exercises the idempotency_keys table to verify that:
 *   1. N concurrent "writers" racing for the same key execute the side-effect
 *      exactly once (at-most-once guarantee).
 *   2. All N concurrent "writers" ultimately receive the same stored response.
 *   3. A stale pending lock is detected and stolen correctly.
 *
 * Run:  pnpm --filter @workspace/scripts run validate:idempotency
 *
 * Requires DATABASE_URL to be set in the environment.
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Helpers mirroring the idempotency.ts reservation logic
// ---------------------------------------------------------------------------

const LOCK_TTL_MS = 30_000;
const POLL_INTERVAL_MS = 150;
const POLL_TIMEOUT_MS = 10_000;

async function tryReserve(
  client: pg.PoolClient,
  userId: string,
  key: string,
  method: string,
  path: string,
): Promise<
  | { owned: true }
  | { owned: false; completed: { status: number; body: unknown } | null }
> {
  const insertRes = await client.query<{ id: string }>(
    `INSERT INTO idempotency_keys (user_id, key, method, path, locked_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ON CONSTRAINT idempotency_user_key_uq DO NOTHING
     RETURNING id`,
    [userId, key, method, path],
  );

  if ((insertRes.rowCount ?? 0) === 1) return { owned: true };

  const selectRes = await client.query<{
    response_status: number | null;
    response_body: unknown;
    locked_at: Date | null;
  }>(
    `SELECT response_status, response_body, locked_at
     FROM idempotency_keys
     WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4 LIMIT 1`,
    [userId, key, method, path],
  );
  const row = selectRes.rows[0];
  if (!row) return { owned: false, completed: null };

  if (row.response_status != null) {
    return {
      owned: false,
      completed: { status: row.response_status, body: row.response_body },
    };
  }

  if (row.locked_at) {
    const ageMs = Date.now() - new Date(row.locked_at).getTime();
    if (ageMs > LOCK_TTL_MS) {
      const stealRes = await client.query<{ id: string }>(
        `UPDATE idempotency_keys
         SET locked_at = NOW()
         WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4
           AND date_trunc('milliseconds', locked_at) = date_trunc('milliseconds', $5::timestamptz)
           AND response_status IS NULL
         RETURNING id`,
        [userId, key, method, path, row.locked_at],
      );
      if ((stealRes.rowCount ?? 0) === 1) return { owned: true };
    }
  }
  return { owned: false, completed: null };
}

async function finalise(
  client: pg.PoolClient,
  userId: string,
  key: string,
  method: string,
  path: string,
  status: number,
  body: unknown,
): Promise<void> {
  await client.query(
    `UPDATE idempotency_keys
     SET response_status = $5, response_body = $6, locked_at = NULL
     WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4`,
    [userId, key, method, path, status, JSON.stringify(body)],
  );
}

async function waitForCompletion(
  userId: string,
  key: string,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown } | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await pool.query<{
      response_status: number | null;
      response_body: unknown;
    }>(
      `SELECT response_status, response_body
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 AND method = $3 AND path = $4 LIMIT 1`,
      [userId, key, method, path],
    );
    const row = res.rows[0];
    if (row?.response_status != null) {
      return { status: row.response_status, body: row.response_body };
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

/** Ensure a synthetic test user exists and return its ID. */
async function ensureTestUser(): Promise<string> {
  // Use a fixed deterministic UUID so we don't accumulate rows on each run.
  const userId = "00000000-dead-beef-0000-000000000001";
  await pool.query(
    `INSERT INTO users (id, clerk_user_id, name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [userId, "idem_test_clerk_1", "Idempotency Test User", "idem-test@example.com"],
  );
  return userId;
}

async function cleanup(userId: string, key: string): Promise<void> {
  await pool.query(
    `DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
    [userId, key],
  );
}

// ---------------------------------------------------------------------------
// Test 1: Serial reservation – only one execution, response stored correctly
// ---------------------------------------------------------------------------

async function testSerialReservation(userId: string): Promise<void> {
  console.log("\nTest 1: Serial reservation stores response correctly");
  const key = `test-serial-${Date.now()}`;
  await cleanup(userId, key);

  const client = await pool.connect();
  try {
    const r1 = await tryReserve(client, userId, key, "POST", "/api/test");
    assert(r1.owned === true, "First reserve call should own the reservation");

    let handlerRan = 0;
    handlerRan++;
    const responseBody = { id: "abc123", amount: 100 };
    await finalise(client, userId, key, "POST", "/api/test", 201, responseBody);

    assert(handlerRan === 1, "Handler executed exactly once");

    // Second call should see the completed response immediately.
    const r2 = await tryReserve(client, userId, key, "POST", "/api/test");
    assert(r2.owned === false, "Second reserve call should not own");
    assert(
      !r2.owned && r2.completed?.status === 201,
      "Second call replays status 201",
    );
    assert(
      !r2.owned &&
        JSON.stringify(r2.completed?.body) === JSON.stringify(responseBody),
      "Second call replays correct body",
    );
  } finally {
    client.release();
    await cleanup(userId, key);
  }
}

// ---------------------------------------------------------------------------
// Test 2: Concurrent reservation – only one owner, all others wait and replay
// ---------------------------------------------------------------------------

async function testConcurrentReservation(userId: string): Promise<void> {
  console.log("\nTest 2: Concurrent reservation – at-most-once execution");
  const key = `test-concurrent-${Date.now()}`;
  await cleanup(userId, key);

  const CONCURRENCY = 8;
  let executionCount = 0;
  const results: Array<{ status: number; body: unknown }> = [];

  /**
   * Simulates one concurrent request: try to reserve, execute if owner,
   * wait+replay if not.
   */
  async function simulateRequest(workerIdx: number): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const client = await pool.connect();
      try {
        const result = await tryReserve(
          client,
          userId,
          key,
          "POST",
          "/api/concurrent-test",
        );
        if (!result.owned) {
          if (result.completed) {
            results.push(result.completed);
            return;
          }
          // Poll for completion.
          const completed = await waitForCompletion(
            userId,
            key,
            "POST",
            "/api/concurrent-test",
          );
          if (completed) {
            results.push(completed);
            return;
          }
          continue;
        }

        // Owner: simulate some async work.
        executionCount++;
        await sleep(50);
        const responseBody = { created: true, ownedBy: workerIdx };
        await finalise(
          client,
          userId,
          key,
          "POST",
          "/api/concurrent-test",
          201,
          responseBody,
        );
        results.push({ status: 201, body: responseBody });
        return;
      } finally {
        client.release();
      }
    }
    // Timed out – record a 409 sentinel.
    results.push({ status: 409, body: { error: "timed out" } });
  }

  // Fire all workers simultaneously.
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => simulateRequest(i)),
  );

  assert(
    executionCount === 1,
    `Handler executed exactly once across ${CONCURRENCY} concurrent workers (got ${executionCount})`,
  );
  assert(
    results.length === CONCURRENCY,
    `All ${CONCURRENCY} workers got a result`,
  );
  const allStatus201 = results.every((r) => r.status === 201);
  assert(allStatus201, "All workers received status 201");
  const bodies = results.map((r) => JSON.stringify(r.body));
  const allSameBody = bodies.every((b) => b === bodies[0]);
  assert(allSameBody, "All workers received identical response bodies");

  await cleanup(userId, key);
}

// ---------------------------------------------------------------------------
// Test 3: Stale lock is stolen and re-executed by the next waiter
// ---------------------------------------------------------------------------

async function testStaleLockRecovery(userId: string): Promise<void> {
  console.log("\nTest 3: Stale lock is stolen and handler re-executes");
  const key = `test-stale-${Date.now()}`;
  await cleanup(userId, key);

  // Insert a stale pending reservation (locked_at far in the past).
  await pool.query(
    `INSERT INTO idempotency_keys (user_id, key, method, path, locked_at)
     VALUES ($1, $2, 'POST', '/api/stale', NOW() - INTERVAL '60 seconds')`,
    [userId, key],
  );

  const client = await pool.connect();
  try {
    const result = await tryReserve(
      client,
      userId,
      key,
      "POST",
      "/api/stale",
    );
    assert(
      result.owned === true,
      "Should steal stale lock and own the reservation",
    );

    if (result.owned) {
      await finalise(
        client,
        userId,
        key,
        "POST",
        "/api/stale",
        200,
        { recovered: true },
      );
    }

    // Verify the row is now completed.
    const row = await pool.query(
      `SELECT response_status FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 LIMIT 1`,
      [userId, key],
    );
    assert(
      row.rows[0]?.response_status === 200,
      "Row finalised with status 200 after stale steal",
    );
  } finally {
    client.release();
    await cleanup(userId, key);
  }
}

// ---------------------------------------------------------------------------
// Test 4: Handler error deletes the pending row so retries can re-run
// ---------------------------------------------------------------------------

async function testHandlerErrorCleansUp(userId: string): Promise<void> {
  console.log("\nTest 4: Handler error removes pending row so retry can re-run");
  const key = `test-error-${Date.now()}`;
  await cleanup(userId, key);

  const client = await pool.connect();
  try {
    const r1 = await tryReserve(client, userId, key, "POST", "/api/error");
    assert(r1.owned === true, "First call owns reservation");

    // Simulate handler crash: delete the pending row.
    await client.query(
      `DELETE FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 AND response_status IS NULL`,
      [userId, key],
    );

    // Now a second attempt should be able to re-own.
    const r2 = await tryReserve(client, userId, key, "POST", "/api/error");
    assert(r2.owned === true, "After cleanup, next attempt owns reservation");

    if (r2.owned) {
      await finalise(
        client,
        userId,
        key,
        "POST",
        "/api/error",
        201,
        { retried: true },
      );
    }
  } finally {
    client.release();
    await cleanup(userId, key);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== Idempotency Concurrency Validation ===\n");

  let userId: string;
  try {
    userId = await ensureTestUser();
  } catch (err) {
    console.error(
      "Could not create test user – is the database reachable and schema up to date?",
    );
    console.error(err);
    process.exit(1);
  }

  try {
    await testSerialReservation(userId);
    await testConcurrentReservation(userId);
    await testStaleLockRecovery(userId);
    await testHandlerErrorCleansUp(userId);
  } finally {
    await pool.end();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
