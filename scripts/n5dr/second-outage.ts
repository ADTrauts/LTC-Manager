/** A second canonical outage after logout. Prints counts only. */
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
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    into[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
  return into;
}

async function main() {
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
  const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
  try {
    const first = await db.asset.findUniqueOrThrow({ where: { id: file.N5DR_ASSET_ID }, select: { unitId: true } });
    const asset = await db.asset.create({
      data: {
        assetCode: `N5DR-B-${Date.now().toString(36)}`,
        name: "Test cart",
        equipmentType: "EQUIPMENT",
        unitId: first.unitId,
        departmentId: file.N5DR_DEPARTMENT_ID,
        criticality: "ROUTINE",
        status: "OPERATIONAL",
      },
    });
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
    const changed = await changeAssetStatus(session, {
      facilityId: file.N5DR_FACILITY_ID,
      departmentId: file.N5DR_DEPARTMENT_ID,
      assetId: asset.id,
      toStatus: "OUT_OF_SERVICE",
      reason: "MANUAL",
      note: "Second controlled outage",
      client: db,
      now: new Date(),
    });
    await evaluateExternalDelivery({ db, now: new Date(), facilityIds: [file.N5DR_FACILITY_ID] });
    const recipients = await db.notificationRecipient.count({
      where: { userId: file.N5DR_USER_ID, notification: { facilityId: file.N5DR_FACILITY_ID } },
    });
    console.log("second outbox", changed.attentionOutboxIds.length, "recipients", recipients);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "second outage failed");
  process.exit(1);
});
