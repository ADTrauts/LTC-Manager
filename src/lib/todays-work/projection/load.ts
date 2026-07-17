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

import { loadCallDownList } from "../load-call-down-list";
import { loadCoverageList } from "../load-coverage-list";
import { loadHandoffs } from "../load-handoffs";
import { loadWalkList } from "../load-walk-list";
import type { CallDownData } from "../call-down";
import type { CoverageData } from "../coverage-list";
import type { HandoffData } from "../handoffs";
import type { WalkListData } from "../walk-list";

import { adaptProjectionToTodaysWork } from "./adapt-projection";
import {
  assembleExperienceWalkContributions,
  filterCallDownsToProjectedUnits,
  filterCoverageToProjectedUnits,
  filterHandoffsToProjectedUnits,
  filterWalkListToProjectedUnits,
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
  callDowns: CallDownData;
  experienceContributions: ExperienceWalkContribution[];
  error: string | null;
};

export type AssembledTodaysWorkCoverage = {
  projection: TodaysWorkProjectionView;
  coverage: CoverageData;
  error: string | null;
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
  const [walkRaw, callDownsRaw] = await Promise.all([
    loadWalkList(facilityId, {
      activeDepartmentKey: options.activeDepartmentKey ?? null,
    }),
    loadCallDownList(facilityId),
  ]);

  const walk = filterWalkListToProjectedUnits(
    walkRaw,
    loaded.view.actionableUnitIds.length > 0
      ? loaded.view.actionableUnitIds
      : loaded.view.projectedUnitIds,
  );
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
    callDowns,
    experienceContributions,
    error: null,
  };
}

export async function assembleProjectedTodaysWorkWalk(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<
  | { enabled: false }
  | { enabled: true; error: string }
  | { enabled: true; projection: TodaysWorkProjectionView; walk: WalkListData; error: null }
> {
  const loaded = await loadTodaysWorkProjection(session, options);
  if (!loaded.enabled) return { enabled: false };
  if (!loaded.view || loaded.error) {
    return { enabled: true, error: loaded.error ?? "Projection unavailable" };
  }

  const walkRaw = await loadWalkList(session.facilityId, {
    activeDepartmentKey: options.activeDepartmentKey,
  });
  const walk = filterWalkListToProjectedUnits(
    walkRaw,
    loaded.view.actionableUnitIds.length > 0
      ? loaded.view.actionableUnitIds
      : loaded.view.projectedUnitIds,
  );
  return { enabled: true, projection: loaded.view, walk, error: null };
}

export async function assembleProjectedTodaysWorkCoverage(
  session: AppJwtPayload,
  options: LoadTodaysWorkProjectionOptions = {},
): Promise<
  | { enabled: false }
  | { enabled: true; error: string }
  | AssembledTodaysWorkCoverage & { enabled: true }
> {
  const loaded = await loadTodaysWorkProjection(session, options);
  if (!loaded.enabled) return { enabled: false };
  if (!loaded.view || loaded.error) {
    return { enabled: true, error: loaded.error ?? "Projection unavailable" };
  }

  const coverageRaw = await loadCoverageList(session.facilityId);
  const coverage = filterCoverageToProjectedUnits(
    coverageRaw,
    loaded.view.projectedUnitIds,
  );
  return {
    enabled: true,
    projection: loaded.view,
    coverage,
    error: null,
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

  const handoffsRaw = await loadHandoffs(session.facilityId, {
    activeDepartmentKey: options.activeDepartmentKey,
  });
  const handoffs = filterHandoffsToProjectedUnits(
    handoffsRaw,
    loaded.view.projectedUnitIds,
  );
  return {
    enabled: true,
    projection: loaded.view,
    handoffs,
    error: null,
  };
}
