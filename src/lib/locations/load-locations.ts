/**
 * Wave 15F — Locations Experience loader.
 *
 * Delegates eligibility to the shared projected-location loader (purpose LOCATIONS).
 */

import type { AppJwtPayload } from "@/lib/auth";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
import type {
  ProjectionRuntimeMemo,
  ProjectionRuntimeResult,
  ProjectionSourceLoadDb,
} from "@/lib/projection";

import {
  loadProjectedLocationView,
  type LoadProjectedLocationOptions,
} from "./load-projected-location";
import type { LocationsViewModel } from "./types";

export type LoadLocationsViewOptions = Omit<LoadProjectedLocationOptions, "purpose"> & {
  db?: ProjectionSourceLoadDb;
  memo?: ProjectionRuntimeMemo<ProjectionRuntimeResult>;
};

export type LoadLocationsViewResult = {
  enabled: boolean;
  view: LocationsViewModel | null;
  projectedUnitIds: readonly string[];
  error: string | null;
  metrics: {
    totalDurationMs: number;
    locationCount: number;
    actionableLocationCount: number;
  } | null;
};

/**
 * Load the Locations Experience from Projection Runtime.
 * Single resolve; reuses request-scoped memoization when provided.
 */
export async function loadLocationsView(
  session: AppJwtPayload,
  options: LoadLocationsViewOptions = {},
): Promise<LoadLocationsViewResult> {
  if (!isProjectionLocationsEnabled()) {
    return {
      enabled: false,
      view: null,
      projectedUnitIds: [],
      error: null,
      metrics: null,
    };
  }

  const loaded = await loadProjectedLocationView(session, {
    ...options,
    purpose: "LOCATIONS",
  });

  return {
    enabled: true,
    view: loaded.view,
    projectedUnitIds: loaded.projectedUnitIds,
    error: loaded.error,
    metrics: loaded.metrics,
  };
}
