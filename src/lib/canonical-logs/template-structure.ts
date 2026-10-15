/**
 * Phase 7 template structure.
 * Repeating groups, calculations, and reusable sections are Catalog data.
 * A published snapshot copies them. Runtime does not read the component library.
 *
 * Evaluation order:
 * submitted scalar answers + repeat rows
 * → derived calculations
 * → rules / measurement standards
 * → persist canonical evidence
 * → inspection score ignores calculated fields unless a field is explicitly scored
 *
 * Offline sync does not assemble repeat rows. A template that requires rows
 * fails server validation on sync until the client sends the structured rows.
 */

export const MAX_REPEAT_ROWS = 40;

const REPEAT_COLUMN_TYPES = new Set([
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
  "COMPLIANCE",
  "OPTIONAL_COMMENT",
]);

export type RepeatColumnDefinition = {
  columnKey: string;
  label: string;
  fieldType: string;
  isRequired?: boolean;
  displaySequence: number;
  helpText?: string | null;
  unitLabel?: string | null;
  minNumber?: number | null;
  maxNumber?: number | null;
  allowedSelections?: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired?: boolean;
};

export type RepeatingGroupDefinition = {
  groupKey: string;
  label: string;
  helpText?: string | null;
  sectionKey?: string | null;
  minRows?: number;
  maxRows?: number;
  displaySequence: number;
  columns: RepeatColumnDefinition[];
};

export type CalculationExpression =
  | { op: "LITERAL"; value: number }
  | { op: "FIELD"; fieldKey: string }
  | { op: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE"; left: CalculationExpression; right: CalculationExpression }
  | { op: "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT"; groupKey: string; columnKey: string };

export type CalculationDefinition = {
  calculationKey: string;
  label: string;
  sectionKey?: string | null;
  unitLabel?: string | null;
  decimalPrecision?: number | null;
  expression: CalculationExpression;
};

export type RepeatCellInput = {
  columnKey: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueSelections?: string[];
};

export type RepeatRowInput = {
  groupKey: string;
  rowKey: string;
  rowSequence: number;
  cells: RepeatCellInput[];
};

export type RepeatValidation = {
  errors: string[];
  outOfStandard: boolean;
  correctiveActionRequired: boolean;
  reasons: string[];
  rows: Array<{
    groupKey: string;
    rowKey: string;
    rowSequence: number;
    cells: Array<RepeatCellInput & { label: string; fieldType: string; outOfStandard: boolean; unitLabel: string | null }>;
  }>;
};

export function parseRepeatingGroups(raw: unknown): RepeatingGroupDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is RepeatingGroupDefinition => {
    if (!row || typeof row !== "object") return false;
    const group = row as RepeatingGroupDefinition;
    return typeof group.groupKey === "string" && Array.isArray(group.columns);
  });
}

export function parseCalculations(raw: unknown): CalculationDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is CalculationDefinition => {
    if (!row || typeof row !== "object") return false;
    const calc = row as CalculationDefinition;
    return typeof calc.calculationKey === "string" && calc.expression != null;
  });
}

export function validateRepeatingGroupsForPublish(groups: readonly RepeatingGroupDefinition[]): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const group of groups) {
    if (!group.groupKey.trim()) errors.push("A repeating group needs a stable key.");
    if (keys.has(group.groupKey)) errors.push(`Repeating group "${group.groupKey}" is duplicated.`);
    keys.add(group.groupKey);
    const maxRows = group.maxRows ?? MAX_REPEAT_ROWS;
    if (maxRows > MAX_REPEAT_ROWS) errors.push(`${group.label} allows more than ${MAX_REPEAT_ROWS} rows.`);
    if ((group.minRows ?? 0) < 0 || maxRows < (group.minRows ?? 0)) {
      errors.push(`${group.label} has an invalid row range.`);
    }
    const columns = new Set<string>();
    for (const column of group.columns) {
      if (!column.columnKey.trim()) errors.push(`${group.label} has a column without a key.`);
      if (columns.has(column.columnKey)) errors.push(`${group.label} repeats column "${column.columnKey}".`);
      columns.add(column.columnKey);
      if (!REPEAT_COLUMN_TYPES.has(column.fieldType)) {
        errors.push(`${group.label} column "${column.label}" cannot use ${column.fieldType} in a row.`);
      }
    }
  }
  return errors;
}

