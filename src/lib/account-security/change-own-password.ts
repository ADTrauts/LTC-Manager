import bcrypt from "bcryptjs";

import { revokeUserSessions, type PrismaLike } from "@/lib/session-revocation";

export type ChangeOwnUserPasswordResult =
  | { ok: true }
  | { ok: false; message: string };

type PasswordClient = {
  user: {
    findFirst: PrismaLike["user"]["findFirst"];
    update: PrismaLike["user"]["update"];
  };
  $transaction: PrismaLike["$transaction"];
};

/**
 * Change the global User password and increment User.sessionVersion.
 * Invalidates every User JWT (account, Organization, internal, partner), including this browser.
 * Does not touch Employee PIN sessions.
 */
export async function changeOwnUserPassword(
  client: PasswordClient,
  input: { userId: string; currentPassword: string; newPassword: string },
): Promise<ChangeOwnUserPasswordResult> {
  const user = await client.user.findFirst({
    where: { id: input.userId, isActive: true },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    return { ok: false, message: "User account not found." };
  }

  const isValidCurrent = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValidCurrent) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await client.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await revokeUserSessions(tx, user.id);
  });
  return { ok: true };
}
