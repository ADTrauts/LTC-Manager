import type { CoverageExpectationStatus } from "./types";

export type CoverageRoleOption = {
  key: string;
  label: string;
};

export type CoverageCycleOption = {
  stableKey: string;
  label: string;
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

export type CoverageLocationOption = {
  id: string;
  name: string;
  roomTypeLabel: string | null;
};

export type CoverageCatalog = {
  roles: CoverageRoleOption[];
  locations: CoverageLocationOption[];
  cycles: CoverageCycleOption[];
};
