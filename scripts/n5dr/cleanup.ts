/**
 * Remove the N5D-R3 disposable fixture from ltc_verify_n1a only.
 * Prints counts. Does not print secrets or connection strings.
 */
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

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

const facilityId = file.N5DR_FACILITY_ID;
const userId = file.N5DR_USER_ID;
const orgId = file.N5DR_ORG_ID;

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: file.DATABASE_URL } } });
  const counts: Record<string, number> = {};
  const note = async (name: string, count: number) => {
    counts[name] = count;
  };
  try {
    const facility = await db.facility.findUnique({ where: { id: facilityId }, select: { organizationId: true } });
    if (!facility || facility.organizationId !== orgId) throw new Error("fixture facility does not match the organization");
    const units = await db.unit.findMany({ where: { facilityId }, select: { id: true } });
    const unitIds = units.map((unit) => unit.id);
    const repairs = await db.repair.findMany({ where: { unitId: { in: unitIds } }, select: { id: true } });
    const repairIds = repairs.map((repair) => repair.id);
    const notifications = await db.notification.findMany({ where: { facilityId }, select: { id: true } });
    const notificationIds = notifications.map((row) => row.id);
    const recipients = await db.notificationRecipient.findMany({
      where: { notificationId: { in: notificationIds } },
      select: { id: true },
    });
    const recipientIds = recipients.map((row) => row.id);

    await note("dispatches", (await db.pushDispatch.deleteMany({ where: { OR: [{ notificationRecipientId: { in: recipientIds } }, { pushSubscription: { userId } }] } })).count);
    await note("deliveries", (await db.notificationDelivery.deleteMany({ where: { notificationRecipientId: { in: recipientIds } } })).count);
    await note("recipients", (await db.notificationRecipient.deleteMany({ where: { id: { in: recipientIds } } })).count);
    await note("notifications", (await db.notification.deleteMany({ where: { facilityId } })).count);
    await note("outbox", (await db.notificationOutbox.deleteMany({ where: { facilityId } })).count);
    await note("preferences", (await db.notificationPreference.deleteMany({ where: { userId } })).count);
    await note("subscriptions", (await db.pushSubscription.deleteMany({ where: { userId } })).count);
    await note("repair-updates", (await db.repairUpdate.deleteMany({ where: { repairId: { in: repairIds } } })).count);
    await note("response-history", (await db.workOrderResponseHistory.deleteMany({ where: { repairId: { in: repairIds } } })).count);
    await note("repairs", (await db.repair.deleteMany({ where: { id: { in: repairIds } } })).count);
    await note("asset-history", (await db.assetStatusHistory.deleteMany({ where: { asset: { unitId: { in: unitIds } } } })).count);
    await note("issue-updates", (await db.assetIssueUpdate.deleteMany({ where: { issue: { facilityId } } })).count);
    await note("issues", (await db.assetIssue.deleteMany({ where: { facilityId } })).count);
    await note("assets", (await db.asset.deleteMany({ where: { unitId: { in: unitIds } } })).count);
    await note("assignments", (await db.operationalAssignment.deleteMany({ where: { facilityId } })).count);
    await note("employees", (await db.employee.deleteMany({ where: { facilityId } })).count);
    const accesses = await db.userFacilityAccess.findMany({ where: { facilityId }, select: { id: true } });
    await note("role-periods", (await db.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccessId: { in: accesses.map((row) => row.id) } } })).count);
    await note("access", (await db.userFacilityAccess.deleteMany({ where: { facilityId } })).count);
    await note("users", (await db.user.deleteMany({ where: { id: userId, facilityId } })).count);
    await note("units", (await db.unit.deleteMany({ where: { facilityId } })).count);
    await note("departments", (await db.department.deleteMany({ where: { facilityId } })).count);
    await note("facilities", (await db.facility.deleteMany({ where: { id: facilityId, organizationId: orgId } })).count);
    await note("organizations", (await db.organization.deleteMany({ where: { id: orgId } })).count);
    const left = await db.facility.count({ where: { id: facilityId } });
    const usersLeft = await db.user.count({ where: { email: { startsWith: "n5dr-" } } });
    console.log(JSON.stringify({ ...counts, facilitiesLeft: left, leftoverUsers: usersLeft }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split("\n")[0] : "cleanup failed";
  console.error(message);
  process.exit(1);
});
