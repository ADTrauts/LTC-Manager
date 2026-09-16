/**
 * Load the canonical supervisor operating-location projection for Today's Work + Walk List.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import {
  loadProjectedLocationView,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import {
  loadDashboardQueries,
  buildDashboardAggregates,
  type OperationContext,
} from "@/lib/operations-center";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import {
  loadPublishedRunModel,
  presentLocationRunOperation,
  type RunLocationOperationPresentation,
} from "@/lib/operational-cycles";
import {
  getFacilityLocalTodayWindow,
  getFacilityServiceDate,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
} from "@/lib/projection";
import {
  narrowTeamScopeToCollectedRooms,
  resolveViewerTeamScopes,
  type ViewerTeamScope,
} from "@/lib/todays-work/viewer-team-scope";

import { applyViewerTeamScopeToLocations } from "./apply-team-scope";
import {
  buildOperatingLocationBoard,
  operatingBoardToWalkList,
  sortOperatingLocationsForWalk,
  type OperatingLocationStaffingInput,
} from "./build";
import { collectSupervisorOperatingLocations } from "./collect";
import type {
  OperatingLocationBoard,
  OperatingLocationIssueFacts,
  OperatingLocationStatus,
} from "./types";

import { deriveAssignedCountsWithOaPreference } from "./oa-staffing-preference";

export type LoadOperatingLocationBoardOptions = {
  session: AppJwtPayload;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentId?: string | null;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
};

export type LoadedOperatingLocationBoard = {
  board: OperatingLocationBoard;
  walkLocations: OperatingLocationStatus[];
  operationContext: OperationContext;
  /** Scope for the active Department lens, or null in All Departments mode. */
  teamScope: ViewerTeamScope | null;
};

const FALLBACK_OPERATION_CONTEXT: OperationContext = {
  mealType: "BREAKFAST",
  mealLabel: "Current operation",
  serviceLabel: "Current operation",
  phase: "Preparation",
  scheduledTimeLabel: null,
  minutesUntilService: null,
};

function emptyFacts(): OperatingLocationIssueFacts {
  return {
    failedLogs: 0,
    missedLogs: 0,
    pendingLogs: 0,
    openRepairCount: 0,
    urgentRepairCount: 0,
  };
}

async function loadOperationalStaffing(input: {
  facilityId: string;
  departmentIds: string[];
  serviceDate: Date;
}): Promise<{
  assignedByUnitId: Map<string, number>;
  assignedBySpaceId: Map<string, number>;
  expectedByUnitId: Map<string, number>;
}> {
  const assignedByUnitId = new Map<string, number>();
  const assignedBySpaceId = new Map<string, number>();
  const expectedByUnitId = new Map<string, number>();
  if (!isOperationalAssignmentsEnabled() || input.departmentIds.length === 0) {
    return { assignedByUnitId, assignedBySpaceId, expectedByUnitId };
  }

  const [assignments, templates] = await Promise.all([
    prisma.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: { in: input.departmentIds },
        serviceDate: input.serviceDate,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        employeeId: true,
        unitId: true,
        locations: { select: { unitSpaceId: true } },
      },
    }),
    prisma.operationalAssignmentTemplate.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: { in: input.departmentIds },
        isActive: true,
      },
      select: {
        items: { select: { unitId: true, requiredCount: true } },
      },
    }),
  ]);

  const employeesByUnit = new Map<string, Set<string>>();
  const employeesBySpace = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (assignment.unitId) {
      const set = employeesByUnit.get(assignment.unitId) ?? new Set();
      set.add(assignment.employeeId);
      employeesByUnit.set(assignment.unitId, set);
    }
    for (const location of assignment.locations) {
      const set = employeesBySpace.get(location.unitSpaceId) ?? new Set();
      set.add(assignment.employeeId);
      employeesBySpace.set(location.unitSpaceId, set);
    }
  }
  for (const [unitId, employees] of employeesByUnit) {
    assignedByUnitId.set(unitId, employees.size);
  }
  for (const [spaceId, employees] of employeesBySpace) {
    assignedBySpaceId.set(spaceId, employees.size);
  }
  for (const template of templates) {
    for (const item of template.items) {
      if (!item.unitId) continue;
      expectedByUnitId.set(
        item.unitId,
        (expectedByUnitId.get(item.unitId) ?? 0) + item.requiredCount,
      );
    }
  }

  return { assignedByUnitId, assignedBySpaceId, expectedByUnitId };
}

