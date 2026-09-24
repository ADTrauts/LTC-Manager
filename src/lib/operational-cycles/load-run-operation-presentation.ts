/**
 * Server loaders for new-model Run presentation.
 * Materializes missing today's Key Time rows; never deletes completed actuals.
 */

import type { AppJwtPayload } from "@/lib/auth";
import { hasAtLeastRole, type AppRole } from "@/lib/access";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { localHhMmFromInstant } from "./key-time-day-expectation";
import { loadSpaceOperationalTypeAssignments } from "./load-operational-type-targets";
import { loadPublishedCyclesWithKeyTimesForDate } from "./load-published-cycles";
import { materializeKeyTimeDayExpectations } from "./materialize-key-time-day-expectations";
import {
  detectRunModelProvenance,
  presentDepartmentRunOperation,
  presentLocationRunOperation,
  type RunDepartmentOperationPresentation,
  type RunLocationIdentity,
  type RunLocationOperationPresentation,
  type RunModelProvenance,
} from "./present-run-operation";
import type { OperationalCycleDefinition } from "./types";

export type LoadedPublishedRunModel = {
  cycles: OperationalCycleDefinition[];
  provenance: RunModelProvenance;
  timezone: string;
  operationalDateKey: string;
  now: Date;
  nowLocalHhMm: string;
  timings: Awaited<ReturnType<typeof materializeKeyTimeDayExpectations>>["timings"];
  created: number;
};

export async function loadPublishedRunModel(input: {
  facilityId: string;
  departmentId: string;
  now?: Date;
}): Promise<LoadedPublishedRunModel> {
  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const nowLocalHhMm = localHhMmFromInstant(now, timezone);

  const [cycles, materialized] = await Promise.all([
    loadPublishedCyclesWithKeyTimesForDate(
      input.facilityId,
      input.departmentId,
      operationalDateKey,
    ),
    materializeKeyTimeDayExpectations({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDateKey,
      now,
    }),
  ]);

  return {
    cycles,
    provenance: detectRunModelProvenance(cycles, materialized.timings),
    timezone,
    operationalDateKey,
    now,
    nowLocalHhMm,
    timings: materialized.timings,
    created: materialized.created,
  };
}

/**
 * Test-only same-day refresh: materialize missing Key Time rows for today's
 * newly published configuration. Does not delete existing actuals.
 */
export async function refreshTodayKeyTimesAfterImmediatePublish(input: {
  facilityId: string;
  departmentId: string;
  now?: Date;
}): Promise<{ created: number; operationalDateKey: string }> {
  const loaded = await loadPublishedRunModel(input);
  return { created: loaded.created, operationalDateKey: loaded.operationalDateKey };
}

function roomTypeLabelForSpace(space: {
  facilityRoomType?: { displayName: string } | null;
  customTypeLabel?: string | null;
}): string | null {
  const facilityName = space.facilityRoomType?.displayName?.trim();
  if (facilityName) return facilityName;
  const custom = space.customTypeLabel?.trim();
  return custom || null;
}

function contextLabelForNeighborhood(unit: {
  name: string;
  hierarchyRole: string | null;
  parentUnit?: { name: string; hierarchyRole: string | null } | null;
}): string {
  const parent = unit.parentUnit;
  if (parent?.hierarchyRole === "FLOOR") {
    return `${unit.name} · ${parent.name}`;
  }
  if (parent?.name) {
    return `${unit.name} · ${parent.name}`;
  }
  return unit.name;
}

export async function loadRoomRunIdentity(input: {
  facilityId: string;
  spaceId: string;
}): Promise<RunLocationIdentity | null> {
  const space = await prisma.unitSpace.findFirst({
    where: { id: input.spaceId, facilityId: input.facilityId, isActive: true },
    select: {
      id: true,
      name: true,
      unitId: true,
      customTypeLabel: true,
      facilityRoomType: { select: { displayName: true } },
      unit: {
        select: {
          id: true,
          name: true,
          hierarchyRole: true,
          parentUnit: { select: { name: true, hierarchyRole: true } },
        },
      },
    },
  });
  if (!space) return null;
  return {
    title: space.name,
    roomTypeLabel: roomTypeLabelForSpace(space),
    contextLabel: space.unit ? contextLabelForNeighborhood(space.unit) : null,
    spaceId: space.id,
    unitId: space.unitId,
  };
}

