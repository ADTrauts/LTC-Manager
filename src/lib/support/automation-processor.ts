import { Prisma, type PrismaClient, type SupportAutomationType, type SupportMessageDeliveryStatus } from "@prisma/client";

import { recordSupportStaffNotifications } from "./notifications";
import { renderSupportSavedReply } from "./saved-replies";
import {
  actionForSupportAutomationType,
  isValidSupportAutomationEmail,
  supportAutomationDedupeKey,
  supportAutomationSubmissionId,
} from "./automation";
import {
  postmarkSupportReplySender,
  sendSupportReply,
  type SupportReplyEmailSender,
} from "./reply";
import { applySupportTicketStatusChange } from "./ticket-service";

const UNSAFE_DELIVERY: SupportMessageDeliveryStatus[] = ["FAILED", "BOUNCED", "SPAM_COMPLAINT"];

export type SupportAutomationProcessResult = {
  scanned: number;
  claimed: number;
  applied: number;
  skipped: number;
  failed: number;
};

type RuleRow = {
  id: string;
  name: string;
  type: SupportAutomationType;
  delayMinutes: number;
  savedReplyId: string | null;
  createdByStaffId: string;
  createdByStaff: { displayName: string };
  savedReply: { id: string; name: string; body: string; isActive: boolean } | null;
};

