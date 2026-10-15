/**
 * Harbor / Template Studio authoring helpers for CatalogLogDefinition.
 * Field identity, publish safety, and Marketplace recommendation parsing.
 * Does not introduce a second form-definition model.
 */

import type {
  CatalogLogPurposeType,
  OperationalEvidenceFieldType,
  OperationalTemplateScheduleKind,
} from "@prisma/client";

import { parseLocalTime } from "@/lib/operational-cycles/cycle-windows";

import {
  parseCatalogEvidenceRules,
  resolveCatalogRuleKeys,
  validateCatalogEvidenceRules,
  type CatalogEvidenceRule,
} from "./evidence-rules";
import {
  parseInspectionSections,
  type InspectionSectionDefinition,
} from "./inspection-score";
import {
  calculationCycleErrors,
  parseCalculations,
  parseRepeatingGroups,
  validateRepeatingGroupsForPublish,
} from "./template-structure";
import { parseCatalogSuggestions, type CatalogSuggestions } from "./suggestions";

export function slugCatalogToken(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.slice(0, 64) || "untitled";
}

export const CANONICAL_EVIDENCE_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "TEMPERATURE",
  "YES_NO",
  "PASS_NEEDS_ATTENTION",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
  "TIME",
  "ATTESTATION",
  "OPTIONAL_COMMENT",
  "PHOTO",
  "FILE",
  "SIGNATURE",
  "COMPLIANCE",
] as const satisfies readonly OperationalEvidenceFieldType[];

export const NUMERIC_EVIDENCE_FIELD_TYPES = ["NUMBER", "TEMPERATURE"] as const;
export const SELECT_EVIDENCE_FIELD_TYPES = ["SINGLE_SELECT", "MULTI_SELECT"] as const;
export const EXCEPTION_EVIDENCE_FIELD_TYPES = [
  "NUMBER",
  "TEMPERATURE",
  "YES_NO",
  "PASS_NEEDS_ATTENTION",
  "COMPLIANCE",
] as const;

export type CatalogAuthoringField = {
  fieldKey?: string | null;
  label: string;
  fieldType: OperationalEvidenceFieldType | string;
  isRequired?: boolean;
  helpText?: string | null;
  unitLabel?: string | null;
  minNumber?: number | null;
  maxNumber?: number | null;
  allowedSelections?: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired?: boolean;
  sectionKey?: string | null;
  scoreWeight?: number | null;
  critical?: boolean;
  creditValues?: string[];
};

export type CatalogRecommendedFixedWindow = {
  label?: string;
  startLocal: string;
  endLocal: string;
};

export type CatalogAuthoringIssue = {
  code: string;
  message: string;
};

export function isNumericEvidenceFieldType(fieldType: string): boolean {
  return fieldType === "NUMBER" || fieldType === "TEMPERATURE";
}

export function isSelectEvidenceFieldType(fieldType: string): boolean {
  return fieldType === "SINGLE_SELECT" || fieldType === "MULTI_SELECT";
}

export function isExceptionEvidenceFieldType(fieldType: string): boolean {
  return (
    fieldType === "NUMBER" ||
    fieldType === "TEMPERATURE" ||
    fieldType === "YES_NO" ||
    fieldType === "PASS_NEEDS_ATTENTION" ||
    fieldType === "COMPLIANCE"
  );
}

/**
 * Stable field keys: a provided key is kept. Label changes do not regenerate it.
 * Only unlabeled / new fields receive a key derived from the current label.
 */
export function resolveCatalogFieldKeys(
  fields: readonly Pick<CatalogAuthoringField, "fieldKey" | "label">[],
): string[] {
  const used = new Set<string>();
  return fields.map((field, index) => {
    const provided = field.fieldKey?.trim() ? slugCatalogToken(field.fieldKey) : "";
    const base = provided || slugCatalogToken(field.label) || `field_${index + 1}`;
    let key = base;
    let n = 2;
    while (used.has(key)) {
      key = `${base}_${n}`;
      n += 1;
    }
    used.add(key);
    return key;
  });
}

export function parseRecommendedFixedWindows(raw: unknown): CatalogRecommendedFixedWindow[] {
  if (!Array.isArray(raw)) return [];
  const windows: CatalogRecommendedFixedWindow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    const startLocal = typeof obj.startLocal === "string" ? obj.startLocal.trim() : "";
    const endLocal = typeof obj.endLocal === "string" ? obj.endLocal.trim() : "";
    if (!startLocal && !endLocal) continue;
    windows.push({
      label: typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : undefined,
      startLocal,
      endLocal,
    });
  }
  return windows;
}

