import { formatEvidenceFieldDisplay, serializeEvidenceFieldForCsv, type EvidenceFieldDisplayInput } from "./evidence-field-display";
import type { LogSubmissionSnapshotV2 } from "./snapshot";
import { evaluateCalculations, parseCalculations, parseRepeatingGroups, type RepeatRowInput } from "./template-structure";

type RecordValue = EvidenceFieldDisplayInput & {
  fieldKey: string;
  label: string;
  outOfStandard: boolean;
  groupKey?: string | null;
  rowKey?: string | null;
  rowSequence?: number | null;
};

/** Export all saved scalar answers, preserving false values and pinned field order/units. */
export function projectScalarRecordResponses(
  catalog: Pick<LogSubmissionSnapshotV2["catalog"], "fields"> | undefined,
  values: readonly RecordValue[],
) {
  const definitions = new Map(catalog?.fields.map((field) => [field.fieldKey, field]));
  return values.filter((value) => !value.groupKey).sort((a, b) =>
    (definitions.get(a.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER) -
    (definitions.get(b.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER),
  ).map((value) => ({
    column: value.label,
    value: serializeEvidenceFieldForCsv(value),
    unit: definitions.get(value.fieldKey)?.unitLabel ?? "",
    outOfStandard: value.outOfStandard,
  }));
}

/** Present saved answers and derive totals exclusively from the submission's pinned definition. */
export function presentRecordValues(
  catalog: Pick<LogSubmissionSnapshotV2["catalog"], "fields" | "repeatingGroups" | "calculations"> | undefined,
  values: readonly RecordValue[],
) {
  const scalarFields = new Map(catalog?.fields.map((field) => [field.fieldKey, field]));
  const groups = new Map(parseRepeatingGroups(catalog?.repeatingGroups).map((group) => [group.groupKey, group]));
  const columnFor = (value: RecordValue) => groups.get(value.groupKey ?? "")?.columns.find((column) => column.columnKey === value.fieldKey);
  const rows = new Map<string, RepeatRowInput>();
  const exceptionRows = new Set<string>();
  for (const value of values) {
    if (!value.groupKey || !value.rowKey) continue;
    const key = `${value.groupKey}:${value.rowKey}`;
    const row = rows.get(key) ?? { groupKey: value.groupKey, rowKey: value.rowKey, rowSequence: value.rowSequence ?? 0, cells: [] };
    row.cells.push({ columnKey: value.fieldKey, valueNumber: value.valueNumber, valueText: value.valueText, valueBoolean: value.valueBoolean, valueSelections: value.valueSelections });
    rows.set(key, row);
    if (value.outOfStandard) exceptionRows.add(key);
  }

  const fields = [...values].sort((a, b) => {
    if (Boolean(a.groupKey) !== Boolean(b.groupKey)) return a.groupKey ? 1 : -1;
    if (a.groupKey || b.groupKey) {
      const groupOrder = (groups.get(a.groupKey ?? "")?.displaySequence ?? 0) - (groups.get(b.groupKey ?? "")?.displaySequence ?? 0);
      return groupOrder || (a.groupKey ?? "").localeCompare(b.groupKey ?? "") ||
        (a.rowSequence ?? 0) - (b.rowSequence ?? 0) || (a.rowKey ?? "").localeCompare(b.rowKey ?? "") ||
        (columnFor(a)?.displaySequence ?? 0) - (columnFor(b)?.displaySequence ?? 0) || a.fieldKey.localeCompare(b.fieldKey);
    }
    return (scalarFields.get(a.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER) - (scalarFields.get(b.fieldKey)?.displaySequence ?? Number.MAX_SAFE_INTEGER);
  }).map((value) => {
    const definition = value.groupKey ? columnFor(value) : scalarFields.get(value.fieldKey);
    const unit = definition?.unitLabel?.trim() ?? "";
    const min = definition?.minNumber;
    const max = definition?.maxNumber;
    const rangeLabel = min != null && max != null ? `${min}${unit}–${max}${unit}`
      : min != null ? `≥ ${min}${unit}` : max != null ? `≤ ${max}${unit}` : null;
    return {
      valueKey: `${value.groupKey ?? ""}:${value.rowKey ?? ""}:${value.fieldKey}`,
      fieldKey: value.fieldKey,
      label: value.groupKey ? `${groups.get(value.groupKey)?.label ?? value.groupKey} · Row ${value.rowSequence ?? ""} · ${value.label}` : value.label,
      displayValue: formatEvidenceFieldDisplay({ ...value, unitLabel: definition?.unitLabel ?? null }),
      rangeLabel,
      outOfStandard: value.outOfStandard,
    };
  });

  return {
    fields,
    calculations: evaluateCalculations({
      calculations: parseCalculations(catalog?.calculations),
      scalars: new Map(values.filter((value) => !value.groupKey).map((value) => [value.fieldKey, value.valueNumber ?? null])),
      rows: [...rows.values()],
    }),
    rowCount: rows.size,
    exceptionRowCount: exceptionRows.size,
  };
}
