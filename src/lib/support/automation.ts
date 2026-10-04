import { createHash } from "node:crypto";
import type {
  PrismaClient,
  SupportAutomationAction,
  SupportAutomationType,
} from "@prisma/client";

import { SupportTicketError } from "./errors";

export const SUPPORT_AUTOMATION_TYPES = [
  "WAITING_REMINDER",
  "WAITING_RESOLVE",
  "RESOLVED_CLOSE",
  "UNASSIGNED_ALERT",
] as const satisfies readonly SupportAutomationType[];

export const SUPPORT_AUTOMATION_TYPE_LABEL: Record<SupportAutomationType, string> = {
  WAITING_REMINDER: "Customer reminder",
  WAITING_RESOLVE: "Resolve after no response",
  RESOLVED_CLOSE: "Close resolved tickets",
  UNASSIGNED_ALERT: "Unassigned ticket alert",
};

export const SUPPORT_AUTOMATION_ACTION_LABEL: Record<SupportAutomationAction, string> = {
  SEND_REMINDER: "Reminder sent",
  RESOLVE_AFTER_WAIT: "Resolved after no response",
  CLOSE_RESOLVED: "Closed resolved ticket",
  ALERT_UNASSIGNED: "Unassigned ticket alert",
};

export const SUPPORT_AUTOMATION_MINUTES_PER_DAY = 1440;
export const SUPPORT_AUTOMATION_RECENT_RUNS = 20;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSupportAutomationType(value: unknown): value is SupportAutomationType {
  return typeof value === "string" && (SUPPORT_AUTOMATION_TYPES as readonly string[]).includes(value);
}

export function isValidSupportAutomationEmail(email: string | null | undefined): boolean {
  return Boolean(email && EMAIL_RE.test(email.trim()));
}

export function actionForSupportAutomationType(type: SupportAutomationType): SupportAutomationAction {
  switch (type) {
    case "WAITING_REMINDER":
      return "SEND_REMINDER";
    case "WAITING_RESOLVE":
      return "RESOLVE_AFTER_WAIT";
    case "RESOLVED_CLOSE":
      return "CLOSE_RESOLVED";
    case "UNASSIGNED_ALERT":
      return "ALERT_UNASSIGNED";
  }
}

export function supportAutomationDelayLabel(type: SupportAutomationType, delayMinutes: number): string {
  if (type === "UNASSIGNED_ALERT") {
    if (delayMinutes > 0 && delayMinutes % 60 === 0) {
      const hours = delayMinutes / 60;
      return hours === 1 ? "1 hour" : `${hours} hours`;
    }
    return delayMinutes === 1 ? "1 minute" : `${delayMinutes} minutes`;
  }
  if (delayMinutes > 0 && delayMinutes % SUPPORT_AUTOMATION_MINUTES_PER_DAY === 0) {
    const days = delayMinutes / SUPPORT_AUTOMATION_MINUTES_PER_DAY;
    return days === 1 ? "1 day" : `${days} days`;
  }
  return delayMinutes === 1 ? "1 minute" : `${delayMinutes} minutes`;
}

export function supportAutomationDedupeKey(
  ruleId: string,
  ticketId: string,
  action: SupportAutomationAction,
  cycleAt: Date,
): string {
  return `${ruleId}:${ticketId}:${action}:${cycleAt.toISOString()}`;
}

export function supportAutomationSubmissionId(dedupeKey: string): string {
  const hex = createHash("sha256").update(dedupeKey).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function trimName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validateRuleFields(input: {
  name: string;
  type: SupportAutomationType;
  delayMinutes: number;
  savedReplyId?: string | null;
}) {
  const name = trimName(input.name);
  if (!name || name.length > 80) {
    throw new SupportTicketError("invalid_input");
  }
  if (!Number.isInteger(input.delayMinutes) || input.delayMinutes < 0 || input.delayMinutes > 60 * 24 * 365) {
    throw new SupportTicketError("invalid_input");
  }
  if (input.type === "WAITING_REMINDER" && !input.savedReplyId) {
    throw new SupportTicketError("invalid_input");
  }
  if (
    (input.type === "RESOLVED_CLOSE" || input.type === "UNASSIGNED_ALERT") &&
    input.savedReplyId
  ) {
    throw new SupportTicketError("invalid_input");
  }
  return { name, savedReplyId: input.savedReplyId ?? null };
}

export async function createSupportAutomationRule(
  db: PrismaClient,
  input: {
    actorStaffId: string;
    name: string;
    type: SupportAutomationType;
    delayMinutes: number;
    savedReplyId?: string | null;
    isActive?: boolean;
  },
) {
  const fields = validateRuleFields(input);
  if (fields.savedReplyId) {
    const reply = await db.supportSavedReply.findUnique({
      where: { id: fields.savedReplyId },
      select: { id: true, isActive: true },
    });
    if (!reply?.isActive) {
      throw new SupportTicketError("invalid_reference");
    }
  }
  return db.supportAutomationRule.create({
    data: {
      name: fields.name,
      type: input.type,
      delayMinutes: input.delayMinutes,
      savedReplyId: fields.savedReplyId,
      isActive: input.isActive === true,
      createdByStaffId: input.actorStaffId,
    },
  });
}

export async function updateSupportAutomationRule(
  db: PrismaClient,
  input: {
    ruleId: string;
    name: string;
    delayMinutes: number;
    savedReplyId?: string | null;
  },
) {
  const current = await db.supportAutomationRule.findUnique({
    where: { id: input.ruleId },
    select: { id: true, type: true },
  });
  if (!current) {
    throw new SupportTicketError("not_found");
  }
  const fields = validateRuleFields({
    name: input.name,
    type: current.type,
    delayMinutes: input.delayMinutes,
    savedReplyId: input.savedReplyId,
  });
  if (fields.savedReplyId) {
    const reply = await db.supportSavedReply.findUnique({
      where: { id: fields.savedReplyId },
      select: { id: true, isActive: true },
    });
    if (!reply) {
      throw new SupportTicketError("invalid_reference");
    }
  }
  return db.supportAutomationRule.update({
    where: { id: current.id },
    data: {
      name: fields.name,
      delayMinutes: input.delayMinutes,
      savedReplyId: fields.savedReplyId,
    },
  });
}

export async function setSupportAutomationRuleActive(
  db: PrismaClient,
  input: { ruleId: string; isActive: boolean },
) {
  const current = await db.supportAutomationRule.findUnique({
    where: { id: input.ruleId },
    select: { id: true },
  });
  if (!current) {
    throw new SupportTicketError("not_found");
  }
  return db.supportAutomationRule.update({
    where: { id: current.id },
    data: { isActive: input.isActive },
  });
}

export async function listSupportAutomationRules(db: PrismaClient) {
  return db.supportAutomationRule.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      savedReply: { select: { id: true, name: true, isActive: true } },
      _count: { select: { runs: { where: { outcome: "APPLIED" } } } },
    },
  });
}

export async function listRecentSupportAutomationRuns(db: PrismaClient, take = SUPPORT_AUTOMATION_RECENT_RUNS) {
  return db.supportAutomationRun.findMany({
    where: { outcome: { in: ["APPLIED", "SKIPPED", "FAILED"] } },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      outcome: true,
      reason: true,
      occurredAt: true,
      ticket: { select: { id: true, number: true, subject: true } },
      rule: { select: { id: true, name: true } },
    },
  });
}
