/**
 * Notification Center read model.
 *
 * Scoped to one User and the active Facility. It does not read Coverage,
 * Dashboard Attention, or Harbor support notices, and it does not decide
 * whether the operational condition is still true.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

import { isWebPushSendingEnabled } from "./web-push-config";
import {
  NOTIFICATION_CENTER_FETCH_CAP,
  NOTIFICATION_CENTER_LIMIT,
  RESOLVED_PRESENTATION_WINDOW_MS,
  classifyNotificationSection,
  compareActiveAttention,
  formatAttentionTime,
  notificationActionLabel,
  notificationPriorityLabel,
  safeNotificationActionPath,
  type NotificationCenterSection,
} from "./center";
import { readPrimaryResponsibilityReason } from "./responsibility-context";
import { holdsPrimaryNow, presentSnoozeControl, type SnoozeControl } from "./snooze";

type Db = PrismaClient | Prisma.TransactionClient;

export type NotificationCenterItem = {
  id: string;
  section: NotificationCenterSection;
  kind: "OPERATIONAL" | "COMMUNICATION" | "SYSTEM" | "ADMIN";
  category: string;
  priority: "UPDATE" | "NEEDS_ATTENTION" | "URGENT" | "CRITICAL";
  priorityLabel: string;
  title: string;
  body: string;
  departmentName: string | null;
  occurredAtLabel: string;
  resolvedAtLabel: string | null;
  endedAtLabel: string | null;
  read: boolean;
  acknowledged: boolean;
  requiresAcknowledgement: boolean;
  explanations: string[];
  actionPath: string | null;
  actionLabel: string | null;
  snooze: SnoozeControl;
};

export type NotificationCenterModel =
  | { status: "no_access" }
  | {
      status: "ready";
      activeCount: number;
      browserDeliveryActive: boolean;
      needsAttention: NotificationCenterItem[];
      messages: NotificationCenterItem[];
      updates: NotificationCenterItem[];
      resolved: NotificationCenterItem[];
      ended: NotificationCenterItem[];
    };

const recipientSelect = {
  id: true,
  userId: true,
  readAt: true,
  acknowledgedAt: true,
  explanation: true,
  snoozedUntil: true,
  notification: {
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      kind: true,
      category: true,
      priority: true,
      title: true,
      body: true,
      actionPath: true,
      requiresAcknowledgement: true,
      sourceType: true,
      sourceId: true,
      metadata: true,
      occurredAt: true,
      resolvedAt: true,
      expiresAt: true,
      department: { select: { name: true } },
    },
  },
} satisfies Prisma.NotificationRecipientSelect;

type RecipientRow = Prisma.NotificationRecipientGetPayload<{ select: typeof recipientSelect }>;

function stillActionable(now: Date) {
  return {
    resolvedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

export async function getActiveAttentionCountForUser(
  db: Db,
  input: { userId: string; facilityId: string; now?: Date },
): Promise<number | null> {
  if (!(await userHasActiveFacilityAccess(db, input.userId, input.facilityId))) return null;
  const now = input.now ?? new Date();
  return db.notification.count({
    where: {
      facilityId: input.facilityId,
      ...stillActionable(now),
      kind: { in: ["OPERATIONAL", "SYSTEM", "ADMIN"] },
      priority: { in: ["NEEDS_ATTENTION", "URGENT", "CRITICAL"] },
      recipients: { some: { userId: input.userId } },
    },
  });
}

export async function loadNotificationCenter(
  db: Db,
  input: { userId: string; facilityId: string; now: Date; timeZone: string },
): Promise<NotificationCenterModel> {
  if (!(await userHasActiveFacilityAccess(db, input.userId, input.facilityId))) {
    return { status: "no_access" };
  }

  const resolvedSince = new Date(input.now.getTime() - RESOLVED_PRESENTATION_WINDOW_MS);
  const [openRows, resolvedRows, endedRows, activeCount] = await Promise.all([
    db.notificationRecipient.findMany({
      where: {
        userId: input.userId,
        notification: { facilityId: input.facilityId, ...stillActionable(input.now) },
      },
      select: recipientSelect,
      orderBy: { notification: { occurredAt: "desc" } },
      take: NOTIFICATION_CENTER_FETCH_CAP,
    }),
    db.notificationRecipient.findMany({
      where: {
        userId: input.userId,
        notification: {
          facilityId: input.facilityId,
          resolvedAt: { gte: resolvedSince },
        },
      },
      select: recipientSelect,
      orderBy: { notification: { resolvedAt: "desc" } },
      take: NOTIFICATION_CENTER_FETCH_CAP,
    }),
    db.notificationRecipient.findMany({
      where: {
        userId: input.userId,
        notification: {
          facilityId: input.facilityId,
          resolvedAt: null,
          expiresAt: { lte: input.now, gte: resolvedSince },
        },
      },
      select: recipientSelect,
      orderBy: { notification: { expiresAt: "desc" } },
      take: NOTIFICATION_CENTER_FETCH_CAP,
    }),
    getActiveAttentionCountForUser(db, input),
  ]);

  const [open, resolvedFolded, endedFolded] = await Promise.all([
    foldRecipients(db, openRows, input.timeZone, input.now),
    foldRecipients(db, resolvedRows, input.timeZone, input.now),
    foldRecipients(db, endedRows, input.timeZone, input.now),
  ]);
  open.sort((left, right) => {
    if (left.section === "needs_attention" && right.section === "needs_attention") {
      return compareActiveAttention(left, right);
    }
    const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
    if (byTime !== 0) return byTime;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const resolved = resolvedFolded
    .filter((item) => item.section === "resolved")
    .sort((left, right) => {
      const byTime = (right.resolvedAt?.getTime() ?? 0) - (left.resolvedAt?.getTime() ?? 0);
      if (byTime !== 0) return byTime;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  const ended = endedFolded
    .filter((item) => item.section === "ended")
    .sort((left, right) => {
      const byTime = (right.expiresAt?.getTime() ?? 0) - (left.expiresAt?.getTime() ?? 0);
      if (byTime !== 0) return byTime;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  const needsAttention = open.filter((item) => item.section === "needs_attention");
  const messages = open.filter((item) => item.section === "messages");
  const updates = open.filter((item) => item.section === "updates");

  return {
    status: "ready",
    activeCount: activeCount ?? 0,
    browserDeliveryActive: isWebPushSendingEnabled(),
    needsAttention: needsAttention.slice(0, NOTIFICATION_CENTER_LIMIT).map(toViewItem),
    messages: messages.slice(0, NOTIFICATION_CENTER_LIMIT).map(toViewItem),
    updates: updates.slice(0, NOTIFICATION_CENTER_LIMIT).map(toViewItem),
    resolved: resolved.slice(0, NOTIFICATION_CENTER_LIMIT).map(toViewItem),
    ended: ended.slice(0, NOTIFICATION_CENTER_LIMIT).map(toViewItem),
  };
}

type FoldedItem = NotificationCenterItem & {
  occurredAt: Date;
  resolvedAt: Date | null;
  expiresAt: Date | null;
};

function toViewItem(item: FoldedItem): NotificationCenterItem {
  const { occurredAt: _occurredAt, resolvedAt: _resolvedAt, expiresAt: _expiresAt, ...view } = item;
  return view;
}

async function foldRecipients(db: Db, rows: RecipientRow[], timeZone: string, now: Date): Promise<FoldedItem[]> {
  const grouped = new Map<string, RecipientRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.notification.id) ?? [];
    existing.push(row);
    grouped.set(row.notification.id, existing);
  }
  const items: FoldedItem[] = [];
  for (const group of grouped.values()) {
    const notification = group[0]!.notification;
    const section = classifyNotificationSection({ ...notification, now });
    const actionPath = safeNotificationActionPath(notification.actionPath);
    const metadata =
      notification.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata)
        ? notification.metadata
        : null;
    const protectedAttention = metadata?.protected !== false;
    const futureSnooze = group.reduce<Date | null>((latest, row) => {
      if (!row.snoozedUntil || row.snoozedUntil.getTime() <= now.getTime()) return latest;
      if (!latest || row.snoozedUntil.getTime() > latest.getTime()) return row.snoozedUntil;
      return latest;
    }, null);
    const closed = notification.resolvedAt != null || notification.expiresAt != null;
    const holds =
      notification.priority === "URGENT" && protectedAttention === false && !closed
        ? await holdsPrimaryNow(db, notification, group[0]!.userId, now)
        : null;
    const primary = readPrimaryResponsibilityReason(notification.metadata);
    items.push({
      id: notification.id,
      section,
      kind: notification.kind,
      category: notification.category,
      priority: notification.priority,
      priorityLabel: notificationPriorityLabel(notification.priority),
      title: notification.title,
      body: notification.body,
      departmentName: notification.department?.name ?? null,
      occurredAt: notification.occurredAt,
      occurredAtLabel: formatAttentionTime(notification.occurredAt, timeZone),
      resolvedAt: notification.resolvedAt,
      resolvedAtLabel: notification.resolvedAt ? formatAttentionTime(notification.resolvedAt, timeZone) : null,
      expiresAt: notification.expiresAt,
      endedAtLabel: notification.expiresAt ? formatAttentionTime(notification.expiresAt, timeZone) : null,
      read: group.every((row) => row.readAt != null),
      acknowledged: group.some((row) => row.acknowledgedAt != null),
      requiresAcknowledgement: notification.requiresAcknowledgement,
      explanations: uniqueExplanations(group.map((row) => row.explanation)),
      actionPath,
      actionLabel: actionPath ? notificationActionLabel(notification.category) : null,
      snooze: presentSnoozeControl({
        attention: {
          kind: notification.kind,
          priority: notification.priority,
          requiresAcknowledgement: notification.requiresAcknowledgement,
          protected: protectedAttention,
          recipientReasons: primary ? [primary] : [],
        },
        resolvedAt: notification.resolvedAt,
        expiresAt: notification.expiresAt,
        now,
        snoozedUntil: futureSnooze,
        currentlyHoldsPrimaryResponsibility: holds,
        timeZone,
      }),
    });
  }
  return items;
}

function uniqueExplanations(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}
