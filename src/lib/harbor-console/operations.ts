import type { Prisma, PrismaClient } from "@prisma/client";

import { PLATFORM_CATALOG_OWNER } from "@/lib/canonical-logs/catalog-ownership";
import { getSupportAttachmentScanner } from "@/lib/support/attachment-scanner";
import { isSupportAttachmentStorageConfigured } from "@/lib/support/attachment-store";
import { getSupportOutboundWebhookCredentials, isSupportReplyRoutingConfigured } from "@/lib/support/config";
import { supportAutomationDelayLabel, supportAutomationRuleAnchor } from "@/lib/support/automation";
import { supportMessageHref } from "@/lib/support/history";
import { describeSupportScanSchedule, parseSupportScanQueueStage, SUPPORT_SCAN_QUEUE_STAGES, supportScanQueueWhere, type SupportScanQueueStage } from "@/lib/support/scan-scheduling";
import { supportQueueWhere } from "@/lib/support/queues";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";
import { hasHarborCapability, validateHarborStaffSession, type HarborJwtPayload } from "./auth";
import { HARBOR_CUSTOMER_PAGE_SIZE, harborCustomerPageWindow } from "./pagination";
import { billingStatusLabel, elapsedAgeLabel, PAYMENT_PROBLEM_STATUSES } from "./presentation";

export const HARBOR_OPERATION_QUEUES = [
  { key: "support", label: "Unassigned support", unit: "tickets", description: "Active tickets without a responsible staff member. Claim and respond in Tickets." },
  { key: "priority", label: "High-priority support", unit: "tickets", description: "Active High and Urgent tickets, including work already assigned." },
  { key: "delivery", label: "Delivery problems", unit: "messages", description: "Recorded failed, bounced, or complained-about replies, newest first. History is retained even after a later successful reply; review the conversation before sending again." },
  { key: "pending", label: "Unconfirmed outgoing replies", unit: "messages", description: "By reply creation, oldest first: replies without a confirmed send outcome, or accepted sends without a recorded delivery outcome. Age is measured from creation or send acceptance, not an approved delivery SLA. Check provider evidence before sending again." },
  { key: "scanning", label: "Attachment scan backlog", unit: "attachments", description: "Pending or failed scans, oldest first. Originals remain protected by existing download authorization and scanning checks." },
  { key: "automation", label: "Failed automation runs", unit: "runs", description: "Recorded failed Support automation attempts, newest first. A later successful run does not remove this history." },
  { key: "billing", label: "Payment follow-up", unit: "Facilities", description: "Facilities whose local billing mirror reports a payment problem. Opening this queue does not contact Stripe or reconcile billing." },
  { key: "licensing", label: "Unlinked active licenses", unit: "licenses", description: "Active entitlement rows without an installed Department link. This can be normal during setup; inspect the Facility's licensing facts before taking action." },
  { key: "catalog", label: "Platform Catalog drafts", unit: "versions", description: "VSSYL-owned draft versions only. Staff can review and edit drafts; publication requires the existing catalog.publish capability." },
] as const;

export type HarborOperationQueue = (typeof HARBOR_OPERATION_QUEUES)[number]["key"];
export type HarborOperationRow = { id: string; title: string; detail: string; occurredAt: Date; href: string; action: string; related?: { href: string; label: string } };

export function parseHarborOperationQueue(value: unknown): HarborOperationQueue {
  return HARBOR_OPERATION_QUEUES.find((queue) => queue.key === value)?.key ?? "support";
}

export function harborOperationsHref(queue: HarborOperationQueue, page = 1, scanStage?: SupportScanQueueStage | null) {
  const query = new URLSearchParams({ queue });
  if (page > 1) query.set("page", String(page));
  if (queue === "scanning" && scanStage) query.set("scan", scanStage);
  return `/console/operations?${query}`;
}

const deliveryWhere = { kind: "OUTBOUND", deliveryStatus: { in: ["FAILED", "BOUNCED", "SPAM_COMPLAINT"] } } satisfies Prisma.SupportTicketMessageWhereInput;
const pendingDeliveryWhere = { kind: "OUTBOUND", OR: [{ deliveryStatus: null }, { deliveryStatus: { in: ["PENDING", "SENT"] } }] } satisfies Prisma.SupportTicketMessageWhereInput;
const automationWhere = { outcome: "FAILED" } satisfies Prisma.SupportAutomationRunWhereInput;
const billingWhere = { billing: { is: { status: { in: PAYMENT_PROBLEM_STATUSES } } } } satisfies Prisma.FacilityWhereInput;
const licensingWhere = { status: "ACTIVE", departmentId: null } satisfies Prisma.FacilityDepartmentEntitlementWhereInput;
const catalogWhere = { ...PLATFORM_CATALOG_OWNER, status: "DRAFT" } satisfies Prisma.CatalogLogDefinitionWhereInput;
const ticketReferenceSelect = { id: true, number: true } satisfies Prisma.SupportTicketSelect;
const ticketHref = (id: string) => `/console/tickets/${encodeURIComponent(id)}`;
const customerHref = (id: string) => `/console/customers/${encodeURIComponent(id)}`;

