/**
 * Wave 15G — Sidebar Projection loader.
 *
 * purpose: SIDEBAR → shared LocationsViewModel → Sidebar DTO.
 * When flag off, callers use legacy getSidebarUnitsForSession (no mix).
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  resolveFacilityVocabulary,
  type FacilityVocabulary,
} from "@/lib/facility-builder/facility-vocabulary";
import { isProjectionSidebarEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import { adaptLocationsViewToSidebar } from "./adapt-sidebar";
import {
  loadProjectedLocationView,
  type LoadProjectedLocationOptions,
} from "./load-projected-location";
import type { SidebarProjectionView } from "./sidebar-types";

export type LoadSidebarProjectionOptions = Omit<
  LoadProjectedLocationOptions,
  "purpose"
> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
  vocabulary?: FacilityVocabulary;
};

export type LoadSidebarProjectionResult = {
  enabled: boolean;
  /** Null when flag off (use legacy path exclusively). */
  view: SidebarProjectionView | null;
  projectedUnitIds: readonly string[];
  error: string | null;
  usedLegacyEligibility: boolean;
  metrics: {
    totalDurationMs: number;
    locationCount: number;
    actionableLocationCount: number;
  } | null;
};

async function loadFacilityVocabulary(
  facilityId: string,
): Promise<FacilityVocabulary> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      vocabularyProfile: true,
      vocabularyLevel1Label: true,
      vocabularyLevel2Label: true,
      vocabularyLevel3Label: true,
    },
  });
  return resolveFacilityVocabulary(facility);
}

/**
 * Load Sidebar location tree from Projection.
 * Flag off → enabled false, no Projection call, no legacy mix.
 */
export async function loadSidebarProjection(
  session: AppJwtPayload,
  options: LoadSidebarProjectionOptions = {},
): Promise<LoadSidebarProjectionResult> {
  if (!isProjectionSidebarEnabled()) {
    return {
      enabled: false,
      view: null,
      projectedUnitIds: [],
      error: null,
      usedLegacyEligibility: true,
      metrics: null,
    };
  }

  const loaded = await loadProjectedLocationView(session, {
    ...options,
    purpose: "SIDEBAR",
  });

  const vocabulary =
    options.vocabulary ??
    (session.facilityId
      ? await loadFacilityVocabulary(session.facilityId)
      : undefined);

  const view = adaptLocationsViewToSidebar(
    loaded.view,
    vocabulary,
    loaded.error,
  );

  return {
    enabled: true,
    view,
    projectedUnitIds: view.projectedUnitIds,
    error: loaded.error,
    usedLegacyEligibility: false,
    metrics: loaded.metrics,
  };
}
