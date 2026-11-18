import type { Prisma, PrismaClient } from "@prisma/client";

import { deliverAccountInvite, prepareAccountInvite } from "@/lib/account-invite/send";
import { lockFacilityForAdministratorChange } from "@/lib/facility-access";
import { loadFacilityAdministratorSeat } from "@/lib/facility-administrator";

import type { HarborAdministratorInviteTarget } from "./administrator-activation";
import { lockHarborStaffSession, validateHarborStaffSession, type HarborJwtPayload } from "./auth";

export async function replaceHarborAdministratorInvitation(
  db: PrismaClient,
  session: HarborJwtPayload,
  target: HarborAdministratorInviteTarget & { facilityId: string },
  origin: string,
): Promise<"ineligible" | "delivery_requested" | "delivery_unconfirmed"> {
  async function stillHoldsSeat(tx: Prisma.TransactionClient) {
    const seat = await loadFacilityAdministratorSeat(tx, target.facilityId);
    return seat.kind === "HELD" && seat.holder.since <= new Date() && seat.holder.periodId === target.periodId &&
      seat.holder.userId === target.userId && seat.holder.email === target.email;
  }

  const prepared = await db.$transaction(async (tx) => {
    const authority = await lockHarborStaffSession(session, tx);
    if (!authority.valid || authority.staff.role !== "OWNER") return null;
    await lockFacilityForAdministratorChange(tx, target.facilityId);
    if (!(await stillHoldsSeat(tx))) return null;
    return prepareAccountInvite(tx, target.userId, async () =>
      (await validateHarborStaffSession(session, tx)).valid && (await stillHoldsSeat(tx)),
    );
  }, { isolationLevel: "ReadCommitted" });

  if (!prepared) return "ineligible";
  try {
    return (await deliverAccountInvite(prepared, origin)).sent ? "delivery_requested" : "delivery_unconfirmed";
  } catch {
    // The replacement is committed even if delivery cannot be confirmed.
    return "delivery_unconfirmed";
  }
}
