import type { PrismaClient } from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

const ATTENTION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export type AttentionClick =
  | { kind: "ignore" }
  | { kind: "unavailable" }
  | { kind: "denied" }
  | { kind: "focus"; notificationId: string }
  | { kind: "switch"; contextKey: string; next: string };

/** A notification click may return only to that attention item. */
export function safeAttentionReturn(value: string): string | null {
  if (!value.startsWith("/notifications?")) return null;
  let url: URL;
  try {
    url = new URL(value, "https://vssyl.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://vssyl.local" || url.pathname !== "/notifications") return null;
  if (url.username || url.password || url.hash) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "attention") return null;
  const attentionId = url.searchParams.get("attention") ?? "";
  if (!ATTENTION_ID.test(attentionId)) return null;
  return `/notifications?attention=${encodeURIComponent(attentionId)}`;
}

/**
 * Decide where a push click lands.
 * A recipient may enter a Facility they already may enter. The click does not grant access,
 * acknowledge, or change the Notification.
 */
export async function resolveAttentionClick(
  db: PrismaClient,
  input: { userId: string; facilityId: string; attentionId: string },
): Promise<AttentionClick> {
  if (!ATTENTION_ID.test(input.attentionId)) return { kind: "ignore" };
  const notification = await db.notification.findUnique({
    where: { id: input.attentionId },
    select: { id: true, facilityId: true },
  });
  if (!notification) return { kind: "unavailable" };
  const recipient = await db.notificationRecipient.findFirst({
    where: { notificationId: notification.id, userId: input.userId },
    select: { id: true },
  });
  if (!recipient) return { kind: "unavailable" };
  if (notification.facilityId === input.facilityId) {
    return { kind: "focus", notificationId: notification.id };
  }
  if (!(await userHasActiveFacilityAccess(db, input.userId, notification.facilityId))) {
    return { kind: "denied" };
  }
  return {
    kind: "switch",
    contextKey: `facility_internal:${notification.facilityId}`,
    next: `/notifications?attention=${encodeURIComponent(notification.id)}`,
  };
}
