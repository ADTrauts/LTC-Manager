/**
 * User + Facility interruption preferences.
 *
 * A missing row is quiet off and Update digest unselected. Nothing is emailed.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

import { isQuietMinute } from "./quiet-window";

type Db = PrismaClient | Prisma.TransactionClient;

export type NotificationDeliveryPreference = {
  quietEnabled: boolean;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  updateDigestEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationDeliveryPreference = {
  quietEnabled: false,
  quietStartMinute: null,
  quietEndMinute: null,
  updateDigestEnabled: false,
};

export class NotificationPreferenceError extends Error {
  readonly code: "FACILITY_ACCESS_DENIED" | "INVALID_QUIET_WINDOW";

  constructor(code: NotificationPreferenceError["code"]) {
    super(code);
    this.name = "NotificationPreferenceError";
    this.code = code;
  }
}

export async function loadNotificationPreference(
  db: Db,
  input: { userId: string; facilityId: string },
): Promise<NotificationDeliveryPreference & { source: "stored" | "default" }> {
  const row = await db.notificationPreference.findUnique({
    where: { userId_facilityId: { userId: input.userId, facilityId: input.facilityId } },
    select: {
      quietEnabled: true,
      quietStartMinute: true,
      quietEndMinute: true,
      updateDigestEnabled: true,
    },
  });
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCE, source: "default" };
  return { ...row, source: "stored" };
}

export async function saveNotificationPreference(
  db: Db,
  input: { userId: string; facilityId: string } & NotificationDeliveryPreference,
): Promise<NotificationDeliveryPreference> {
  if (!(await userHasActiveFacilityAccess(db, input.userId, input.facilityId))) {
    throw new NotificationPreferenceError("FACILITY_ACCESS_DENIED");
  }
  if (input.quietEnabled && (!isQuietMinute(input.quietStartMinute) || !isQuietMinute(input.quietEndMinute))) {
    throw new NotificationPreferenceError("INVALID_QUIET_WINDOW");
  }
  const saved = await db.notificationPreference.upsert({
    where: { userId_facilityId: { userId: input.userId, facilityId: input.facilityId } },
    create: {
      userId: input.userId,
      facilityId: input.facilityId,
      quietEnabled: input.quietEnabled,
      quietStartMinute: input.quietEnabled ? input.quietStartMinute : null,
      quietEndMinute: input.quietEnabled ? input.quietEndMinute : null,
      updateDigestEnabled: input.updateDigestEnabled,
    },
    update: {
      quietEnabled: input.quietEnabled,
      quietStartMinute: input.quietEnabled ? input.quietStartMinute : null,
      quietEndMinute: input.quietEnabled ? input.quietEndMinute : null,
      updateDigestEnabled: input.updateDigestEnabled,
    },
    select: {
      quietEnabled: true,
      quietStartMinute: true,
      quietEndMinute: true,
      updateDigestEnabled: true,
    },
  });
  return saved;
}
