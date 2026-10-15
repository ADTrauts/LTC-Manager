/**
 * Constrained declarative exception / visibility rules for Catalog evidence.
 * Data only — never JavaScript, eval, or SQL.
 */

import type { OperationalEvidenceFieldType } from "@prisma/client";

import type { EvidenceFieldValueInput, TemplateFieldSnapshot } from "@/lib/operational-evidence/types";

import { slugCatalogToken } from "./catalog-authoring";

export const EVIDENCE_RULE_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "CONTAINS",
  "IS_TRUE",
  "IS_FALSE",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
  "OUT_OF_STANDARD",
] as const;

export type EvidenceRuleOperator = (typeof EVIDENCE_RULE_OPERATORS)[number];

export const EVIDENCE_RULE_ACTIONS = [
  "MARK_OUT_OF_STANDARD",
  "SHOW_FIELD",
  "REQUIRE_FIELD",
  "REQUIRE_CORRECTIVE_ACTION",
  "REQUIRE_COMMENT",
  "SET_NEEDS_REVIEW",
] as const;

export type EvidenceRuleActionKind = (typeof EVIDENCE_RULE_ACTIONS)[number];

export type CatalogEvidenceRuleAction = {
  kind: EvidenceRuleActionKind;
  targetFieldKey?: string | null;
};

export type CatalogEvidenceRule = {
  ruleKey: string;
  sourceFieldKey: string;
  operator: EvidenceRuleOperator;
  compareValue?: string | number | boolean | null;
  actions: CatalogEvidenceRuleAction[];
};

export type EvidenceRuleIssue = {
  code: string;
  message: string;
};

export type EvidenceRuleEvaluation = {
  visibleFieldKeys: string[];
  requiredFieldKeys: string[];
  outOfStandardFieldKeys: string[];
  fieldOutOfStandard: Record<string, boolean>;
  correctiveActionRequired: boolean;
  needsReview: boolean;
  triggeringFields: Array<{ fieldKey: string; label: string; reason: string }>;
};

const NUMERIC_OPS = new Set<EvidenceRuleOperator>([
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
]);

const BOOLEAN_OPS = new Set<EvidenceRuleOperator>(["IS_TRUE", "IS_FALSE"]);

function isOperator(value: unknown): value is EvidenceRuleOperator {
  return typeof value === "string" && (EVIDENCE_RULE_OPERATORS as readonly string[]).includes(value);
}

function isActionKind(value: unknown): value is EvidenceRuleActionKind {
  return typeof value === "string" && (EVIDENCE_RULE_ACTIONS as readonly string[]).includes(value);
}

export function operatorsForFieldType(fieldType: string): EvidenceRuleOperator[] {
  const base: EvidenceRuleOperator[] = ["EQUALS", "NOT_EQUALS", "IS_EMPTY", "IS_NOT_EMPTY", "OUT_OF_STANDARD"];
  if (fieldType === "NUMBER" || fieldType === "TEMPERATURE") {
    return [...base, "GREATER_THAN", "GREATER_THAN_OR_EQUAL", "LESS_THAN", "LESS_THAN_OR_EQUAL"];
  }
  if (fieldType === "YES_NO" || fieldType === "ATTESTATION") {
    return [...base, "IS_TRUE", "IS_FALSE"];
  }
  if (
    fieldType === "SHORT_TEXT" ||
    fieldType === "LONG_TEXT" ||
    fieldType === "OPTIONAL_COMMENT" ||
    fieldType === "SINGLE_SELECT" ||
    fieldType === "MULTI_SELECT"
  ) {
    return [...base, "CONTAINS"];
  }
  return base;
}

export function parseCatalogEvidenceRules(raw: unknown): CatalogEvidenceRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: CatalogEvidenceRule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    const sourceFieldKey = typeof obj.sourceFieldKey === "string" ? obj.sourceFieldKey.trim() : "";
    if (!sourceFieldKey || !isOperator(obj.operator)) continue;
    const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
    const actions: CatalogEvidenceRuleAction[] = [];
    for (const action of actionsRaw) {
      if (!action || typeof action !== "object") continue;
      const row = action as Record<string, unknown>;
      if (!isActionKind(row.kind)) continue;
      actions.push({
        kind: row.kind,
        targetFieldKey: typeof row.targetFieldKey === "string" ? row.targetFieldKey.trim() : null,
      });
    }
    if (actions.length === 0) continue;
    const ruleKey =
      typeof obj.ruleKey === "string" && obj.ruleKey.trim()
        ? slugCatalogToken(obj.ruleKey)
        : `rule_${rules.length + 1}`;
    rules.push({
      ruleKey,
      sourceFieldKey,
      operator: obj.operator,
      compareValue: obj.compareValue as CatalogEvidenceRule["compareValue"],
      actions,
    });
  }
  return rules;
}