async function readQueue(tx: Prisma.TransactionClient, queue: HarborOperationQueue, staffId: string, skip: number, observedAt: Date, scanStage: SupportScanQueueStage | null): Promise<HarborOperationRow[]> {
  const bounds = { skip, take: HARBOR_CUSTOMER_PAGE_SIZE };
  if (queue === "support" || queue === "priority") {
    const rows = await tx.supportTicket.findMany({
      ...bounds, where: supportQueueWhere(queue === "support" ? "unassigned" : "high", staffId),
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { ...ticketReferenceSelect, status: true, priority: true, updatedAt: true, facility: { select: { displayName: true } } },
    });
    return rows.map((row) => ({ id: row.id, title: formatSupportTicketNumber(row.number), detail: `${row.status} · ${row.priority} · ${row.facility?.displayName ?? "No Facility linked"}`, occurredAt: row.updatedAt, href: ticketHref(row.id), action: "Review ticket" }));
  }
  if (queue === "delivery") {
    const rows = await tx.supportTicketMessage.findMany({
      ...bounds, where: deliveryWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, deliveryStatus: true, createdAt: true, ticket: { select: ticketReferenceSelect } },
    });
    return rows.map((row) => ({ id: row.id, title: formatSupportTicketNumber(row.ticket.number), detail: `Reply delivery: ${row.deliveryStatus}`, occurredAt: row.createdAt, href: supportMessageHref(row.ticket.id, row.id), action: "Review this reply" }));
  }
  if (queue === "pending") {
    const rows = await tx.supportTicketMessage.findMany({
      ...bounds, where: pendingDeliveryWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, deliveryStatus: true, createdAt: true, sentAt: true, ticket: { select: ticketReferenceSelect } },
    });
    return rows.map((row) => {
      const accepted = row.deliveryStatus === "SENT";
      const since = accepted ? row.sentAt ?? row.createdAt : row.createdAt;
      const ageSource = accepted && row.sentAt ? "since recorded send" : "since reply creation";
      return { id: row.id, title: formatSupportTicketNumber(row.ticket.number), detail: `${accepted ? "Provider accepted; delivery outcome not recorded" : "Send outcome not confirmed"} · ${elapsedAgeLabel(since, observedAt)} ${ageSource}`, occurredAt: since, href: supportMessageHref(row.ticket.id, row.id), action: "Review this reply" };
    });
  }
  if (queue === "scanning") {
    const rows = await tx.supportTicketAttachment.findMany({
      ...bounds, where: supportScanQueueWhere(scanStage, observedAt), orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, position: true, scanStatus: true, createdAt: true, nextScanAt: true, scanLeaseExpiresAt: true, message: { select: { ticket: { select: ticketReferenceSelect } } } },
    });
    return rows.map((row) => ({ id: row.id, title: `${formatSupportTicketNumber(row.message.ticket.number)} · attachment ${row.position + 1}`, detail: `${describeSupportScanSchedule(row, observedAt).label} · age ${elapsedAgeLabel(row.createdAt, observedAt)}`, occurredAt: row.createdAt, href: `/console/operations/scans/${encodeURIComponent(row.id)}`, action: "Inspect scan attempts" }));
  }
  if (queue === "automation") {
    const rows = await tx.supportAutomationRun.findMany({
      ...bounds, where: automationWhere, orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { id: true, action: true, occurredAt: true, rule: { select: { id: true, name: true, type: true, delayMinutes: true, isActive: true } }, ticket: { select: ticketReferenceSelect } },
    });
    return rows.map((row) => ({
      id: row.id, title: formatSupportTicketNumber(row.ticket.number),
      detail: `Failed ${row.action.toLowerCase().replaceAll("_", " ")} · ${row.rule.name} · current rule ${row.rule.isActive ? "On" : "Off"}, configured after ${supportAutomationDelayLabel(row.rule.type, row.rule.delayMinutes)}`,
      occurredAt: row.occurredAt, href: ticketHref(row.ticket.id), action: "Review ticket history",
      related: { href: `/console/tickets/automations#${encodeURIComponent(supportAutomationRuleAnchor(row.rule.id))}`, label: "Review this rule" },
    }));
  }
  if (queue === "billing") {
    const rows = await tx.facility.findMany({
      ...bounds, where: billingWhere, orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { id: true, displayName: true, billing: { select: { status: true, updatedAt: true } } },
    });
    return rows.map((row) => ({ id: row.id, title: row.displayName, detail: billingStatusLabel(row.billing?.status), occurredAt: row.billing!.updatedAt, href: `${customerHref(row.id)}#billing`, action: "Review local billing", related: { href: `${customerHref(row.id)}/lifecycle#licensing`, label: "Review customer access" } }));
  }
  if (queue === "licensing") {
    const rows = await tx.facilityDepartmentEntitlement.findMany({
      ...bounds, where: licensingWhere, orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true, departmentKey: true, updatedAt: true, facility: { select: { id: true, displayName: true } } },
    });
    return rows.map((row) => ({ id: row.id, title: row.facility.displayName, detail: `${row.departmentKey} · active entitlement without a Department link`, occurredAt: row.updatedAt, href: `${customerHref(row.facility.id)}/lifecycle#licensing`, action: "Review licensing state" }));
  }
  const rows = await tx.catalogLogDefinition.findMany({
    ...bounds, where: catalogWhere, orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: { id: true, stableKey: true, version: true, name: true, updatedAt: true },
  });
  return rows.map((row) => ({ id: row.id, title: row.name, detail: `Platform draft · version ${row.version}`, occurredAt: row.updatedAt, href: `/console/catalog/${encodeURIComponent(row.stableKey)}`, action: "Review draft and history" }));
}

