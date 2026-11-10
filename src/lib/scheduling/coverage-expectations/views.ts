import type { CoverageExpectationStatus } from "./types";

export type CoverageRoleOption = {
  key: string;
  label: string;
};

export type CoverageCycleOption = {
  stableKey: string;
  label: string;
};

export type CoverageUnitOption = {
  id: string;
  name: string;
};

export type CoverageSpaceOption = {
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
};

export type CoverageExpectationItemView = {
  id: string;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  applicableOperationalCycleStableKeys: string[];
  unitId: string | null;
  unitName: string | null;
  spaceId: string | null;
  spaceName: string | null;
};

export type CoverageExpectationView = {
  id: string;
  stableKey: string;
  version: number;
  status: CoverageExpectationStatus;
  name: string;
  description: string | null;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  items: CoverageExpectationItemView[];
};

export type CoverageCatalog = {
  roles: CoverageRoleOption[];
  cycles: CoverageCycleOption[];
  units: CoverageUnitOption[];
  spaces: CoverageSpaceOption[];
};
