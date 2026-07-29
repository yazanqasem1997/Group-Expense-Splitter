import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  groupInvitationsTable,
  groupMembersTable,
} from "@workspace/db";
import {
  AcceptInvitationResponse,
  DeclineInvitationResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { param, randomKey } from "../lib/params";
import { serializeInvitation } from "../lib/serialize";

const router: IRouter = Router();

/**
 * Verify that the authenticated user is the intended recipient of the
 * invitation. The invitation is keyed to an email address; the user must
 * have that email on their local profile. This prevents one authenticated
 * user from accepting/declining an invitation meant for someone else.
 *
 * Returns true when the check passes, false when it should be rejected.
 * We do a case-insensitive comparison because email addresses are
 * case-insensitive by RFC 5321.
 */
function isRecipient(userEmail: string | null | undefined, invitedEmail: string): boolean {
  if (!userEmail) return false;
  return userEmail.trim().toLowerCase() === invitedEmail.trim().toLowerCase();
}

router.post(
  "/invitations/:token/accept",
  requireAuth,
  async (req, res): Promise<void> => {
    const token = param(req, "token");
    const user = req.localUser!;

    const [invite] = await db
      .select()
      .from(groupInvitationsTable)
      .where(eq(groupInvitationsTable.token, token))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    // Ownership check: only the intended recipient may accept.
    if (!isRecipient(user.email, invite.invitedEmail)) {
      res.status(403).json({ error: "This invitation was not sent to your account" });
      return;
    }

    if (invite.status === "accepted") {
      res.json(AcceptInvitationResponse.parse(serializeInvitation(invite)));
      return;
    }

    let accepted;
    try {
      accepted = await db.transaction(async (tx) => {
      // Link the invited placeholder member to this user, or create one.
      let memberKey = invite.invitedMemberKey;
      if (memberKey) {
        // Scope by BOTH groupId AND memberKey — memberKey is only group-scoped,
        // not globally unique, so omitting groupId risks updating the wrong row.
        const updated = await tx
          .update(groupMembersTable)
          .set({
            userId: user.id,
            isPending: false,
            joinedAt: new Date(),
            name: user.name,
            email: user.email,
            avatarColor: user.avatarColor,
            photo: user.photo,
          })
          .where(
            and(
              eq(groupMembersTable.groupId, invite.groupId),
              eq(groupMembersTable.memberKey, memberKey),
            ),
          )
          .returning({ id: groupMembersTable.memberKey });

        if (updated.length === 0) {
          // Placeholder member row missing or stale — abort so we don't accept
          // an invitation without actually linking membership.
          throw new Error("STALE_MEMBER_KEY");
        }
      } else {
        memberKey = randomKey();
        await tx.insert(groupMembersTable).values({
          groupId: invite.groupId,
          userId: user.id,
          memberKey,
          name: user.name,
          email: user.email,
          avatarColor: user.avatarColor,
          photo: user.photo,
          isAdmin: false,
          isPending: false,
          joinedAt: new Date(),
        });
      }

      const [updated] = await tx
        .update(groupInvitationsTable)
        .set({ status: "accepted", invitedMemberKey: memberKey })
        .where(eq(groupInvitationsTable.id, invite.id))
        .returning();
      return updated!;
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "STALE_MEMBER_KEY") {
        res.status(409).json({ error: "Invitation member slot is no longer valid. Ask the group owner to re-invite you." });
        return;
      }
      throw err;
    }

    res.json(AcceptInvitationResponse.parse(serializeInvitation(accepted)));
  },
);

router.post(
  "/invitations/:token/decline",
  requireAuth,
  async (req, res): Promise<void> => {
    const token = param(req, "token");
    const user = req.localUser!;

    const [invite] = await db
      .select()
      .from(groupInvitationsTable)
      .where(eq(groupInvitationsTable.token, token))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    // Ownership check: only the intended recipient may decline.
    if (!isRecipient(user.email, invite.invitedEmail)) {
      res.status(403).json({ error: "This invitation was not sent to your account" });
      return;
    }

    const [updated] = await db
      .update(groupInvitationsTable)
      .set({ status: "declined" })
      .where(eq(groupInvitationsTable.id, invite.id))
      .returning();
    res.json(DeclineInvitationResponse.parse(serializeInvitation(updated!)));
  },
);

export default router;
