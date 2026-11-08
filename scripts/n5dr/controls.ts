/**
 * Evaluator checks after the browser has saved Snooze and Quiet Hours.
 * Prints statuses only.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { reportIssue } from "@/lib/asset-operations/issue-service";
import { evaluateExternalDelivery } from "@/lib/notifications/external-delivery";
import { decidePushOpportunity } from "@/lib/notifications/push-dispatch";
import { isInsideQuietWindow, localMinuteOfDay } from "@/lib/notifications/quiet-window";
import { parseFacilityLocalScheduledStartOnDate } from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

function load(path: string) {
  const into: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    into[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return into;
}

const file = load(".env.n5dr");
assertDisposableDatabaseUrl(file.DATABASE_URL);
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/ltc_verify_n1a") {
  throw new Error("refusing non-disposable database");
}
process.env.DATABASE_URL = file.DATABASE_URL;
process.env.DIRECT_URL = file.DIRECT_URL;
process.env.VAPID_PUBLIC_KEY = file.VAPID_PUBLIC_KEY;
process.env.VAPID_PRIVATE_KEY = file.VAPID_PRIVATE_KEY;
process.env.VAPID_SUBJECT = file.VAPID_SUBJECT;
process.env.WEB_PUSH_SENDING_ENABLED = "true";
process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";

const zone = "America/New_York";
const mode = process.argv[2] ?? "snooze";

function session(): FacilitySession {
  return {
    uid: file.N5DR_USER_ID,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "MANAGER",
    name: "N5DR Tester",
    email: file.N5DR_EMAIL,
    facilityId: file.N5DR_FACILITY_ID,
    primaryDepartmentId: file.N5DR_DEPARTMENT_ID,
    sessionVersion: 0,
  } as FacilitySession;
}

function civil(clock: string): Date {
  const value = parseFacilityLocalScheduledStartOnDate(clock, "2026-11-04", zone);
  if (!value) throw new Error("clock");
  return value;
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
  try {
    if (mode === "snooze") {
      const snoozed = await db.notificationRecipient.findMany({
        where: { userId: file.N5DR_USER_ID, snoozedUntil: { not: null } },
        select: { id: true, snoozedUntil: true, readAt: true, acknowledgedAt: true },
      });
      console.log(
        "snoozed rows",
        snoozed.map((row) => `until=${row.snoozedUntil?.toISOString()} read=${row.readAt ? "yes" : "no"} ack=${row.acknowledgedAt ? "yes" : "no"}`).join(" | ") || "none",
      );
      const active = snoozed.filter((row) => row.snoozedUntil && row.snoozedUntil.getTime() > Date.now());
      const before = await db.pushDispatch.count({
        where: { notificationRecipientId: { in: active.map((row) => row.id) }, triggerKey: { startsWith: "snooze-expired:" } },
      });
      await evaluateExternalDelivery({ db, now: new Date(), facilityIds: [file.N5DR_FACILITY_ID] });
      const during = await db.pushDispatch.count({
        where: { notificationRecipientId: { in: active.map((row) => row.id) }, triggerKey: { startsWith: "snooze-expired:" } },
      });
      console.log("wake during snooze", before, "->", during);
      const target = active[0];
      if (!target?.snoozedUntil) return;
      const due = new Date(target.snoozedUntil.getTime() + 1000);
      await evaluateExternalDelivery({ db, now: due, facilityIds: [file.N5DR_FACILITY_ID] });
      await evaluateExternalDelivery({ db, now: due, facilityIds: [file.N5DR_FACILITY_ID] });
      const wakes = await db.pushDispatch.findMany({
        where: { notificationRecipientId: target.id, triggerKey: { startsWith: "snooze-expired:" } },
        select: { status: true, attemptCount: true, lastErrorCode: true },
      });
      console.log(
        "expiry wakes",
        wakes.map((row) => `${row.status} attempts=${row.attemptCount} error=${row.lastErrorCode ?? "none"}`).join(" | ") || "none",
      );
      return;
    }

    if (mode === "quiet") {
      const preference = await db.notificationPreference.findUnique({
        where: { userId_facilityId: { userId: file.N5DR_USER_ID, facilityId: file.N5DR_FACILITY_ID } },
      });
      console.log(
        "stored quiet",
        preference?.quietEnabled,
        preference?.quietStartMinute,
        preference?.quietEndMinute,
      );
      for (const clock of ["22:30", "07:00", "21:59"]) {
        const minute = localMinuteOfDay(civil(clock), zone);
        console.log(clock, "minute", minute, "overnight", isInsideQuietWindow(minute, 22 * 60, 7 * 60));
      }
      const loaded = {
        quietEnabled: true,
        quietStartMinute: preference?.quietStartMinute ?? null,
        quietEndMinute: preference?.quietEndMinute ?? null,
        updateDigestEnabled: false,
      };
      const now = new Date();
      for (const priority of ["UPDATE", "NEEDS_ATTENTION", "URGENT", "CRITICAL"] as const) {
        console.log(
          priority,
          decidePushOpportunity({
            notification: {
              kind: "OPERATIONAL",
              priority,
              protected: priority === "CRITICAL",
              requiresAcknowledgement: priority !== "UPDATE",
              resolvedAt: null,
              expiresAt: null,
              recipientReasons: ["WORK_ORDER_ASSIGNEE"],
            },
            recipient: { reason: "ON_CALL_RESPONDER", snoozedUntil: null },
            preference: loaded,
            now,
            timeZone: zone,
            currentlyHoldsOperationalResponsibility: true,
          }),
        );
      }
      const asset = await db.asset.findUniqueOrThrow({
        where: { id: file.N5DR_ASSET_ID },
        select: { unitId: true },
      });
      const sentBefore = await db.pushDispatch.count({
        where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" },
      });
      try {
        await reportIssue(session(), {
          facilityId: file.N5DR_FACILITY_ID,
          departmentId: file.N5DR_DEPARTMENT_ID,
          unitId: asset.unitId,
          summary: "Controlled test condition",
          description: "Controlled test condition",
          observedAt: now,
          client: db,
          now,
        });
      } catch (error) {
        console.log("issue write", error instanceof Error ? error.message : "failed");
      }
      const updates = await db.notification.findMany({
        where: { facilityId: file.N5DR_FACILITY_ID, priority: "UPDATE" },
        select: {
          id: true,
          recipients: {
            select: {
              pushDispatches: { select: { status: true, lastErrorCode: true } },
            },
          },
        },
      });
      console.log(
        "update dispatches",
        updates
          .flatMap((row) => row.recipients.flatMap((recipient) => recipient.pushDispatches))
          .map((row) => `${row.status}:${row.lastErrorCode ?? "none"}`)
          .join(" | ") || "none",
      );
      const created = await db.asset.create({
        data: {
          assetCode: `N5DR-Q-${Date.now().toString(36)}`,
          name: "Test warmer",
          equipmentType: "OTHER",
          unitId: asset.unitId,
          departmentId: file.N5DR_DEPARTMENT_ID,
          status: "OPERATIONAL",
          criticality: "ROUTINE",
        },
      });
      await changeAssetStatus(session(), {
        facilityId: file.N5DR_FACILITY_ID,
        departmentId: file.N5DR_DEPARTMENT_ID,
        assetId: created.id,
        toStatus: "OUT_OF_SERVICE",
        reason: "MANUAL",
        note: "Quiet window attention",
        client: db,
        now,
      });
      const sentAfter = await db.pushDispatch.count({
        where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" },
      });
      const latest = await db.pushDispatch.findMany({
        where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { status: true, lastErrorCode: true },
      });
      console.log("sent", sentBefore, "->", sentAfter);
      console.log("latest", latest.map((row) => `${row.status}:${row.lastErrorCode ?? "none"}`).join(" | "));
      return;
    }

    const active = await db.pushSubscription.count({
      where: { userId: file.N5DR_USER_ID, revokedAt: null },
    });
    const sentBefore = await db.pushDispatch.count({
      where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" },
    });
    const asset = await db.asset.findUniqueOrThrow({
      where: { id: file.N5DR_ASSET_ID },
      select: { unitId: true },
    });
    const created = await db.asset.create({
      data: {
        assetCode: `N5DR-L-${Date.now().toString(36)}`,
        name: "Test shelf",
        equipmentType: "OTHER",
        unitId: asset.unitId,
        departmentId: file.N5DR_DEPARTMENT_ID,
        status: "OPERATIONAL",
        criticality: "ROUTINE",
      },
    });
    await changeAssetStatus(session(), {
      facilityId: file.N5DR_FACILITY_ID,
      departmentId: file.N5DR_DEPARTMENT_ID,
      assetId: created.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      note: "After sign-out",
      client: db,
      now: new Date(),
    });
    const sentAfter = await db.pushDispatch.count({
      where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" },
    });
    const open = await db.pushDispatch.count({
      where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: { in: ["QUEUED", "SENDING"] } },
    });
    console.log("active subscriptions", active, "sent", sentBefore, "->", sentAfter, "open", open);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "controls failed");
  process.exit(1);
});
