"use client";

import type { RepeatingGroupDefinition, RepeatRowInput } from "@/lib/canonical-logs/template-structure";

function newRowKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `row_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function CanonicalRepeatGroupControl(props: {
  groups: readonly RepeatingGroupDefinition[];
  rows: RepeatRowInput[];
  onChange: (rows: RepeatRowInput[]) => void;
  readOnly?: boolean;
}) {
  if (props.groups.length === 0) return null;
  return (
    <div className="space-y-4">
      {props.groups.map((group) => {
        const rows = props.rows
          .filter((row) => row.groupKey === group.groupKey)
          .slice()
          .sort((a, b) => a.rowSequence - b.rowSequence);
        const maxRows = Math.min(group.maxRows ?? 40, 40);
        return (
          <section key={group.groupKey} className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-zinc-900">{group.label}</h3>
              {group.helpText ? <p className="text-xs text-zinc-500">{group.helpText}</p> : null}
            </div>
            {rows.map((row, index) => (
              <div key={row.rowKey} className="space-y-2 rounded-md border border-zinc-200 p-3 md:grid md:grid-cols-3 md:gap-2">
                <p className="text-xs font-medium text-zinc-500 md:col-span-3">Reading {index + 1}</p>
                {group.columns.map((column) => {
                  const cell = row.cells.find((item) => item.columnKey === column.columnKey);
                  return (
                    <label key={column.columnKey} className="block text-sm">
                      <span className="text-xs text-zinc-600">
                        {column.label}
                        {column.isRequired ? " *" : ""}
                      </span>
                      <input
                        className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                        type={column.fieldType === "NUMBER" || column.fieldType === "TEMPERATURE" ? "number" : column.fieldType === "TIME" ? "time" : "text"}
                        disabled={props.readOnly}
                        value={
                          column.fieldType === "NUMBER" || column.fieldType === "TEMPERATURE"
                            ? (cell?.valueNumber ?? "")
                            : (cell?.valueText ?? "")
                        }
                        onChange={(event) => {
                          const nextCells = group.columns.map((item) => {
                            const current = row.cells.find((cell) => cell.columnKey === item.columnKey) ?? {
                              columnKey: item.columnKey,
                            };
                            if (item.columnKey !== column.columnKey) return current;
                            if (item.fieldType === "NUMBER" || item.fieldType === "TEMPERATURE") {
                              const parsed = event.target.value === "" ? null : Number(event.target.value);
                              return { ...current, valueNumber: parsed != null && Number.isFinite(parsed) ? parsed : null };
                            }
                            return { ...current, valueText: event.target.value };
                          });
                          props.onChange(
                            props.rows.map((item) => (item.rowKey === row.rowKey ? { ...item, cells: nextCells } : item)),
                          );
                        }}
                      />
                    </label>
                  );
                })}
                {props.readOnly ? null : (
                  <button
                    type="button"
                    className="text-xs underline md:col-span-3"
                    onClick={() => props.onChange(props.rows.filter((item) => item.rowKey !== row.rowKey))}
                  >
                    Remove reading
                  </button>
                )}
              </div>
            ))}
            {props.readOnly || rows.length >= maxRows ? null : (
              <button
                type="button"
                className="text-sm underline"
                onClick={() =>
                  props.onChange([
                    ...props.rows,
                    {
                      groupKey: group.groupKey,
                      rowKey: newRowKey(),
                      rowSequence: rows.length + 1,
                      cells: group.columns.map((column) => ({ columnKey: column.columnKey })),
                    },
                  ])
                }
              >
                + Add reading
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
