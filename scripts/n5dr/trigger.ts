/**
 * Canonical Asset outage, then the existing external-delivery pass.
 * Requires .env.n5dr. Prints statuses only.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { changeAssetStatus } from "@/lib/asset-operations/asset-service";
import { evaluateExternalDelivery } from "@/lib/notifications/external-delivery";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

function load(path: string) {
  const into: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    into[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return into;
}

const file = load(".env.n5dr");
assertDisposableDatabaseUrl(file.DATABASE_URL);
const parsed = new URL(file.DATABASE_URL);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
  throw new Error("N5D-R refuses a non-loopback database host.");
}
if (parsed.pathname !== "/ltc_verify_n1a") throw new Error("N5D-R database path refused.");
process.env.DATABASE_URL = file.DATABASE_URL;
process.env.DIRECT_URL = file.DIRECT_URL;
process.env.VAPID_PUBLIC_KEY = file.VAPID_PUBLIC_KEY;
process.env.VAPID_PRIVATE_KEY = file.VAPID_PRIVATE_KEY;
process.env.VAPID_SUBJECT = file.VAPID_SUBJECT;
process.env.WEB_PUSH_SENDING_ENABLED = "true";
process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";

async function main() {
const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
const now = new Date();
const session = {
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

try {
  const before = await db.pushDispatch.count({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
  });
  const changed = await changeAssetStatus(session, {
    facilityId: file.N5DR_FACILITY_ID,
    departmentId: file.N5DR_DEPARTMENT_ID,
    assetId: file.N5DR_ASSET_ID,
    toStatus: "OUT_OF_SERVICE",
    reason: "MANUAL",
    note: "Controlled N5D-R outage",
    client: db,
    now,
  });
  const outbox = await db.notificationOutbox.findMany({
    where: { id: { in: changed.attentionOutboxIds } },
    select: { id: true, eventType: true, processedAt: true, lastError: true },
  });
  const notices = await db.notification.findMany({
    where: { facilityId: file.N5DR_FACILITY_ID, sourceType: "asset_status" },
    select: {
      id: true,
      priority: true,
      title: true,
      recipients: { select: { id: true, userId: true, acknowledgedAt: true, readAt: true } },
    },
  });
  const dispatches = await db.pushDispatch.findMany({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
    select: { id: true, status: true, attemptCount: true, lastErrorCode: true, triggerKey: true },
  });
  console.log(
    "outbox",
    outbox.map((row) => `${row.eventType}:${row.processedAt ? "processed" : "pending"}:${row.lastError ? "error" : "ok"}`).join(",") || "none",
  );
  console.log(
    "notices",
    notices.map((row) => `${row.id} ${row.priority} recipients=${row.recipients.length}`).join(" | ") || "none",
  );
  console.log("dispatch count before", before, "after enqueue", dispatches.length);
  console.log(
    "dispatches",
    dispatches.map((row) => `${row.status} attempts=${row.attemptCount} error=${row.lastErrorCode ?? "none"}`).join(" | ") || "none",
  );
  const titlesLeak = notices.some((row) => row.title.includes("Test cooler") || row.title.length > 0);
  console.log("source title stored", titlesLeak);

  const delivery = await evaluateExternalDelivery({ db, now, facilityIds: [file.N5DR_FACILITY_ID] });
  const after = await db.pushDispatch.findMany({
    where: { notificationRecipient: { userId: file.N5DR_USER_ID } },
    select: { status: true, attemptCount: true, lastErrorCode: true, sentAt: true },
  });
  console.log("evaluator failures", delivery.failures);
  console.log(
    "after send",
    after.map((row) => `${row.status} attempts=${row.attemptCount} error=${row.lastErrorCode ?? "none"} sent=${row.sentAt ? "yes" : "no"}`).join(" | ") || "none",
  );
} finally {
  await db.$disconnect();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "trigger failed");
  process.exit(1);
});