function cellProvided(column: RepeatColumnDefinition, cell: RepeatCellInput | undefined): boolean {
  if (!cell) return false;
  if (cell.valueNumber != null && Number.isFinite(cell.valueNumber)) return true;
  if (cell.valueBoolean != null) return true;
  if (cell.valueText?.trim()) return true;
  if ((cell.valueSelections ?? []).length > 0) return true;
  return false;
}

function numericValue(cell: RepeatCellInput | undefined): number | null {
  if (!cell || cell.valueNumber == null || !Number.isFinite(cell.valueNumber)) return null;
  return cell.valueNumber;
}

export function validateRepeatSubmission(input: {
  groups: readonly RepeatingGroupDefinition[];
  rows: readonly RepeatRowInput[];
}): RepeatValidation {
  const errors: string[] = [];
  const reasons: string[] = [];
  const known = new Map(input.groups.map((group) => [group.groupKey, group]));
  const byGroup = new Map<string, RepeatRowInput[]>();
  const seenRows = new Set<string>();
  for (const row of input.rows) {
    const group = known.get(row.groupKey);
    if (!group) {
      errors.push(`Unknown repeating group "${row.groupKey}".`);
      continue;
    }
    const identity = `${row.groupKey}:${row.rowKey}`;
    if (!row.rowKey.trim() || seenRows.has(identity)) {
      errors.push(`${group.label} needs a stable row identity.`);
    }
    seenRows.add(identity);
    const columns = new Map(group.columns.map((column) => [column.columnKey, column]));
    for (const cell of row.cells) {
      if (!columns.has(cell.columnKey)) errors.push(`${group.label} has no column "${cell.columnKey}".`);
    }
    byGroup.set(row.groupKey, [...(byGroup.get(row.groupKey) ?? []), row]);
  }
  const normalized: RepeatValidation["rows"] = [];
  let outOfStandard = false;
  let correctiveActionRequired = false;
  for (const group of input.groups) {
    const rows = (byGroup.get(group.groupKey) ?? []).slice().sort((a, b) => a.rowSequence - b.rowSequence);
    const maxRows = Math.min(group.maxRows ?? MAX_REPEAT_ROWS, MAX_REPEAT_ROWS);
    const minRows = group.minRows ?? 0;
    if (rows.length < minRows) errors.push(`${group.label} requires at least ${minRows} row${minRows === 1 ? "" : "s"}.`);
    if (rows.length > maxRows) errors.push(`${group.label} allows at most ${maxRows} rows.`);
    rows.forEach((row, index) => {
      const cells = group.columns.map((column) => {
        const cell = row.cells.find((item) => item.columnKey === column.columnKey);
        const required = column.isRequired === true && column.fieldType !== "OPTIONAL_COMMENT";
        if (required && !cellProvided(column, cell)) {
          errors.push(`${group.label} row ${index + 1} requires ${column.label}.`);
        }
        const number = numericValue(cell);
        const measured =
          (column.fieldType === "NUMBER" || column.fieldType === "TEMPERATURE") &&
          number != null &&
          ((column.minNumber != null && number < column.minNumber) ||
            (column.maxNumber != null && number > column.maxNumber));
        if (measured) {
          outOfStandard = true;
          if (column.correctiveActionRequired) correctiveActionRequired = true;
          const expected =
            column.minNumber != null && column.maxNumber != null
              ? `${column.minNumber}–${column.maxNumber}${column.unitLabel ? ` ${column.unitLabel}` : ""}`
              : "the configured range";
          reasons.push(
            `${group.label} · row ${index + 1} · ${column.label}: ${number}. Expected ${expected}.`,
          );
        }
        return {
          columnKey: column.columnKey,
          label: column.label,
          fieldType: column.fieldType,
          unitLabel: column.unitLabel ?? null,
          valueText: cell?.valueText ?? null,
          valueNumber: cell?.valueNumber ?? null,
          valueBoolean: cell?.valueBoolean ?? null,
          valueSelections: cell?.valueSelections ?? [],
          outOfStandard: measured,
        };
      });
      normalized.push({ groupKey: group.groupKey, rowKey: row.rowKey, rowSequence: row.rowSequence, cells });
    });
  }
  return { errors, outOfStandard, correctiveActionRequired, reasons, rows: normalized };
}

