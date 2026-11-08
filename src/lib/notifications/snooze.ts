/**
 * Recipient snooze.
 *
 * Snooze suppresses later external interruption for this User's rows on one
 * thread. It does not acknowledge, hide the Center item, change the bell,
 * or stop escalation. Only that User's rows are written.
 */

import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

import { formatAttentionTime } from "./center";

import { resolveNotificationRecipients } from "./recipient-resolver";
import { loadResponsibilityContext, readPrimaryResponsibilityReason } from "./responsibility-context";
import {
  deriveResponsePolicy,
  SNOOZE_POLICY,
  type AttentionForResponse,
} from "./response-policy";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * No certified maximum existed. Four hours covers one meal service and does
 * not silence external interruption for a whole shift. It is not configurable.
 */
export const ATTENTION_SNOOZE_MAX_MS = 4 * 60 * 60 * 1000;

export const SNOOZE_DURATION_CHOICES = [
  { token: "30m", label: "30 minutes", ms: 30 * 60 * 1000 },
  { token: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { token: "4h", label: "4 hours", ms: ATTENTION_SNOOZE_MAX_MS },
] as const;

export type SnoozeDurationToken = (typeof SNOOZE_DURATION_CHOICES)[number]["token"];

export type SnoozeControl =
  | { state: "hidden" }
  | { state: "available" }
  | { state: "paused"; untilLabel: string };

/** The server accepts only these three durations. A raw millisecond value is refused. */
export function snoozeUntilFromChoice(token: string, now: Date): Date | null {
  const choice = SNOOZE_DURATION_CHOICES.find((row) => row.token === token);
  if (!choice || choice.ms <= 0 || choice.ms > ATTENTION_SNOOZE_MAX_MS) return null;
  return new Date(now.getTime() + choice.ms);
}

/**
 * One control for this User on this thread.
 * A past snoozedUntil is not shown as paused. The timestamp can stay.
 */
export function presentSnoozeControl(input: {
  attention: AttentionForResponse;
  resolvedAt: Date | null;
  expiresAt: Date | null;
  now: Date;
  snoozedUntil: Date | null;
  currentlyHoldsPrimaryResponsibility?: boolean | null;
  timeZone: string;
}): SnoozeControl {
  if (input.snoozedUntil && input.snoozedUntil.getTime() > input.now.getTime()) {
    return { state: "paused", untilLabel: formatAttentionTime(input.snoozedUntil, input.timeZone) };
  }
  const decision = evaluateSnoozeEligibility({
    attention: input.attention,
    resolvedAt: input.resolvedAt,
    expiresAt: input.expiresAt,
    now: input.now,
    currentlyHoldsPrimaryResponsibility: input.currentlyHoldsPrimaryResponsibility,
  });
  return decision === "allowed" ? { state: "available" } : { state: "hidden" };
}

export type SnoozeDecision =
  | "allowed"
  | "update_not_snoozable"
  | "protected_not_snoozable"
  | "critical_not_snoozable"
  | "current_responsibility_holder"
  | "responsibility_unresolved"
  | "thread_closed"
  | "invalid_duration";

export class NotificationSnoozeError extends Error {
  readonly code: "NOT_FOUND" | "NOT_RECIPIENT" | "FACILITY_ACCESS_DENIED";

  constructor(code: NotificationSnoozeError["code"]) {
    super(code);
    this.name = "NotificationSnoozeError";
    this.code = code;
  }
}

type SnoozeThread = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  kind: NotificationKind;
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.JsonValue | null;
  resolvedAt: Date | null;
  expiresAt: Date | null;
};

export function evaluateSnoozeEligibility(input: {
  attention: AttentionForResponse;
  resolvedAt: Date | null;
  expiresAt: Date | null;
  now: Date;
  snoozedUntil?: Date | null;
  currentlyHoldsPrimaryResponsibility?: boolean | null;
}): SnoozeDecision {
  if (input.resolvedAt || input.expiresAt) return "thread_closed";
  if (input.attention.priority === NotificationPriority.UPDATE) return "update_not_snoozable";
  if (input.attention.priority === NotificationPriority.CRITICAL) return "critical_not_snoozable";
  if (input.attention.protected) return "protected_not_snoozable";
  let policy;
  try {
    policy = deriveResponsePolicy(input.attention);
  } catch {
    return "protected_not_snoozable";
  }
  if (policy.snooze === SNOOZE_POLICY.NONE) return "protected_not_snoozable";
  if (policy.snooze === SNOOZE_POLICY.NON_RESPONSIBLE_RECIPIENT_ONLY) {
    if (input.currentlyHoldsPrimaryResponsibility === true) return "current_responsibility_holder";
    if (input.currentlyHoldsPrimaryResponsibility !== false) return "responsibility_unresolved";
  }
  if (input.snoozedUntil) {
    const distance = input.snoozedUntil.getTime() - input.now.getTime();
    if (distance <= 0 || distance > ATTENTION_SNOOZE_MAX_MS) return "invalid_duration";
  }
  return "allowed";
}

