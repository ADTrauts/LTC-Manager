import type { Prisma, PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { isApplicableWeekday } from "./cycle-windows";
import type { OperationalCycleDefinition } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

function mapCycleRow(
  row: {
    id: string;
    stableKey: string;
    version: number;
    label: string;
    description: string | null;
    cycleType: OperationalCycleDefinition["cycleType"];
    displaySequence: number;
    startLocal: string;
    endLocal: string;
    overnight: boolean;
    applicableDaysOfWeek: number[];
    effectiveFrom: Date;
    effectiveTo: Date | null;
    mealType: OperationalCycleDefinition["mealType"];
    locationMode: OperationalCycleDefinition["locationMode"];
    applicableUnitTypes: OperationalCycleDefinition["applicableUnitTypes"];
    expectedMilestones: OperationalCycleDefinition["expectedMilestones"];
    status: OperationalCycleDefinition["status"];
    locations: { unitId: string }[];
  },
): OperationalCycleDefinition {
  return {
    id: row.id,
    stableKey: row.stableKey,
    version: row.version,
    label: row.label,
    description: row.description,
    cycleType: row.cycleType,
    displaySequence: row.displaySequence,
    startLocal: row.startLocal,
    endLocal: row.endLocal,
    overnight: row.overnight,
    applicableDaysOfWeek: row.applicableDaysOfWeek,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    mealType: row.mealType,
    locationMode: row.locationMode,
    applicableUnitTypes: row.applicableUnitTypes,
    expectedMilestones: row.expectedMilestones,
    status: row.status,
    unitIds: row.locations.map((l) => l.unitId),
  };
}

/**
 * Load published, date-effective Operational Cycles for a facility department.
 * Filters by applicable weekday in facility timezone. Drafts are never returned.
 */
export async function loadPublishedCyclesForDate(
  facilityId: string,
  departmentId: string,
  operationalDateKey: string,
  client: DbClient = prisma,
): Promise<OperationalCycleDefinition[]> {
  const timezone = await loadFacilityTimezone(client as PrismaClient, facilityId);
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);

  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId,
      departmentId,
      effectiveFrom: { lte: serviceDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }],
      AND: [
        {
          OR: [
            { status: "PUBLISHED" },
            // Retained for historical operational dates within effective bounds.
            { status: "RETIRED", effectiveTo: { not: null } },
          ],
        },
      ],
    },
    include: {
      locations: { select: { unitId: true } },
    },
    orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { id: "asc" }],
  });

  return rows
    .map(mapCycleRow)
    .filter((cycle) =>
      isApplicableWeekday(cycle.applicableDaysOfWeek, operationalDateKey, timezone),
    );
}

export { mapCycleRow, toServiceDateKey };
