import type { PrismaClient } from "@prisma/client";

import { SCAN_CODES } from "@/lib/support/attachment-scanner";
import { supportMessageHref } from "@/lib/support/history";
import { describeSupportScanSchedule, SUPPORT_SCAN_BACKOFF_MS, SUPPORT_SCAN_LEASE_MS, SUPPORT_SCAN_MAX_ATTEMPTS } from "@/lib/support/scan-scheduling";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";
import { validateHarborStaffSession, type HarborJwtPayload } from "./auth";

const ATTEMPT_LIMIT = 10;
const safeResultCode = (value: string | null) => value === "RESCAN_REQUESTED" ? "Explicit rescan requested" : SCAN_CODES.find((code) => code === value) ?? (value ? "Unrecognized result code" : "Not recorded");
const safeStatus = (value: string) => ["RUNNING", "CLEAN", "BLOCKED", "FAILED", "STALE"].includes(value) ? value : "Unrecognized status";

/** Scan metadata only. A ticket/attachment reference is never permission to read its original. */
export async function loadHarborScanDiagnostics(db: PrismaClient, session: HarborJwtPayload, attachmentId: string, workFacilityId: string | null) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    if (!(await validateHarborStaffSession(session, tx)).valid) return { kind: "unauthorized" as const };
    const attachment = await tx.supportTicketAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        position: true, scanStatus: true, scanCycle: true, createdAt: true, nextScanAt: true,
        scanLeaseExpiresAt: true, scannedAt: true, scanResultCode: true,
        message: { select: { id: true, ticketId: true, ticket: { select: { number: true } } } },
        _count: { select: { scanAttempts: true } },
        scanAttempts: {
          take: ATTEMPT_LIMIT, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { attempt: true, cycle: true, status: true, resultCode: true, createdAt: true, finishedAt: true, signatureUpdatedAt: true },
        },
      },
    });
    if (!attachment) return { kind: "missing" as const };
    // A link back to the existing participant-authorized source workflow adds no rescan command here.
    const engagement = workFacilityId ? null : await tx.implementationEngagement.findFirst({
      where: { supportTicketId: attachment.message.ticketId, participants: { some: { staffId: session.uid } } },
      select: { id: true, facilityId: true },
    });
    const observedAt = new Date();
    return {
      kind: "found" as const, observedAt,
      ticketLabel: formatSupportTicketNumber(attachment.message.ticket.number),
      conversationHref: supportMessageHref(attachment.message.ticketId, attachment.message.id),
      attachmentPosition: attachment.position + 1, createdAt: attachment.createdAt,
      schedule: describeSupportScanSchedule(attachment, observedAt), cycle: attachment.scanCycle,
      nextScanAt: attachment.nextScanAt, leaseExpiresAt: attachment.scanLeaseExpiresAt,
      scannedAt: attachment.scannedAt, resultCode: safeResultCode(attachment.scanResultCode),
      attemptsTotal: attachment._count.scanAttempts,
      attempts: attachment.scanAttempts.map((attempt) => ({ ...attempt, status: safeStatus(attempt.status), resultCode: safeResultCode(attempt.resultCode) })),
      implementationHref: engagement ? `/console/customers/${encodeURIComponent(engagement.facilityId)}/implementation?engagement=${encodeURIComponent(engagement.id)}` : null,
      policy: { maxAttempts: SUPPORT_SCAN_MAX_ATTEMPTS, leaseSeconds: SUPPORT_SCAN_LEASE_MS / 1000, backoffSeconds: SUPPORT_SCAN_BACKOFF_MS.map((delay) => delay / 1000) },
    };
  }, { isolationLevel: "RepeatableRead" });
  if (result.kind === "unauthorized" || !(await validateHarborStaffSession(session, db)).valid) return { kind: "unauthorized" as const };
  return result;
}
