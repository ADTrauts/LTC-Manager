/**
 * Rewrite draft and published Cycles that still use a unit type or a physical
 * room type onto the explicit Department locations that match.
 * A Cycle with no matching location is left unchanged.
 *
 * Requires LEG02_APPLY=1 to write.
 */
import { PrismaClient } from "@prisma/client";

import { planRetiredCycleLocation } from "../src/lib/operational-cycles/rewrite-retired-locations";
import { redactDatabaseUrl } from "./verify/lib/database-target.mjs";

const url = process.env.DATABASE_URL ?? "";
const target = redactDatabaseUrl(url);
if (!url) {
  console.error("leg02 cycles: DATABASE_URL is unset.");
  process.exit(1);
}

const prisma = new PrismaClient();

const cycles = await prisma.departmentOperationalCycle.findMany({
  where: {
    locationMode: { in: ["UNIT_TYPES", "ROOM_TYPE"] },
    status: { in: ["DRAFT", "PUBLISHED"] },
  },
  select: {
    id: true,
    departmentId: true,
    locationMode: true,
    applicableUnitTypes: true,
    roomTypeKey: true,
  },
});

const departmentIds = [...new Set(cycles.map((cycle) => cycle.departmentId))];
const units = departmentIds.length
  ? await prisma.unit.findMany({
      where: {
        isActive: true,
        departmentResponsibilities: { some: { departmentId: { in: departmentIds } } },
      },
      select: {
        id: true,
        unitType: true,
        departmentResponsibilities: { select: { departmentId: true } },
      },
    })
  : [];
const spaces = departmentIds.length
  ? await prisma.unitSpace.findMany({
      where: {
        isActive: true,
        OR: [
          { unit: { departmentResponsibilities: { some: { departmentId: { in: departmentIds } } } } },
          { responsibilities: { some: { departmentId: { in: departmentIds } } } },
        ],
      },
      select: {
        id: true,
        facilityRoomType: { select: { baseTypeKey: true } },
        unit: { select: { departmentResponsibilities: { select: { departmentId: true } } } },
        responsibilities: { select: { departmentId: true } },
      },
    })
  : [];

function unitsFor(departmentId: string) {
  return units
    .filter((unit) => unit.departmentResponsibilities.some((row) => row.departmentId === departmentId))
    .map((unit) => ({ id: unit.id, unitType: unit.unitType, active: true }));
}

function spacesFor(departmentId: string) {
  return spaces
    .filter((space) => {
      const fromUnit = space.unit?.departmentResponsibilities.some((row) => row.departmentId === departmentId);
      const fromSpace = space.responsibilities.some((row) => row.departmentId === departmentId);
      return fromUnit || fromSpace;
    })
    .map((space) => ({
      id: space.id,
      roomTypeKey: space.facilityRoomType?.baseTypeKey ?? null,
      active: true,
    }));
}

const rewrites: Array<{ id: string; plan: { unitIds: string[]; spaceIds: string[] } }> = [];
let unmapped = 0;
for (const cycle of cycles) {
  const plan = planRetiredCycleLocation({
    locationMode: cycle.locationMode,
    applicableUnitTypes: cycle.applicableUnitTypes,
    roomTypeKey: cycle.roomTypeKey,
    units: unitsFor(cycle.departmentId),
    spaces: spacesFor(cycle.departmentId),
  });
  if (plan.action === "explicit") rewrites.push({ id: cycle.id, plan });
  else if (plan.action === "unmapped") unmapped += 1;
}

if (process.env.LEG02_APPLY !== "1") {
  console.log(
    `leg02 cycles: dry run at ${target}. ${rewrites.length} would move onto explicit locations. ${unmapped} have no matching location. Set LEG02_APPLY=1 to write.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  for (const rewrite of rewrites) {
    await tx.departmentOperationalCycleLocation.deleteMany({ where: { cycleId: rewrite.id } });
    await tx.departmentOperationalCycle.update({
      where: { id: rewrite.id },
      data: {
        locationMode: "EXPLICIT_UNITS",
        applicableUnitTypes: [],
        roomTypeKey: null,
        locations: {
          create: [
            ...rewrite.plan.unitIds.map((unitId) => ({ unitId })),
            ...rewrite.plan.spaceIds.map((spaceId) => ({ spaceId })),
          ],
        },
      },
    });
  }
});

console.log(
  `leg02 cycles: moved ${rewrites.length} onto explicit locations at ${target}. ${unmapped} have no matching location and were left unchanged.`,
);
await prisma.$disconnect();
