/**
 * Wave 15F — Locations Experience view model.
 *
 * Locations only renders this model. Eligibility, visibility, Experiences,
 * Plant policy, and permission narrowing are Projection's responsibility.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type {
  ProjectionLocationPresentation,
  ProjectionPlantPolicy,
  ProjectionPurpose,
  ProjectionRevision,
} from "@/lib/projection";

export type LocationsLensMode = "DEPARTMENT" | "FACILITY";

export type LocationsExperienceRef = {
  experienceKey: string;
  areaKey: string;
  label: string;
  order: number;
  allowedActionKeys: readonly string[];
};

export type LocationsAreaRef = {
  areaKey: string;
  label: string;
  order: number;
  experiences: readonly LocationsExperienceRef[];
};

/**
 * Place-entry tree node:
 * Facility → Floor → Neighborhood → Room → Operational Areas → Experiences
 */
export type LocationsTreeNode = {
  id: string;
  label: string;
  presentation: ProjectionLocationPresentation;
  /** UNIT id for floors/neighborhoods/legacy units; SPACE id for rooms. */
  physicalId: string;
  kind: "FACILITY" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY" | "ROOM";
  /** Parent Unit id for rooms; null for facility/unit nodes. */
  unitId: string | null;
  /** Workspace entry when a Unit destination exists. */
  href: string | null;
  experienceKeys: readonly string[];
  areas: readonly LocationsAreaRef[];
  children: readonly LocationsTreeNode[];
};

export type LocationsDepartmentSnapshot = {
  departmentId: string;
  departmentKey: OperationalDepartmentKey;
  label: string;
  roots: readonly LocationsTreeNode[];
  actionableLocationIds: readonly string[];
  /** Distinct Unit ids present in this department's projected tree. */
  unitIds: readonly string[];
  plantPolicy: ProjectionPlantPolicy | null;
};

export type LocationsViewModel = {
  facilityId: string;
  purpose: ProjectionPurpose;
  lensMode: LocationsLensMode;
  lensKey: string;
  /** Active department when lens is DEPARTMENT; null for Facility Overview. */
  departmentKey: OperationalDepartmentKey | null;
  revision: ProjectionRevision;
  /**
   * Department-labeled snapshots.
   * Facility Overview keeps one entry per department — never flatten/merge.
   * Department lens has exactly one entry.
   */
  departmentSnapshots: readonly LocationsDepartmentSnapshot[];
  /**
   * Physical Unit ids for the Locations page loader (deduped).
   * Physical identity may be shared across labeled department snapshots;
   * Experiences/Areas remain department-labeled above.
   */
  projectedUnitIds: readonly string[];
  diagnostics: readonly { code: string; severity: string; message: string }[];
};
