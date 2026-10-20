import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getSupportAttachmentStore, type SupportAttachmentStore } from "./attachment-store";
import { failedScan, getSupportAttachmentScanner, validateScanResult, type ScanResult, type SupportAttachmentScanner } from "./attachment-scanner";
import { isBlockedSupportAttachmentType, looksLikeExecutableContent, SUPPORT_ATTACHMENT_MAX_BYTES } from "./attachment-limits";
const LEASE_MS = 90_000;
const BACKOFF = [60_000,5*60_000];
export const sha256Bytes = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function processPendingSupportAttachments(db: PrismaClient, options: { scanner?: SupportAttachmentScanner | null; store?: SupportAttachmentStore | null; attachmentIds?: string[]; limit?: number; now?: () => Date } = {}) {
  const scanner = options.scanner === undefined ? getSupportAttachmentScanner() : options.scanner;
  if (!scanner) return { configured: false, claimed: 0, results: [] as { attachmentId: string; status: string; code: string }[] };
  const store = options.store === undefined ? getSupportAttachmentStore() : options.store;
  const now = options.now ?? (()=>new Date());
  const candidates = await db.supportTicketAttachment.findMany({ where: { scanStatus: "PENDING", AND: [{ OR: [{ scanLeaseExpiresAt: null },{ scanLeaseExpiresAt: { lte: now() } }] }], ...(options.attachmentIds ? { id: { in: options.attachmentIds } } : {}), OR: [{ nextScanAt: null },{ nextScanAt: { lte: now() } }] }, orderBy: [{ createdAt: "asc" },{ id: "asc" }], select: { id: true }, take: Math.min(10,Math.max(1,options.limit ?? 3))*2 });
  const results: { attachmentId: string; status: string; code: string }[] = []; let claimed = 0;
  for (const candidate of candidates) {
    if (claimed >= Math.min(10,Math.max(1,options.limit ?? 3))) break;
    const claim = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportTicketAttachment" WHERE "id"=${candidate.id} FOR UPDATE`);
      const row = await tx.supportTicketAttachment.findUniqueOrThrow({ where: { id: candidate.id } });
      if (row.scanStatus !== "PENDING" || row.scanLeaseExpiresAt && +row.scanLeaseExpiresAt > +now() || row.nextScanAt && +row.nextScanAt > +now()) return null;
      await tx.supportAttachmentScanAttempt.updateMany({ where: { attachmentId: row.id, status: "RUNNING" }, data: { status: "FAILED", resultCode: "LEASE_EXPIRED", finishedAt: now() } });
      const previous = await tx.supportAttachmentScanAttempt.findFirst({ where: { attachmentId: row.id, cycle: row.scanCycle }, orderBy: { attempt: "desc" } });
      if ((previous?.attempt ?? 0) >= 3 || !row.storageKey || !row.checksumSha256 || row.sizeBytes < 1 || row.sizeBytes > SUPPORT_ATTACHMENT_MAX_BYTES) {
        await tx.supportTicketAttachment.update({ where: { id: row.id }, data: { scanStatus: "SCAN_FAILED", scanResultCode: !row.checksumSha256 ? "HASH_MISSING" : "SCANNER_FAILURE", scanLeaseToken: null, scanLeaseExpiresAt: null } }); return null;
      }
      const id = randomUUID(); const attempt = await tx.supportAttachmentScanAttempt.create({ data: { id, attachmentId: row.id, cycle: row.scanCycle, attempt: (previous?.attempt ?? 0)+1, expectedSha256: row.checksumSha256, expectedSizeBytes: row.sizeBytes } });
      await tx.supportTicketAttachment.update({ where: { id: row.id }, data: { scanLeaseToken: id, scanLeaseExpiresAt: new Date(+now()+LEASE_MS) } });
      return { row, attempt };
    });
    if (!claim) continue;
    claimed++;
    const { row, attempt } = claim;
    const binding = { attachmentId: row.id, attemptId: attempt.id, sha256: attempt.expectedSha256, sizeBytes: attempt.expectedSizeBytes };
    let result: ScanResult;
    try {
      const bytes = await store?.get(row.storageKey!);
      if (!bytes) result = failedScan(binding,"OBJECT_UNAVAILABLE",now());
      else if (bytes.length !== binding.sizeBytes || sha256Bytes(bytes) !== binding.sha256) result = failedScan(binding,"HASH_MISMATCH",now());
      else if (isBlockedSupportAttachmentType(row) || looksLikeExecutableContent(bytes)) result = { ...failedScan(binding,"BLOCKED_CONTENT",now()), verdict: "BLOCKED" };
      else result = validateScanResult(binding,await scanner.scan({ ...binding, filename: row.filename, contentType: row.contentType, bytes }),now());
    } catch { result = failedScan(binding,"TRANSPORT",now()); }
    if (result.verdict === "CLEAN") {
      // Blob and Postgres are independent: recheck before receipt, and every download rechecks again.
      try {
        const latest = await store?.get(row.storageKey!);
        if (!latest || latest.length !== binding.sizeBytes || sha256Bytes(latest) !== binding.sha256) result = { ...result, verdict: "FAILED", code: "HASH_MISMATCH", inspectedComplete: false };
      } catch { result = { ...result, verdict: "FAILED", code: "OBJECT_UNAVAILABLE", inspectedComplete: false }; }
    }
    const committed = await db.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportTicketAttachment" WHERE "id"=${row.id} FOR UPDATE`);
      const current = await tx.supportTicketAttachment.findUniqueOrThrow({ where: { id: row.id } });
      if (current.scanStatus !== "PENDING" || current.scanLeaseToken !== attempt.id || !current.scanLeaseExpiresAt || +current.scanLeaseExpiresAt <= +now() || current.checksumSha256 !== binding.sha256 || current.sizeBytes !== binding.sizeBytes || current.storageKey !== row.storageKey) {
        await tx.supportAttachmentScanAttempt.updateMany({ where: { id: attempt.id, status: "RUNNING" }, data: { status: "STALE", resultCode: "HASH_MISMATCH", finishedAt: now() } });
        return { attachmentId: row.id, status: "unavailable", code: "STALE_RESULT" };
      }
      const permanentFailure = result.code === "HASH_MISMATCH";
      const status = result.verdict === "CLEAN" ? "CLEAN" : result.verdict === "BLOCKED" ? "BLOCKED" : attempt.attempt >= 3 || permanentFailure ? "SCAN_FAILED" : "PENDING";
      const metadata = { scannedAt: new Date(result.scannedAt), engineVersion: result.engineVersion, signatureVersion: result.signatureVersion, signatureUpdatedAt: result.signatureUpdatedAt ? new Date(result.signatureUpdatedAt) : undefined };
      await tx.supportAttachmentScanAttempt.update({ where: { id: attempt.id }, data: { ...metadata, status: result.verdict === "FAILED" ? "FAILED" : result.verdict, resultCode: result.code, finishedAt: now() } });
      await tx.supportTicketAttachment.update({ where: { id: row.id }, data: { scanStatus: status, scanLeaseToken: null, scanLeaseExpiresAt: null, nextScanAt: status === "PENDING" ? new Date(+now()+BACKOFF[attempt.attempt-1]!) : null, scannedAt: metadata.scannedAt, scannerProvider: result.provider, scannerEngineVersion: result.engineVersion ?? null, scannerSignatureVersion: result.signatureVersion ?? null, scanResultCode: result.code, scanFailureReason: result.verdict === "FAILED" ? result.code : null } });
      return { attachmentId: row.id, status, code: result.code };
    });
    results.push(committed);
  }
  return { configured: true, claimed, results };
}
export async function readVerifiedSupportAttachment(store: SupportAttachmentStore | null, attachment: { scanStatus: string; storageKey: string | null; checksumSha256: string | null; sizeBytes: number }) {
  if (attachment.scanStatus !== "CLEAN" || !attachment.storageKey || !attachment.checksumSha256) return null;
  const bytes = await store?.get(attachment.storageKey);
  return bytes && bytes.length === attachment.sizeBytes && bytes.length <= SUPPORT_ATTACHMENT_MAX_BYTES && sha256Bytes(bytes) === attachment.checksumSha256 ? bytes : null;
}

