/**
 * Run → Locations landing presentation.
 *
 * Projection still owns eligibility/hrefs. These types are display-only
 * reductions of Runtime Location State. Not persisted. Not a health score.
 */

import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";

export const LANDING_COVERAGE_UNAVAILABLE_LABEL = "Coverage unavailable";
export const LANDING_NO_ACTIVE_OPERATION_LABEL = "No active operation";
export const LANDING_UNTYPED_LABEL = "Operational Type not assigned";

export type LocationLandingGrain = "SPACE" | "NEIGHBORHOOD" | "FLOOR";

export type LocationLandingSpaceAncestry = {
  spaceId: string;
  spaceNodeId: string;
  neighborhoodNodeId: string | null;
  floorNodeId: string | null;
  departmentId: string;
};

export type CollectedLandingSpaces = {
  refs: RuntimeLocationSpaceRef[];
  ancestry: LocationLandingSpaceAncestry[];
};

/** Compact operational row for the Locations hierarchy. */
export type LocationLandingRowState = {
  grain: LocationLandingGrain;
  operationLabel: string | null;
  configurationLabel: string | null;
  exceptionLabels: string[];
  moreExceptionCount: number;
  nextLabel: string | null;
  coverageLabel: string | null;
  summaryFacts: string[];
  needsAttention: boolean;
  configureHref: string | null;
};

export type LocationsLandingPresentation = {
  byNodeId: Readonly<Record<string, LocationLandingRowState>>;
  spaceCount: number;
};