export async function setNotificationSnooze(
  db: Db,
  input: {
    facilityId: string;
    notificationId: string;
    userId: string;
    snoozedUntil: Date;
    now?: Date;
  },
): Promise<{ ok: true; snoozedUntil: Date } | { ok: false; decision: Exclude<SnoozeDecision, "allowed"> }> {
  const now = input.now ?? new Date();
  const loaded = await loadOwnThread(db, input);
  const holds = await holdsPrimaryNow(db, loaded.thread, input.userId, now);
  const decision = evaluateSnoozeEligibility({
    attention: loaded.attention,
    resolvedAt: loaded.thread.resolvedAt,
    expiresAt: loaded.thread.expiresAt,
    now,
    snoozedUntil: input.snoozedUntil,
    currentlyHoldsPrimaryResponsibility: holds,
  });
  if (decision !== "allowed") return { ok: false, decision };
  await db.notificationRecipient.updateMany({
    where: { notificationId: loaded.thread.id, userId: input.userId },
    data: { snoozedUntil: input.snoozedUntil },
  });
  return { ok: true, snoozedUntil: input.snoozedUntil };
}

export async function clearNotificationSnooze(
  db: Db,
  input: { facilityId: string; notificationId: string; userId: string },
): Promise<{ snoozedUntil: null }> {
  const loaded = await loadOwnThread(db, input);
  await db.notificationRecipient.updateMany({
    where: { notificationId: loaded.thread.id, userId: input.userId },
    data: { snoozedUntil: null },
  });
  return { snoozedUntil: null };
}

async function loadOwnThread(
  db: Db,
  input: { facilityId: string; notificationId: string; userId: string },
): Promise<{ thread: SnoozeThread; attention: AttentionForResponse }> {
  if (!(await userHasActiveFacilityAccess(db, input.userId, input.facilityId))) {
    throw new NotificationSnoozeError("FACILITY_ACCESS_DENIED");
  }
  const thread = await db.notification.findFirst({
    where: { id: input.notificationId, facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      kind: true,
      priority: true,
      requiresAcknowledgement: true,
      sourceType: true,
      sourceId: true,
      metadata: true,
      resolvedAt: true,
      expiresAt: true,
      recipients: {
        where: { userId: input.userId },
        select: { id: true },
      },
    },
  });
  if (!thread) throw new NotificationSnoozeError("NOT_FOUND");
  if (thread.recipients.length === 0) throw new NotificationSnoozeError("NOT_RECIPIENT");
  const metadata =
    thread.metadata && typeof thread.metadata === "object" && !Array.isArray(thread.metadata)
      ? thread.metadata
      : null;
  const primary = readPrimaryResponsibilityReason(thread.metadata);
  const protectedAttention = metadata?.protected !== false;
  return {
    thread,
    attention: {
      kind: thread.kind,
      priority: thread.priority,
      requiresAcknowledgement: thread.requiresAcknowledgement,
      protected: protectedAttention,
      recipientReasons: primary ? [primary] : [],
    },
  };
}

export async function holdsPrimaryNow(
  db: Db,
  thread: SnoozeThread,
  userId: string,
  now: Date,
): Promise<boolean | null> {
  const primary = readPrimaryResponsibilityReason(thread.metadata);
  if (
    primary !== NotificationRecipientReason.ON_DUTY_SUPERVISOR &&
    primary !== NotificationRecipientReason.ON_CALL_RESPONDER &&
    primary !== NotificationRecipientReason.WORK_ORDER_ASSIGNEE
  ) {
    return null;
  }
  if (primary === NotificationRecipientReason.WORK_ORDER_ASSIGNEE) {
    const repairId = repairIdFromThread(thread.sourceId);
    if (!repairId) return null;
    const repair = await db.repair.findFirst({
      where: { id: repairId, unit: { facilityId: thread.facilityId } },
      select: { assignedEmployee: { select: { userId: true } } },
    });
    if (!repair) return null;
    return repair.assignedEmployee?.userId === userId;
  }
  const loaded = await loadResponsibilityContext(db, thread);
  if (!loaded.ok || loaded.context.primaryReason !== primary) return null;
  const resolution = await resolveNotificationRecipients(db, {
    facilityId: loaded.context.facilityId,
    departmentId: loaded.context.departmentId,
    audience: "floor",
    reasons: [primary],
    onDuty:
      primary === NotificationRecipientReason.ON_DUTY_SUPERVISOR
        ? {
            serviceDate: loaded.context.serviceDate ?? "",
            at: now,
            unitId: loaded.context.unitId,
            spaceId: loaded.context.spaceId,
          }
        : null,
    onCall:
      primary === NotificationRecipientReason.ON_CALL_RESPONDER
        ? { at: now, unitId: loaded.context.unitId, spaceId: loaded.context.spaceId }
        : null,
  });
  return resolution.resolved.some((row) => row.userId === userId && row.reason === primary);
}

function repairIdFromThread(sourceId: string): string | null {
  try {
    const value: unknown = JSON.parse(sourceId);
    if (!Array.isArray(value) || value.length < 3) return null;
    const repairId = value[2];
    return typeof repairId === "string" && repairId.length > 0 ? repairId : null;
  } catch {
    return null;
  }
}
