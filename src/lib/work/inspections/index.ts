export type {
  InspectionDefinitionItemSnapshot,
  InspectionDefinitionSnapshot,
  InspectionItemAnswerInput,
  SubmitInspectionInput,
  SubmitInspectionResult,
  InspectionValidationResult,
  DeterminedInspectionResult,
} from "@/lib/work/inspections/types";

export { validateInspectionSubmission } from "@/lib/work/inspections/validate-inspection-submission";
export { determineInspectionResult } from "@/lib/work/inspections/determine-inspection-result";
export { submitInspection } from "@/lib/work/inspections/submit-inspection";
export {
  syncInspectionRecordToTask,
  buildInspectionTaskUpsertInput,
  mapInspectionResultToTaskStatus,
} from "@/lib/work/inspections/inspection-task";
export { inspectionResultOperatorCopy } from "@/lib/work/inspections/result-copy";
export { filterInspectionsForUnit } from "@/lib/work/inspections/list-unit-inspections";
export {
  upsertInspectionDefinitionSchema,
  parseInspectionItemsJson,
} from "@/lib/work/inspections/definition-schema";
export {
  syncInspectionFollowUpTasks,
  syncInspectionFollowUpTasksFromContext,
  isQualifyingInspectionFollowUp,
  buildInspectionFollowUpUpsertInput,
  buildInspectionFollowUpTitle,
  followUpStatusLabel,
} from "@/lib/work/inspections/sync-inspection-follow-up-tasks";
export {
  generateDueInspectionWork,
  generateDueInspectionWorkForFacilities,
  buildScheduledInspectionTaskInput,
} from "@/lib/work/inspections/generate-due-inspection-work";
export {
  doesCadenceMatchServiceDate,
  buildInspectionScheduleSummary,
  iterateServiceDatesInclusive,
} from "@/lib/work/inspections/inspection-cadence";
export { facilityLocalDateTimeToUtc } from "@/lib/work/inspections/facility-local-due-at";
export { completeScheduledInspectionOccurrence } from "@/lib/work/inspections/complete-scheduled-occurrence";
