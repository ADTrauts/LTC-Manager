"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { notificationActorFromSession } from "@/lib/notifications/center";
import {
  loadNotificationPreference,
  NotificationPreferenceError,
  saveNotificationPreference,
} from "@/lib/notifications/notification-preference";
import { prisma } from "@/lib/prisma";

export async function saveQuietHoursAction(formData: FormData): Promise<void> {
  const actor = notificationActorFromSession(await getSession());
  if (!actor) redirect("/login");
  const quietEnabled = formData.get("quietEnabled") === "on";
  const quietStartMinute = clockToMinute(formData.get("quietStart"));
  const quietEndMinute = clockToMinute(formData.get("quietEnd"));
  if (quietEnabled && (quietStartMinute == null || quietEndMinute == null)) {
    redirect("/account/notifications?notice=unavailable");
  }
  const existing = await loadNotificationPreference(prisma, actor);
  try {
    await saveNotificationPreference(prisma, {
      userId: actor.userId,
      facilityId: actor.facilityId,
      quietEnabled,
      quietStartMinute,
      quietEndMinute,
      updateDigestEnabled: existing.updateDigestEnabled,
    });
  } catch (error) {
    if (error instanceof NotificationPreferenceError) {
      redirect("/account/notifications?notice=unavailable");
    }
    throw error;
  }
  revalidatePath("/account/notifications");
  redirect("/account/notifications?notice=saved");
}

function clockToMinute(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
