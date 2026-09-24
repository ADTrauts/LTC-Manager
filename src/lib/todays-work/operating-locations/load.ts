/**
 * Load the supervisor operating-location projection for Today's Work + Walk List.
 *
 * Visibility: Projection → collected operating locations.
 * Operational facts: Runtime Location State (SPACE grain), aggregated for cards.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import {
  loadProjectedLocationView,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import type { OperationContext } from "@/lib/operations-center";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
} from "@/lib/projection";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";
import {
  narrowTeamScopeToCollectedRooms,
  resolveViewerTeamScopes,
  type ViewerTeamScope,
} from "@/lib/todays-work/viewer-team-scope";

import { applyViewerTeamScopeToLocations } from "./apply-team-scope";
import { operatingBoardToWalkList, sortOperatingLocationsForWalk } from "./build";
import { collectSupervisorOperatingLocations } from "./collect";
import {
  operationContextFromRuntimeStates,
  projectOperatingLocationBoardFromRuntime,
} from "./from-runtime-state";
import type { OperatingLocationBoard, OperatingLocationStatus } from "./types";

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

export async function loadOperatingLocationBoard(
  facilityId: string,
  options: LoadOperatingLocationBoardOptions,
): Promise<LoadedOperatingLocationBoard> {
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

  const spaceRefs = collected.flatMap((location) => {
    const departmentId = location.departmentKey
      ? departmentIdByKey.get(location.departmentKey)
      : undefined;
    if (!departmentId) return [];
    return location.rooms.map((room) => ({
      spaceId: room.spaceId,
      departmentId,
      departmentLabel: location.departmentLabel,
      unitId: room.unitId,
      displayName: room.name,
      floorName: location.floorLabel,
      neighborhoodName: location.kind === "NEIGHBORHOOD" ? location.displayName : null,
    }));
  });

  const loaded = await loadRuntimeLocationStates({
    facilityId,
    spaceRefs,
  });

  const board = projectOperatingLocationBoardFromRuntime({
    locations: collected,
    states: loaded.states,
    lensMode,
    sort: "board",
  });

  return {
    board,
    walkLocations: sortOperatingLocationsForWalk(board.locations),
    operationContext: operationContextFromRuntimeStates(
      loaded.states,
      FALLBACK_OPERATION_CONTEXT,
    ),
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
