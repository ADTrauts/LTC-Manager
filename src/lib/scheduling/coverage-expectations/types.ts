/**
 * Canonical coverage need.
 *
 * WHAT: operational assignment roleKey
 * HOW MANY: requiredCount
 * WHERE: canonical UnitSpace (spaceId). A Unit id is that Unit, not its rooms.
 * WHEN: DepartmentOperationalCycle.stableKey for a period
 * ACTUAL: OperationalAssignment (never ScheduleEntry, Team membership, or Job Role)
 *
 * Coverage state is derived. Do not persist isCovered.
 * Location Function does not select the room.
 */

export type CoverageExpectationStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

export type CoveragePerspective = "working" | "runtime";

export type CoverageProvenanceSource = "EXPLICIT_LOCATION";

export type CoverageExpectationItemInput = {
  id: string;
  templateId: string;
  templateStableKey: string;
  templateVersion: number;
  templateStatus: CoverageExpectationStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  unitId: string | null;
  spaceId: string | null;
  /** Ignored. Coverage matching does not read Location Function. */
  applicableOperationalTypeKeys?: readonly string[];
  applicableOperationalCycleStableKeys: readonly string[];
};

export type CoverageLocationContext = {
  departmentId: string;
  spaceId: string;
  unitId: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
};

export type CoverageCycleRef = {
  stableKey: string;
  label: string;
};

export type ResolvedCoverageExpectation = {
  id: string;
  templateId: string;
  templateStableKey: string;
  templateVersion: number;
  templateStatus: CoverageExpectationStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
  unitId: string | null;
  provenance: CoverageProvenanceSource;
  detail: string;
};

export type CanonicalCoverageState =
  | "COVERED"
  | "AT_RISK"
  | "UNCOVERED"
  | "NOT_YET_ASSIGNED"
  | "NOT_CONFIRMED"
  | "NOT_APPLICABLE";

export type CoverageAssignmentActual = {
  id: string;
  roleKey: string;
  status: string;
  unitId: string | null;
  coveredSpaceIds: readonly string[];
  startsAt: Date | null;
  endsAt: Date | null;
  hasCallDown?: boolean;
  /** Present when the OA prefetch already loaded employee identity. */
  employeeId?: string | null;
  employeeDisplayName?: string | null;
};

export type CoveragePlanLifecycle = "MISSING" | "DRAFT" | "RUNTIME_VISIBLE";