export function serializeRecommendedFixedWindows(
  windows: readonly CatalogRecommendedFixedWindow[],
): CatalogRecommendedFixedWindow[] {
  return windows
    .map((window) => ({
      label: window.label?.trim() || undefined,
      startLocal: window.startLocal.trim(),
      endLocal: window.endLocal.trim(),
    }))
    .filter((window) => window.startLocal.length > 0 || window.endLocal.length > 0);
}

export function tokenizeAuthoringList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeCatalogSuggestionsInput(input: {
  assetTypes?: string[] | string | null;
  spaceTypes?: string[] | string | null;
  departmentKeys?: string[] | string | null;
  keywords?: string[] | string | null;
}): CatalogSuggestions {
  const asList = (value: string[] | string | null | undefined): string[] => {
    if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string") return tokenizeAuthoringList(value);
    return [];
  };
  return parseCatalogSuggestions({
    assetTypes: asList(input.assetTypes),
    spaceTypes: asList(input.spaceTypes),
    departmentKeys: asList(input.departmentKeys),
    keywords: asList(input.keywords),
  });
}

function issue(code: string, message: string): CatalogAuthoringIssue {
  return { code, message };
}

export function validateCatalogFieldForPublish(
  field: CatalogAuthoringField,
  index: number,
): CatalogAuthoringIssue[] {
  const errors: CatalogAuthoringIssue[] = [];
  const prefix = `fields[${index}]`;
  if (!field.label.trim()) {
    errors.push(issue(`${prefix}.label_required`, "Each field needs a label before publish."));
  }
  if (
    !CANONICAL_EVIDENCE_FIELD_TYPES.includes(field.fieldType as (typeof CANONICAL_EVIDENCE_FIELD_TYPES)[number])
  ) {
    errors.push(issue(`${prefix}.field_type_invalid`, `"${field.fieldType}" is not a supported field type.`));
  }
  if (isNumericEvidenceFieldType(field.fieldType)) {
    if (field.minNumber != null && !Number.isFinite(field.minNumber)) {
      errors.push(issue(`${prefix}.min_invalid`, "Minimum must be a number."));
    }
    if (field.maxNumber != null && !Number.isFinite(field.maxNumber)) {
      errors.push(issue(`${prefix}.max_invalid`, "Maximum must be a number."));
    }
    if (
      field.minNumber != null &&
      field.maxNumber != null &&
      Number.isFinite(field.minNumber) &&
      Number.isFinite(field.maxNumber) &&
      field.minNumber > field.maxNumber
    ) {
      errors.push(issue(`${prefix}.min_max_order`, "Minimum must be less than or equal to maximum."));
    }
  }
  if (field.scoreWeight != null && (!Number.isFinite(field.scoreWeight) || field.scoreWeight <= 0)) {
    errors.push(issue(`${prefix}.score_weight_invalid`, "Score weight must be a positive number."));
  }
  if (isSelectEvidenceFieldType(field.fieldType)) {
    const choices = (field.allowedSelections ?? []).map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) {
      errors.push(
        issue(`${prefix}.selections_required`, "Select fields need at least two choices before publish."),
      );
    }
  }
  if (field.fieldType === "OPTIONAL_COMMENT" && field.isRequired === true) {
    errors.push(
      issue(`${prefix}.optional_comment_required`, "Comment fields stay optional until a later rule engine."),
    );
  }
  if (field.correctiveActionRequired && !field.correctiveActionTrigger && isExceptionEvidenceFieldType(field.fieldType)) {
    errors.push(
      issue(
        `${prefix}.corrective_required_without_trigger`,
        "Require a corrective-action note only when the field can be marked out of standard.",
      ),
    );
  }
  return errors;
}

export function validateRecommendedWindowsForPublish(
  windows: readonly CatalogRecommendedFixedWindow[],
): CatalogAuthoringIssue[] {
  const errors: CatalogAuthoringIssue[] = [];
  windows.forEach((window, index) => {
    const start = parseLocalTime(window.startLocal);
    const end = parseLocalTime(window.endLocal);
    const prefix = `recommendedFixedWindows[${index}]`;
    if (window.startLocal && !start) {
      errors.push(issue(`${prefix}.window_start_invalid`, "Window start must be HH:mm."));
    }
    if (window.endLocal && !end) {
      errors.push(issue(`${prefix}.window_end_invalid`, "Window end must be HH:mm."));
    }
    if (start && end) {
      const startMin = start.hours * 60 + start.minutes;
      const endMin = end.hours * 60 + end.minutes;
      if (endMin <= startMin) {
        errors.push(issue(`${prefix}.window_order`, "Window end must be after window start."));
      }
    }
  });
  return errors;
}

