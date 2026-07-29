import { eq, inArray } from "drizzle-orm";
import { db, deviceTokensTable } from "@workspace/db";
import { logger } from "./logger";

type PushMessage = {
  to: string;
  title: string;
  body: string;
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