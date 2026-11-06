/**
 * Notification Center presentation rules.
 *
 * The bell counts unresolved attention that has not expired. It does not count
 * unread Updates, resolved history, ended history, or future Chat.
 * Reading an item does not remove it.
 *
 * Snooze is not applied here. A stored snoozedUntil does not hide an item
 * or change the bell. It only marks later external interruption.
 */

import type { NotificationKind, NotificationPriority } from "@prisma/client";

export const NOTIFICATION_CENTER_LIMIT = 40;
export const NOTIFICATION_CENTER_FETCH_CAP = 200;
/** Presentation only. Resolved rows are not deleted. */
export const RESOLVED_PRESENTATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type NotificationCenterSection = "needs_attention" | "messages" | "updates" | "resolved" | "ended";

const ACTIVE_PRIORITIES = new Set<NotificationPriority>(["NEEDS_ATTENTION", "URGENT", "CRITICAL"]);

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  CRITICAL: 0,
  URGENT: 1,
  NEEDS_ATTENTION: 2,
  UPDATE: 3,
};

export function classifyNotificationSection(input: {
  kind: NotificationKind;
  priority: NotificationPriority;
  resolvedAt: Date | null;
  expiresAt?: Date | null;
  now?: Date;
}): NotificationCenterSection {
  if (input.resolvedAt) return "resolved";
  if (input.expiresAt && input.now && input.expiresAt.getTime() <= input.now.getTime()) return "ended";
  if (input.kind === "COMMUNICATION") return "messages";
  if (input.priority === "UPDATE") return "updates";
  return "needs_attention";
}

/**
 * Active operational attention for the bell.
 * Communication is excluded. Update is excluded. Resolved is excluded.
 * Read and acknowledgement do not change the answer.
 */
export function isActiveAttention(input: {
  kind: NotificationKind;
  priority: NotificationPriority;
  resolvedAt: Date | null;
  expiresAt?: Date | null;
  now?: Date;
}): boolean {
  if (input.resolvedAt) return false;
  if (input.expiresAt && input.now && input.expiresAt.getTime() <= input.now.getTime()) return false;
  if (input.kind === "COMMUNICATION") return false;
  return ACTIVE_PRIORITIES.has(input.priority);
}

export function compareActiveAttention(
  left: { priority: NotificationPriority; occurredAt: Date; id: string },
  right: { priority: NotificationPriority; occurredAt: Date; id: string },
): number {
  const byPriority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (byPriority !== 0) return byPriority;
  const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function notificationPriorityLabel(priority: NotificationPriority): string {
  switch (priority) {
    case "UPDATE":
      return "Update";
    case "NEEDS_ATTENTION":
      return "Needs Attention";
    case "URGENT":
      return "Urgent";
    case "CRITICAL":
      return "Critical";
  }
}

export function notificationActionLabel(category: string): string {
  switch (category) {
    case "coverage":
      return "Review Coverage";
    case "assignment":
      return "Open Assignment";
    case "publication":
      return "Review Publication";
    case "key_point":
      return "Review Key Point";
    case "evidence":
    case "records":
      return "Review Evidence";
    case "record":
      return "Review Record";
    case "issue":
      return "Open Issue";
    case "work_order":
      return "Open Work Order";
    case "asset":
      return "Open Asset";
    default:
      return "Open";
  }
}

/** A stored path is a launch target, not permission. Reject anything that is not an in-app path. */
export function safeNotificationActionPath(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path !== path.trim()) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("\\") || path.includes("://")) return null;
  if (/[\u0000-\u001f]/.test(path)) return null;
  return path;
}

/**
 * Personal attention belongs to an authenticated User in the active Facility.
 * A Quick PIN session's uid is an Employee id. It is never used as a User id.
 */
export function notificationActorFromSession(
  session: { authKind?: string | null; uid?: string | null; facilityId?: string | null } | null,
): { userId: string; facilityId: string } | null {
  if (!session || session.authKind !== "user") return null;
  if (!session.uid || !session.facilityId) return null;
  return { userId: session.uid, facilityId: session.facilityId };
}

export function attentionBellLabel(count: number | null): string {
  if (count == null) return "Attention. The count is unavailable.";
  if (count === 0) return "Attention. Nothing needs your attention.";
  return `Attention. ${count} ${count === 1 ? "item needs" : "items need"} attention.`;
}

export function attentionBellCountText(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function formatAttentionTime(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(instant);
  }
}
