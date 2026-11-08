/**
 * Quiet Hours and post-logout delivery checks for N5D-R3.
 * Prints statuses only.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { createWorkOrder } from "@/lib/asset-operations/work-order-service";
import { deliverQueuedPushDispatches } from "@/lib/notifications/push-delivery";
import { recipientAddedTriggerKey } from "@/lib/notifications/push-dispatch";
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

const mode = process.argv[2] ?? "status";

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

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
  try {
    if (mode === "status") {
      const active = await db.pushSubscription.count({ where: { userId: file.N5DR_USER_ID, revokedAt: null } });
      const access = await db.userFacilityAccess.count({
        where: { userId: file.N5DR_USER_ID, facilityId: file.N5DR_FACILITY_ID, isActive: true },
      });
      const lease = await db.pushSubscription.findFirst({
        where: { userId: file.N5DR_USER_ID, revokedAt: null },
        select: { authorizedUntil: true },
      });
      console.log(
        "user-present",
        Boolean(file.N5DR_USER_ID),
        "auth user",
        "active",
        active,
        "facility-access",
        access,
        "lease",
        lease?.authorizedUntil ? "future-or-set" : "missing",
      );
      return;
    }

    if (mode === "assign") {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: file.N5DR_ASSET_ID }, select: { unitId: true } });
      const before = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
      await createWorkOrder(session(), {
        facilityId: file.N5DR_FACILITY_ID,
        departmentId: file.N5DR_DEPARTMENT_ID,
        unitId: asset.unitId,
        assetId: file.N5DR_ASSET_ID,
        title: "Controlled assignment",
        description: "Controlled assignment",
        assignedEmployeeId: file.N5DR_EMPLOYEE_ID,
        client: db,
      });
      const updates = await db.notification.findMany({
        where: { facilityId: file.N5DR_FACILITY_ID, sourceType: "work_order_assignment" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          priority: true,
          recipients: {
            select: {
              reason: true,
              userId: true,
              pushDispatches: { select: { status: true, lastErrorCode: true } },
            },
          },
        },
      });
      const mine = updates.flatMap((row) =>
        row.recipients
          .filter((recipient) => recipient.userId === file.N5DR_USER_ID)
          .flatMap((recipient) => recipient.pushDispatches.map((dispatch) => `${row.priority}:${recipient.reason}:${dispatch.status}:${dispatch.lastErrorCode ?? "none"}`)),
      );
      const sent = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
      console.log("assignment pushes", mine.join(" | ") || "none");
      console.log("sent", before, "->", sent);
      return;
    }

    if (mode === "attention") {
      const before = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
      await changeAssetStatus(session(), {
        facilityId: file.N5DR_FACILITY_ID,
        departmentId: file.N5DR_DEPARTMENT_ID,
        assetId: file.N5DR_ASSET_ID,
        toStatus: "OUT_OF_SERVICE",
        reason: "MANUAL",
        note: "Quiet window attention",
        client: db,
        now: new Date(),
      });
      const sent = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
      console.log("attention sent", before, "->", sent);
      return;
    }

    if (mode === "queue") {
      const subscription = await db.pushSubscription.findFirstOrThrow({
        where: { userId: file.N5DR_USER_ID, revokedAt: null },
        select: { id: true },
      });
      const recipient = await db.notificationRecipient.findFirstOrThrow({
        where: { userId: file.N5DR_USER_ID },
        select: { id: true },
      });
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: subscription.id,
          triggerKey: `r3-queued:${recipient.id}`,
          status: "QUEUED",
          queuedAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      console.log("queued one");
      return;
    }

    if (mode === "deliver-queued") {
      let calls = 0;
      const summary = await deliverQueuedPushDispatches(db, {
        now: new Date(),
        limit: 10,
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      const queued = await db.pushDispatch.findFirst({
        where: { triggerKey: { startsWith: "r3-queued:" } },
        select: { status: true, lastErrorCode: true },
      });
      console.log("transport calls", calls, "summary sent", summary.sent, "queued row", queued ? `${queued.status}:${queued.lastErrorCode ?? "none"}` : "missing");
      return;
    }

    if (mode === "revoked-send") {
      const subscription = await db.pushSubscription.findFirstOrThrow({
        where: { userId: file.N5DR_USER_ID },
        select: { id: true, revokedAt: true, authorizedUntil: true },
      });
      const recipient = await db.notificationRecipient.findFirstOrThrow({
        where: { userId: file.N5DR_USER_ID, notification: { priority: "NEEDS_ATTENTION" } },
        select: { id: true },
      });
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: subscription.id,
          triggerKey: `r3-revoked:${recipient.id}`,
          status: "QUEUED",
          queuedAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      let calls = 0;
      const summary = await deliverQueuedPushDispatches(db, {
        now: new Date(),
        limit: 10,
        transport: async () => {
          calls += 1;
          return { outcome: "accepted" };
        },
      });
      const row = await db.pushDispatch.findFirst({
        where: { triggerKey: { startsWith: "r3-revoked:" } },
        select: { status: true, lastErrorCode: true },
      });
      const latest = await db.notification.findFirst({
        where: { facilityId: file.N5DR_FACILITY_ID, sourceType: "asset_status" },
        orderBy: { createdAt: "desc" },
        select: {
          priority: true,
          recipients: {
            where: { userId: file.N5DR_USER_ID },
            select: { reason: true, pushDispatches: { select: { status: true } } },
          },
        },
      });
      const recipientText = latest
        ? latest.recipients
            .map((item) => `${item.reason}:${item.pushDispatches.length}`)
            .join(" | ") || "no-recipient"
        : "no-notification";
      console.log(
        "revoked",
        Boolean(subscription.revokedAt),
        "lease-future",
        Boolean(subscription.authorizedUntil && subscription.authorizedUntil.getTime() > Date.now()),
        "transport",
        calls,
        "sent",
        summary.sent,
        "row",
        row ? `${row.status}:${row.lastErrorCode ?? "none"}` : "missing",
        "latest-asset",
        latest?.priority ?? "none",
        recipientText,
      );
      return;
    }

    if (mode === "latest-asset") {
      const latest = await db.notification.findFirst({
        where: { facilityId: file.N5DR_FACILITY_ID, sourceType: "asset_status" },
        orderBy: { createdAt: "desc" },
        select: {
          priority: true,
          recipients: {
            where: { userId: file.N5DR_USER_ID },
            select: { reason: true, pushDispatches: { select: { status: true, lastErrorCode: true } } },
          },
        },
      });
      if (!latest) {
        console.log("latest-asset none");
        return;
      }
      const text = latest.recipients
        .map((item) => `${item.reason}:${item.pushDispatches.map((dispatch) => `${dispatch.status}:${dispatch.lastErrorCode ?? "none"}`).join(",") || "no-dispatch"}`)
        .join(" | ");
      console.log("latest-asset", latest.priority, text || "no-recipient");
      return;
    }

    if (mode === "revocation") {
      const rows = await db.pushSubscription.findMany({
        where: { userId: file.N5DR_USER_ID },
        select: { revokedAt: true, revokedReason: true, authorizedUntil: true },
      });
      console.log(
        rows
          .map((row) => `${row.revokedAt ? "revoked" : "active"} ${row.revokedReason ?? "none"} lease=${row.authorizedUntil && row.authorizedUntil.getTime() > Date.now() ? "future" : "not-future"}`)
          .join(" | ") || "none",
      );
      return;
    }

    const before = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: file.N5DR_ASSET_ID }, select: { unitId: true } });
    const created = await db.asset.create({
      data: {
        assetCode: `N5DR-R3-${Date.now().toString(36)}`,
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
    const sent = await db.pushDispatch.count({ where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: "SENT" } });
    const open = await db.pushDispatch.count({
      where: { notificationRecipient: { userId: file.N5DR_USER_ID }, status: { in: ["QUEUED", "SENDING"] } },
    });
    console.log("after logout sent", before, "->", sent, "open", open);
    void recipientAddedTriggerKey;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "check failed");
  process.exit(1);
});