/** Explicit staff rescan starts a new bounded cycle; blocked files are never promoted/reset. */
export async function requestFailedSupportAttachmentRescan(db: PrismaClient, session: import("@/lib/harbor-console/session").HarborJwtPayload, attachmentId: string, reason: string) {
  if (reason.trim().length < 3 || reason.length > 2000) throw new Error("A rescan reason is required");
  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformStaff" WHERE "id"=${session.uid} FOR SHARE`);
    const staff = await tx.platformStaff.findUniqueOrThrow({ where: { id: session.uid } });
    if (!staff.isActive || staff.sessionVersion !== session.sessionVersion || staff.role !== session.staffRole || staff.email !== session.email) throw new Error("Console authority changed");
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SupportTicketAttachment" WHERE "id"=${attachmentId} FOR UPDATE`);
    const row = await tx.supportTicketAttachment.findUniqueOrThrow({ where: { id: attachmentId }, include: { message: { select: { ticketId: true } } } });
    if (row.scanStatus !== "SCAN_FAILED") throw new Error("Only failed scans can explicitly re-enter PENDING; blocked files require separate review");
    await tx.supportTicketAttachment.update({ where: { id: attachmentId }, data: { scanCycle: { increment: 1 }, scanStatus: "PENDING", nextScanAt: null, scanLeaseToken: null, scanLeaseExpiresAt: null, scanResultCode: "RESCAN_REQUESTED" } });
    await tx.supportTicketMessage.create({ data: { ticketId: row.message.ticketId, kind: "NOTE", authorStaffId: staff.id, bodyText: `Security rescan requested for attachment ${attachmentId}, cycle ${row.scanCycle+1}. Reason: ${reason.trim()}` } });
  });
}
