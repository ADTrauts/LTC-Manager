/**
 * Move published and draft Cycles that still expect READY / SERVICE_STARTED
 * onto Dietary Key Points, and clear those milestones.
 * A Cycle whose meal cannot be named is left unchanged.
 *
 * Requires LEG02_APPLY=1 to write.
 */
import { PrismaClient } from "@prisma/client";

import { planLegacyMilestoneKeyPoints } from "../src/lib/dietary/legacy-milestone-key-points";
import { redactDatabaseUrl } from "./verify/lib/database-target.mjs";

const url = process.env.DATABASE_URL ?? "";
const target = redactDatabaseUrl(url);
if (!url) {
  console.error("leg02 meal timing: DATABASE_URL is unset.");
  process.exit(1);
}

const prisma = new PrismaClient();
const rows = await prisma.departmentOperationalCycle.findMany({
  where: { status: { in: ["DRAFT", "PUBLISHED"] } },
  select: {
    id: true,
    facilityId: true,
    departmentId: true,
    stableKey: true,
    version: true,
    mealType: true,
    nodeKind: true,
    status: true,
    expectedMilestones: true,
    applicableDaysOfWeek: true,
    effectiveFrom: true,
  },
});

const occupied = new Map<string, string[]>();
for (const row of rows) {
  const list = occupied.get(row.departmentId) ?? [];
  list.push(row.stableKey);
  occupied.set(row.departmentId, list);
}

const plan = planLegacyMilestoneKeyPoints({
  cycles: rows.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    stableKey: row.stableKey,
    mealType: row.mealType,
    nodeKind: row.nodeKind,
    status: row.status,
    expectedMilestones: row.expectedMilestones,
  })),
  occupiedStableKeysByDepartment: occupied,
});

if (process.env.LEG02_APPLY !== "1") {
  console.log(
    `leg02 meal timing: dry run at ${target}. ${plan.creates.length} Key Points would be added. ${plan.clearCycleIds.length} Cycles would drop the old milestones. ${plan.unmappedCycleIds.length} Cycles have no meal name.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

function parentRow(departmentId: string, stableKey: string) {
  return rows
    .filter((row) => row.departmentId === departmentId && row.stableKey === stableKey)
    .sort((a, b) => b.version - a.version)[0];
}

await prisma.$transaction(async (tx) => {
  for (const create of plan.creates) {
    const parent = parentRow(create.departmentId, create.parentStableKey);
    if (!parent) continue;
    const versions = await tx.departmentOperationalCycle.findMany({
      where: { departmentId: create.departmentId, stableKey: create.plan.stableKey },
      select: { version: true, status: true },
    });
    if (versions.some((row) => row.status === "DRAFT" || row.status === "PUBLISHED")) continue;
    const version = versions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
    const status = parent.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    await tx.departmentOperationalCycle.create({
      data: {
        facilityId: parent.facilityId,
        departmentId: create.departmentId,
        stableKey: create.plan.stableKey,
        parentStableKey: create.parentStableKey,
        nodeKind: "KEY_TIME",
        version,
        label: create.plan.label,
        description: create.plan.description,
        cycleType: create.plan.cycleType,
        displaySequence: create.plan.displaySequence,
        startLocal: null,
        endLocal: null,
        overnight: false,
        applicableDaysOfWeek:
          parent.applicableDaysOfWeek.length > 0 ? parent.applicableDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: parent.effectiveFrom,
        mealType: null,
        locationMode: create.plan.locationMode,
        locationInheritFromParent: false,
        applicableUnitTypes: [],
        applicableOperationalTypeKeys: create.plan.applicableOperationalTypeKeys ?? [],
        roomTypeKey: null,
        expectedMilestones: [],
        occurrenceTracking: create.plan.occurrenceTracking ?? "REQUIRED",
        keyPointGrain: create.plan.keyPointGrain ?? "LOCATION",
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        keyTimeGroups: {
          create: (create.plan.dueLocals ?? []).map((dueLocal, index) => ({
            dueLocal,
            displaySequence: (index + 1) * 10,
          })),
        },
      },
    });
  }

  if (plan.clearCycleIds.length > 0) {
    await tx.departmentOperationalCycle.updateMany({
      where: { id: { in: plan.clearCycleIds } },
      data: { expectedMilestones: [] },
    });
  }
});

console.log(
  `leg02 meal timing: added ${plan.creates.length} Key Points and cleared milestones on ${plan.clearCycleIds.length} Cycles at ${target}. ${plan.unmappedCycleIds.length} Cycles have no meal name and were left unchanged.`,
);
await prisma.$disconnect();
