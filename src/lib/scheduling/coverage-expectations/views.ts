import type { CoverageExpectationStatus } from "./types";

export type CoverageRoleOption = {
  key: string;
  label: string;
};

export type CoverageOperationalTypeOption = {
  key: string;
  name: string;
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
  applicableOperationalTypeKeys: string[];
  applicableOperationalCycleStableKeys: string[];
  unitId: string | null;
  unitName: string | null;
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
  operationalTypes: CoverageOperationalTypeOption[];
  cycles: CoverageCycleOption[];
};
