import type { PrismaClient } from "@prisma/client";

import { loadFacilityAdministratorSeat } from "@/lib/facility-administrator";

export type HarborAdministratorInviteTarget = { userId: string; periodId: string; email: string };

export async function loadHarborAdministratorActivation(
  db: PrismaClient,
  facilityId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const seat = await loadFacilityAdministratorSeat(tx, facilityId);
    if (seat.kind === "EMPTY") return { label: "No Facility Administrator assigned", expiresAt: null, recovery: null };
    if (seat.kind === "GONE") return { label: "Facility Administrator seat needs attention", expiresAt: null, recovery: null };

    const userId = seat.holder.userId;
    const pending = await tx.user.findFirst({ where: { id: userId, passwordHash: null }, select: { facilityId: true } });
    if (!pending) return { label: "Account password set", expiresAt: null, recovery: null };
    const { email, periodId, since } = seat.holder;
    const recovery: HarborAdministratorInviteTarget | null = pending.facilityId && email && since <= now ? { userId, email, periodId } : null;

    const invite = await tx.accountInviteToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { expiresAt: "desc" },
      select: { expiresAt: true },
    });
    if (!invite) return { label: "No unused account invite", expiresAt: null, recovery };

    return {
      label: invite.expiresAt > now ? "Account invite valid" : "Account invite expired",
      expiresAt: invite.expiresAt,
      recovery,
    };
  }, { isolationLevel: "RepeatableRead" });
}