export function roundCalculated(value: number, precision: number): number {
  const places = Math.max(0, Math.min(6, precision));
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

type CalcContext = {
  scalars: ReadonlyMap<string, number | null>;
  rows: readonly RepeatRowInput[];
  calculations: ReadonlyMap<string, CalculationDefinition>;
  stack: string[];
};

function evalExpression(expression: CalculationExpression, context: CalcContext): number | null {
  switch (expression.op) {
    case "LITERAL":
      return Number.isFinite(expression.value) ? expression.value : null;
    case "FIELD":
      return context.scalars.get(expression.fieldKey) ?? null;
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE": {
      const left = evalExpression(expression.left, context);
      const right = evalExpression(expression.right, context);
      if (left == null || right == null) return null;
      if (expression.op === "ADD") return left + right;
      if (expression.op === "SUBTRACT") return left - right;
      if (expression.op === "MULTIPLY") return left * right;
      if (right === 0) return null;
      return left / right;
    }
    case "SUM":
    case "AVERAGE":
    case "MIN":
    case "MAX":
    case "COUNT": {
      const numbers = context.rows
        .filter((row) => row.groupKey === expression.groupKey)
        .map((row) => numericValue(row.cells.find((cell) => cell.columnKey === expression.columnKey)))
        .filter((value): value is number => value != null);
      if (expression.op === "COUNT") return numbers.length;
      if (numbers.length === 0) return null;
      if (expression.op === "SUM") return numbers.reduce((sum, value) => sum + value, 0);
      if (expression.op === "MIN") return Math.min(...numbers);
      if (expression.op === "MAX") return Math.max(...numbers);
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    }
    default:
      return null;
  }
}

export type CalculatedResult = {
  calculationKey: string;
  label: string;
  unitLabel: string | null;
  value: number | null;
  display: string;
};

export function evaluateCalculations(input: {
  calculations: readonly CalculationDefinition[];
  scalars?: ReadonlyMap<string, number | null>;
  rows: readonly RepeatRowInput[];
}): CalculatedResult[] {
  const byKey = new Map(input.calculations.map((row) => [row.calculationKey, row]));
  return input.calculations.map((calculation) => {
    const raw = evalExpression(calculation.expression, {
      scalars: input.scalars ?? new Map(),
      rows: input.rows,
      calculations: byKey,
      stack: [],
    });
    const precision = calculation.expression.op === "COUNT" ? 0 : (calculation.decimalPrecision ?? 1);
    const value = raw == null ? null : roundCalculated(raw, precision);
    const unit = calculation.unitLabel ? ` ${calculation.unitLabel}` : "";
    return {
      calculationKey: calculation.calculationKey,
      label: calculation.label,
      unitLabel: calculation.unitLabel ?? null,
      value,
      display: value == null ? "—" : `${value}${unit}`,
    };
  });
}

function expressionRefs(expression: CalculationExpression, into: Set<string>) {
  if (expression.op === "FIELD" && expression.fieldKey.startsWith("calc:")) into.add(expression.fieldKey.slice(5));
  if ("left" in expression) {
    expressionRefs(expression.left, into);
    expressionRefs(expression.right, into);
  }
}

