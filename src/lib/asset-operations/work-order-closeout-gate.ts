/**
 * Client-safe Work Order closeout gate. Keep Prisma / Node services out of this module
 * so technician UX can reuse the same completion rules.
 */
export const WORK_PERFORMED_MIN_LENGTH = 3;
export const WAIVE_REASON_MIN_LENGTH = 8;

export const SATISFYING_RECORD_STATUSES = [
  "COMPLETED",
  "COMPLETED_WITH_CORRECTIVE_ACTION",
] as const;

export type WorkOrderCloseoutMissingFact =
  | "WORK_PERFORMED"
  | "LABOR"
  | "REQUIRED_RECORD"
  | "ASSET_CONDITION_REVIEW";

export type RepairAssetConditionReviewChoice =
  | "NO_CHANGE"
  | "OPERATIONAL"
  | "DEGRADED"
  | "OUT_OF_SERVICE";

export type WorkOrderCloseoutValidation = {
  canComplete: boolean;
  missing: WorkOrderCloseoutMissingFact[];
  missingRecordLabels: string[];
};

/** A completed Record satisfies the pin. A Catalog form wins when the requirement names one. */
export function recordMatchesPinnedRequirement(input: {
  requirement: {
    templateId?: string | null;
    templateVersion: number | null;
    templateStableKey?: string | null;
    catalogDefinitionId?: string | null;
    catalogVersion?: number | null;
  };
  record: {
    templateId?: string | null;
    templateVersion: number | null;
    templateStableKey?: string | null;
    catalogDefinitionId?: string | null;
    assetId?: string | null;
  };
  assetId?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (input.requirement.catalogDefinitionId) {
    if (input.record.catalogDefinitionId !== input.requirement.catalogDefinitionId) {
      return { ok: false, reason: "Record does not match the required form." };
    }
    if (
      input.assetId &&
      input.record.assetId &&
      input.record.assetId !== input.assetId
    ) {
      return { ok: false, reason: "Record is for a different asset." };
    }
    return { ok: true };
  }
  const requirementKey = input.requirement.templateStableKey ?? input.requirement.templateId ?? null;
  const recordKey = input.record.templateStableKey ?? input.record.templateId ?? null;
  if (requirementKey && recordKey !== requirementKey) {
    return { ok: false, reason: "Record does not match the pinned required template." };
  }
  if (input.record.templateVersion !== input.requirement.templateVersion) {
    return { ok: false, reason: "Record does not match the pinned template version." };
  }
  return { ok: true };
}

export function validateWorkOrderCloseout(input: {
  workPerformed: string | null | undefined;
  laborEntryCount: number;
  requirements: Array<{ status: string; templateName?: string | null }>;
  hasAsset: boolean;
  assetConditionReview: RepairAssetConditionReviewChoice | null | undefined;
}): WorkOrderCloseoutValidation {
  const missing: WorkOrderCloseoutMissingFact[] = [];
  const missingRecordLabels: string[] = [];

  if ((input.workPerformed ?? "").trim().length < WORK_PERFORMED_MIN_LENGTH) {
    missing.push("WORK_PERFORMED");
  }
  if (input.laborEntryCount < 1) {
    missing.push("LABOR");
  }

  for (const requirement of input.requirements) {
    if (requirement.status === "PENDING") {
      missingRecordLabels.push(requirement.templateName?.trim() || "Required Record");
    }
  }
  if (missingRecordLabels.length > 0) {
    missing.push("REQUIRED_RECORD");
  }

  if (input.hasAsset && !input.assetConditionReview) {
    missing.push("ASSET_CONDITION_REVIEW");
  }

  return {
    canComplete: missing.length === 0,
    missing,
    missingRecordLabels,
  };
}

export function formatWorkOrderCloseoutBlockedMessage(
  validation: WorkOrderCloseoutValidation,
): string {
  const lines = ["Cannot complete Work Order", "", "Still required:"];
  for (const fact of validation.missing) {
    if (fact === "WORK_PERFORMED") lines.push("• Work performed");
    if (fact === "LABOR") lines.push("• Labor time");
    if (fact === "ASSET_CONDITION_REVIEW") lines.push("• Asset condition review");
    if (fact === "REQUIRED_RECORD") {
      for (const label of validation.missingRecordLabels) {
        lines.push(`• ${label}`);
      }
    }
  }
  return lines.join("\n");
}