export async function loadOperatingLocationBoard(
  facilityId: string,
  options: LoadOperatingLocationBoardOptions,
): Promise<LoadedOperatingLocationBoard> {
  const now = new Date();
  const lensOverride: LoadProjectedLocationOptions["lensOverride"] =
    options.activeDepartmentId && options.activeDepartmentKey
      ? {
          mode: "DEPARTMENT",
          departmentId: options.activeDepartmentId,
          departmentKey: options.activeDepartmentKey,
        }
      : undefined;

  const locationsView = await loadProjectedLocationView(options.session, {
    purpose: "LOCATIONS",
    memo: options.memo,
    ...(lensOverride ? { lensOverride } : {}),
  });

  const snapshots = (locationsView.view?.departmentSnapshots ?? []).filter(
    (snapshot) =>
      !options.activeDepartmentKey ||
      snapshot.departmentKey === options.activeDepartmentKey,
  );
  const collectedUnscoped = collectSupervisorOperatingLocations(snapshots);
  const departmentIdByKey = new Map(
    snapshots
      .filter((snapshot) => snapshot.departmentKey)
      .map((snapshot) => [snapshot.departmentKey, snapshot.departmentId] as const),
  );
  const scopesByDepartmentId = await resolveViewerTeamScopes({
    session: options.session,
    facilityId,
    departments: snapshots.map((snapshot) => ({
      id: snapshot.departmentId,
      label: snapshot.label,
    })),
  });
  const collectedRoomIdsByDepartment = new Map<string, Set<string>>();
  for (const location of collectedUnscoped) {
    const departmentId = location.departmentKey
      ? departmentIdByKey.get(location.departmentKey)
      : undefined;
    if (!departmentId) continue;
    const set = collectedRoomIdsByDepartment.get(departmentId) ?? new Set<string>();
    for (const room of location.rooms) set.add(room.spaceId);
    collectedRoomIdsByDepartment.set(departmentId, set);
  }
  for (const [departmentId, scope] of scopesByDepartmentId) {
    const footprint = collectedRoomIdsByDepartment.get(departmentId) ?? new Set<string>();
    scopesByDepartmentId.set(departmentId, narrowTeamScopeToCollectedRooms(scope, footprint));
  }
  const collected = applyViewerTeamScopeToLocations(
    collectedUnscoped,
    scopesByDepartmentId,
    departmentIdByKey,
  );
  const activeTeamScope = options.activeDepartmentId
    ? scopesByDepartmentId.get(options.activeDepartmentId) ?? null
    : null;
  const lensMode = locationsView.view?.lensMode === "FACILITY" ? "FACILITY" : "DEPARTMENT";

  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const serviceDate = getFacilityServiceDate(facilityTimezone, now);
  const unitIds = [...new Set(collected.map((location) => location.unitId))];

  const [queries, operationalStaffing] = await Promise.all([
    loadDashboardQueries(facilityId, window, {
      facilityTimezone,
      now,
      projectedUnitIds: unitIds,
    }),
    loadOperationalStaffing({
      facilityId,
      departmentIds: snapshots.map((snapshot) => snapshot.departmentId),
      serviceDate,
    }),
  ]);

  const preliminary = buildDashboardAggregates({ ...queries, now, facilityTimezone });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
    facilityTimezone,
  });

  const viewsBySpaceId = new Map<string, RunLocationOperationPresentation>();
  for (const snapshot of snapshots) {
    const model = await loadPublishedRunModel({
      facilityId,
      departmentId: snapshot.departmentId,
      now,
    });
    const snapshotLocations = collected.filter(
      (location) => location.departmentKey === snapshot.departmentKey,
    );
    for (const location of snapshotLocations) {
      for (const room of location.rooms) {
        const timing = model.timings.find((row) => row.spaceId === room.spaceId);
        viewsBySpaceId.set(
          room.spaceId,
          presentLocationRunOperation({
            cycles: model.cycles,
            timings: model.timings,
            now: model.now,
            facilityTimezone: model.timezone,
            operationalDateKey: model.operationalDateKey,
            spaceId: room.spaceId,
            nowLocalHhMm: model.nowLocalHhMm,
            location: {
              title: room.name,
              roomTypeLabel: timing?.facilityRoomTypeName ?? room.roomTypeLabel,
              contextLabel: location.displayName,
              spaceId: room.spaceId,
              unitId: room.unitId,
            },
          }),
        );
      }
    }
  }

  const factsByUnitId = new Map<string, OperatingLocationIssueFacts>();
  for (const unit of preliminary.unitCards) {
    const repairs = queries.openRepairs.filter((repair) => repair.unitId === unit.id);
    factsByUnitId.set(unit.id, {
      failedLogs: unit.failed,
      missedLogs: unit.missed,
      pendingLogs: unit.pending,
      openRepairCount: repairs.length,
      urgentRepairCount: repairs.filter(
        (repair) => repair.priority === "URGENT" || repair.priority === "HIGH",
      ).length,
    });
  }
  if (factsByUnitId.size === 0) {
    for (const unitId of unitIds) factsByUnitId.set(unitId, emptyFacts());
  }

  const staffingByUnitId = new Map<string, OperatingLocationStaffingInput>();
  const operationalEnabled = isOperationalAssignmentsEnabled();
  for (const location of collected) {
    const spaceAssigned = location.rooms.reduce(
      (sum, room) => sum + (operationalStaffing.assignedBySpaceId.get(room.spaceId) ?? 0),
      0,
    );
    const scheduleCount =
      preliminary.unitCards.find((unit) => unit.id === location.unitId)?.staffingCount ?? 0;

    staffingByUnitId.set(location.unitId, {
      ...deriveAssignedCountsWithOaPreference({
        operationalEnabled,
        spaceAssigned,
        unitAssigned: operationalStaffing.assignedByUnitId.get(location.unitId) ?? 0,
        expectedByUnitId: operationalStaffing.expectedByUnitId.get(location.unitId) ?? null,
        scheduleCount,
      }),
    });
  }

  const board = buildOperatingLocationBoard({
    locations: collected,
    viewsBySpaceId,
    staffingByUnitId,
    factsByUnitId,
    sort: "board",
    lensMode,
  });

  return {
    board,
    walkLocations: sortOperatingLocationsForWalk(board.locations),
    operationContext: activeOperation.operationContext ?? FALLBACK_OPERATION_CONTEXT,
    teamScope: activeTeamScope,
  };
}

export function loadedBoardToWalkList(loaded: LoadedOperatingLocationBoard) {
  return operatingBoardToWalkList(
    {
      ...loaded.board,
      locations: loaded.walkLocations,
    },
    loaded.operationContext,
  );
}
