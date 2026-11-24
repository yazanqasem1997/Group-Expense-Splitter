import { and, eq } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  auditLogTable,
  type Group,
  type GroupMember,
} from "@workspace/db";

export type Membership = {
  group: Group;
  member: GroupMember | null;
  isMember: boolean;
  isAdmin: boolean;
  isOwner: boolean;
};

/**
 * Resolve the requesting user's relationship to a group. A user is a "member"
 * if a group_members row links to their user id. Owners (creators) and admin
 * members have elevated rights.
 */
export async function getMembership(
  groupId: string,
  userId: string,
): Promise<Membership | null> {
  const [group] = await db
    .select()
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  if (!group) return null;

  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.userId, userId),
      ),
    )
    .limit(1);

  const isOwner = group.createdByUserId === userId;
  const isMember = isOwner || Boolean(member);
  const isAdmin = isOwner || Boolean(member?.isAdmin);

  return {
    group,
    member: member ?? null,
    isMember,
    isAdmin,
    isOwner,
  };
}

/**
 * Append an audit log entry. Best-effort — callers may run this inside a
 * transaction by passing a tx-bound executor.
 */
export async function recordAudit(
  executor: typeof db,
  entry: {
    entityType: string;
    entityId: string;
    groupId?: string | null;
    action: "created" | "updated" | "deleted";
    changedByUserId?: string | null;
    fieldChanges?: unknown;
  },
): Promise<void> {
  await executor.insert(auditLogTable).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    groupId: entry.groupId ?? null,
    action: entry.action,
    changedByUserId: entry.changedByUserId ?? null,
    fieldChanges: (entry.fieldChanges ?? null) as never,
  });
}
