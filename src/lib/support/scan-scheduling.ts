import type { Prisma, SupportAttachmentScanStatus } from "@prisma/client";

// Existing processor policy, shared with read-only diagnostics. No scheduler is started here.
export const SUPPORT_SCAN_LEASE_MS = 90_000;
export const SUPPORT_SCAN_BACKOFF_MS = [60_000, 5 * 60_000] as const;
export const SUPPORT_SCAN_MAX_ATTEMPTS = 3;

export type SupportScanQueueStage = "eligible" | "leased" | "scheduled" | "failed";
export const SUPPORT_SCAN_QUEUE_STAGES = [
  { key: "eligible", label: "Eligible for processor" },
  { key: "leased", label: "Unexpired lease" },
  { key: "scheduled", label: "Retry scheduled" },
  { key: "failed", label: "Failed; explicit review required" },
] as const;

export function parseSupportScanQueueStage(value: unknown): SupportScanQueueStage | null {
  return SUPPORT_SCAN_QUEUE_STAGES.find((stage) => stage.key === value)?.key ?? null;
}

function leaseAvailableWhere(now: Date): Prisma.SupportTicketAttachmentWhereInput {
  return { OR: [{ scanLeaseExpiresAt: null }, { scanLeaseExpiresAt: { lte: now } }] };
}

/** Exact existing processor candidate predicate, including both lease and retry eligibility. */
export function pendingSupportScanWhere(now: Date): Prisma.SupportTicketAttachmentWhereInput {
  return {
    scanStatus: "PENDING",
    AND: [leaseAvailableWhere(now)],
    OR: [{ nextScanAt: null }, { nextScanAt: { lte: now } }],
  };
}

export function supportScanQueueWhere(stage: SupportScanQueueStage | null, now: Date): Prisma.SupportTicketAttachmentWhereInput {
  if (stage === "eligible") return pendingSupportScanWhere(now);
  if (stage === "leased") return { scanStatus: "PENDING", scanLeaseExpiresAt: { gt: now } };
  if (stage === "scheduled") return { scanStatus: "PENDING", AND: [leaseAvailableWhere(now)], nextScanAt: { gt: now } };
  if (stage === "failed") return { scanStatus: "SCAN_FAILED" };
  return { scanStatus: { in: ["PENDING", "SCAN_FAILED"] } };
}

export function describeSupportScanSchedule(row: {
  scanStatus: SupportAttachmentScanStatus;
  scanLeaseExpiresAt: Date | null;
  nextScanAt: Date | null;
}, now: Date): { stage: SupportScanQueueStage | null; label: string } {
  if (row.scanStatus === "SCAN_FAILED") return { stage: "failed", label: "Scan failed; explicit review required" };
  if (row.scanStatus === "BLOCKED") return { stage: null, label: "Blocked; no automatic retry" };
  if (row.scanStatus === "CLEAN") return { stage: null, label: "Clean scan recorded; download checks still apply" };
  if (row.scanLeaseExpiresAt && row.scanLeaseExpiresAt > now) return { stage: "leased", label: "Unexpired scan lease; worker completion is not confirmed" };
  if (row.nextScanAt && row.nextScanAt > now) return { stage: "scheduled", label: "Retry not yet eligible" };
  return { stage: "eligible", label: row.scanLeaseExpiresAt ? "Lease expired; eligible for processor recovery" : "Eligible for processor; execution is not confirmed" };
}
