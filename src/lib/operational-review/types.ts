/**
 * Derived historical Review model for one facility service day.
 * Not persisted. Not RLS. Not a live Run snapshot.
 */

import type { LogAttachmentForResolve, PublishedCycleForLogs } from "@/lib/canonical-logs/resolve-log-requirements";
import type { LogHistorySubmission } from "@/lib/canonical-logs/expectation-history";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import type {
  CoverageAssignmentActual,
  CoverageExpectationStatus,
  CoveragePlanLifecycle,
  CoverageTemplateVersionRow,
} from "@/lib/scheduling/coverage-expectations";

export type ReviewDomainStatus = "evaluated" | "unavailable";

export type ReviewUnavailableReason =
  | "no_historical_ot_version"
  | "attachment_history_not_reliable"
  | "legacy_only_date"
  | "coverage_interval_ambiguous"
  | "unsupported_work_history"
  | "historical_catalog_unresolvable"
  | "no_historical_cycle_version";

export type ReviewDomainAvailability = {
  status: ReviewDomainStatus;
  reason: ReviewUnavailableReason | null;
};

export type ReviewEvidenceState =
  | "completed"
  | "not_complete"
  | "completed_with_corrective_action"
  | "unavailable"
  | "not_required";

export type ReviewCoverageState = "covered" | "at_risk" | "uncovered" | "unavailable";

export type ReviewLocationEntry = {
  spaceId: string;
  parentUnitId: string | null;
  parentUnitLabel: string | null;
  /** Current SPACE display name. Not historically immutable. */
  displayLabel: string;
  displayLabelIsHistorical: false;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
};

export type ReviewEvidenceOccurrence = {
  spaceId: string | null;
  parentUnitId: string | null;
  requirementKey: string;
  attachmentId: string;
  attachmentStableKey: string;
  catalogStableKey: string;
  catalogVersion: number;
  slotLabel: string;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  expected: true;
  state: ReviewEvidenceState;
  recordId: string | null;
  occurredAt: string | null;
  recordedAt: string | null;
  operationalDateKey: string;
};

export type ReviewCoverageSlot = {
  spaceId: string;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  state: ReviewCoverageState;
  templateId: string;
  templateStableKey: string;
  templateVersion: number;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  operationalTypeKey: string | null;
  fillingAssignmentIds: string[];
};

export type ReviewCycleVersion = {
  id: string;
  stableKey: string;
  version: number;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  expectedMilestones: string[];
  spaceIds: string[];
};

export type ReviewMilestoneItem = {
  kind: "SERVERY_READY" | "MEAL_SERVICE_STARTED" | "KEY_TIME";
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  expectedTimeLocal: string | null;
  spaceId: string | null;
  unitId: string | null;
  actualOccurredAt: string | null;
  actualRecordedAt: string | null;
};

export type ReviewScheduledPresence = {
  scheduleEntryId: string;
  employeeId: string;
  employeeDisplayName: string;
  unitId: string | null;
  departmentId: string | null;
  shift: string | null;
};

export type ReviewPresenceException = {
  overrideId: string;
  employeeId: string;
  employeeDisplayName: string;
  kind: "called_off" | "reassigned" | "presence_exception";
  reason: string;
  oldUnitId: string | null;
  newUnitId: string | null;
};

export type ReviewAssignmentActual = {
  id: string;
  roleKey: string;
  status: string;
  employeeId: string | null;
  employeeDisplayName: string | null;
  unitId: string | null;
  coveredSpaceIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  hasCallDown: boolean;
  locationChangedDuringEdits: boolean;
};

export type ReviewAssetImpact = {
  issueId: string;
  spaceId: string | null;
  operationalImpact: "SERVICE_AT_RISK" | "EQUIPMENT_UNAVAILABLE";
  observedAt: string;
};

export type OperationalReviewDayViewModel = {
  facilityId: string;
  facilityLabel: string;
  departmentId: string | null;
  departmentIds: string[];
  serviceDate: string;
  timezone: string;
  locations: ReviewLocationEntry[];
  evidence: {
    availability: ReviewDomainAvailability;
    occurrences: ReviewEvidenceOccurrence[];
  };
  coverage: {
    availability: ReviewDomainAvailability;
    slots: ReviewCoverageSlot[];
    assignments: ReviewAssignmentActual[];
  };
  cycles: {
    availability: ReviewDomainAvailability;
    versions: ReviewCycleVersion[];
  };
  milestones: {
    availability: ReviewDomainAvailability;
    items: ReviewMilestoneItem[];
  };
  presence: {
    scheduled: ReviewScheduledPresence[];
    exceptions: ReviewPresenceException[];
    attendanceClaimed: false;
  };
  work: {
    availability: ReviewDomainAvailability;
  };
  assets: {
    availability: ReviewDomainAvailability;
    impacts: ReviewAssetImpact[];
  };
};

