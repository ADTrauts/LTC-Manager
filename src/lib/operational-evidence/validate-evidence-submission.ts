import type { OperationalEvidenceFieldType } from "@prisma/client";

import type {
  EvidenceFieldValueInput,
  EvidenceSubmissionValidationResult,
  TemplateFieldSnapshot,
  TemplateValidationIssue,
} from "./types";

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
): TemplateValidationIssue {
  return { code, message, severity };
}

function hasProvidedValue(
  fieldType: OperationalEvidenceFieldType,
  value: EvidenceFieldValueInput | undefined,
): boolean {
  if (!value) return false;
  switch (fieldType) {
    case "NUMBER":
    case "TEMPERATURE":
      return value.valueNumber != null && Number.isFinite(Number(value.valueNumber));
    case "YES_NO":
    case "ATTESTATION":
      return value.valueBoolean != null;
    case "PASS_NEEDS_ATTENTION":
      return Boolean(value.valueText?.trim()) || value.valueBoolean != null;
    case "SINGLE_SELECT":
      return Boolean(value.valueText?.trim()) || (value.valueSelections?.length ?? 0) === 1;
    case "MULTI_SELECT":
      return (value.valueSelections?.length ?? 0) > 0;
    case "DATE":
    case "TIME":
      return value.valueDateTime != null || Boolean(value.valueText?.trim());
    case "OPTIONAL_COMMENT":
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return Boolean(value.valueText?.trim());
    default:
      return Boolean(value.valueText?.trim()) || value.valueNumber != null || value.valueBoolean != null;
  }
}

function selectionValues(value: EvidenceFieldValueInput): string[] {
  if (value.valueSelections && value.valueSelections.length > 0) {
    return value.valueSelections.map((s) => s.trim()).filter(Boolean);
  }
  if (value.valueText?.trim()) return [value.valueText.trim()];
  return [];
}

function isOutOfStandard(
  field: TemplateFieldSnapshot,
  value: EvidenceFieldValueInput | undefined,
): boolean {
  if (!value || !field.correctiveActionTrigger) return false;

  switch (field.fieldType) {
    case "NUMBER":
    case "TEMPERATURE": {
      if (value.valueNumber == null || !Number.isFinite(Number(value.valueNumber))) return false;
      const n = Number(value.valueNumber);
      if (field.minNumber != null && n < field.minNumber) return true;
      if (field.maxNumber != null && n > field.maxNumber) return true;
      return false;
    }
    case "PASS_NEEDS_ATTENTION": {
      const text = (value.valueText ?? "").trim().toUpperCase();
      if (text === "NEEDS_ATTENTION" || text === "FAIL" || text === "NEEDS ATTENTION") return true;
      if (value.valueBoolean === false) return true;
      return false;
    }
    case "YES_NO":
      // Out-of-standard only when trigger is set and answer is explicitly No.
      return value.valueBoolean === false;
    default:
      return false;
  }
}

/**
 * Validate submitted field values against published template fields.
 * Detects out-of-standard results and whether corrective action text is required.
 */
export function validateEvidenceSubmission(input: {
  fields: readonly TemplateFieldSnapshot[];
  values: readonly EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
}): EvidenceSubmissionValidationResult {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const byKey = new Map(input.values.map((v) => [v.fieldKey, v]));
  const fieldOutOfStandard: Record<string, boolean> = {};
  let outOfStandard = false;
  let correctiveActionRequired = false;

  const knownKeys = new Set(input.fields.map((f) => f.fieldKey));
  for (const value of input.values) {
    if (!knownKeys.has(value.fieldKey)) {
      errors.push(
        issue(
          `values.${value.fieldKey}.unknown_field`,
          `Unknown field key "${value.fieldKey}".`,
          "error",
        ),
      );
    }
  }

  for (const field of input.fields) {
    const value = byKey.get(field.fieldKey);
    const required = field.isRequired && field.fieldType !== "OPTIONAL_COMMENT";
    if (required && !hasProvidedValue(field.fieldType, value)) {
      errors.push(
        issue(`values.${field.fieldKey}.required`, `"${field.label}" is required.`, "error"),
      );
    }

    if (
      value &&
      (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") &&
      value.valueNumber != null &&
      !Number.isFinite(Number(value.valueNumber))
    ) {
      errors.push(
        issue(`values.${field.fieldKey}.number_invalid`, `"${field.label}" must be a number.`, "error"),
      );
    }

    if (field.fieldType === "SINGLE_SELECT" || field.fieldType === "MULTI_SELECT") {
      if (value && hasProvidedValue(field.fieldType, value)) {
        const selected = selectionValues(value);
        const allowed = new Set(field.allowedSelections);
        for (const sel of selected) {
          if (!allowed.has(sel)) {
            errors.push(
              issue(
                `values.${field.fieldKey}.selection_invalid`,
                `"${sel}" is not an allowed selection for "${field.label}".`,
                "error",
              ),
            );
          }
        }
        if (field.fieldType === "SINGLE_SELECT" && selected.length > 1) {
          errors.push(
            issue(
              `values.${field.fieldKey}.single_select_many`,
              `"${field.label}" allows only one selection.`,
              "error",
            ),
          );
        }
      }
    }

    const oos = isOutOfStandard(field, value);
    fieldOutOfStandard[field.fieldKey] = oos;
    if (oos) {
      outOfStandard = true;
      if (field.correctiveActionRequired) {
        correctiveActionRequired = true;
      }
    }
  }

  if (correctiveActionRequired && !input.correctiveActionText?.trim()) {
    errors.push(
      issue(
        "corrective_action_required",
        "Corrective action is required for out-of-standard results.",
        "error",
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    outOfStandard,
    correctiveActionRequired,
    fieldOutOfStandard,
  };
}