/**
 * Department used for published Run presentation.
 * Follows the active shell department, then Unit responsibilities.
 * Does not require DIETARY_OPERATIONAL_CYCLES_ENABLED — provenance decides
 * new vs legacy, matching Today's Work Key Time attention.
 */
export async function resolveRunPresentationDepartment(input: {
  facilityId: string;
  activeDepartmentId: string | null;
  unitId?: string | null;
}): Promise<{ id: string; name: string; key: string } | null> {
  if (input.activeDepartmentId) {
    const active = await prisma.department.findFirst({
      where: {
        id: input.activeDepartmentId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: { id: true, name: true, key: true },
    });
    if (active) return active;
  }

  if (input.unitId) {
    const responsibilities = await prisma.unitDepartmentResponsibility.findMany({
      where: {
        unitId: input.unitId,
        unit: { facilityId: input.facilityId, isActive: true },
        department: { isActive: true, key: { in: ["DIETARY", "EVS", "PLANT"] } },
      },
      select: {
        department: { select: { id: true, name: true, key: true } },
      },
    });
    for (const key of ["DIETARY", "EVS", "PLANT"] as const) {
      const match = responsibilities.find((row) => row.department.key === key);
      if (match) return match.department;
    }
  }

  return null;
}

export type SelectedRoomResolution =
  | { ok: true; identity: RunLocationIdentity }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "wrong_unit"; identity: RunLocationIdentity };

/**
 * Resolve `?space=` against the Unit route. Wrong facility / unknown Room →
 * not_found. Same-facility Room under a different Unit → wrong_unit (redirect).
 */
export async function resolveSelectedRoomForUnit(input: {
  facilityId: string;
  unitId: string;
  spaceId: string;
}): Promise<SelectedRoomResolution> {
  const identity = await loadRoomRunIdentity({
    facilityId: input.facilityId,
    spaceId: input.spaceId,
  });
  if (!identity?.spaceId || !identity.unitId) {
    return { ok: false, reason: "not_found" };
  }
  if (identity.unitId !== input.unitId) {
    return { ok: false, reason: "wrong_unit", identity };
  }
  return { ok: true, identity };
}

export async function loadLocationRunPresentation(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  spaceId: string;
  location?: RunLocationIdentity | null;
  now?: Date;
}): Promise<RunLocationOperationPresentation | null> {
  if (input.session.facilityId !== input.facilityId) return null;

  const [model, location, assignments] = await Promise.all([
    loadPublishedRunModel({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      now: input.now,
    }),
    input.location
      ? Promise.resolve(input.location)
      : loadRoomRunIdentity({ facilityId: input.facilityId, spaceId: input.spaceId }),
    loadSpaceOperationalTypeAssignments({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      spaceIds: [input.spaceId],
      perspective: "runtime",
    }),
  ]);
  if (!location) return null;

  const role = input.session.role as AppRole;
  return presentLocationRunOperation({
    cycles: model.cycles,
    timings: model.timings,
    now: model.now,
    facilityTimezone: model.timezone,
    operationalDateKey: model.operationalDateKey,
    spaceId: input.spaceId,
    operationalTypeKey: assignments.get(input.spaceId)?.key ?? null,
    location,
    nowLocalHhMm: model.nowLocalHhMm,
    canAdjust: hasAtLeastRole(role, "SUPERVISOR"),
    canComplete: hasAtLeastRole(role, "STAFF"),
  });
}

export async function loadDepartmentRunPresentation(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
  spaceIdFilter?: ReadonlySet<string>;
}): Promise<RunDepartmentOperationPresentation | null> {
  if (input.session.facilityId !== input.facilityId) return null;

  const model = await loadPublishedRunModel({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    now: input.now,
  });
  if (model.provenance !== "NEW_PERIOD_KEY_TIME") return null;

  return presentDepartmentRunOperation({
    cycles: model.cycles,
    timings: model.timings,
    now: model.now,
    facilityTimezone: model.timezone,
    operationalDateKey: model.operationalDateKey,
    nowLocalHhMm: model.nowLocalHhMm,
    spaceIdFilter: input.spaceIdFilter,
  });
}
