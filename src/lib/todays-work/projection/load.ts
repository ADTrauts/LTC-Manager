/**
 * Wave 15I — Today's Work Projection loader + assembled view.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import {
  resolveSessionProjection,
  type LoadProjectedLocationOptions,
} from "@/lib/locations";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import { loadPresenceCallOffs } from "../load-presence-call-offs";
import { presentHandoffsFromBoard } from "../present-handoffs-from-board";
import type { CallDownData } from "../call-down";
import type { HandoffData } from "../handoffs";
import type { WalkListData } from "../walk-list";
import {
  loadOperatingLocationBoard,
  loadedBoardToWalkList,
  type OperatingLocationBoard,
} from "../operating-locations";
import type { ViewerTeamScope } from "../viewer-team-scope";

import { adaptProjectionToTodaysWork } from "./adapt-projection";
import {
  assembleExperienceWalkContributions,
  filterCallDownsToProjectedUnits,
  type ExperienceWalkContribution,
} from "./assemble";
import type { TodaysWorkProjectionView } from "./types";

export type LoadTodaysWorkProjectionOptions = Omit<
  LoadProjectedLocationOptions,
  "purpose" | "focus"
> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentId?: string | null;
};

export type LoadTodaysWorkProjectionResult = {
  enabled: boolean;
  view: TodaysWorkProjectionView | null;
  usedLegacy: boolean;
  error: string | null;
};

export type AssembledTodaysWork = {
  projection: TodaysWorkProjectionView;
  walk: WalkListData;
  board: OperatingLocationBoard;
  callDowns: CallDownData;
  experienceContributions: ExperienceWalkContribution[];
  error: string | null;
  teamScope: ViewerTeamScope | null;
};

export type AssembledTodaysWorkHandoffs = {
  projection: TodaysWorkProjectionView;
  handoffs: HandoffData;
  error: string | null;
};

/**
 * Load Projection eligibility for Today's Work (purpose TODAYS_WORK).
 */
export async function loadTodaysWorkProjection(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<LoadTodaysWorkProjectionResult> {
  if (!isProjectionTodaysWorkEnabled()) {
    return {
      enabled: false,
      view: null,
      usedLegacy: true,
      error: null,
    };
  }

  const facilityId = session.facilityId;
  if (!facilityId) {
    return {
      enabled: true,
      view: null,
      usedLegacy: false,
      error: "Today's Work requires a facility session",
    };
  }

  const resolved = await resolveSessionProjection(session, {
    ...options,
    purpose: "TODAYS_WORK",
  });

  if (!resolved.ok || !resolved.runtime) {
    return {
      enabled: true,
      view: {
        facilityId,
        lensMode: "DEPARTMENT",
        lensKey: "fail-closed",
        projectedUnitIds: [],
        actionableUnitIds: [],
        sections: [],
        error: resolved.error ?? "Projection failed",
      },
      usedLegacy: false,
      error: resolved.error ?? "Projection failed",
    };
  }

  const view = adaptProjectionToTodaysWork(resolved.runtime.snapshot, null);
  return {
    enabled: true,
    view,
    usedLegacy: false,
    error: null,
  };
}

/**
 * Projection + walk + call-downs. Never mixes legacy broad lists when enabled.
 */
export async function assembleProjectedTodaysWorkHub(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<AssembledTodaysWork | { enabled: false } | { error: string; enabled: true }> {
  const loaded = await loadTodaysWorkProjection(session, options);
  if (!loaded.enabled) {
    return { enabled: false };
  }
  if (!loaded.view || loaded.error) {
    return {
      enabled: true,
      error: loaded.error ?? "Today's Work Projection unavailable",
    };
  }

  const facilityId = session.facilityId;
  const [operating, callDownsRaw] = await Promise.all([
    loadOperatingLocationBoard(facilityId, {
      session,
      memo: options.memo,
      activeDepartmentKey: options.activeDepartmentKey,
      activeDepartmentId: options.activeDepartmentId,
    }),
    loadPresenceCallOffs(facilityId),
  ]);

  const walk = loadedBoardToWalkList(operating);
  const callDowns = filterCallDownsToProjectedUnits(
    callDownsRaw,
    loaded.view.projectedUnitIds,
  );
  const experienceContributions = assembleExperienceWalkContributions(
    loaded.view,
    walk.items,
  );

  return {
    projection: loaded.view,
    walk,
    board: operating.board,
    callDowns,
    experienceContributions,
    error: null,
    teamScope: operating.teamScope,
  };
}

export async function assembleProjectedTodaysWorkWalk(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<
  | { enabled: false }
  | { enabled: true; error: string }
  | {
      enabled: true;
      projection: TodaysWorkProjectionView;
      walk: WalkListData;
      board: OperatingLocationBoard;
      error: null;
      teamScope: ViewerTeamScope | null;
    }
> {
  const loaded = await loadTodaysWorkProjection(session, options);
  if (!loaded.enabled) return { enabled: false };
  if (!loaded.view || loaded.error) {
    return { enabled: true, error: loaded.error ?? "Projection unavailable" };
  }

  const operating = await loadOperatingLocationBoard(session.facilityId, {
    session,
    memo: options.memo,
    activeDepartmentKey: options.activeDepartmentKey,
    activeDepartmentId: options.activeDepartmentId,
  });
  return {
    enabled: true,
    projection: loaded.view,
    walk: loadedBoardToWalkList(operating),
    board: { ...operating.board, locations: operating.walkLocations },
    error: null,
    teamScope: operating.teamScope,
  };
}

export async function assembleProjectedTodaysWorkHandoffs(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<
  | { enabled: false }
  | { enabled: true; error: string }
  | AssembledTodaysWorkHandoffs & { enabled: true }
> {
  const loaded = await loadTodaysWorkProjection(session, options);
  if (!loaded.enabled) return { enabled: false };
  if (!loaded.view || loaded.error) {
    return { enabled: true, error: loaded.error ?? "Projection unavailable" };
  }

  const [operating, callOffsRaw] = await Promise.all([
    loadOperatingLocationBoard(session.facilityId, {
      session,
      memo: options.memo,
      activeDepartmentKey: options.activeDepartmentKey,
      activeDepartmentId: options.activeDepartmentId,
    }),
    loadPresenceCallOffs(session.facilityId),
  ]);
  const callOffs = filterCallDownsToProjectedUnits(
    callOffsRaw,
    loaded.view.projectedUnitIds,
  );
  return {
    enabled: true,
    projection: loaded.view,
    handoffs: presentHandoffsFromBoard({
      board: operating.board,
      callOffs,
      operationContext: operating.operationContext,
    }),
    error: null,
  };
}
