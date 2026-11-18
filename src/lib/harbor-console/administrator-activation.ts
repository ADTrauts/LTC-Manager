import type { PrismaClient } from "@prisma/client";

import { loadFacilityAdministratorSeat } from "@/lib/facility-administrator";

export async function loadHarborAdministratorActivation(
  db: PrismaClient,
  facilityId: string,
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    const seat = await loadFacilityAdministratorSeat(tx, facilityId);
    if (seat.kind === "EMPTY") return { label: "No Facility Administrator assigned", expiresAt: null };
    if (seat.kind === "GONE") return { label: "Facility Administrator seat needs attention", expiresAt: null };

    const userId = seat.holder.userId;
    const hasPassword = await tx.user.count({ where: { id: userId, passwordHash: { not: null } } });
    if (hasPassword) return { label: "Account password set", expiresAt: null };

    const invite = await tx.accountInviteToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { expiresAt: "desc" },
      select: { expiresAt: true },
    });
    if (!invite) return { label: "No unused account invite", expiresAt: null };

    return {
      label: invite.expiresAt > now ? "Account invite valid" : "Account invite expired",
      expiresAt: invite.expiresAt,
    };
  }, { isolationLevel: "RepeatableRead" });
}
