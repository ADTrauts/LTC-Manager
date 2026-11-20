import { prisma } from "@/lib/prisma";
import { validateHarborStaffSession } from "../auth";
import type { HarborJwtPayload } from "../session";
import { requireLifecycle } from "./ceremony";
import type { StaffLifecycleConfig } from "./gate";

export async function loadStaffAccess(config: StaffLifecycleConfig, session: HarborJwtPayload, requestedPage: number) {
  const desiredPage = Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1);
  const canInvite = session.staffRole === "OWNER" && config.administrators.has(session.uid) &&
    config.invitationsEnabled === true;
  const canApproveRoster = session.staffRole === "OWNER" && config.rosterApprovers.has(session.uid) &&
    config.invitationsEnabled === true;
  const canReviewRecovery = config.recoveryEnabled === true && config.recoveryApprovers.has(session.uid);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    requireLifecycle((await validateHarborStaffSession(session, tx)).valid);
    const passkeyCount = await tx.harborStaffPasskey.count({ where: { staffId: session.uid } });
    const canListStaff = session.staffRole === "OWNER" &&
      (config.administrators.has(session.uid) || config.rosterApprovers.has(session.uid));
    const staffCount = canListStaff ? await tx.platformStaff.count() : 0;
    const now = new Date();
    const invitationWhere = { kind: "INVITE" as const, usedAt: null, expiresAt: { gt: now },
      email: { in: [...(config.allowedEmails ?? [])] } };
    const invitationCount = canListStaff ? await tx.harborStaffLifecycleIntent.count({ where: invitationWhere }) : 0;
    const recoveryWhere = { kind: "RECOVERY" as const, usedAt: null, approvedById: null,
      expiresAt: { gt: now }, staffId: { not: session.uid }, email: { in: [...(config.allowedEmails ?? [])] } };
    const recoveryCount = canReviewRecovery ? await tx.harborStaffLifecycleIntent.count({ where: recoveryWhere }) : 0;
    const pageCount = Math.max(1, Math.ceil(Math.max(staffCount, invitationCount, recoveryCount) / 25));
    const page = Math.min(desiredPage, pageCount);
    const staff = canListStaff ? await tx.platformStaff.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, displayName: true, email: true, role: true, isActive: true,
        _count: { select: { lifecyclePasskeys: true } } },
    }) : [];
    const invitations = canListStaff ? await tx.harborStaffLifecycleIntent.findMany({
      where: invitationWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, email: true, expiresAt: true },
    }) : [];
    const recoveries = canReviewRecovery ? await tx.harborStaffLifecycleIntent.findMany({
      where: recoveryWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 25, take: 25,
      select: { id: true, email: true, createdAt: true, expiresAt: true },
    }) : [];
    return { passkeyCount, staffCount, staff, invitationCount, invitations, recoveryCount, recoveries, page,
      pageCount };
  }, { isolationLevel: "RepeatableRead" });
  requireLifecycle((await validateHarborStaffSession(session)).valid);
  return { ...result, canInvite, canApproveRoster, canReviewRecovery,
    canEnrollOwner: session.staffRole === "OWNER" && config.administrators.has(session.uid) &&
      config.rosterApprovers.has(session.uid) && result.passkeyCount === 0 };
}
