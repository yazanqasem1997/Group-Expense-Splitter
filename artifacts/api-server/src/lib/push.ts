import { usersTable as pushUsers } from "@workspace/db";
import { inArray as pushIn } from "drizzle-orm";
import { groupMembersTable as pushGroupMembers, groupsTable as pushGroups } from "@workspace/db";
import { eq as pushEq } from "drizzle-orm";
import { eq, inArray } from "drizzle-orm";
import { db, deviceTokensTable } from "@workspace/db";
import { logger } from "./logger";

type PushMessage = {
  to: string;
  title: string;
  body: string;
  categoryId?: string;
  data?: Record<string, unknown>;
  sound: "default";
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendPushToUsers(
  userIds: string[],
  notification: Omit<PushMessage, "to" | "sound">,
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await db
    .select({ token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(inArray(deviceTokensTable.userId, Array.from(new Set(userIds))));
  if (rows.length === 0) return;

  const messages: PushMessage[] = rows.map(({ token }) => ({
    ...notification,
    to: token,
    sound: "default",
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Expo push request failed");
      return;
    }

    const result = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const invalidTokens = rows
      .filter((_, index) => result.data?.[index]?.details?.error === "DeviceNotRegistered")
      .map(({ token }) => token);
    if (invalidTokens.length > 0) {
      await db
        .delete(deviceTokensTable)
        .where(inArray(deviceTokensTable.token, invalidTokens));
    }
  } catch (error) {
    logger.warn({ err: error }, "Expo push delivery failed");
  }
}

export async function removeDeviceToken(token: string): Promise<void> {
  await db.delete(deviceTokensTable).where(eq(deviceTokensTable.token, token));
}
/** First name (or "Someone") for push copy. */
export function actorName(user: unknown): string {
  const u = user as { name?: string | null; displayName?: string | null } | undefined;
  const name = (u?.name || u?.displayName || "").trim();
  return name ? name.split(" ")[0]! : "Someone";
}

/** Push to every signed-up member of a group except the person who made the change. Never throws. */
export async function pushToGroupExceptActor(
  groupId: string,
  actorUserId: string,
  build: (groupName: string) => { title: string; body: string },
  data: Record<string, unknown>,
  prefKey?: string,
  onlyMemberKeys?: string[],
): Promise<void> {
  try {
    const [group] = await db.select({ name: pushGroups.name }).from(pushGroups).where(pushEq(pushGroups.id, groupId)).limit(1);
    const allRows = await db.select({ userId: pushGroupMembers.userId, memberKey: pushGroupMembers.memberKey }).from(pushGroupMembers).where(pushEq(pushGroupMembers.groupId, groupId));
    const rows = onlyMemberKeys ? allRows.filter(r => onlyMemberKeys.includes(r.memberKey)) : allRows;
    const ids = [...new Set(rows.map(r => r.userId).filter((id): id is string => !!id && id !== actorUserId))];
    const allowed = prefKey ? await filterByPref(ids, prefKey) : ids;
    if (allowed.length === 0) return;
    const { title, body } = build(group?.name ?? "Your group");
    await sendPushToUsers(allowed, { title, body, data: { ...data, groupId } });
  } catch {
    // push is best-effort; never block the request
  }
}

/** Drop anyone who switched this notification type off in Settings > Notifications. Never throws. */
export async function filterByPref(ids: string[], key: string): Promise<string[]> {
  if (ids.length === 0) return ids;
  try {
    const rows = await db.select({ id: pushUsers.id, prefs: pushUsers.notifPrefs }).from(pushUsers).where(pushIn(pushUsers.id, ids));
    // Edits, deletions, comments and reactions are off unless the person switched them on.
    const offByDefault = ["expenseEdited", "expenseDeleted", "comment", "reaction"].includes(key);
    const off = new Set(rows.filter(r => {
      const v = (r.prefs as Record<string, unknown> | null)?.[key];
      return offByDefault ? v !== true : v === false;
    }).map(r => r.id));
    return ids.filter(id => !off.has(id));
  } catch {
    return ids;
  }
}
