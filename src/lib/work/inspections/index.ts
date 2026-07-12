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
