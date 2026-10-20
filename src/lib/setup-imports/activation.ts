import { Prisma, type PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { issueAccountInviteToken, findValidAccountInviteToken, buildAccountInviteUrl, ACCOUNT_INVITE_EXPIRES_DAYS } from "@/lib/account-invite/tokens";
import { isEmailConfigured, sendAccountInviteEmail } from "@/lib/email";
import { hash, ImportError } from "./contract";
import { liveActor, lockAuthority, lockFacility } from "./authority";

/** Post-commit delivery is separately receipted; it cannot roll back an Employee.
 * Existing account passwords/PINs are never generated, returned or overwritten. */
export async function deliverImportActivation(db: PrismaClient, session: FacilitySession, input: { batchId: string; row: number; origin: string }, deps: { configured?: () => boolean; send?: typeof sendAccountInviteEmail } = {}) {
  const intent = await db.$transaction(async tx => {
    const actor = await lockAuthority(tx,session,"workforce"); await lockFacility(tx,session.facilityId);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${input.batchId} FOR UPDATE`);
    const batch = await tx.setupImportBatch.findUnique({ where: { id: input.batchId } });
    if (!batch || batch.dataset !== "workforce" || batch.facilityId !== session.facilityId || batch.actorKind !== session.authKind || (session.authKind === "user" ? batch.actorUserId : batch.actorStaffId) !== session.uid) throw new ImportError("Activation receipt is outside this import context.");
    const row = await tx.setupImportResult.findFirst({ where: { batchId: batch.id, rowNumber: input.row, phase: "IMPORT", status: { in: ["committed","reused"] } } });
    const ids = row?.targetIds as Record<string,string> | undefined;
    if (!row || !ids?.employeeId || !ids.userId) throw new ImportError("A committed linked Employee receipt is required.");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${ids.userId} FOR UPDATE`);
    const employee = await tx.employee.findFirst({ where: { id: ids.employeeId, facilityId: session.facilityId, userId: ids.userId }, select: { status: true, facility: { select: { displayName: true } }, user: { select: { id: true, email: true, displayName: true, isActive: true, passwordHash: true } } } });
    if (!employee?.user?.isActive || employee.status === "TERMINATED") throw new ImportError("Current employment/account needs lifecycle review. No activation was sent.");
    const issued = !employee.user.passwordHash ? await issueAccountInviteToken(tx,employee.user.id) : null;
    await liveActor(tx,session);
    return { user: { id: employee.user.id, email: employee.user.email, displayName: employee.user.displayName }, facilityName: employee.facility.displayName, rawToken: issued?.rawToken, actorDigest: hash(actor), intendedKey: row.intendedKey };
  },{ isolationLevel: "Serializable", timeout: 20_000 });
  let status = intent.rawToken ? "not_configured" : "not_needed";
  if (intent.rawToken && (deps.configured ?? isEmailConfigured)()) {
    try {
      const sent = await (deps.send ?? sendAccountInviteEmail)({ to: intent.user.email, displayName: intent.user.displayName, facilityDisplayName: intent.facilityName, inviteUrl: buildAccountInviteUrl(input.origin,intent.rawToken), expiresInDays: ACCOUNT_INVITE_EXPIRES_DAYS });
      status = sent.sent ? "sent" : sent.reason === "not_configured" ? "not_configured" : "delivery_failed";
    } catch { status = "delivery_failed"; }
  }
  await db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SetupImportBatch" WHERE "id"=${input.batchId} FOR UPDATE`);
    if (intent.rawToken && !(await findValidAccountInviteToken(tx,intent.rawToken))) status = "superseded";
    const previous = await tx.setupImportResult.findFirst({ where: { batchId: input.batchId, rowNumber: input.row, phase: "ACTIVATION" }, orderBy: { attempt: "desc" } });
    await tx.setupImportResult.create({ data: { batchId: input.batchId, rowNumber: input.row, phase: "ACTIVATION", attempt: (previous?.attempt ?? 0)+1, status, intendedKey: intent.intendedKey, targetIds: { userId: intent.user.id }, confirmedDigest: intent.actorDigest, message: status === "not_needed" ? "An existing password is preserved. Use normal sign-in/verification/recovery." : status === "sent" ? "Activation email sent; acceptance remains pending." : status === "superseded" ? "A newer activation or acceptance superseded this delivery. Inspect current account state before retrying." : "Activation delivery is not confirmed. The Employee remains committed; explicitly retry delivery after inspecting this status." } });
  });
  return { status };
}
