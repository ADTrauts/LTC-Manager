/**
 * Runtime Location State — derived operational interpretation for one SPACE.
 *
 * Projection answers: which places may this viewer see?
 * This object answers: what is happening at this operational location?
 *
 * Not persisted. Not authorization. Not a Builder dump. Not a health score.
 */

import type { CanonicalCoverageState, CoveragePlanLifecycle } from "@/lib/scheduling/coverage-expectations";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import type { RunModelProvenance } from "@/lib/operational-cycles/present-run-operation";
import type { KeyTimeStatusKey } from "@/lib/operational-cycles/key-time-day-expectation";
import type { AssetOperationalImpact } from "@prisma/client";
import type { AssetOperationalStatus } from "@/lib/asset-operations/types";

export type RuntimeLocationKind = "SPACE";

export type RuntimeLocationId = {
  kind: RuntimeLocationKind;
  spaceId: string;
  unitId: string | null;
  departmentId: string;
  facilityId: string;
};

export type RuntimeTimeTriple = {
  configured: string | null;
  adjusted: string | null;
  expectedToday: string | null;
  actual: string | null;
  recordedAt: Date | null;
};

export type RuntimeLocationIdentity = {
  location: RuntimeLocationId;
  displayName: string;
  hierarchy: {
    facilityName: string;
    departmentName: string | null;
    floorName: string | null;
    neighborhoodName: string | null;
    unitName: string | null;
    spaceName: string;
  };
  physical: {
    roomTypeKey: string | null;
    roomTypeLabel: string | null;
  };
};

export type RuntimeEffectiveProgramRef = {
  operationalType: {
    state: "assigned" | "unassigned";
    key: string | null;
    name: string | null;
    id: string | null;
    profileId: string | null;
    profileVersion: number | null;
    profileStatus: "ACTIVE" | null;
  };
  cycleSetRef: {
    departmentId: string;
    publishedOn: string;
    cycleRefs: Array<{
      stableKey: string;
      version: number;
      label: string;
    }>;
  } | null;
  coverageExpectationRefs: Array<{
    templateStableKey: string;
    templateVersion: number;
  }>;
  logAttachmentRefs: Array<{
    attachmentId: string;
    stableKey: string;
  }>;
};

export type RuntimeCurrentOperation = {
  state: "ACTIVE" | "NONE";
  current: {
    cycleStableKey: string;
    cycleVersion: number;
    label: string;
    hierarchyLabel: string | null;
    window: { start: string | null; end: string | null };
    timing: RuntimeTimeTriple;
  } | null;
  upcoming: {
    cycleStableKey: string;
    label: string;
    startsAt: string | null;
    minutesUntil: number | null;
  } | null;
  provenance: RunModelProvenance;
};

export type RuntimeCoverageAvailability =
  | "evaluated"
  | "feature_disabled"
  | "no_published_expectations"
  | "not_applicable";

export type RuntimeCoverageAssignmentRef = {
  assignmentId: string;
  employeeId: string | null;
  employeeDisplayName: string | null;
};

export type RuntimeCoverageSlot = {
  expectationId: string;
  templateStableKey: string;
  templateVersion: number;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  state: CanonicalCoverageState;
  cycleStableKey: string | null;
  assignmentIds: string[];
  assignmentRefs: RuntimeCoverageAssignmentRef[];
};

export type RuntimeCoverageState = {
  availability: RuntimeCoverageAvailability;
  planLifecycle: CoveragePlanLifecycle | null;
  slots: RuntimeCoverageSlot[];
};

export type RuntimeEvidenceItem = {
  requirementKey: string;
  attachmentId: string;
  /** Harbor Catalog stable identity. Passed through from LogRequirement — not looked up again. */
  catalogStableKey: string;
  displayName: string;
  productState: LogRequirementProductState;
  cycleStableKey: string | null;
  window: { start: string | null; end: string | null };
  recordId: string | null;
  href: string | null;
  needsSupervisorReview: boolean;
};

export type RuntimeEvidenceState = {
  requiredToday: number;
  dueNow: string[];
  upcoming: string[];
  completed: string[];
  overdue: string[];
  needsReview: string[];
  correctiveOpen: string[];
  items: RuntimeEvidenceItem[];
};

