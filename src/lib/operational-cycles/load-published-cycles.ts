import type { Prisma, PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { isApplicableWeekday } from "./cycle-windows";
import type { KeyTimeGroupDefinition, OperationalCycleDefinition } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

type CycleRowInput = {
  id: string;
  stableKey: string;
  version: number;
  label: string;
  description: string | null;
  cycleType: OperationalCycleDefinition["cycleType"];
  nodeKind?: OperationalCycleDefinition["nodeKind"];
  displaySequence: number;
  startLocal: string | null;
  endLocal: string | null;
  overnight: boolean;
  applicableDaysOfWeek: number[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  mealType: OperationalCycleDefinition["mealType"];
  locationMode: OperationalCycleDefinition["locationMode"];
  locationInheritFromParent?: boolean;
  applicableUnitTypes: OperationalCycleDefinition["applicableUnitTypes"];
  expectedMilestones: OperationalCycleDefinition["expectedMilestones"];
  status: OperationalCycleDefinition["status"];
  parentStableKey?: string | null;
  roomTypeKey?: string | null;
  locations: { unitId: string | null; spaceId?: string | null }[];
  milestoneTimes?: Array<{
    unitId: string;
    milestone: OperationalCycleDefinition["expectedMilestones"][number];
    configuredTime: string;
  }>;
  keyTimeGroups?: Array<{
    id?: string;
    dueLocal: string;
    displaySequence?: number;
    rooms?: Array<{ spaceId: string }>;
  }>;
};

function mapKeyTimeGroups(
  groups: CycleRowInput["keyTimeGroups"],
): KeyTimeGroupDefinition[] {
  return (groups ?? []).map((group) => ({
    id: group.id,
    dueLocal: group.dueLocal,
    displaySequence: group.displaySequence,
    spaceIds: (group.rooms ?? []).map((room) => room.spaceId),
  }));
}

function mapCycleRow(row: CycleRowInput): OperationalCycleDefinition {
  return {
    id: row.id,
    stableKey: row.stableKey,
    parentStableKey: row.parentStableKey ?? null,
    nodeKind: row.nodeKind ?? "PERIOD",
    version: row.version,
    label: row.label,
    description: row.description,
    cycleType: row.cycleType,
    displaySequence: row.displaySequence,
    startLocal: row.startLocal ?? null,
    endLocal: row.endLocal ?? null,
    overnight: row.overnight,
    applicableDaysOfWeek: row.applicableDaysOfWeek,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    mealType: row.mealType,
    locationMode: row.locationMode,
    locationInheritFromParent: row.locationInheritFromParent ?? false,
    applicableUnitTypes: row.applicableUnitTypes,
    roomTypeKey: row.roomTypeKey ?? null,
    expectedMilestones: row.expectedMilestones,
    status: row.status,
    unitIds: row.locations.map((l) => l.unitId).filter((id): id is string => Boolean(id)),
    spaceIds: row.locations.map((l) => l.spaceId).filter((id): id is string => Boolean(id)),
    milestoneTimes: (row.milestoneTimes ?? []).map((rowTime) => ({
      unitId: rowTime.unitId,
      milestone: rowTime.milestone,
      configuredTime: rowTime.configuredTime,
    })),
    keyTimeGroups: mapKeyTimeGroups(row.keyTimeGroups),
  };
}

/**
 * Load published, date-effective Operational Cycles for a facility department.
 * Filters by applicable weekday in facility timezone. Drafts are never returned.
 * By default KEY_TIME nodes are excluded — Run PERIOD windows only.
 * Pass includeKeyTimes to also load KEY_TIME nodes with due-time groups.
 */
export async function loadPublishedCyclesForDate(
  facilityId: string,
  departmentId: string,
  operationalDateKey: string,
  client: DbClient = prisma,
  options?: { includeKeyTimes?: boolean },
): Promise<OperationalCycleDefinition[]> {
  const timezone = await loadFacilityTimezone(client as PrismaClient, facilityId);
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const includeKeyTimes = options?.includeKeyTimes === true;

  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId,
      departmentId,
      ...(includeKeyTimes ? {} : { nodeKind: "PERIOD" }),
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
      locations: { select: { unitId: true, spaceId: true } },
      milestoneTimes: {
        select: { unitId: true, milestone: true, configuredTime: true },
      },
      ...(includeKeyTimes
        ? {
            keyTimeGroups: {
              select: {
                id: true,
                dueLocal: true,
                displaySequence: true,
                rooms: { select: { spaceId: true } },
              },
              orderBy: { displaySequence: "asc" as const },
            },
          }
        : {}),
    },
    orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { id: "asc" }],
  });

  return rows
    .map((row) =>
      mapCycleRow({
        ...row,
        keyTimeGroups: includeKeyTimes
          ? (
              row as typeof row & {
                keyTimeGroups?: Array<{
                  id: string;
                  dueLocal: string;
                  displaySequence: number;
                  rooms: Array<{ spaceId: string }>;
                }>;
              }
            ).keyTimeGroups
          : undefined,
      }),
    )
    .filter((cycle) =>
      isApplicableWeekday(cycle.applicableDaysOfWeek, operationalDateKey, timezone),
    );
}

/** Published KEY_TIME + PERIOD set for Key Time materialization and hierarchy context. */
export async function loadPublishedCyclesWithKeyTimesForDate(
  facilityId: string,
  departmentId: string,
  operationalDateKey: string,
  client: DbClient = prisma,
): Promise<OperationalCycleDefinition[]> {
  return loadPublishedCyclesForDate(facilityId, departmentId, operationalDateKey, client, {
    includeKeyTimes: true,
  });
}

export { mapCycleRow, toServiceDateKey };