/** Metadata only. No command, provider request, message body, recipient, original, or private Catalog projection. */
export async function loadHarborOperations(db: PrismaClient, session: HarborJwtPayload, input: { queue?: unknown; scan?: unknown; page?: string | string[] }) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    if (!(await validateHarborStaffSession(session, tx)).valid) return null;
    const queue = parseHarborOperationQueue(input.queue);
    const scanStage = queue === "scanning" ? parseSupportScanQueueStage(input.scan) : null;
    const observedAt = new Date();
    const [support, priority, delivery, pending, scanning, automation, billing, licensing, catalog] = await Promise.all([
      tx.supportTicket.count({ where: supportQueueWhere("unassigned", session.uid) }),
      tx.supportTicket.count({ where: supportQueueWhere("high", session.uid) }),
      tx.supportTicketMessage.count({ where: deliveryWhere }),
      tx.supportTicketMessage.count({ where: pendingDeliveryWhere }),
      tx.supportTicketAttachment.count({ where: supportScanQueueWhere(null, observedAt) }),
      tx.supportAutomationRun.count({ where: automationWhere }),
      tx.facility.count({ where: billingWhere }),
      tx.facilityDepartmentEntitlement.count({ where: licensingWhere }),
      tx.catalogLogDefinition.count({ where: catalogWhere }),
    ]);
    const scanStages = queue === "scanning" ? await Promise.all(SUPPORT_SCAN_QUEUE_STAGES.map(async (stage) => ({
      ...stage, total: await tx.supportTicketAttachment.count({ where: supportScanQueueWhere(stage.key, observedAt) }),
    }))) : [];
    const counts = { support, priority, delivery, pending, scanning, automation, billing, licensing, catalog } satisfies Record<HarborOperationQueue, number>;
    const queues = HARBOR_OPERATION_QUEUES.map((item) => ({ ...item, total: counts[item.key] }));
    const selectedQueue = queues.find((item) => item.key === queue)!;
    const selected = { ...selectedQueue, total: scanStage ? scanStages.find((stage) => stage.key === scanStage)!.total : selectedQueue.total };
    const window = harborCustomerPageWindow(selected.total, input.page);
    const rows = selected.total ? await readQueue(tx, queue, session.uid, window.offset, observedAt, scanStage) : [];
    const latestAutomation = await tx.supportAutomationRun.findFirst({ orderBy: [{ occurredAt: "desc" }, { id: "desc" }], select: { occurredAt: true, outcome: true } });
    const latestScan = await tx.supportAttachmentScanAttempt.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true, finishedAt: true, status: true } });
    return { queues, selected, ...window, rows, latestAutomation, latestScan, observedAt, scanStage, scanStages, canPublish: hasHarborCapability("catalog.publish", session) };
  }, { isolationLevel: "RepeatableRead" });
  // A snapshot must not keep an already-logged-out login alive while data is assembled.
  if (!result || !(await validateHarborStaffSession(session, db)).valid) return null;
  let scanner: "configured" | "missing" | "invalid";
  try { scanner = getSupportAttachmentScanner() ? "configured" : "missing"; } catch { scanner = "invalid"; }
  return { ...result, infrastructure: {
    scanner, privateStorageConfigured: isSupportAttachmentStorageConfigured(),
    outboundReceiptsConfigured: Boolean(getSupportOutboundWebhookCredentials()),
    replyRoutingConfigured: isSupportReplyRoutingConfigured(),
  } };
}