export function validateCatalogForPublish(input: {
  name: string;
  purposeType: CatalogLogPurposeType | string;
  fields: readonly CatalogAuthoringField[];
  recommendedScheduleKind?: OperationalTemplateScheduleKind | null;
  recommendedFixedWindows?: readonly CatalogRecommendedFixedWindow[];
  rules?: readonly CatalogEvidenceRule[] | unknown;
  passingScore?: number | null;
  sections?: readonly InspectionSectionDefinition[] | unknown;
  repeatingGroups?: unknown;
  calculations?: unknown;
}): { valid: boolean; errors: CatalogAuthoringIssue[] } {
  const errors: CatalogAuthoringIssue[] = [];
  if (!input.name.trim()) {
    errors.push(issue("name_required", "Name is required."));
  }
  if (!["LOG", "CHECKLIST", "INSPECTION", "PROCEDURE"].includes(input.purposeType)) {
    errors.push(issue("purpose_type_invalid", "Purpose is required."));
  }
  const labeled = input.fields.filter((field) => field.label.trim().length > 0);
  const repeatingGroups = parseRepeatingGroups(input.repeatingGroups ?? []);
  if (labeled.length === 0 && repeatingGroups.length === 0) {
    errors.push(issue("fields_required", "Publish requires at least one field."));
  }
  const keys = resolveCatalogFieldKeys(labeled);
  const seen = new Set<string>();
  labeled.forEach((field, index) => {
    errors.push(...validateCatalogFieldForPublish(field, index));
    const key = keys[index]!;
    if (seen.has(key)) {
      errors.push(issue(`fields[${index}].field_key_duplicate`, `Duplicate field key "${key}".`));
    }
    seen.add(key);
  });
  errors.push(...validateRecommendedWindowsForPublish(input.recommendedFixedWindows ?? []));
  const rules = Array.isArray(input.rules)
    ? parseCatalogEvidenceRules(input.rules)
    : parseCatalogEvidenceRules(input.rules ?? []);
  const ruleCheck = validateCatalogEvidenceRules({
    fields: labeled.map((field, index) => ({
      fieldKey: keys[index]!,
      fieldType: field.fieldType,
      allowedSelections: field.allowedSelections,
    })),
    rules,
  });
  for (const error of ruleCheck.errors) {
    errors.push(issue(error.code, error.message));
  }
  if (
    input.passingScore != null &&
    (!Number.isFinite(input.passingScore) || input.passingScore < 0 || input.passingScore > 100)
  ) {
    errors.push(issue("passing_score_invalid", "Passing score must be a percentage from 0 to 100."));
  }
  const sections = parseInspectionSections(input.sections ?? []);
  const sectionKeys = new Set<string>();
  for (const section of sections) {
    if (sectionKeys.has(section.sectionKey)) {
      errors.push(issue("section_key_duplicate", `Duplicate section key "${section.sectionKey}".`));
    }
    sectionKeys.add(section.sectionKey);
  }
  if (input.purposeType === "INSPECTION" && sections.length > 0) {
    labeled.forEach((field, index) => {
      const sectionKey = field.sectionKey?.trim();
      if (sectionKey && !sectionKeys.has(sectionKey)) {
        errors.push(
          issue(
            `fields[${index}].section_unknown`,
            `"${field.label}" references section "${sectionKey}", which is not on this inspection.`,
          ),
        );
      }
    });
  }
  for (const error of validateRepeatingGroupsForPublish(repeatingGroups)) {
    errors.push(issue("repeating_group_invalid", error));
  }
  for (const error of calculationCycleErrors(parseCalculations(input.calculations ?? []))) {
    errors.push(issue("calculation_cycle", error));
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeCatalogRulesForPersist(
  rules: readonly CatalogEvidenceRule[] | unknown,
): CatalogEvidenceRule[] {
  const parsed = parseCatalogEvidenceRules(rules);
  const keys = resolveCatalogRuleKeys(parsed);
  return parsed.map((rule, index) => ({ ...rule, ruleKey: keys[index]! }));
}
