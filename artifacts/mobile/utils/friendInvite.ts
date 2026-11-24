import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_PREFIX = "smf1.";
const PENDING_INVITE_KEY = "pendingFriendInviteCode";

/**
 * Friend QR codes hold a web link rather than the raw token so that a phone
 * camera without Split Mate installed lands on a page that explains how to get
 * the app first. The in-app scanner reads the same link.
 */
export function buildFriendInviteUrl(token: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) return token;
  return `https://${domain}/api/friend-invite?code=${encodeURIComponent(token)}`;
}

/** Accepts either a raw token or any invite link containing `code=`. */
export function extractFriendInviteToken(data: string | undefined | null): string | null {
  if (!data) return null;
  const trimmed = data.trim();
  if (trimmed.startsWith(TOKEN_PREFIX)) return trimmed;
  const match = trimmed.match(/[?&]code=([^&#]+)/);
  if (!match) return null;
  let code: string;
  try {
    code = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return code.startsWith(TOKEN_PREFIX) ? code : null;
}

/** Holds an invite opened before sign-in so it can resume afterwards. */
export async function savePendingFriendInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token);
}

export async function takePendingFriendInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return token;
}
