/**
 * Wave 15H — Unit Workspace Projection view model.
 *
 * Workspace renders this. Eligibility / Areas / Experiences / tools / actions
 * come only from Projection.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ExperienceToolKey } from "@/lib/experiences";
import type { ProjectionPlantPolicy } from "@/lib/projection";

export type UnitWorkspaceToolEntry = {
  key: ExperienceToolKey;
  name: string;
  description: string;
};

export type UnitWorkspaceActionEntry = {
  key: string;
  label: string;
  category: string;
  placement: string;
};

export type UnitWorkspaceExperiencePanel = {
  id: string;
  experienceKey: string;
  label: string;
  description: string;
  order: number;
  areaKey: string;
  tools: readonly UnitWorkspaceToolEntry[];
  actions: readonly UnitWorkspaceActionEntry[];
  allowedActionKeys: readonly string[];
  statusKeys: readonly string[];
  density: string;
  locationIds: readonly string[];
};

export type UnitWorkspaceAreaPanel = {
  areaKey: string;
  label: string;
  order: number;
  experiences: readonly UnitWorkspaceExperiencePanel[];
};

export type UnitWorkspaceRoomContext = {
  locationId: string;
  spaceId: string;
  label: string;
  presentation: "ACTIONABLE" | "STRUCTURAL";
};

export type UnitWorkspaceProjectionSection = {
  departmentKey: OperationalDepartmentKey | null;
  label: string | null;
  areas: readonly UnitWorkspaceAreaPanel[];
  plantPolicy: ProjectionPlantPolicy | null;
};

export type UnitWorkspaceProjectionView = {
  facilityId: string;
  unitId: string;
  unitIncluded: boolean;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  sections: readonly UnitWorkspaceProjectionSection[];
  roomContext: readonly UnitWorkspaceRoomContext[];
  level1Label: string;
  level2Label: string;
  level3Label: string;
  error: string | null;
};