export function resolveCatalogRuleKeys(rules: readonly CatalogEvidenceRule[]): string[] {
  const used = new Set<string>();
  return rules.map((rule, index) => {
    const base = slugCatalogToken(rule.ruleKey || `rule_${index + 1}`);
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

function fieldByKey(fields: readonly TemplateFieldSnapshot[]) {
  return new Map(fields.map((field) => [field.fieldKey, field]));
}

export function validateCatalogEvidenceRules(input: {
  fields: Array<{ fieldKey: string; fieldType: string; allowedSelections?: string[] }>;
  rules: readonly CatalogEvidenceRule[];
}): { valid: boolean; errors: EvidenceRuleIssue[] } {
  const errors: EvidenceRuleIssue[] = [];
  const fields = new Map(input.fields.map((field) => [field.fieldKey, field]));
  const keys = resolveCatalogRuleKeys(input.rules);
  const seen = new Set<string>();

  input.rules.forEach((rule, index) => {
    const prefix = `rules[${index}]`;
    const key = keys[index]!;
    if (seen.has(key)) {
      errors.push({ code: `${prefix}.rule_key_duplicate`, message: `Duplicate rule key "${key}".` });
    }
    seen.add(key);
    const source = fields.get(rule.sourceFieldKey);
    if (!source) {
      errors.push({
        code: `${prefix}.source_missing`,
        message: `Rule references missing field "${rule.sourceFieldKey}".`,
      });
      return;
    }
    if (!operatorsForFieldType(source.fieldType).includes(rule.operator)) {
      errors.push({
        code: `${prefix}.operator_invalid`,
        message: `${rule.operator} is not valid for ${source.fieldType}.`,
      });
    }
    if (
      (rule.operator === "EQUALS" ||
        rule.operator === "NOT_EQUALS" ||
        rule.operator === "CONTAINS" ||
        NUMERIC_OPS.has(rule.operator)) &&
      (rule.compareValue == null || String(rule.compareValue).trim() === "")
    ) {
      errors.push({
        code: `${prefix}.compare_required`,
        message: "This condition needs a comparison value.",
      });
    }
    if (NUMERIC_OPS.has(rule.operator) && rule.compareValue != null && !Number.isFinite(Number(rule.compareValue))) {
      errors.push({
        code: `${prefix}.compare_number`,
        message: "Numeric conditions need a number.",
      });
    }
    if (
      (source.fieldType === "SINGLE_SELECT" || source.fieldType === "MULTI_SELECT") &&
      (rule.operator === "EQUALS" || rule.operator === "NOT_EQUALS") &&
      rule.compareValue != null &&
      !(source.allowedSelections ?? []).includes(String(rule.compareValue))
    ) {
      errors.push({
        code: `${prefix}.compare_choice`,
        message: `"${String(rule.compareValue)}" is not an allowed choice.`,
      });
    }
    for (const [actionIndex, action] of rule.actions.entries()) {
      const needsTarget =
        action.kind === "SHOW_FIELD" ||
        action.kind === "REQUIRE_FIELD" ||
        (action.kind === "REQUIRE_COMMENT" && Boolean(action.targetFieldKey));
      if (needsTarget) {
        const targetKey = action.targetFieldKey?.trim() || "";
        if (!targetKey || !fields.has(targetKey)) {
          errors.push({
            code: `${prefix}.actions[${actionIndex}].target_missing`,
            message: "This action points at a missing field.",
          });
        } else if (targetKey === rule.sourceFieldKey && action.kind === "SHOW_FIELD") {
          errors.push({
            code: `${prefix}.actions[${actionIndex}].self_show`,
            message: "A field cannot show itself.",
          });
        }
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

function answerNumber(value: EvidenceFieldValueInput | undefined): number | null {
  if (value?.valueNumber == null || !Number.isFinite(Number(value.valueNumber))) return null;
  return Number(value.valueNumber);
}

function answerText(value: EvidenceFieldValueInput | undefined): string {
  return value?.valueText?.trim() ?? "";
}

function answerBoolean(value: EvidenceFieldValueInput | undefined): boolean | null {
  if (value?.valueBoolean != null) return value.valueBoolean;
  const text = answerText(value).toUpperCase();
  if (text === "YES" || text === "TRUE") return true;
  if (text === "NO" || text === "FALSE") return false;
  return null;
}

function answerSelections(value: EvidenceFieldValueInput | undefined): string[] {
  if (value?.valueSelections && value.valueSelections.length > 0) return value.valueSelections;
  const text = answerText(value);
  return text ? [text] : [];
}

function isEmptyValue(fieldType: string, value: EvidenceFieldValueInput | undefined): boolean {
  if (!value) return true;
  if (fieldType === "NUMBER" || fieldType === "TEMPERATURE") return answerNumber(value) == null;
  if (fieldType === "YES_NO" || fieldType === "ATTESTATION") return answerBoolean(value) == null;
  if (fieldType === "MULTI_SELECT") return answerSelections(value).length === 0;
  return !answerText(value) && answerSelections(value).length === 0 && answerNumber(value) == null;
}

export function implicitFieldOutOfStandard(
  field: Pick<
    TemplateFieldSnapshot,
    | "fieldType"
    | "minNumber"
    | "maxNumber"
    | "correctiveActionTrigger"
    | "fieldKey"
  >,
  value: EvidenceFieldValueInput | undefined,
): boolean {
  if (field.fieldType === "COMPLIANCE") {
    return answerText(value).toUpperCase() === "NON_COMPLIANT";
  }
  if (!field.correctiveActionTrigger || !value) return false;
  if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
    const n = answerNumber(value);
    if (n == null) return false;
    if (field.minNumber != null && n < field.minNumber) return true;
    if (field.maxNumber != null && n > field.maxNumber) return true;
    return false;
  }
  if (field.fieldType === "PASS_NEEDS_ATTENTION") {
    const text = answerText(value).toUpperCase();
    if (text === "NEEDS_ATTENTION" || text === "FAIL" || text === "NEEDS ATTENTION") return true;
    return value.valueBoolean === false;
  }
  if (field.fieldType === "YES_NO") {
    return answerBoolean(value) === false;
  }
  return false;
}

function implicitReason(field: TemplateFieldSnapshot, value: EvidenceFieldValueInput | undefined): string {
  if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
    const n = answerNumber(value);
    const unit = field.unitLabel?.trim() ?? "";
    const expected =
      field.minNumber != null && field.maxNumber != null
        ? `${field.minNumber}${unit}–${field.maxNumber}${unit}`
        : field.minNumber != null
          ? `≥ ${field.minNumber}${unit}`
          : field.maxNumber != null
            ? `≤ ${field.maxNumber}${unit}`
            : "the expected range";
    return `${field.label} is ${n ?? "—"}${unit ? ` ${unit}` : ""} · expected ${expected}`;
  }
  if (field.fieldType === "COMPLIANCE") return `${field.label} is Non-Compliant`;
  if (field.fieldType === "YES_NO") return `${field.label} is No`;
  if (field.fieldType === "PASS_NEEDS_ATTENTION") return `${field.label} needs attention`;
  return `${field.label} is out of standard`;
}

function compareMet(
  field: TemplateFieldSnapshot,
  operator: EvidenceRuleOperator,
  compareValue: CatalogEvidenceRule["compareValue"],
  value: EvidenceFieldValueInput | undefined,
  implicitOos: boolean,
): boolean {
  switch (operator) {
    case "IS_EMPTY":
      return isEmptyValue(field.fieldType, value);
    case "IS_NOT_EMPTY":
      return !isEmptyValue(field.fieldType, value);
    case "IS_TRUE":
      return answerBoolean(value) === true;
    case "IS_FALSE":
      return answerBoolean(value) === false;
    case "OUT_OF_STANDARD":
      return implicitOos;
    case "CONTAINS": {
      const needle = String(compareValue ?? "").trim().toLowerCase();
      if (!needle) return false;
      if (field.fieldType === "MULTI_SELECT") {
        return answerSelections(value).some((item) => item.toLowerCase().includes(needle));
      }
      return answerText(value).toLowerCase().includes(needle);
    }
    case "EQUALS": {
      if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
        const n = answerNumber(value);
        return n != null && n === Number(compareValue);
      }
      if (field.fieldType === "YES_NO" || field.fieldType === "ATTESTATION") {
        const bool = answerBoolean(value);
        const expected =
          compareValue === true ||
          String(compareValue).toUpperCase() === "YES" ||
          String(compareValue).toUpperCase() === "TRUE";
        return bool === expected;
      }
      if (field.fieldType === "MULTI_SELECT") {
        return answerSelections(value).includes(String(compareValue ?? ""));
      }
      return answerText(value) === String(compareValue ?? "");
    }
    case "NOT_EQUALS":
      return !compareMet(field, "EQUALS", compareValue, value, implicitOos);
    case "GREATER_THAN":
    case "GREATER_THAN_OR_EQUAL":
    case "LESS_THAN":
    case "LESS_THAN_OR_EQUAL": {
      const n = answerNumber(value);
      const cmp = Number(compareValue);
      if (n == null || !Number.isFinite(cmp)) return false;
      if (operator === "GREATER_THAN") return n > cmp;
      if (operator === "GREATER_THAN_OR_EQUAL") return n >= cmp;
      if (operator === "LESS_THAN") return n < cmp;
      return n <= cmp;
    }
    default:
      return false;
  }
}

export function evaluateEvidenceRules(input: {
  fields: readonly TemplateFieldSnapshot[];
  rules?: readonly CatalogEvidenceRule[] | unknown;
  values: readonly EvidenceFieldValueInput[];
}): EvidenceRuleEvaluation {
  const fields = [...input.fields];
  const rules = Array.isArray(input.rules)
    ? input.rules[0] && typeof input.rules[0] === "object" && "sourceFieldKey" in (input.rules[0] as object)
      ? (input.rules as CatalogEvidenceRule[])
      : parseCatalogEvidenceRules(input.rules)
    : parseCatalogEvidenceRules(input.rules);
  const byKey = new Map(input.values.map((value) => [value.fieldKey, value]));
  const lookup = fieldByKey(fields);

  const implicitOos: Record<string, boolean> = {};
  for (const field of fields) {
    implicitOos[field.fieldKey] = implicitFieldOutOfStandard(field, byKey.get(field.fieldKey));
  }

  const active = rules.filter((rule) => {
    const field = lookup.get(rule.sourceFieldKey);
    if (!field) return false;
    return compareMet(
      field,
      rule.operator,
      rule.compareValue,
      byKey.get(rule.sourceFieldKey),
      implicitOos[rule.sourceFieldKey] === true,
    );
  });

  const showTargets = new Set<string>();
  const shown = new Set<string>();
  for (const rule of rules) {
    for (const action of rule.actions) {
      if (action.kind === "SHOW_FIELD" && action.targetFieldKey) {
        showTargets.add(action.targetFieldKey);
      }
    }
  }
  for (const rule of active) {
    for (const action of rule.actions) {
      if (action.kind === "SHOW_FIELD" && action.targetFieldKey) {
        shown.add(action.targetFieldKey);
      }
    }
  }

  const visibleFieldKeys = fields
    .map((field) => field.fieldKey)
    .filter((key) => !showTargets.has(key) || shown.has(key));
  const visible = new Set(visibleFieldKeys);

  const requiredFieldKeys = new Set<string>();
  for (const field of fields) {
    if (!visible.has(field.fieldKey)) continue;
    if (field.isRequired && field.fieldType !== "OPTIONAL_COMMENT") {
      requiredFieldKeys.add(field.fieldKey);
    }
  }
  for (const rule of active) {
    for (const action of rule.actions) {
      if (
        (action.kind === "REQUIRE_FIELD" || action.kind === "REQUIRE_COMMENT") &&
        action.targetFieldKey &&
        visible.has(action.targetFieldKey)
      ) {
        requiredFieldKeys.add(action.targetFieldKey);
      }
    }
  }

  const fieldOutOfStandard: Record<string, boolean> = {};
  for (const field of fields) {
    fieldOutOfStandard[field.fieldKey] = visible.has(field.fieldKey) && implicitOos[field.fieldKey] === true;
  }
  for (const rule of active) {
    if (!visible.has(rule.sourceFieldKey)) continue;
    if (rule.actions.some((action) => action.kind === "MARK_OUT_OF_STANDARD")) {
      fieldOutOfStandard[rule.sourceFieldKey] = true;
    }
  }

  const outOfStandardFieldKeys = Object.entries(fieldOutOfStandard)
    .filter(([, oos]) => oos)
    .map(([key]) => key);

  let correctiveActionRequired = fields.some(
    (field) =>
      visible.has(field.fieldKey) &&
      fieldOutOfStandard[field.fieldKey] &&
      field.correctiveActionTrigger &&
      field.correctiveActionRequired,
  );
  let needsReview = false;
  for (const rule of active) {
    for (const action of rule.actions) {
      if (action.kind === "REQUIRE_CORRECTIVE_ACTION") correctiveActionRequired = true;
      if (action.kind === "REQUIRE_COMMENT" && !action.targetFieldKey) correctiveActionRequired = true;
      if (action.kind === "SET_NEEDS_REVIEW") needsReview = true;
    }
  }
  if (outOfStandardFieldKeys.length === 0) {
    correctiveActionRequired = false;
    needsReview = false;
  }

  const triggeringFields = outOfStandardFieldKeys.map((fieldKey) => {
    const field = lookup.get(fieldKey)!;
    const authored = active.find(
      (rule) =>
        rule.sourceFieldKey === fieldKey &&
        rule.actions.some((action) => action.kind === "MARK_OUT_OF_STANDARD"),
    );
    return {
      fieldKey,
      label: field.label,
      reason: authored
        ? `${field.label} matched a configured exception`
        : implicitReason(field, byKey.get(fieldKey)),
    };
  });

  return {
    visibleFieldKeys,
    requiredFieldKeys: [...requiredFieldKeys],
    outOfStandardFieldKeys,
    fieldOutOfStandard,
    correctiveActionRequired,
    needsReview,
    triggeringFields,
  };
}

export function dropHiddenFieldValues(
  values: readonly EvidenceFieldValueInput[],
  visibleFieldKeys: readonly string[],
): EvidenceFieldValueInput[] {
  const visible = new Set(visibleFieldKeys);
  return values.filter((value) => visible.has(value.fieldKey));
}

export function recordStatusFromException(input: {
  outOfStandard: boolean;
  correctiveActionText?: string | null;
  allowNeedsReview?: boolean;
}): "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION" | "NEEDS_REVIEW" {
  if (!input.outOfStandard) return "COMPLETED";
  if (input.correctiveActionText?.trim()) return "COMPLETED_WITH_CORRECTIVE_ACTION";
  return "NEEDS_REVIEW";
}

export function evidenceCanCreateIssue(record: {
  assetId?: string | null;
  unitId?: string | null;
  outOfStandard?: boolean;
}): boolean {
  return Boolean(record.assetId && record.unitId && record.outOfStandard);
}

export function formAnswersToValues(
  fields: ReadonlyArray<{ fieldKey: string; fieldType: string }>,
  rawByKey: Record<string, string>,
  selectionsByKey: Record<string, string[]> = {},
): EvidenceFieldValueInput[] {
  return fields.map((field) => {
    const raw = rawByKey[field.fieldKey] ?? "";
    if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
      return { fieldKey: field.fieldKey, valueNumber: raw === "" ? null : Number(raw) };
    }
    if (field.fieldType === "YES_NO") {
      return {
        fieldKey: field.fieldKey,
        valueBoolean: raw === "YES" ? true : raw === "NO" ? false : null,
      };
    }
    if (field.fieldType === "ATTESTATION") {
      return { fieldKey: field.fieldKey, valueBoolean: raw === "YES" ? true : null };
    }
    if (field.fieldType === "MULTI_SELECT") {
      return { fieldKey: field.fieldKey, valueSelections: selectionsByKey[field.fieldKey] ?? [] };
    }
    return { fieldKey: field.fieldKey, valueText: raw || null };
  });
}