export type OperationalReviewRangeTotals = {
  evidenceExpected: number;
  evidenceCompleted: number;
  evidenceMissed: number;
  evidenceCorrective: number;
  evidenceUnavailableOccurrences: number;
  evidenceUnavailableDays: number;
  evidenceEvaluatedDays: number;
  coverageExpectedSlots: number;
  coverageCovered: number;
  coverageAtRisk: number;
  coverageUncovered: number;
  coverageUnavailableSlots: number;
  coverageUnavailableDays: number;
  coverageEvaluatedDays: number;
  serviceExpected: number;
  serviceRecorded: number;
  serviceNotRecorded: number;
  serviceLate: number;
  serviceUnavailableDays: number;
  serviceEvaluatedDays: number;
  assetImpacts: number;
  assetImpactDays: number;
  scheduledPresence: number;
  presenceExceptions: number;
};

export type OperationalReviewRangeViewModel = {
  facilityId: string;
  facilityLabel: string;
  departmentId: string | null;
  timezone: string;
  startServiceDate: string;
  endServiceDate: string;
  dayCount: number;
  todayKey: string;
  days: OperationalReviewDayViewModel[];
  totals: OperationalReviewRangeTotals;
};

export type ReviewProfileFact = {
  id: string;
  departmentId: string;
  version: number;
  status: "DRAFT" | "CERTIFIED" | "ACTIVE" | "RETIRED";
  activatedAt: Date | null;
  retiredAt: Date | null;
};

export type ReviewOtBindingFact = {
  profileId: string;
  spaceId: string;
  operationalTypeKey: string;
  operationalTypeName: string;
  archetypeIsActive: boolean;
};

export type ReviewSpaceFact = {
  spaceId: string;
  displayLabel: string;
  parentUnitId: string | null;
  parentUnitLabel: string | null;
};

export type ReviewAttachmentSegmentFact = LogAttachmentForResolve & {
  updatedAt: Date;
  createdAt: Date;
};

export type ReviewEvidenceRecordFact = LogHistorySubmission & {
  logAttachmentId: string | null;
  attachmentStableKey: string | null;
  catalogStableKey: string | null;
  spaceId: string | null;
  unitId: string | null;
  occurredAt: Date;
  recordedAt: Date;
};

export type ReviewCoverageTemplateFact = CoverageTemplateVersionRow;

export type ReviewAssignmentFact = CoverageAssignmentActual & {
  departmentId: string;
  employeeId: string | null;
  locationChangedDuringEdits: boolean;
};

export type ReviewPlanFact = {
  departmentId: string;
  status: string;
};

export type ReviewCycleFact = OperationalCycleDefinition;

export type ReviewServeryMilestoneActual = {
  unitId: string;
  mealType: string;
  milestone: "READY" | "SERVICE_STARTED";
  occurredAt: Date;
  recordedAt: Date | null;
};

export type ReviewKeyTimeActual = {
  spaceId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  configuredDueLocal: string;
  adjustedDueLocal: string | null;
  completedAt: Date | null;
};

export type ReviewScheduleFact = {
  id: string;
  employeeId: string;
  employeeDisplayName: string;
  unitId: string | null;
  departmentId: string | null;
  shift: string | null;
};

export type ReviewOverrideFact = {
  id: string;
  employeeId: string;
  employeeDisplayName: string;
  reason: string;
  oldUnitId: string | null;
  newUnitId: string;
};

export type ReviewAssetImpactFact = {
  issueId: string;
  spaceId: string | null;
  operationalImpact: "SERVICE_AT_RISK" | "EQUIPMENT_UNAVAILABLE";
  observedAt: Date;
};

export type OperationalReviewDayFacts = {
  facilityId: string;
  facilityLabel: string;
  departmentId: string | null;
  departmentIds: string[];
  serviceDate: string;
  timezone: string;
  now: Date;
  todayKey: string;
  spaces: ReviewSpaceFact[];
  profiles: ReviewProfileFact[];
  otBindings: ReviewOtBindingFact[];
  attachmentSegments: ReviewAttachmentSegmentFact[];
  evidenceRecords: ReviewEvidenceRecordFact[];
  coverageTemplates: ReviewCoverageTemplateFact[];
  assignments: ReviewAssignmentFact[];
  plans: ReviewPlanFact[];
  cycles: ReviewCycleFact[];
  publishedCyclesForLogs: PublishedCycleForLogs[];
  serveryMilestoneActuals: ReviewServeryMilestoneActual[];
  keyTimeActuals: ReviewKeyTimeActual[];
  scheduledPresence: ReviewScheduleFact[];
  presenceExceptions: ReviewOverrideFact[];
  assetImpacts: ReviewAssetImpactFact[];
  /** Loader-only signal: legacy LogSubmission rows exist for this date. */
  legacySubmissionPresent: boolean;
  coverageStatusByDepartment?: Record<
    string,
    { status: "evaluated" | "unavailable"; reason: ReviewUnavailableReason | null }
  >;
};

export type CoverageExpectationStatusForReview = CoverageExpectationStatus;
export type CoveragePlanLifecycleForReview = CoveragePlanLifecycle;
