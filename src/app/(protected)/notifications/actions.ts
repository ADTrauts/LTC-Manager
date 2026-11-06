"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { notificationActorFromSession } from "@/lib/notifications/center";
import { acknowledgeNotification, markNotificationRead, NotificationLifecycleError } from "@/lib/notifications/lifecycle";
import {
  clearNotificationSnooze,
  NotificationSnoozeError,
  setNotificationSnooze,
  snoozeUntilFromChoice,
} from "@/lib/notifications/snooze";
import { prisma } from "@/lib/prisma";

export async function markNotificationReadAction(formData: FormData): Promise<void> {
  const target = await attentionTarget(formData);
  await applyAttention(() => markNotificationRead(prisma, target));
}

export async function acknowledgeNotificationAction(formData: FormData): Promise<void> {
  const target = await attentionTarget(formData);
  await applyAttention(() => acknowledgeNotification(prisma, target));
}

export async function snoozeNotificationAction(formData: FormData): Promise<void> {
  const target = await attentionTarget(formData);
  const snoozedUntil = snoozeUntilFromChoice(String(formData.get("duration") ?? ""), new Date());
  if (!snoozedUntil) redirect("/notifications?notice=unavailable");
  try {
    const result = await setNotificationSnooze(prisma, { ...target, snoozedUntil });
    if (!result.ok) redirect("/notifications?notice=unavailable");
  } catch (error) {
    if (error instanceof NotificationSnoozeError) redirect("/notifications?notice=unavailable");
    throw error;
  }
  revalidatePath("/notifications", "layout");
}

export async function resumeBrowserAlertsAction(formData: FormData): Promise<void> {
  const target = await attentionTarget(formData);
  try {
    await clearNotificationSnooze(prisma, target);
  } catch (error) {
    if (error instanceof NotificationSnoozeError) redirect("/notifications?notice=unavailable");
    throw error;
  }
  revalidatePath("/notifications", "layout");
}

async function attentionTarget(formData: FormData): Promise<{
  facilityId: string;
  userId: string;
  notificationId: string;
}> {
  const actor = notificationActorFromSession(await getSession());
  if (!actor) redirect("/login");
  const notificationId = formData.get("notificationId");
  if (typeof notificationId !== "string" || notificationId.length === 0) {
    redirect("/notifications?notice=unavailable");
  }
  return { facilityId: actor.facilityId, userId: actor.userId, notificationId };
}

async function applyAttention(apply: () => Promise<unknown>): Promise<void> {
  try {
    await apply();
  } catch (error) {
    if (error instanceof NotificationLifecycleError) {
      redirect("/notifications?notice=unavailable");
    }
    throw error;
  }
  revalidatePath("/notifications", "layout");
}
