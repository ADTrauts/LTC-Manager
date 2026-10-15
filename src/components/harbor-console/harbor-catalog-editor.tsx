"use client";

import { useRef, useState } from "react";

import type { CatalogActionResult } from "@/app/console/(staff)/catalog/actions";
import { Drawer } from "@/components/drawer";
import {
  HarborCatalogLogPreview,
  type HarborCatalogPreviewModel,
} from "@/components/harbor-console/harbor-catalog-log-preview";
import {
  isExceptionEvidenceFieldType,
  isNumericEvidenceFieldType,
  isSelectEvidenceFieldType,
  slugCatalogToken,
  type CatalogRecommendedFixedWindow,
} from "@/lib/canonical-logs/catalog-authoring";
import { materializeReusableStructure } from "@/lib/canonical-logs/template-structure";
import {
  EVIDENCE_RULE_OPERATORS,
  operatorsForFieldType,
  parseCatalogEvidenceRules,
  validateCatalogEvidenceRules,
  type CatalogEvidenceRule,
  type EvidenceRuleActionKind,
  type EvidenceRuleOperator,
} from "@/lib/canonical-logs/evidence-rules";
import type { CatalogSuggestions } from "@/lib/canonical-logs/suggestions";
import type { HarborCatalogField } from "@/lib/harbor-console/catalog";

const FIELD_TYPES = [
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "TEMPERATURE", label: "Temperature" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "PASS_NEEDS_ATTENTION", label: "Pass / Needs attention" },
  { value: "SINGLE_SELECT", label: "Single select" },
  { value: "MULTI_SELECT", label: "Multi select" },
  { value: "DATE", label: "Date" },
  { value: "TIME", label: "Time" },
  { value: "ATTESTATION", label: "Attestation" },
  { value: "PHOTO", label: "Photo" },
  { value: "FILE", label: "File" },
  { value: "SIGNATURE", label: "Signature" },
  { value: "COMPLIANCE", label: "Compliant / Non-compliant / N/A" },
  { value: "OPTIONAL_COMMENT", label: "Comment" },
] as const;

const CATEGORIES = [
  { value: "TEMPERATURE", label: "Temperature" },
  { value: "SANITATION", label: "Sanitation" },
  { value: "CLEANING", label: "Cleaning" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "FOOD_SAFETY", label: "Food safety" },
  { value: "OPENING_CLOSING", label: "Opening / closing" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "OTHER", label: "Other" },
] as const;

const CADENCES = [
  { value: "ONCE_DAILY", label: "Once daily" },
  { value: "TWICE_DAILY", label: "Twice daily" },
  { value: "THREE_TIMES_DAILY", label: "Three times daily" },
  { value: "ONCE_PER_OPERATIONAL_CYCLE", label: "Each operational cycle" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "AD_HOC", label: "As needed" },
] as const;

const SCHEDULE_KINDS = [
  { value: "", label: "Use cadence default" },
  { value: "FIXED_DAILY_WINDOW", label: "Fixed daily windows" },
  { value: "OPERATIONAL_CYCLE", label: "Operational cycle" },
  { value: "ONCE_PER_OPERATIONAL_DATE", label: "Once per operational date" },
  { value: "AD_HOC", label: "As needed" },
] as const;

type EditorRule = {
  key: string;
  ruleKey: string;
  sourceFieldKey: string;
  operator: EvidenceRuleOperator;
  compareValue: string;
  markOutOfStandard: boolean;
  showFieldKey: string;
  requireFieldKey: string;
  requireCorrectiveAction: boolean;
  setNeedsReview: boolean;
};

type EditorField = {
  key: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  helpText: string;
  unitLabel: string;
  minNumber: string;
  maxNumber: string;
  allowedSelections: string;
  correctiveActionTrigger: boolean;
  correctiveActionRequired: boolean;
  sectionKey: string;
  scoreWeight: string;
  critical: boolean;
  creditValues: string;
};

function unusedFieldKey(label: string, existing: readonly string[]): string {
  const base = slugCatalogToken(label) || "field";
  if (!existing.includes(base)) return base;
  let n = 2;
  let key = `${base}_${n}`;
  while (existing.includes(key)) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
}

function toEditorField(field: HarborCatalogField, index: number): EditorField {
  return {
    key: field.id || `existing-${index}`,
    fieldKey: field.fieldKey,
    label: field.label,
    fieldType: field.fieldType,
    isRequired: field.fieldType === "OPTIONAL_COMMENT" ? false : field.isRequired,
    helpText: field.helpText ?? "",
    unitLabel: field.unitLabel ?? "",
    minNumber: field.minNumber == null ? "" : String(field.minNumber),
    maxNumber: field.maxNumber == null ? "" : String(field.maxNumber),
    allowedSelections: field.allowedSelections.join("\n"),
    correctiveActionTrigger: field.correctiveActionTrigger,
    correctiveActionRequired: field.correctiveActionRequired,
    sectionKey: field.sectionKey ?? "",
    scoreWeight: field.scoreWeight == null ? "" : String(field.scoreWeight),
    critical: field.critical,
    creditValues: field.creditValues.join(", "),
  };
}

function emptyRule(): EditorRule {
  return {
    key: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ruleKey: "",
    sourceFieldKey: "",
    operator: "EQUALS",
    compareValue: "",
    markOutOfStandard: false,
    showFieldKey: "",
    requireFieldKey: "",
    requireCorrectiveAction: false,
    setNeedsReview: false,
  };
}

