import type {
  InspectionResponseType,
  InspectionResult,
} from "@prisma/client";

export type InspectionDefinitionItemSnapshot = {
  id: string;
  label: string;
  isRequired: boolean;
  responseType: InspectionResponseType;
  failureCreatesFollowUp: boolean;
  sortOrder: number;
};

export type InspectionDefinitionSnapshot = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  unitId: string | null;
  name: string;
  isActive: boolean;
  items: InspectionDefinitionItemSnapshot[];
};

export type InspectionItemAnswerInput = {
  definitionItemId: string;
  /** Required for PASS_FAIL / YES_NO. */
  passed?: boolean | null;
  valueText?: string | null;
  valueNumber?: number | null;
  notes?: string | null;
};

export type SubmitInspectionInput = {
  facilityId: string;
  definitionId: string;
  unitId?: string | null;
  operationInstanceId?: string | null;
  submittedByEmployeeId?: string | null;
  notes?: string | null;
  /** When set, retries with the same key return the existing submission. */
  idempotencyKey?: string | null;
  answers: InspectionItemAnswerInput[];
};

export type ValidatedInspectionItemAnswer = {
  definitionItemId: string;
  passed: boolean | null;
  valueText: string | null;
  valueNumber: number | null;
  notes: string | null;
  isRequired: boolean;
  responseType: InspectionResponseType;
  failureCreatesFollowUp: boolean;
  label: string;
};

export type InspectionValidationSuccess = {
  ok: true;
  definition: InspectionDefinitionSnapshot;
  answers: ValidatedInspectionItemAnswer[];
  resolvedUnitId: string | null;
};

export type InspectionValidationFailure = {
  ok: false;
  code:
    | "DEFINITION_NOT_FOUND"
    | "DEFINITION_INACTIVE"
    | "FACILITY_MISMATCH"
    | "UNIT_SCOPE_MISMATCH"
    | "UNIT_REQUIRED"
    | "REQUIRED_ITEM_MISSING"
    | "UNKNOWN_ITEM"
    | "INVALID_ANSWER"
    | "DUPLICATE_ANSWER";
  message: string;
};

export type InspectionValidationResult =
  | InspectionValidationSuccess
  | InspectionValidationFailure;

export type DeterminedInspectionResult = {
  result: InspectionResult;
  failedRequiredItemIds: string[];
  findingItemIds: string[];
};

export type SubmitInspectionSuccess = {
  ok: true;
  deduplicated: boolean;
  submission: {
    id: string;
    facilityId: string;
    definitionId: string;
    unitId: string | null;
    operationInstanceId: string | null;
    submittedByEmployeeId: string | null;
    submittedAt: Date;
    result: InspectionResult;
    notes: string | null;
    taskId: string | null;
    definitionName: string;
    departmentId: string | null;
  };
  taskSync: {
    attempted: boolean;
    synced: boolean;
    skipped: boolean;
    taskId: string | null;
  };
  followUpSync: {
    attempted: boolean;
    skipped: boolean;
    qualifyingCount: number;
    taskIds: string[];
  };
};

export type SubmitInspectionFailure = {
  ok: false;
  validation: InspectionValidationFailure;
};

export type SubmitInspectionResult = SubmitInspectionSuccess | SubmitInspectionFailure;