export function calculationCycleErrors(calculations: readonly CalculationDefinition[]): string[] {
  const refs = new Map<string, string[]>();
  for (const calculation of calculations) {
    const keys = new Set<string>();
    expressionRefs(calculation.expression, keys);
    refs.set(calculation.calculationKey, [...keys]);
  }
  const errors: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function walk(key: string) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      errors.push(`Calculation "${key}" refers to itself.`);
      return;
    }
    visiting.add(key);
    for (const next of refs.get(key) ?? []) {
      if (next === key || visiting.has(next)) errors.push(`Calculation "${key}" has a circular reference.`);
      else walk(next);
    }
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of refs.keys()) walk(key);
  return [...new Set(errors)];
}

export type ReusableStructure = {
  sections?: Array<{
    sectionKey: string;
    label: string;
    description?: string | null;
    displaySequence: number;
    sourceComponentStableKey?: string | null;
    sourceComponentVersion?: number | null;
  }>;
  fields?: Array<{ fieldKey: string; label: string; fieldType: string; [key: string]: unknown }>;
  rules?: Array<{ sourceFieldKey: string; actions: Array<{ targetFieldKey?: string | null }> }>;
  groups?: RepeatingGroupDefinition[];
  calculations?: CalculationDefinition[];
};

function freshKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function materializeReusableStructure(input: {
  componentStableKey: string;
  componentVersion: number;
  structure: ReusableStructure;
  existingFieldKeys: readonly string[];
  existingSectionKeys: readonly string[];
}): ReusableStructure {
  const fieldTaken = new Set(input.existingFieldKeys);
  const sectionTaken = new Set(input.existingSectionKeys);
  const fieldMap = new Map<string, string>();
  const fields = (input.structure.fields ?? []).map((field) => {
    const next = freshKey(field.fieldKey, fieldTaken);
    fieldTaken.add(next);
    fieldMap.set(field.fieldKey, next);
    return { ...field, fieldKey: next };
  });
  const remap = (key: string | null | undefined) => (key && fieldMap.has(key) ? fieldMap.get(key)! : key);
  const sections = (input.structure.sections ?? []).map((section) => {
    const next = freshKey(section.sectionKey, sectionTaken);
    sectionTaken.add(next);
    return {
      ...section,
      sectionKey: next,
      sourceComponentStableKey: input.componentStableKey,
      sourceComponentVersion: input.componentVersion,
    };
  });
  return {
    sections,
    fields,
    rules: (input.structure.rules ?? []).map((rule) => ({
      ...rule,
      sourceFieldKey: remap(rule.sourceFieldKey) ?? rule.sourceFieldKey,
      actions: rule.actions.map((action) => ({ ...action, targetFieldKey: remap(action.targetFieldKey) })),
    })),
    groups: input.structure.groups ?? [],
    calculations: input.structure.calculations ?? [],
  };
}

export function formatRepeatDetail(validation: RepeatValidation): string[] {
  return validation.rows.map((row, index) => {
    const cells = row.cells
      .map((cell) => {
        const value = cell.valueNumber ?? cell.valueText ?? (cell.valueBoolean == null ? "" : cell.valueBoolean ? "Yes" : "No");
        const unit = cell.unitLabel && cell.valueNumber != null ? ` ${cell.unitLabel}` : "";
        const mark = cell.outOfStandard ? " — Out of standard" : cell.valueNumber != null ? " — In standard" : "";
        return `${value}${unit}${mark}`;
      })
      .filter(Boolean)
      .join(" — ");
    return `${index + 1}. ${cells}`;
  });
}

export function repeatLogBookSummary(input: {
  rowCount: number;
  exceptionCount: number;
}): string | null {
  if (input.rowCount === 0) return null;
  const exception = input.exceptionCount > 0 ? ` · ${input.exceptionCount} exception${input.exceptionCount === 1 ? "" : "s"}` : "";
  return `${input.rowCount} reading${input.rowCount === 1 ? "" : "s"}${exception}`;
}