function toEditorRule(rule: CatalogEvidenceRule, index: number): EditorRule {
  const kinds = new Set(rule.actions.map((action) => action.kind));
  return {
    key: rule.ruleKey || `existing-rule-${index}`,
    ruleKey: rule.ruleKey,
    sourceFieldKey: rule.sourceFieldKey,
    operator: rule.operator,
    compareValue: rule.compareValue == null ? "" : String(rule.compareValue),
    markOutOfStandard: kinds.has("MARK_OUT_OF_STANDARD"),
    showFieldKey: rule.actions.find((action) => action.kind === "SHOW_FIELD")?.targetFieldKey ?? "",
    requireFieldKey:
      rule.actions.find((action) => action.kind === "REQUIRE_FIELD" || action.kind === "REQUIRE_COMMENT")
        ?.targetFieldKey ?? "",
    requireCorrectiveAction: kinds.has("REQUIRE_CORRECTIVE_ACTION"),
    setNeedsReview: kinds.has("SET_NEEDS_REVIEW"),
  };
}

function serializeRules(rules: EditorRule[]): CatalogEvidenceRule[] {
  return rules
    .filter((rule) => rule.sourceFieldKey.trim())
    .map((rule, index) => {
      const actions: Array<{ kind: EvidenceRuleActionKind; targetFieldKey?: string | null }> = [];
      if (rule.markOutOfStandard) actions.push({ kind: "MARK_OUT_OF_STANDARD" });
      if (rule.showFieldKey) actions.push({ kind: "SHOW_FIELD", targetFieldKey: rule.showFieldKey });
      if (rule.requireFieldKey) actions.push({ kind: "REQUIRE_FIELD", targetFieldKey: rule.requireFieldKey });
      if (rule.requireCorrectiveAction) actions.push({ kind: "REQUIRE_CORRECTIVE_ACTION" });
      if (rule.setNeedsReview) actions.push({ kind: "SET_NEEDS_REVIEW" });
      return {
        ruleKey: rule.ruleKey || `rule_${index + 1}`,
        sourceFieldKey: rule.sourceFieldKey,
        operator: rule.operator,
        compareValue: rule.compareValue === "" ? null : rule.compareValue,
        actions,
      };
    })
    .filter((rule) => rule.actions.length > 0);
}

function emptyField(): EditorField {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fieldKey: "",
    label: "",
    fieldType: "SHORT_TEXT",
    isRequired: true,
    helpText: "",
    unitLabel: "",
    minNumber: "",
    maxNumber: "",
    allowedSelections: "",
    correctiveActionTrigger: false,
    correctiveActionRequired: false,
    sectionKey: "",
    scoreWeight: "",
    critical: false,
    creditValues: "",
  };
}

function labelFor(options: ReadonlyArray<{ value: string; label: string }>, value: string) {
  return options.find((item) => item.value === value)?.label ?? value;
}

function parseChoices(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function previewModelFromForm(
  form: HTMLFormElement,
  fields: EditorField[],
  rules: EditorRule[],
  groups: Array<{ groupKey: string; label: string; minRows: string; maxRows: string; columns: Array<{ columnKey: string; label: string; fieldType: string; unitLabel: string; minNumber: string; maxNumber: string; isRequired: boolean }> }> = [],
  calculations: Array<{ calculationKey: string; label: string; op: "AVERAGE" | "MIN" | "MAX" | "SUM" | "COUNT"; groupKey: string; columnKey: string; unitLabel: string }> = [],
): HarborCatalogPreviewModel {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? ""),
    purposeLabel: labelFor(
      [
        { value: "LOG", label: "Log" },
        { value: "CHECKLIST", label: "Checklist" },
        { value: "INSPECTION", label: "Inspection" },
        { value: "PROCEDURE", label: "Procedure" },
      ],
      String(data.get("purposeType") ?? "LOG"),
    ),
    categoryLabel: labelFor(CATEGORIES, String(data.get("category") ?? "OTHER")),
    cadenceLabel: labelFor(CADENCES, String(data.get("recommendedCadence") ?? "AD_HOC")),
    instructions: String(data.get("instructions") ?? ""),
    fields: fields.map((field) => ({
      key: field.fieldKey || field.key,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.fieldType === "OPTIONAL_COMMENT" ? false : field.isRequired,
      helpText: field.helpText,
      unitLabel: field.unitLabel,
      minNumber: field.minNumber,
      maxNumber: field.maxNumber,
      allowedSelections: parseChoices(field.allowedSelections),
      correctiveActionTrigger: field.correctiveActionTrigger,
      correctiveActionRequired: field.correctiveActionRequired,
    })),
    rules: serializeRules(rules),
    repeatingGroups: groups
      .filter((group) => group.groupKey.trim())
      .map((group, index) => ({
        groupKey: group.groupKey.trim(),
        label: group.label.trim() || group.groupKey.trim(),
        minRows: Number(group.minRows) || 0,
        maxRows: Number(group.maxRows) || 40,
        displaySequence: index + 1,
        columns: group.columns.map((column, columnIndex) => ({
          columnKey: column.columnKey,
          label: column.label || column.columnKey,
          fieldType: column.fieldType,
          isRequired: column.isRequired,
          displaySequence: columnIndex + 1,
          unitLabel: column.unitLabel || null,
          minNumber: column.minNumber === "" ? null : Number(column.minNumber),
          maxNumber: column.maxNumber === "" ? null : Number(column.maxNumber),
        })),
      })),
    calculations: calculations
      .filter((row) => row.calculationKey.trim())
      .map((row) => ({
        calculationKey: row.calculationKey.trim(),
        label: row.label.trim() || row.calculationKey,
        unitLabel: row.unitLabel || null,
        decimalPrecision: row.op === "COUNT" ? 0 : 1,
        expression: { op: row.op, groupKey: row.groupKey, columnKey: row.columnKey },
      })),
  };
}

