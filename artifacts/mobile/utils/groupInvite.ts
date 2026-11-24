import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_GROUP_INVITE_KEY = "pendingGroupJoinInviteCode";

export function buildGroupInviteUrl(token: string): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain
    ? `https://${domain}/api/group-invite?code=${encodeURIComponent(token)}`
    : `mobile:///group/join?code=${encodeURIComponent(token)}`;
}

export async function savePendingGroupInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_GROUP_INVITE_KEY, token);
}

export async function takePendingGroupInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_GROUP_INVITE_KEY);
  if (token) await AsyncStorage.removeItem(PENDING_GROUP_INVITE_KEY);
  return token;
}
