import type { OperationalEvidenceFieldType } from "@prisma/client";

import {
  dropHiddenFieldValues,
  evaluateEvidenceRules,
  parseCatalogEvidenceRules,
} from "@/lib/canonical-logs/evidence-rules";

import { isEvidenceMediaFieldType } from "@/lib/canonical-logs/evidence-media";

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

/** "41", "41 °F", and "41°F" are the same temperature the correction form shows. */
function parseDisplayedNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = /^(-?\d+(?:\.\d+)?)(?:\s*[°º]?[A-Za-z%]+)?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function normalizeSubmittedValue(
  fieldType: OperationalEvidenceFieldType,
  value: EvidenceFieldValueInput | undefined,
): EvidenceFieldValueInput | undefined {
  if (!value) return value;
  if (fieldType === "NUMBER" || fieldType === "TEMPERATURE") {
    const parsed =
      value.valueNumber != null && Number.isFinite(Number(value.valueNumber))
        ? Number(value.valueNumber)
        : parseDisplayedNumber(value.valueText);
    if (parsed != null) {
      return { ...value, valueNumber: parsed, valueText: null };
    }
    return value;
  }
  if (fieldType === "YES_NO") {
    if (value.valueBoolean != null) return { ...value, valueText: null };
    const text = value.valueText?.trim().toUpperCase();
    if (text === "YES") return { ...value, valueBoolean: true, valueText: null };
    if (text === "NO") return { ...value, valueBoolean: false, valueText: null };
    return value;
  }
  if (fieldType === "COMPLIANCE") {
    const text = value.valueText?.trim().toUpperCase();
    if (text === "COMPLIANT" || text === "NON_COMPLIANT" || text === "NOT_APPLICABLE") {
      return { ...value, valueText: text, valueBoolean: null, valueNumber: null, valueSelections: [] };
    }
    return value;
  }
  if (fieldType === "ATTESTATION") {
    if (value.valueBoolean != null) return { ...value, valueText: null };
    const text = value.valueText?.trim().toUpperCase();
    if (text === "YES" || text === "TRUE" || text === "CONFIRMED") {
      return { ...value, valueBoolean: true, valueText: null };
    }
    return value;
  }
  return value;
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
      return value.valueBoolean != null;
    case "ATTESTATION":
      return value.valueBoolean === true;
    case "PASS_NEEDS_ATTENTION":
      return Boolean(value.valueText?.trim()) || value.valueBoolean != null;
    case "COMPLIANCE":
      return (
        value.valueText === "COMPLIANT" ||
        value.valueText === "NON_COMPLIANT" ||
        value.valueText === "NOT_APPLICABLE"
      );
    case "SINGLE_SELECT":
      return Boolean(value.valueText?.trim()) || (value.valueSelections?.length ?? 0) === 1;
    case "MULTI_SELECT":
      return (value.valueSelections?.length ?? 0) > 0;
    case "DATE":
      return Boolean(value.valueText?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(value.valueText.trim()));
    case "TIME":
      return Boolean(value.valueText?.trim() && /^\d{1,2}:\d{2}$/.test(value.valueText.trim()));
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

/**
 * Validate submitted field values against published template fields.
 * Exception / visibility / required state comes from the shared rule evaluator.
 */
export function validateEvidenceSubmission(input: {
  fields: readonly TemplateFieldSnapshot[];
  values: readonly EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  rules?: unknown;
  /** Field keys that have an accepted photo, file, or signature for this submission. */
  providedMediaFieldKeys?: readonly string[];
}): EvidenceSubmissionValidationResult {
  const errors: TemplateValidationIssue[] = [];
  const warnings: TemplateValidationIssue[] = [];
  const fieldTypeByKey = new Map(input.fields.map((field) => [field.fieldKey, field.fieldType]));
  const normalizedValues = input.values.map(
    (value) =>
      normalizeSubmittedValue(fieldTypeByKey.get(value.fieldKey) ?? "SHORT_TEXT", value) ?? value,
  );
  const knownKeys = new Set(input.fields.map((f) => f.fieldKey));
  for (const value of normalizedValues) {
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

  const evaluation = evaluateEvidenceRules({
    fields: input.fields,
    rules: parseCatalogEvidenceRules(input.rules),
    values: normalizedValues,
  });
  const visible = new Set(evaluation.visibleFieldKeys);
  const mediaKeys = new Set(input.providedMediaFieldKeys ?? []);
  const byKey = new Map(
    dropHiddenFieldValues(normalizedValues, evaluation.visibleFieldKeys).map((value) => [
      value.fieldKey,
      value,
    ]),
  );

  for (const field of input.fields) {
    if (!visible.has(field.fieldKey)) continue;
    const value = byKey.get(field.fieldKey);
    const required = evaluation.requiredFieldKeys.includes(field.fieldKey);
    if (isEvidenceMediaFieldType(field.fieldType)) {
      if (required && !mediaKeys.has(field.fieldKey)) {
        errors.push(
          issue(`values.${field.fieldKey}.required`, `"${field.label}" is required.`, "error"),
        );
      }
      continue;
    }
    if (
      field.fieldType === "COMPLIANCE" &&
      value?.valueText?.trim() &&
      !hasProvidedValue(field.fieldType, value)
    ) {
      errors.push(
        issue(
          `values.${field.fieldKey}.compliance_invalid`,
          `"${field.label}" must be Compliant, Non-Compliant, or N/A.`,
          "error",
        ),
      );
    }
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

    if (
      value &&
      field.fieldType === "DATE" &&
      value.valueText?.trim() &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value.valueText.trim())
    ) {
      errors.push(issue(`values.${field.fieldKey}.date_invalid`, `"${field.label}" must be a date.`, "error"));
    }
    if (
      value &&
      field.fieldType === "TIME" &&
      value.valueText?.trim() &&
      !/^\d{1,2}:\d{2}$/.test(value.valueText.trim())
    ) {
      errors.push(issue(`values.${field.fieldKey}.time_invalid`, `"${field.label}" must be a time.`, "error"));
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
  }

  if (evaluation.correctiveActionRequired && !input.correctiveActionText?.trim()) {
    const trigger = evaluation.triggeringFields[0]?.reason;
    errors.push(
      issue(
        "corrective_action_required",
        trigger
          ? `Corrective action is required: ${trigger}.`
          : "Corrective action is required for out-of-standard results.",
        "error",
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    outOfStandard: evaluation.outOfStandardFieldKeys.length > 0,
    correctiveActionRequired: evaluation.correctiveActionRequired,
    fieldOutOfStandard: evaluation.fieldOutOfStandard,
    needsReview: evaluation.needsReview,
    visibleFieldKeys: evaluation.visibleFieldKeys,
    triggeringFields: evaluation.triggeringFields,
    normalizedValues,
  };
}