function serializeFields(fields: EditorField[]) {
  return JSON.stringify(
    fields
      .filter((field) => field.label.trim().length > 0)
      .map((field) => ({
        fieldKey: field.fieldKey || undefined,
        label: field.label.trim(),
        fieldType: field.fieldType,
        isRequired: field.fieldType === "OPTIONAL_COMMENT" ? false : field.isRequired,
        helpText: field.helpText.trim() || null,
        unitLabel: isNumericEvidenceFieldType(field.fieldType) ? field.unitLabel.trim() || null : null,
        minNumber:
          isNumericEvidenceFieldType(field.fieldType) && field.minNumber !== ""
            ? Number(field.minNumber)
            : null,
        maxNumber:
          isNumericEvidenceFieldType(field.fieldType) && field.maxNumber !== ""
            ? Number(field.maxNumber)
            : null,
        allowedSelections: isSelectEvidenceFieldType(field.fieldType)
          ? parseChoices(field.allowedSelections)
          : [],
        correctiveActionTrigger: isExceptionEvidenceFieldType(field.fieldType)
          ? field.correctiveActionTrigger
          : false,
        correctiveActionRequired: isExceptionEvidenceFieldType(field.fieldType)
          ? field.correctiveActionRequired
          : false,
        sectionKey: field.sectionKey.trim() || null,
        scoreWeight: field.scoreWeight.trim() === "" ? null : Number(field.scoreWeight),
        critical: field.critical,
        creditValues: field.creditValues
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      })),
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm outline-none ring-[var(--brand-accent)] focus:ring-2";

export function HarborCatalogEditor({
  mode,
  stableKey,
  definitionId,
  initialName,
  initialDescription,
  initialInstructions,
  initialPurposeType,
  initialCategory,
  initialCadence,
  initialScheduleKind,
  initialDaypartLabels,
  initialFixedWindows,
  initialSuggestions,
  initialFields,
  initialRules,
  initialPassingScore,
  initialCriticalFailureForcesFailure,
  initialSections,
  initialGroups,
  initialCalculations,
  primaryAction,
  secondaryAction,
}: {
  mode: "create" | "draft";
  stableKey?: string;
  definitionId?: string;
  initialName?: string;
  initialDescription?: string;
  initialInstructions?: string;
  initialPurposeType?: string;
  initialCategory?: string;
  initialCadence?: string | null;
  initialScheduleKind?: string | null;
  initialDaypartLabels?: string[];
  initialFixedWindows?: CatalogRecommendedFixedWindow[];
  initialSuggestions?: CatalogSuggestions;
  initialFields?: HarborCatalogField[];
  initialRules?: CatalogEvidenceRule[];
  initialPassingScore?: number | null;
  initialCriticalFailureForcesFailure?: boolean;
  initialSections?: Array<{ sectionKey: string; label: string; description?: string | null; displaySequence: number }>;
  initialGroups?: Array<{
    groupKey: string;
    label: string;
    minRows?: number;
    maxRows?: number;
    columns: Array<{
      columnKey: string;
      label: string;
      fieldType: string;
      isRequired?: boolean;
      unitLabel?: string | null;
      minNumber?: number | null;
      maxNumber?: number | null;
    }>;
  }>;
  initialCalculations?: Array<{
    calculationKey: string;
    label: string;
    unitLabel?: string | null;
    expression: { op: string; groupKey?: string; columnKey?: string };
  }>;
  primaryAction: (formData: FormData) => Promise<CatalogActionResult | void>;
  secondaryAction?: (formData: FormData) => Promise<CatalogActionResult | void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<EditorField[]>(
    initialFields && initialFields.length > 0 ? initialFields.map(toEditorField) : [emptyField()],
  );
  const [rules, setRules] = useState<EditorRule[]>(
    initialRules && initialRules.length > 0 ? initialRules.map(toEditorRule) : [],
  );
  const [windows, setWindows] = useState<CatalogRecommendedFixedWindow[]>(
    initialFixedWindows && initialFixedWindows.length > 0
      ? initialFixedWindows
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"primary" | "secondary" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<HarborCatalogPreviewModel | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [purposeType, setPurposeType] = useState(initialPurposeType ?? "LOG");
  const [passingScore, setPassingScore] = useState(
    initialPassingScore == null ? "" : String(initialPassingScore),
  );
  const [criticalFailureForcesFailure, setCriticalFailureForcesFailure] = useState(
    initialCriticalFailureForcesFailure === true,
  );
  const [sections, setSections] = useState(
    initialSections && initialSections.length > 0
      ? initialSections.map((section) => ({
          sectionKey: section.sectionKey,
          label: section.label,
          description: section.description ?? "",
        }))
      : [],
  );
  const [groups, setGroups] = useState<
    Array<{
      groupKey: string;
      label: string;
      minRows: string;
      maxRows: string;
      columns: Array<{ columnKey: string; label: string; fieldType: string; unitLabel: string; minNumber: string; maxNumber: string; isRequired: boolean }>;
    }>
  >(
    (initialGroups ?? []).map((group) => ({
      groupKey: group.groupKey,
      label: group.label,
      minRows: String(group.minRows ?? 1),
      maxRows: String(group.maxRows ?? 40),
      columns: group.columns.map((column) => ({
        columnKey: column.columnKey,
        label: column.label,
        fieldType: column.fieldType,
        unitLabel: column.unitLabel ?? "",
        minNumber: column.minNumber == null ? "" : String(column.minNumber),
        maxNumber: column.maxNumber == null ? "" : String(column.maxNumber),
        isRequired: column.isRequired === true,
      })),
    })),
  );
  const [calculations, setCalculations] = useState<
    Array<{ calculationKey: string; label: string; op: "AVERAGE" | "MIN" | "MAX" | "SUM" | "COUNT"; groupKey: string; columnKey: string; unitLabel: string }>
  >(
    (initialCalculations ?? []).flatMap((row) => {
      const op = row.expression.op;
      if (op !== "AVERAGE" && op !== "MIN" && op !== "MAX" && op !== "SUM" && op !== "COUNT") return [];
      return [{
        calculationKey: row.calculationKey,
        label: row.label,
        op,
        groupKey: row.expression.groupKey ?? "",
        columnKey: row.expression.columnKey ?? "",
        unitLabel: row.unitLabel ?? "",
      }];
    }),
  );

  function updateField(index: number, patch: Partial<EditorField>) {
    setFields((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((current) => {
      const next = index + direction;
      if (next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [row] = copy.splice(index, 1);
      copy.splice(next, 0, row!);
      return copy;
    });
  }

  async function run(
    action: (formData: FormData) => Promise<CatalogActionResult | void>,
    formData: FormData,
    which: "primary" | "secondary",
  ) {
    setPending(which);
    setError(null);
    formData.set("fieldsJson", serializeFields(fields));
    formData.set("rulesJson", JSON.stringify(serializeRules(rules)));
    formData.set("passingScore", passingScore);
    formData.set("criticalFailureForcesFailure", criticalFailureForcesFailure ? "true" : "false");
    formData.set(
      "sectionsJson",
      JSON.stringify(
        sections
          .filter((section) => section.sectionKey.trim() && section.label.trim())
          .map((section, index) => ({
            sectionKey: section.sectionKey.trim(),
            label: section.label.trim(),
            description: section.description.trim() || null,
            displaySequence: index + 1,
          })),
      ),
    );
    formData.set(
      "groupsJson",
      JSON.stringify(
        groups
          .filter((group) => group.groupKey.trim() && group.label.trim())
          .map((group, index) => ({
            groupKey: group.groupKey.trim(),
            label: group.label.trim(),
            minRows: Number(group.minRows) || 0,
            maxRows: Number(group.maxRows) || 40,
            displaySequence: index + 1,
            columns: group.columns
              .filter((column) => column.columnKey.trim())
              .map((column, columnIndex) => ({
                columnKey: column.columnKey.trim(),
                label: column.label.trim() || column.columnKey.trim(),
                fieldType: column.fieldType,
                isRequired: column.isRequired,
                displaySequence: columnIndex + 1,
                unitLabel: column.unitLabel.trim() || null,
                minNumber: column.minNumber === "" ? null : Number(column.minNumber),
                maxNumber: column.maxNumber === "" ? null : Number(column.maxNumber),
                correctiveActionTrigger: column.minNumber !== "" || column.maxNumber !== "",
                correctiveActionRequired: column.minNumber !== "" || column.maxNumber !== "",
              })),
          })),
      ),
    );
    formData.set(
      "calculationsJson",
      JSON.stringify(
        calculations
          .filter((row) => row.calculationKey.trim() && row.groupKey.trim() && row.columnKey.trim())
          .map((row) => ({
            calculationKey: row.calculationKey.trim(),
            label: row.label.trim() || row.calculationKey.trim(),
            unitLabel: row.unitLabel.trim() || null,
            decimalPrecision: row.op === "COUNT" ? 0 : 1,
            expression: { op: row.op, groupKey: row.groupKey.trim(), columnKey: row.columnKey.trim() },
          })),
      ),
    );
    formData.set("recommendedFixedWindowsJson", JSON.stringify(windows));
    const result = await action(formData);
    setPending(null);
    if (result && result.ok === false) {
      setError(result.error);
    }
  }

  function openPreview() {
    const form = formRef.current;
    if (!form) return;
    setPreview(previewModelFromForm(form, fields, rules, groups, calculations));
    setPreviewKey((current) => current + 1);
    setPreviewOpen(true);
  }

  return (
    <form
      ref={formRef}
      className="space-y-5"
      action={async (formData) => run(primaryAction, formData, "primary")}
    >
      {definitionId ? <input type="hidden" name="definitionId" value={definitionId} /> : null}
      {stableKey ? <input type="hidden" name="stableKey" value={stableKey} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Name</span>
          <input name="name" required defaultValue={initialName} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Purpose</span>
          <select
            name="purposeType"
            value={purposeType}
            onChange={(event) => setPurposeType(event.target.value)}
            className={inputClass}
          >
            <option value="LOG">Log</option>
            <option value="CHECKLIST">Checklist</option>
            <option value="INSPECTION">Inspection</option>
            <option value="PROCEDURE">Procedure</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Category</span>
          <select name="category" defaultValue={initialCategory ?? "OTHER"} className={inputClass}>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Description</span>
          <textarea name="description" rows={2} defaultValue={initialDescription} className={inputClass} />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Instructions for staff</span>
          <textarea name="instructions" rows={3} defaultValue={initialInstructions} className={inputClass} />
        </label>
      </div>

      <section className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold">Recommended schedule</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Marketplace defaults only. The facility attachment decides the actual schedule.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Recommended cadence</span>
            <select name="recommendedCadence" defaultValue={initialCadence ?? "AD_HOC"} className={inputClass}>
              {CADENCES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Schedule kind</span>
            <select
              name="recommendedScheduleKind"
              defaultValue={initialScheduleKind ?? ""}
              className={inputClass}
            >
              {SCHEDULE_KINDS.map((item) => (
                <option key={item.value || "default"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs text-[var(--text-secondary)]">Recommended dayparts</span>
            <input
              name="recommendedDaypartLabels"
              defaultValue={(initialDaypartLabels ?? []).join(", ")}
              placeholder="Morning, Afternoon"
              className={inputClass}
            />
            <span className="block text-xs text-[var(--text-secondary)]">
              Example: Morning, Afternoon. Used as labels for recommended windows.
            </span>
          </label>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">Recommended fixed windows</h3>
            <button
              type="button"
              className="text-xs font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline"
              onClick={() =>
                setWindows((current) => [...current, { label: "", startLocal: "05:00", endLocal: "11:00" }])
              }
            >
              Add window
            </button>
          </div>
          {windows.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Optional clock times. Example: Morning 05:00–11:00, Afternoon 11:00–16:00.
            </p>
          ) : (
            <ul className="space-y-2">
              {windows.map((window, index) => (
                <li key={`window-${index}`} className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto]">
                  <input
                    value={window.label ?? ""}
                    placeholder="Morning"
                    onChange={(event) =>
                      setWindows((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, label: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <input
                    value={window.startLocal}
                    placeholder="05:00"
                    onChange={(event) =>
                      setWindows((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, startLocal: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <input
                    value={window.endLocal}
                    placeholder="11:00"
                    onChange={(event) =>
                      setWindows((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, endLocal: event.target.value } : row,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <button
                    type="button"
                    className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
                    onClick={() => setWindows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold">Recommended applicability</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Discovery hints only. They do not attach this template or create a facility requirement.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Recommended departments</span>
            <input
              name="suggestedDepartmentKeys"
              defaultValue={(initialSuggestions?.departmentKeys ?? []).join(", ")}
              placeholder="DIETARY"
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Recommended asset types</span>
            <input
              name="suggestedAssetTypes"
              defaultValue={(initialSuggestions?.assetTypes ?? []).join(", ")}
              placeholder="COOLER, REACH_IN_COOLER"
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Recommended space types</span>
            <input
              name="suggestedSpaceTypes"
              defaultValue={(initialSuggestions?.spaceTypes ?? []).join(", ")}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--text-secondary)]">Keywords</span>
            <input
              name="suggestedKeywords"
              defaultValue={(initialSuggestions?.keywords ?? []).join(", ")}
              placeholder="cooler, temperature"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      {purposeType === "INSPECTION" ? (
        <section className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-semibold">Inspection scoring</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            N/A removes that question from the possible points. A critical miss fails the inspection only when
            the policy below is on. The passing score is a percentage.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-[var(--text-secondary)]">Passing score (%)</span>
              <input
                value={passingScore}
                inputMode="numeric"
                onChange={(event) => setPassingScore(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:mt-6">
              <input
                type="checkbox"
                checked={criticalFailureForcesFailure}
                onChange={(event) => setCriticalFailureForcesFailure(event.target.checked)}
              />
              Critical failure forces failure
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium">Sections</h3>
              <button
                type="button"
                className="text-xs underline"
                onClick={() =>
                  setSections((current) => [...current, { sectionKey: "", label: "", description: "" }])
                }
              >
                Add section
              </button>
            </div>
            {sections.map((section, index) => (
              <div key={`section-${index}`} className="grid gap-2 sm:grid-cols-3">
                <input
                  value={section.sectionKey}
                  placeholder="food_storage"
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, sectionKey: event.target.value } : row,
                      ),
                    )
                  }
                  className={inputClass}
                />
                <input
                  value={section.label}
                  placeholder="Food Storage"
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, label: event.target.value } : row,
                      ),
                    )
                  }
                  className={inputClass}
                />
                <input
                  value={section.description}
                  placeholder="Instructions"
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, description: event.target.value } : row,
                      ),
                    )
                  }
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Repeating groups</h2>
          <button
            type="button"
            className="text-xs underline"
            onClick={() =>
              setGroups((current) => [
                ...current,
                {
                  groupKey: "",
                  label: "",
                  minRows: "1",
                  maxRows: "40",
                  columns: [
                    { columnKey: "", label: "", fieldType: "TIME", unitLabel: "", minNumber: "", maxNumber: "", isRequired: true },
                  ],
                },
              ])
            }
          >
            Add repeating group
          </button>
        </div>
        {groups.map((group, index) => (
          <div key={`group-${index}`} className="space-y-2 rounded border border-zinc-200 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <input className={inputClass} placeholder="sanitizer_readings" value={group.groupKey} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupKey: event.target.value } : row))} />
              <input className={inputClass} placeholder="Sanitizer Readings" value={group.label} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} />
              <input className={inputClass} placeholder="Min rows" value={group.minRows} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, minRows: event.target.value } : row))} />
              <input className={inputClass} placeholder="Max rows" value={group.maxRows} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, maxRows: event.target.value } : row))} />
            </div>
            {group.columns.map((column, columnIndex) => (
              <div key={`${index}-${columnIndex}`} className="grid gap-2 sm:grid-cols-4">
                <input className={inputClass} placeholder="column key" value={column.columnKey} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: row.columns.map((item, itemIndex) => itemIndex === columnIndex ? { ...item, columnKey: event.target.value } : item) } : row))} />
                <input className={inputClass} placeholder="Label" value={column.label} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: row.columns.map((item, itemIndex) => itemIndex === columnIndex ? { ...item, label: event.target.value } : item) } : row))} />
                <input className={inputClass} placeholder="NUMBER" value={column.fieldType} onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: row.columns.map((item, itemIndex) => itemIndex === columnIndex ? { ...item, fieldType: event.target.value } : item) } : row))} />
                <input className={inputClass} placeholder="min-max unit" value={`${column.minNumber}|${column.maxNumber}|${column.unitLabel}`} onChange={(event) => {
                  const [minNumber = "", maxNumber = "", unitLabel = ""] = event.target.value.split("|");
                  setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: row.columns.map((item, itemIndex) => itemIndex === columnIndex ? { ...item, minNumber, maxNumber, unitLabel } : item) } : row));
                }} />
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={column.isRequired}
                    onChange={(event) => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: row.columns.map((item, itemIndex) => itemIndex === columnIndex ? { ...item, isRequired: event.target.checked } : item) } : row))}
                  />
                  Required
                </label>
              </div>
            ))}
            <button type="button" className="text-xs underline" onClick={() => setGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, columns: [...row.columns, { columnKey: "", label: "", fieldType: "SHORT_TEXT", unitLabel: "", minNumber: "", maxNumber: "", isRequired: false }] } : row))}>Add column</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Calculated fields</h2>
          <button type="button" className="text-xs underline" onClick={() => setCalculations((current) => [...current, { calculationKey: "", label: "", op: "AVERAGE", groupKey: groups[0]?.groupKey ?? "", columnKey: "", unitLabel: "" }])}>Add calculation</button>
        </div>
        {calculations.map((row, index) => (
          <div key={`calc-${index}`} className="grid gap-2 sm:grid-cols-5">
            <input className={inputClass} placeholder="average_ppm" value={row.calculationKey} onChange={(event) => setCalculations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, calculationKey: event.target.value } : item))} />
            <input className={inputClass} placeholder="Average PPM" value={row.label} onChange={(event) => setCalculations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} />
            <input className={inputClass} placeholder="AVERAGE" value={row.op} onChange={(event) => setCalculations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, op: event.target.value as typeof row.op } : item))} />
            <input className={inputClass} placeholder="group.column" value={`${row.groupKey}.${row.columnKey}`} onChange={(event) => {
              const [groupKey = "", columnKey = ""] = event.target.value.split(".");
              setCalculations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, groupKey, columnKey } : item));
            }} />
            <input className={inputClass} placeholder="ppm" value={row.unitLabel} onChange={(event) => setCalculations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitLabel: event.target.value } : item))} />
          </div>
        ))}
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            const copied = materializeReusableStructure({
              componentStableKey: "supervisor_verification",
              componentVersion: 1,
              existingFieldKeys: fields.map((field) => field.fieldKey).filter(Boolean),
              existingSectionKeys: sections.map((section) => section.sectionKey).filter(Boolean),
              structure: {
                sections: [{ sectionKey: "supervisor_verification", label: "Supervisor Verification", displaySequence: sections.length + 1 }],
                fields: [
                  { fieldKey: "supervisor_notes", label: "Supervisor Notes", fieldType: "LONG_TEXT" },
                  { fieldKey: "supervisor_attestation", label: "Attestation", fieldType: "ATTESTATION", isRequired: true },
                  { fieldKey: "supervisor_signature", label: "Signature", fieldType: "SIGNATURE", isRequired: true },
                ],
              },
            });
            setSections((current) => [
              ...current,
              ...(copied.sections ?? []).map((section) => ({
                sectionKey: section.sectionKey,
                label: section.label,
                description: "",
              })),
            ]);
            setFields((current) => [
              ...current,
              ...(copied.fields ?? []).map((field) => ({
                ...emptyField(),
                fieldKey: field.fieldKey,
                label: field.label,
                fieldType: field.fieldType as EditorField["fieldType"],
                isRequired: field.fieldType !== "LONG_TEXT",
                sectionKey: copied.sections?.[0]?.sectionKey ?? "",
              })),
            ]);
          }}
        >
          Insert Supervisor Verification
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Fields</h2>
          <button
            type="button"
            className="text-sm font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline"
            onClick={() => setFields((current) => [...current, emptyField()])}
          >
            Add field
          </button>
        </div>
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li key={field.key} className="rounded-md border border-[var(--border)] bg-white p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--text-secondary)]">Label</span>
                  <input
                    value={field.label}
                    onChange={(event) => updateField(index, { label: event.target.value })}
                    onBlur={() => {
                      if (field.fieldKey || !field.label.trim()) return;
                      const used = fields
                        .map((row, rowIndex) => (rowIndex === index ? "" : row.fieldKey))
                        .filter(Boolean);
                      updateField(index, { fieldKey: unusedFieldKey(field.label, used) });
                    }}
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--text-secondary)]">Type</span>
                  <select
                    value={field.fieldType}
                    onChange={(event) => {
                      const fieldType = event.target.value;
                      updateField(index, {
                        fieldType,
                        isRequired: fieldType === "OPTIONAL_COMMENT" ? false : field.isRequired,
                        unitLabel:
                          fieldType === "TEMPERATURE" && !field.unitLabel ? "°F" : field.unitLabel,
                      });
                    }}
                    className={inputClass}
                  >
                    {FIELD_TYPES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="sm:col-span-2 text-xs text-[var(--text-secondary)]" data-testid="catalog-field-key">
                  Field key: <span className="font-mono">{field.fieldKey || "assigned on save"}</span>
                  <span className="ml-1">Changing the label does not change this key.</span>
                </p>
                {isNumericEvidenceFieldType(field.fieldType) ? (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs text-[var(--text-secondary)]">Unit</span>
                      <input
                        value={field.unitLabel}
                        placeholder="°F, ppm, pH, %"
                        onChange={(event) => updateField(index, { unitLabel: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--text-secondary)]">Minimum</span>
                        <input
                          value={field.minNumber}
                          inputMode="decimal"
                          onChange={(event) => updateField(index, { minNumber: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-xs text-[var(--text-secondary)]">Maximum</span>
                        <input
                          value={field.maxNumber}
                          inputMode="decimal"
                          onChange={(event) => updateField(index, { maxNumber: event.target.value })}
                          className={inputClass}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
                {isSelectEvidenceFieldType(field.fieldType) ? (
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs text-[var(--text-secondary)]">Choices (one per line)</span>
                    <textarea
                      value={field.allowedSelections}
                      rows={3}
                      onChange={(event) => updateField(index, { allowedSelections: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                ) : null}
                {purposeType === "INSPECTION" ? (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs text-[var(--text-secondary)]">Section key</span>
                      <input
                        value={field.sectionKey}
                        placeholder="food_storage"
                        onChange={(event) => updateField(index, { sectionKey: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-[var(--text-secondary)]">Score weight</span>
                      <input
                        value={field.scoreWeight}
                        inputMode="numeric"
                        onChange={(event) => updateField(index, { scoreWeight: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="block space-y-1 sm:col-span-2">
                      <span className="text-xs text-[var(--text-secondary)]">
                        Full-credit responses (comma separated). Leave blank for the default.
                      </span>
                      <input
                        value={field.creditValues}
                        placeholder="COMPLIANT"
                        onChange={(event) => updateField(index, { creditValues: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </>
                ) : null}
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-xs text-[var(--text-secondary)]">Help</span>
                  <input
                    value={field.helpText}
                    onChange={(event) => updateField(index, { helpText: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                {field.fieldType === "OPTIONAL_COMMENT" ? (
                  <p className="text-xs text-[var(--text-secondary)]">Comments stay optional.</p>
                ) : (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.isRequired}
                      onChange={(event) => updateField(index, { isRequired: event.target.checked })}
                    />
                    Required
                  </label>
                )}
                {purposeType === "INSPECTION" ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.critical}
                      onChange={(event) => updateField(index, { critical: event.target.checked })}
                    />
                    Critical item
                  </label>
                ) : null}
                {isExceptionEvidenceFieldType(field.fieldType) ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.correctiveActionTrigger}
                        onChange={(event) =>
                          updateField(index, {
                            correctiveActionTrigger: event.target.checked,
                            correctiveActionRequired: event.target.checked
                              ? field.correctiveActionRequired
                              : false,
                          })
                        }
                      />
                      Mark as exception
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={field.correctiveActionRequired}
                        onChange={(event) =>
                          updateField(index, {
                            correctiveActionRequired: event.target.checked,
                            correctiveActionTrigger: event.target.checked
                              ? true
                              : field.correctiveActionTrigger,
                          })
                        }
                      />
                      Require corrective action
                    </label>
                  </>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-40"
                    onClick={() => moveField(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={index === fields.length - 1}
                    className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline disabled:opacity-40"
                    onClick={() => moveField(index, 1)}
                  >
                    Move down
                  </button>
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
                      onClick={() => setFields((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {isExceptionEvidenceFieldType(field.fieldType) ? (
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  Out of standard uses the existing engine: numeric values outside min/max, No, or Needs
                  attention. A required note only appears when that happens.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <AdvancedLogicSection fields={fields} rules={rules} setRules={setRules} />

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={openPreview}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
          data-testid="harbor-catalog-preview-button"
        >
          Preview
        </button>
        <button
          type="submit"
          disabled={pending !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
        >
          {pending === "primary" ? "Saving…" : mode === "create" ? "Create draft" : "Save draft"}
        </button>
        {secondaryAction ? (
          <button
            type="submit"
            disabled={pending !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
            formAction={async (formData) => run(secondaryAction, formData, "secondary")}
          >
            {pending === "secondary" ? "Publishing…" : "Publish"}
          </button>
        ) : null}
      </div>
      <Drawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        closeLabel="Close"
        size="md"
        data-testid="harbor-catalog-preview"
      >
        {preview ? <HarborCatalogLogPreview key={previewKey} model={preview} /> : null}
      </Drawer>
    </form>
  );
}

function AdvancedLogicSection({
  fields,
  rules,
  setRules,
}: {
  fields: EditorField[];
  rules: EditorRule[];
  setRules: (next: EditorRule[] | ((current: EditorRule[]) => EditorRule[])) => void;
}) {
  const labeled = fields.filter((field) => field.label.trim() && field.fieldKey);
  const ruleCheck = validateCatalogEvidenceRules({
    fields: labeled.map((field) => ({
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      allowedSelections: parseChoices(field.allowedSelections),
    })),
    rules: parseCatalogEvidenceRules(serializeRules(rules)),
  });

  function updateRule(index: number, patch: Partial<EditorRule>) {
    setRules((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <section className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4" data-testid="catalog-advanced-logic">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Advanced logic</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Optional conditions. Simple range and exception checkboxes above stay enough for most logs.
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline"
          onClick={() => setRules((current) => [...current, emptyRule()])}
        >
          Add condition
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)]">No extra conditions. Publish still uses field ranges and exception checkboxes.</p>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule, index) => {
            const source = labeled.find((field) => field.fieldKey === rule.sourceFieldKey);
            const operators = source ? operatorsForFieldType(source.fieldType) : [...EVIDENCE_RULE_OPERATORS];
            const needsValue = !["IS_TRUE", "IS_FALSE", "IS_EMPTY", "IS_NOT_EMPTY", "OUT_OF_STANDARD"].includes(
              rule.operator,
            );
            return (
              <li key={rule.key} className="space-y-2 rounded-md border border-[var(--border)] p-3">
                <p className="text-xs font-semibold text-[var(--text-secondary)]">When</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <select
                    value={rule.sourceFieldKey}
                    onChange={(event) => updateRule(index, { sourceFieldKey: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Choose field</option>
                    {labeled.map((field) => (
                      <option key={field.fieldKey} value={field.fieldKey}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.operator}
                    onChange={(event) => updateRule(index, { operator: event.target.value as EvidenceRuleOperator })}
                    className={inputClass}
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {operator.replaceAll("_", " ").toLowerCase()}
                      </option>
                    ))}
                  </select>
                  {needsValue ? (
                    source && isSelectEvidenceFieldType(source.fieldType) ? (
                      <select
                        value={rule.compareValue}
                        onChange={(event) => updateRule(index, { compareValue: event.target.value })}
                        className={inputClass}
                      >
                        <option value="">Choose value</option>
                        {parseChoices(source.allowedSelections).map((choice) => (
                          <option key={choice} value={choice}>
                            {choice}
                          </option>
                        ))}
                      </select>
                    ) : source?.fieldType === "YES_NO" ? (
                      <select
                        value={rule.compareValue}
                        onChange={(event) => updateRule(index, { compareValue: event.target.value })}
                        className={inputClass}
                      >
                        <option value="">Choose value</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <input
                        value={rule.compareValue}
                        onChange={(event) => updateRule(index, { compareValue: event.target.value })}
                        className={inputClass}
                        placeholder="Value"
                      />
                    )
                  ) : (
                    <p className="self-center text-xs text-[var(--text-secondary)]">No comparison value needed</p>
                  )}
                </div>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">Then</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.markOutOfStandard}
                      onChange={(event) => updateRule(index, { markOutOfStandard: event.target.checked })}
                    />
                    Mark response out of standard
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.requireCorrectiveAction}
                      onChange={(event) => updateRule(index, { requireCorrectiveAction: event.target.checked })}
                    />
                    Require corrective action
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.setNeedsReview}
                      onChange={(event) => updateRule(index, { setNeedsReview: event.target.checked })}
                    />
                    Set needs review
                  </label>
                  <label className="block space-y-1 text-xs">
                    <span className="text-[var(--text-secondary)]">Show field</span>
                    <select
                      value={rule.showFieldKey}
                      onChange={(event) => updateRule(index, { showFieldKey: event.target.value })}
                      className={inputClass}
                    >
                      <option value="">None</option>
                      {labeled
                        .filter((field) => field.fieldKey !== rule.sourceFieldKey)
                        .map((field) => (
                          <option key={field.fieldKey} value={field.fieldKey}>
                            {field.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block space-y-1 text-xs sm:col-span-2">
                    <span className="text-[var(--text-secondary)]">Require field</span>
                    <select
                      value={rule.requireFieldKey}
                      onChange={(event) => updateRule(index, { requireFieldKey: event.target.value })}
                      className={inputClass}
                    >
                      <option value="">None</option>
                      {labeled.map((field) => (
                        <option key={field.fieldKey} value={field.fieldKey}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
                  onClick={() => setRules((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove condition
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {ruleCheck.errors.length > 0 ? (
        <ul className="space-y-1 text-xs text-amber-900" data-testid="catalog-rule-errors">
          {ruleCheck.errors.map((error) => (
            <li key={error.code}>{error.message} Drafts may stay incomplete; publish is blocked.</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
