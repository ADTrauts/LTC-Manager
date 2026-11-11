/**
 * Read the derived Coverage answer for one Department and service date.
 *
 * Uses the canonical slot evaluator. Does not persist the answer.
 * The grain is facility + service date + department + space + role + cycle.
 * Legacy template rows with no space or no cycle are not episode grains.
 * The EVS location rollup is not a second episode grain.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import {
  calledOffShiftExcludesAssignment,
  previousServiceDateKey,
  type CalledOffShift,
} from "@/lib/scheduling/call-off-window";
import {
  facilityLocalDateToServiceDate,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import {
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  planLifecycleFromStatus,
  resolveCoverageExpectationsForLocation,
  selectRuntimeCoverageTemplates,
  type CoverageAssignmentActual,
  type CoverageCycleRef,
  type CoverageExpectationItemInput,
  type CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";
import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";

import { coverageGrainKey } from "./decide";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CoverageSlotSnapshot = {
  key: string;
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  spaceId: string;
  responsibility: string;
  cycleStableKey: string;
  state: CanonicalCoverageState;
  locationLabel: string;
  cycleLabel: string;
  unitId: string | null;
  cycleStartsAt: Date | null;
  cycleEndsAt: Date | null;
};

const SEVERITY: Record<CanonicalCoverageState, number> = {
  UNCOVERED: 5,
  AT_RISK: 4,
  NOT_CONFIRMED: 3,
  NOT_YET_ASSIGNED: 2,
  COVERED: 1,
  NOT_APPLICABLE: 0,
};

export async function loadCoverageSlotSnapshot(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDateKey: string;
  },
): Promise<Map<string, CoverageSlotSnapshot>> {
  const serviceDate = new Date(`${input.serviceDateKey}T00:00:00.000Z`);
  const previousDate = facilityLocalDateToServiceDate(previousServiceDateKey(input.serviceDateKey));
  const [facility, plan, assignments, callOffRows, templateRows, cycles, spaces] = await Promise.all([
    client.facility.findUnique({
      where: { id: input.facilityId },
      select: { timezone: true },
    }),
    client.operationalAssignmentPlan.findUnique({
      where: {
        facilityId_departmentId_serviceDate: {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          serviceDate,
        },
      },
      select: { status: true },
    }),
    client.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
      },
      select: {
        id: true,
        employeeId: true,
        roleKey: true,
        status: true,
        unitId: true,
        startsAt: true,
        endsAt: true,
        locations: { select: { unitSpaceId: true } },
      },
    }),
    client.scheduleEntry.findMany({
      where: {
        calledOffAt: { not: null },
        departmentId: input.departmentId,
        date: { in: [previousDate, serviceDate] },
        employee: { facilityId: input.facilityId },
      },
      select: {
        employeeId: true,
        departmentId: true,
        date: true,
        plannedStart: true,
        plannedEnd: true,
      },
    }),
    client.operationalAssignmentTemplate.findMany({
      where: { facilityId: input.facilityId, departmentId: input.departmentId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
    loadPublishedCyclesForDate(input.facilityId, input.departmentId, input.serviceDateKey, client),
    client.unitSpace.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        responsibilities: { some: { departmentId: input.departmentId } },
      },
      select: { id: true, name: true, unitId: true },
    }),
  ]);

  const runtimeTemplates = selectRuntimeCoverageTemplates(
    templateRows.map((row) => ({
      id: row.id,
      stableKey: row.stableKey,
      version: row.version,
      status: row.status,
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      items: row.items.map((item) => ({
        id: item.id,
        roleKey: item.roleKey,
        roleLabel: item.roleLabel,
        requiredCount: item.requiredCount,
        unitId: item.unitId,
        spaceId: item.spaceId,
        applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
      })),
    })) as CoverageTemplateVersionRow[],
    input.serviceDateKey,
  );
  const items: CoverageExpectationItemInput[] = flattenCoverageTemplateItems(runtimeTemplates);
  const cycleRefs: CoverageCycleRef[] = cycles
    .filter((cycle) => cycle.nodeKind === "PERIOD")
    .map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label }));
  const cycleWindows = new Map<string, { startsAt: Date | null; endsAt: Date | null; label: string }>();
  for (const cycle of cycles) {
    if (cycle.nodeKind !== "PERIOD") continue;
    const window =
      cycle.startLocal && cycle.endLocal
        ? resolveCycleWindowInstants({
            operationalDateKey: input.serviceDateKey,
            startLocal: cycle.startLocal,
            endLocal: cycle.endLocal,
            overnight: cycle.overnight,
            facilityTimezone: facility?.timezone,
          })
        : null;
    cycleWindows.set(cycle.stableKey, {
      startsAt: window?.startsAt ?? null,
      endsAt: window?.endsAt ?? null,
      label: cycle.label,
    });
  }

  const facilityTimeZone = resolveFacilityTimezone(facility?.timezone);
  const callOffs: CalledOffShift[] = callOffRows.map((row) => ({
    employeeId: row.employeeId,
    departmentId: row.departmentId,
    serviceDateKey: toServiceDateKey(row.date),
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
  }));
  const counting = assignments.filter(
    (assignment) =>
      !callOffs.some((shift) =>
        calledOffShiftExcludesAssignment({
          shift,
          assignment: {
            employeeId: assignment.employeeId,
            departmentId: input.departmentId,
            startsAt: assignment.startsAt,
            endsAt: assignment.endsAt,
            serviceDateKey: input.serviceDateKey,
          },
          timeZone: facilityTimeZone,
        }),
      ),
  );
  const actuals: CoverageAssignmentActual[] = counting.map((assignment) => ({
    id: assignment.id,
    employeeId: assignment.employeeId,
    roleKey: assignment.roleKey,
    status: assignment.status,
    unitId: assignment.unitId,
    coveredSpaceIds: assignment.locations.map((location) => location.unitSpaceId),
    startsAt: assignment.startsAt,
    endsAt: assignment.endsAt,
  }));
  const planLifecycle = planLifecycleFromStatus(plan?.status ?? null);
  const slots = new Map<string, CoverageSlotSnapshot>();

  for (const space of spaces) {
    const expectations = resolveCoverageExpectationsForLocation({
      items,
      context: {
        departmentId: input.departmentId,
        spaceId: space.id,
        unitId: space.unitId,
      },
      cycles: cycleRefs,
    });
    const evaluated = evaluateCoverageSlots({
      expectations,
      assignments: actuals,
      spaceId: space.id,
      unitId: space.unitId,
      plan: planLifecycle,
      cycleWindows,
    });
    for (const slot of evaluated) {
      const cycleStableKey = slot.expectation.cycleStableKey;
      if (!cycleStableKey) continue;
      const window = cycleWindows.get(cycleStableKey);
      const snapshot: CoverageSlotSnapshot = {
        key: coverageGrainKey({
          facilityId: input.facilityId,
          serviceDate: input.serviceDateKey,
          departmentId: input.departmentId,
          spaceId: space.id,
          responsibility: slot.expectation.roleKey,
          cycleStableKey,
        }),
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: input.serviceDateKey,
        spaceId: space.id,
        responsibility: slot.expectation.roleKey,
        cycleStableKey,
        state: slot.state,
        locationLabel: space.name,
        cycleLabel: slot.expectation.cycleLabel ?? window?.label ?? cycleStableKey,
        unitId: space.unitId,
        cycleStartsAt: window?.startsAt ?? null,
        cycleEndsAt: window?.endsAt ?? null,
      };
      const existing = slots.get(snapshot.key);
      if (!existing || SEVERITY[snapshot.state] > SEVERITY[existing.state]) {
        slots.set(snapshot.key, snapshot);
      }
    }
  }

  return slots;
}