function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export async function waitingEnteredAt(
  db: PrismaClient,
  ticketId: string,
): Promise<Date | null> {
  const event = await db.supportTicketEvent.findFirst({
    where: { ticketId, type: "STATUS_CHANGED", toValue: "WAITING_ON_CUSTOMER" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return event?.createdAt ?? null;
}

export async function unassignedCycleAt(
  db: PrismaClient,
  ticketId: string,
  createdAt: Date,
): Promise<Date> {
  const event = await db.supportTicketEvent.findFirst({
    where: { ticketId, type: "ASSIGNMENT_CHANGED", toValue: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return event?.createdAt ?? createdAt;
}

export async function latestOutboundDeliveryStatus(
  db: PrismaClient,
  ticketId: string,
): Promise<SupportMessageDeliveryStatus | null> {
  const message = await db.supportTicketMessage.findFirst({
    where: { ticketId, kind: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    select: { deliveryStatus: true },
  });
  return message?.deliveryStatus ?? null;
}

export async function contactHasSpamComplaint(
  db: PrismaClient,
  contactId: string,
): Promise<boolean> {
  const row = await db.supportTicketMessage.findFirst({
    where: { deliveryStatus: "SPAM_COMPLAINT", ticket: { is: { contactId } } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function canSendAutomatedSupportEmail(
  db: PrismaClient,
  input: { ticketId: string; contactId: string; contactEmail: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidSupportAutomationEmail(input.contactEmail)) {
    return { ok: false, reason: "invalid_contact_email" };
  }
  if (await contactHasSpamComplaint(db, input.contactId)) {
    return { ok: false, reason: "spam_complaint" };
  }
  const latest = await latestOutboundDeliveryStatus(db, input.ticketId);
  if (latest && UNSAFE_DELIVERY.includes(latest)) {
    return { ok: false, reason: `unsafe_delivery_${latest.toLowerCase()}` };
  }
  return { ok: true };
}

async function claimRun(
  db: PrismaClient,
  input: {
    ruleId: string;
    ticketId: string;
    action: ReturnType<typeof actionForSupportAutomationType>;
    dedupeKey: string;
    now: Date;
  },
): Promise<{ id: string; created: boolean } | null> {
  const existing = await db.supportAutomationRun.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true, outcome: true },
  });
  if (existing) {
    return null;
  }
  try {
    const created = await db.supportAutomationRun.create({
      data: {
        ruleId: input.ruleId,
        ticketId: input.ticketId,
        action: input.action,
        outcome: "CLAIMED",
        dedupeKey: input.dedupeKey,
        reason: "claimed",
        occurredAt: input.now,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

async function finishRun(
  db: PrismaClient,
  input: {
    runId: string;
    outcome: "APPLIED" | "SKIPPED" | "FAILED";
    reason: string;
    messageId?: string | null;
    eventId?: string | null;
    now: Date;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await db.supportAutomationRun.update({
    where: { id: input.runId },
    data: {
      outcome: input.outcome,
      reason: input.reason.slice(0, 200),
      messageId: input.messageId ?? undefined,
      eventId: input.eventId ?? undefined,
      metadata: input.metadata,
      occurredAt: input.now,
    },
  });
}

async function writeAutomationEvent(
  db: PrismaClient,
  input: {
    ticketId: string;
    ruleId: string;
    ruleName: string;
    action: string;
    causedByMessageId?: string | null;
    now: Date;
  },
) {
  const event = await db.supportTicketEvent.create({
    data: {
      ticketId: input.ticketId,
      type: "AUTOMATION_APPLIED",
      actorStaffId: null,
      causedByMessageId: input.causedByMessageId ?? null,
      toValue: input.action,
      metadata: { source: "AUTOMATION", ruleId: input.ruleId, ruleName: input.ruleName },
      createdAt: input.now,
    },
    select: { id: true },
  });
  return event.id;
}

async function sendAutomationReply(
  db: PrismaClient,
  input: {
    ticketId: string;
    actorStaffId: string;
    actorName: string;
    savedReply: { body: string };
    clientSubmissionId: string;
    send: SupportReplyEmailSender;
    now: Date;
  },
) {
  const ticket = await db.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      number: true,
      contact: { select: { displayName: true } },
      facility: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    throw new Error("ticket_missing");
  }
  const body = renderSupportSavedReply(input.savedReply.body, {
    customerName: ticket.contact.displayName,
    ticketNumber: ticket.number,
    facilityName: ticket.facility?.displayName ?? null,
    staffName: input.actorName,
  });
  return sendSupportReply(
    db,
    {
      ticketId: input.ticketId,
      actorStaffId: input.actorStaffId,
      body,
      clientSubmissionId: input.clientSubmissionId,
      now: input.now,
    },
    input.send,
  );
}

async function processWaitingReminder(
  db: PrismaClient,
  rule: RuleRow,
  ticket: {
    id: string;
    contactId: string;
    contactEmail: string;
    status: string;
  },
  now: Date,
  send: SupportReplyEmailSender,
): Promise<"APPLIED" | "SKIPPED" | "FAILED"> {
  if (ticket.status !== "WAITING_ON_CUSTOMER") {
    return "SKIPPED";
  }
  const entered = await waitingEnteredAt(db, ticket.id);
  if (!entered || entered.getTime() + rule.delayMinutes * 60_000 > now.getTime()) {
    return "SKIPPED";
  }
  const action = actionForSupportAutomationType(rule.type);
  const dedupeKey = supportAutomationDedupeKey(rule.id, ticket.id, action, entered);
  const claimed = await claimRun(db, { ruleId: rule.id, ticketId: ticket.id, action, dedupeKey, now });
  if (!claimed) return "SKIPPED";

  const safety = await canSendAutomatedSupportEmail(db, {
    ticketId: ticket.id,
    contactId: ticket.contactId,
    contactEmail: ticket.contactEmail,
  });
  if (!safety.ok) {
    await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: safety.reason, now });
    return "SKIPPED";
  }
  if (!rule.savedReply?.isActive) {
    await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: "saved_reply_inactive", now });
    return "SKIPPED";
  }

  try {
    const sent = await sendAutomationReply(db, {
      ticketId: ticket.id,
      actorStaffId: rule.createdByStaffId,
      actorName: rule.createdByStaff.displayName,
      savedReply: rule.savedReply,
      clientSubmissionId: supportAutomationSubmissionId(dedupeKey),
      send,
      now,
    });
    if (sent.deliveryStatus !== "SENT" && !sent.duplicate) {
      await finishRun(db, {
        runId: claimed.id,
        outcome: "FAILED",
        reason: "send_failed",
        messageId: sent.messageId,
        now,
      });
      return "FAILED";
    }
    const eventId = await writeAutomationEvent(db, {
      ticketId: ticket.id,
      ruleId: rule.id,
      ruleName: rule.name,
      action,
      causedByMessageId: sent.messageId,
      now,
    });
    await finishRun(db, {
      runId: claimed.id,
      outcome: "APPLIED",
      reason: "reminder_sent",
      messageId: sent.messageId,
      eventId,
      now,
    });
    return "APPLIED";
  } catch (error) {
    await finishRun(db, {
      runId: claimed.id,
      outcome: "FAILED",
      reason: error instanceof Error ? error.message : "send_threw",
      now,
    });
    return "FAILED";
  }
}

async function processWaitingResolve(
  db: PrismaClient,
  rule: RuleRow,
  ticket: {
    id: string;
    contactId: string;
    contactEmail: string;
    status: string;
    resolvedAt: Date | null;
    closedAt: Date | null;
  },
  now: Date,
  send: SupportReplyEmailSender,
): Promise<"APPLIED" | "SKIPPED" | "FAILED"> {
  if (ticket.status !== "WAITING_ON_CUSTOMER") {
    return "SKIPPED";
  }
  const entered = await waitingEnteredAt(db, ticket.id);
  if (!entered || entered.getTime() + rule.delayMinutes * 60_000 > now.getTime()) {
    return "SKIPPED";
  }
  const action = actionForSupportAutomationType(rule.type);
  const dedupeKey = supportAutomationDedupeKey(rule.id, ticket.id, action, entered);
  const claimed = await claimRun(db, { ruleId: rule.id, ticketId: ticket.id, action, dedupeKey, now });
  if (!claimed) return "SKIPPED";

  let messageId: string | null = null;
  if (rule.savedReplyId) {
    const safety = await canSendAutomatedSupportEmail(db, {
      ticketId: ticket.id,
      contactId: ticket.contactId,
      contactEmail: ticket.contactEmail,
    });
    if (!safety.ok) {
      await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: safety.reason, now });
      return "SKIPPED";
    }
    if (!rule.savedReply?.isActive) {
      await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: "saved_reply_inactive", now });
      return "SKIPPED";
    }
    try {
      const sent = await sendAutomationReply(db, {
        ticketId: ticket.id,
        actorStaffId: rule.createdByStaffId,
        actorName: rule.createdByStaff.displayName,
        savedReply: rule.savedReply,
        clientSubmissionId: supportAutomationSubmissionId(dedupeKey),
        send,
        now,
      });
      messageId = sent.messageId;
      if (sent.deliveryStatus !== "SENT" && !sent.duplicate) {
        await finishRun(db, {
          runId: claimed.id,
          outcome: "FAILED",
          reason: "final_send_failed",
          messageId,
          now,
        });
        return "FAILED";
      }
    } catch (error) {
      await finishRun(db, {
        runId: claimed.id,
        outcome: "FAILED",
        reason: error instanceof Error ? error.message : "send_threw",
        now,
      });
      return "FAILED";
    }
  }

  try {
    const event = await db.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({
        where: { id: ticket.id },
        select: { id: true, status: true, resolvedAt: true, closedAt: true },
      });
      if (!current || current.status !== "WAITING_ON_CUSTOMER") {
        return null;
      }
      const changed = await applySupportTicketStatusChange(tx, {
        ticket: current,
        to: "RESOLVED",
        actorStaffId: null,
        causedByMessageId: messageId,
        eventMetadata: { source: "AUTOMATION", ruleId: rule.id, ruleName: rule.name },
        now,
      });
      if (!changed) return null;
      return tx.supportTicketEvent.findFirst({
        where: { ticketId: ticket.id, type: "STATUS_CHANGED", toValue: "RESOLVED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    });
    if (!event) {
      await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: "status_changed", messageId, now });
      return "SKIPPED";
    }
    await finishRun(db, {
      runId: claimed.id,
      outcome: "APPLIED",
      reason: messageId ? "final_notice_resolved" : "resolved_without_email",
      messageId,
      eventId: event.id,
      now,
    });
    return "APPLIED";
  } catch (error) {
    await finishRun(db, {
      runId: claimed.id,
      outcome: "FAILED",
      reason: error instanceof Error ? error.message : "resolve_failed",
      messageId,
      now,
    });
    return "FAILED";
  }
}

async function processResolvedClose(
  db: PrismaClient,
  rule: RuleRow,
  ticket: { id: string; status: string; resolvedAt: Date | null; closedAt: Date | null },
  now: Date,
): Promise<"APPLIED" | "SKIPPED" | "FAILED"> {
  if (ticket.status !== "RESOLVED" || !ticket.resolvedAt) {
    return "SKIPPED";
  }
  if (ticket.resolvedAt.getTime() + rule.delayMinutes * 60_000 > now.getTime()) {
    return "SKIPPED";
  }
  const action = actionForSupportAutomationType(rule.type);
  const dedupeKey = supportAutomationDedupeKey(rule.id, ticket.id, action, ticket.resolvedAt);
  const claimed = await claimRun(db, { ruleId: rule.id, ticketId: ticket.id, action, dedupeKey, now });
  if (!claimed) return "SKIPPED";

  try {
    const event = await db.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUnique({
        where: { id: ticket.id },
        select: { id: true, status: true, resolvedAt: true, closedAt: true },
      });
      if (!current || current.status !== "RESOLVED" || !current.resolvedAt) {
        return null;
      }
      const changed = await applySupportTicketStatusChange(tx, {
        ticket: current,
        to: "CLOSED",
        actorStaffId: null,
        eventMetadata: { source: "AUTOMATION", ruleId: rule.id, ruleName: rule.name },
        now,
      });
      if (!changed) return null;
      return tx.supportTicketEvent.findFirst({
        where: { ticketId: ticket.id, type: "STATUS_CHANGED", toValue: "CLOSED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    });
    if (!event) {
      await finishRun(db, { runId: claimed.id, outcome: "SKIPPED", reason: "status_changed", now });
      return "SKIPPED";
    }
    await finishRun(db, { runId: claimed.id, outcome: "APPLIED", reason: "closed_resolved", eventId: event.id, now });
    return "APPLIED";
  } catch (error) {
    await finishRun(db, {
      runId: claimed.id,
      outcome: "FAILED",
      reason: error instanceof Error ? error.message : "close_failed",
      now,
    });
    return "FAILED";
  }
}

async function processUnassignedAlert(
  db: PrismaClient,
  rule: RuleRow,
  ticket: {
    id: string;
    number: number;
    subject: string;
    status: string;
    assignedStaffId: string | null;
    createdAt: Date;
  },
  now: Date,
): Promise<"APPLIED" | "SKIPPED" | "FAILED"> {
  if (ticket.assignedStaffId || (ticket.status !== "NEW" && ticket.status !== "OPEN")) {
    return "SKIPPED";
  }
  const cycleAt = await unassignedCycleAt(db, ticket.id, ticket.createdAt);
  if (cycleAt.getTime() + rule.delayMinutes * 60_000 > now.getTime()) {
    return "SKIPPED";
  }
  const action = actionForSupportAutomationType(rule.type);
  const dedupeKey = supportAutomationDedupeKey(rule.id, ticket.id, action, cycleAt);
  const claimed = await claimRun(db, { ruleId: rule.id, ticketId: ticket.id, action, dedupeKey, now });
  if (!claimed) return "SKIPPED";

  try {
    await recordSupportStaffNotifications(db, {
      type: "UNASSIGNED_ALERT",
      ticket: {
        id: ticket.id,
        number: ticket.number,
        subject: ticket.subject,
        assignedStaffId: null,
      },
      sourceKey: dedupeKey,
      now,
    });
    const eventId = await writeAutomationEvent(db, {
      ticketId: ticket.id,
      ruleId: rule.id,
      ruleName: rule.name,
      action,
      now,
    });
    await finishRun(db, { runId: claimed.id, outcome: "APPLIED", reason: "staff_alerted", eventId, now });
    return "APPLIED";
  } catch (error) {
    await finishRun(db, {
      runId: claimed.id,
      outcome: "FAILED",
      reason: error instanceof Error ? error.message : "alert_failed",
      now,
    });
    return "FAILED";
  }
}

async function candidateTicketIds(db: PrismaClient, rule: RuleRow, now: Date): Promise<string[]> {
  const cutoff = minutesAgo(now, rule.delayMinutes);
  if (rule.type === "WAITING_REMINDER" || rule.type === "WAITING_RESOLVE") {
    const rows = await db.supportTicket.findMany({
      where: { status: "WAITING_ON_CUSTOMER" },
      select: { id: true },
      take: 200,
    });
    return rows.map((row) => row.id);
  }
  if (rule.type === "RESOLVED_CLOSE") {
    const rows = await db.supportTicket.findMany({
      where: { status: "RESOLVED", resolvedAt: { lte: cutoff } },
      select: { id: true },
      take: 200,
    });
    return rows.map((row) => row.id);
  }
  const rows = await db.supportTicket.findMany({
    where: {
      assignedStaffId: null,
      status: { in: ["NEW", "OPEN"] },
      createdAt: { lte: cutoff },
    },
    select: { id: true },
    take: 200,
  });
  return rows.map((row) => row.id);
}

export async function processSupportAutomations(
  db: PrismaClient,
  options: {
    now?: Date;
    send?: SupportReplyEmailSender;
    ruleIds?: string[];
  } = {},
): Promise<SupportAutomationProcessResult> {
  const now = options.now ?? new Date();
  const send = options.send ?? postmarkSupportReplySender;
  const rules = await db.supportAutomationRule.findMany({
    where: {
      isActive: true,
      ...(options.ruleIds ? { id: { in: options.ruleIds } } : {}),
    },
    include: {
      createdByStaff: { select: { displayName: true } },
      savedReply: { select: { id: true, name: true, body: true, isActive: true } },
    },
  });

  const result: SupportAutomationProcessResult = {
    scanned: 0,
    claimed: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  for (const rule of rules) {
    const ids = await candidateTicketIds(db, rule, now);
    for (const ticketId of ids) {
      result.scanned += 1;
      try {
        const ticket = await db.supportTicket.findUnique({
          where: { id: ticketId },
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            assignedStaffId: true,
            createdAt: true,
            resolvedAt: true,
            closedAt: true,
            contactId: true,
            contact: { select: { email: true } },
          },
        });
        if (!ticket) {
          result.skipped += 1;
          continue;
        }
        const row = {
          ...ticket,
          contactEmail: ticket.contact.email,
        };
        let outcome: "APPLIED" | "SKIPPED" | "FAILED" = "SKIPPED";
        if (rule.type === "WAITING_REMINDER") {
          outcome = await processWaitingReminder(db, rule, row, now, send);
        } else if (rule.type === "WAITING_RESOLVE") {
          outcome = await processWaitingResolve(db, rule, row, now, send);
        } else if (rule.type === "RESOLVED_CLOSE") {
          outcome = await processResolvedClose(db, rule, row, now);
        } else {
          outcome = await processUnassignedAlert(db, rule, row, now);
        }
        if (outcome === "APPLIED") result.applied += 1;
        else if (outcome === "FAILED") result.failed += 1;
        else result.skipped += 1;
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}

export function isSupportAutomationCronAuthorized(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
