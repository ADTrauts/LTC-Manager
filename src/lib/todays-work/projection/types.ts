/**
 * Wave 15I — Today's Work Projection view model.
 *
 * Projection supplies eligibility + Experience work contributors.
 * Engines supply live outstanding work; Today's Work only assembles.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ExperienceToolKey } from "@/lib/experiences";
import type { ProjectionPlantPolicy } from "@/lib/projection";

export type TodaysWorkToolEntry = {
  key: ExperienceToolKey;
  name: string;
};

export type TodaysWorkActionEntry = {
  key: string;
  label: string;
};

/** One Experience that may contribute work for projected locations. */
export type TodaysWorkExperienceContributor = {
  id: string;
  experienceKey: string;
  label: string;
  description: string;
  order: number;
  areaKey: string;
  unitIds: readonly string[];
  spaceIds: readonly string[];
  domains: readonly string[];
  tools: readonly TodaysWorkToolEntry[];
  actions: readonly TodaysWorkActionEntry[];
  allowedActionKeys: readonly string[];
};

export type TodaysWorkAreaContributor = {
  areaKey: string;
  label: string;
  order: number;
  experiences: readonly TodaysWorkExperienceContributor[];
};

export type TodaysWorkProjectionSection = {
  departmentKey: OperationalDepartmentKey | null;
  label: string | null;
  areas: readonly TodaysWorkAreaContributor[];
  plantPolicy: ProjectionPlantPolicy | null;
};

export type TodaysWorkProjectionView = {
  facilityId: string;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  /** Units that may appear in walk/coverage/handoffs (never broaden). */
  projectedUnitIds: readonly string[];
  /** Prefer actionable leaves' owning Units for ranking. */
  actionableUnitIds: readonly string[];
  sections: readonly TodaysWorkProjectionSection[];
  error: string | null;
};
