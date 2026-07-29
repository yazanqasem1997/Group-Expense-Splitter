import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

/**
 * The authenticated local user is attached to the request by `requireAuth`.
 * Handlers can safely read `req.localUser` after the middleware runs.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      localUser?: User;
    }
  }
}

const AVATAR_COLORS = [
  "#6366F1",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EF4444",
  "#14B8A6",
];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/**
 * Just-in-time provision the local `users` row for a Clerk identity. Uses an
 * upsert on the unique `clerk_user_id` so concurrent first-requests cannot
 * create duplicates.
 */
export async function provisionUser(
  clerkUserId: string,
  profile: { name?: string; email?: string | null; photo?: string | null },
): Promise<User> {
  const name =
    profile.name?.trim() || profile.email?.split("@")[0] || "New user";
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      name,
      email: profile.email ?? null,
      photo: profile.photo ?? null,
      avatarColor: pickAvatarColor(clerkUserId),
    })
    .onConflictDoUpdate({
      target: usersTable.clerkUserId,
      // Touch updatedAt without clobbering user-edited profile fields.
      set: { updatedAt: new Date() },
    })
    .returning();
  return user!;
}

/**
 * Express middleware that requires a valid Clerk session and attaches the
 * corresponding local user (creating it lazily on first sight).
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.clerkUserId, clerkUserId),
  });

  if (!user) {
    // Enrich the provisioned profile from Clerk when possible.
    let name: string | undefined;
    let email: string | null = null;
    let photo: string | null = null;
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      name =
        [clerkUser.firstName, clerkUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim() || clerkUser.username || undefined;
      email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
      photo = clerkUser.imageUrl ?? null;
    } catch (err) {
      req.log.warn({ err }, "Failed to fetch Clerk user during provisioning");
    }
    user = await provisionUser(clerkUserId, { name, email, photo });
  }

  req.localUser = user;
  next();
}