export type RuntimeAssetFact = {
  assetId: string;
  name: string;
  status: AssetOperationalStatus;
  openIssueCount: number;
  openWorkOrderCount: number;
};

export type RuntimeAssetIssueFact = {
  issueId: string;
  assetId: string;
  impact: AssetOperationalImpact;
  summary: string;
  href: string | null;
};

export type RuntimeAssetState = {
  assets: RuntimeAssetFact[];
  issuesAffectingOperation: RuntimeAssetIssueFact[];
  openIssues: RuntimeAssetIssueFact[];
};

export type RuntimeMilestoneKind = "KEY_TIME" | "SERVERY_READY" | "MEAL_SERVICE_STARTED";

export type RuntimeMilestoneItem = {
  kind: RuntimeMilestoneKind;
  label: string;
  cycleStableKey: string | null;
  timing: RuntimeTimeTriple;
  statusKey: KeyTimeStatusKey | "not_recorded";
  canonical: boolean;
};

export type RuntimeMilestoneState = {
  items: RuntimeMilestoneItem[];
};

export type RuntimeReadinessState = {
  availability: "deferred_legacy_engine";
  state: null;
  source: null;
  primaryReason: null;
};

export type RuntimeAdjustmentKind =
  | "ASSIGNMENT_OVERRIDE"
  | "CYCLE_TIME_ADJUSTED"
  | "KEY_TIME_ADJUSTED"
  | "KEY_TIME_COMPLETED"
  | "SERVERY_READY"
  | "MEAL_SERVICE_STARTED"
  | "ISSUE_OPENED"
  | "CORRECTIVE_ACTION";

export type RuntimeAdjustment = {
  kind: RuntimeAdjustmentKind;
  sourceId: string;
  at: Date;
  detail: string;
  doesNotRewriteBuild: true;
};

export type RuntimeExceptionSource =
  | "coverage"
  | "evidence"
  | "milestone"
  | "asset_issue"
  | "corrective_action"
  | "runtime_delay";

export type RuntimeException = {
  source: RuntimeExceptionSource;
  state: string;
  location: RuntimeLocationId;
  operationalContext: {
    cycleStableKey: string | null;
    operationalTypeKey: string | null;
  };
  label: string;
  href: string | null;
};

export type RuntimeNextEventKind =
  | "cycle_start"
  | "cycle_end"
  | "key_time"
  | "evidence_window"
  | "assignment_transition";

export type RuntimeNextEvent = {
  kind: RuntimeNextEventKind;
  at: Date;
  label: string;
  sourceId: string;
};

export type RuntimeLocationAsOf = {
  now: Date;
  operationalDateKey: string;
  timezone: string;
};

export type RuntimeLocationState = {
  identity: RuntimeLocationIdentity;
  program: RuntimeEffectiveProgramRef;
  operation: RuntimeCurrentOperation;
  coverage: RuntimeCoverageState;
  evidence: RuntimeEvidenceState;
  assets: RuntimeAssetState;
  milestones: RuntimeMilestoneState;
  readiness: RuntimeReadinessState;
  changes: RuntimeAdjustment[];
  exceptions: RuntimeException[];
  next: RuntimeNextEvent | null;
  asOf: RuntimeLocationAsOf;
};

export type RuntimeLocationSpaceRef = {
  spaceId: string;
  departmentId: string;
  departmentLabel?: string | null;
  unitId?: string | null;
  displayName?: string | null;
  floorName?: string | null;
  neighborhoodName?: string | null;
};

export type LoadRuntimeLocationStatesInput = {
  facilityId: string;
  spaceRefs: readonly RuntimeLocationSpaceRef[];
  now?: Date;
  /** Injected for tests. Defaults to isOperationalAssignmentsEnabled(). */
  operationalAssignmentsEnabled?: boolean;
  /** Injected for tests. Defaults to isCanonicalLogsEnabled(). */
  canonicalLogsEnabled?: boolean;
};

export type RuntimeLocationPrefetchStats = {
  publishedRunModelLoads: number;
  coveragePrefetchSets: number;
  evidenceAttachmentQueries: number;
  assetIssueQueries: number;
  spaceIdentityQueries: number;
  perSpaceDomainLoads: number;
};

export const DEFERRED_READINESS: RuntimeReadinessState = {
  availability: "deferred_legacy_engine",
  state: null,
  source: null,
  primaryReason: null,
};
