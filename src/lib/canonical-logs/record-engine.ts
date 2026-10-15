/**
 * One operational Record engine.
 *
 * Forward authority (CANONICAL_LOGS_ENABLED=true):
 *
 *   CatalogLogDefinition          Vssyl-published product definition
 *     → FacilityCatalogInstall    facility adopted that definition/version (reference, not a copy)
 *     → LogAttachment             facility requirement segment (where / when / local overlay / pinned version)
 *     → derived requirement       resolveLogRequirementsForAttachment + buildLogRequirementKey
 *     → OperationalEvidenceRecord submitted fact (OperationalEvidenceFieldValue = answers)
 *
 * Log Book is a projection over OperationalEvidenceRecord (searchEvidenceRecords).
 * Review / Audit CSV are derived expected-vs-actual layers. Neither is a fact store.
 *
 * OperationalTemplate is NOT the next layer after CatalogLogDefinition.
 * It is the previous facility-owned definition + applicability + schedule engine
 * (Phase 9C). Remaining dependencies: facility-private templates, PM/WO
 * RecordRequirement pins, compatibility runtime when the flag is off.
 *
 * LogTemplate / LogAssignment / LogSubmission and InspectionDefinition /
 * InspectionSubmission are legacy compatibility. Writers are fenced while the
 * product Record engine is on. Historical rows stay readable.
 *
 * PROCEDURE is knowledge, not a submitted Record.
 * Waiver rows are deferred. LogAttachment.waiverAllowed only declares policy.
 */

export const RECORD_ENGINE_AUTHORITY = {
  definition: "CatalogLogDefinition",
  install: "FacilityCatalogInstall",
  requirementSegment: "LogAttachment",
  expectedSlots: "derived",
  fact: "OperationalEvidenceRecord",
  logBook: "projection",
  review: "derived",
} as const;

export type RecordForm =
  | "READING"
  | "CHECKLIST"
  | "INSPECTION"
  | "ACKNOWLEDGEMENT"
  | "ON_DEMAND";

export type CatalogRecordPurpose = "LOG" | "CHECKLIST" | "INSPECTION" | "PROCEDURE";

export type LegacyRecordWriter =
  | "LOG_TEMPLATE"
  | "LOG_ASSIGNMENT"
  | "LOG_SUBMISSION"
  | "INSPECTION_SUBMISSION"
  | "INSPECTION_OCCURRENCE"
  | "OPERATIONAL_TEMPLATE";

export function presentRecordForm(input: {
  purposeType: CatalogRecordPurpose;
  timingMode?: "DAILY_WINDOWS" | "OPERATIONAL_CYCLE" | "CALENDAR" | "AD_HOC" | null;
  fieldTypes?: readonly string[];
}): RecordForm | null {
  if (input.purposeType === "PROCEDURE") return null;
  if (input.timingMode === "AD_HOC") return "ON_DEMAND";
  if (
    input.purposeType === "LOG" &&
    input.fieldTypes &&
    input.fieldTypes.length > 0 &&
    input.fieldTypes.every((fieldType) => fieldType === "ATTESTATION")
  ) {
    return "ACKNOWLEDGEMENT";
  }
  if (input.purposeType === "CHECKLIST") return "CHECKLIST";
  if (input.purposeType === "INSPECTION") return "INSPECTION";
  return "READING";
}

export function recordPurposeRejection(purposeType: string): string | null {
  if (purposeType === "PROCEDURE") {
    return "Procedures are knowledge, not Records.";
  }
  return null;
}

export function legacyRecordWriteDecision(input: {
  productRecordEngine: boolean;
  writer: LegacyRecordWriter;
}): { allowed: true } | { allowed: false; reason: string } {
  if (!input.productRecordEngine) return { allowed: true };
  return {
    allowed: false,
    reason: `${input.writer} is a legacy writer. Product Records are OperationalEvidenceRecord.`,
  };
}

export function assertLegacyRecordWriteAllowed(input: {
  productRecordEngine: boolean;
  writer: LegacyRecordWriter;
}): void {
  const decision = legacyRecordWriteDecision(input);
  if (!decision.allowed) throw new Error(decision.reason);
}

export function pinSubmittedStandard(input: {
  definitionVersion: number;
  minNumber: number | null;
  maxNumber: number | null;
  valueNumber: number;
}): {
  definitionVersion: number;
  minNumber: number | null;
  maxNumber: number | null;
  valueNumber: number;
  outOfStandard: boolean;
} {
  const below = input.minNumber != null && input.valueNumber < input.minNumber;
  const above = input.maxNumber != null && input.valueNumber > input.maxNumber;
  return {
    definitionVersion: input.definitionVersion,
    minNumber: input.minNumber,
    maxNumber: input.maxNumber,
    valueNumber: input.valueNumber,
    outOfStandard: below || above,
  };
}
export function followUpRecordDecision(input: {
  originStableKey: string;
  nextStableKey: string;
  originId: string;
  nextId: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.originId === input.nextId) {
    return { ok: false, reason: "A follow-up is a new Record." };
  }
  if (input.originStableKey !== input.nextStableKey) {
    return { ok: false, reason: "A follow-up uses the same Record definition." };
  }
  return { ok: true };
}
