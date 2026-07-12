"use client";

import { useMemo, useState } from "react";

import { INSPECTION_RESPONSE_TYPE_OPTIONS } from "@/lib/work/inspections/list-unit-inspections";
import type { InspectionResponseType } from "@prisma/client";

import { upsertInspectionDefinitionAction } from "@/app/(protected)/admin/inspections/actions";

export type EditorItem = {
  key: string;
  id?: string;
  label: string;
  description: string;
  responseType: InspectionResponseType;
  isRequired: boolean;
  failureCreatesFollowUp: boolean;
};

export type InspectionDefinitionEditorProps = {
  mode: "create" | "edit";
  definitionId?: string;
  initialName?: string;
  initialDescription?: string;
  initialFrequency?: string;
  initialDepartmentId?: string;
  initialUnitId?: string;
  initialIsActive?: boolean;
  initialItems?: EditorItem[];
  departments: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string }>;
};

function newItem(partial?: Partial<EditorItem>): EditorItem {
  return {
    key: `new_${Math.random().toString(36).slice(2, 10)}`,
    label: "",
    description: "",
    responseType: "PASS_FAIL",
    isRequired: true,
    failureCreatesFollowUp: false,
    ...partial,
  };
}

export function InspectionDefinitionEditor(props: InspectionDefinitionEditorProps) {
  const [name, setName] = useState(props.initialName ?? "");
  const [description, setDescription] = useState(props.initialDescription ?? "");
  const [frequency, setFrequency] = useState(props.initialFrequency ?? "");
  const [departmentId, setDepartmentId] = useState(props.initialDepartmentId ?? "");
  const [unitId, setUnitId] = useState(props.initialUnitId ?? "");
  const [isActive, setIsActive] = useState(props.initialIsActive ?? true);
  const [items, setItems] = useState<EditorItem[]>(
    props.initialItems?.length ? props.initialItems : [newItem({ label: "Check 1" })],
  );
  const [error, setError] = useState<string | null>(null);

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items.map((item, index) => ({
          ...(item.id ? { id: item.id } : {}),
          label: item.label,
          description: item.description.trim() || null,
          sortOrder: index + 1,
          isRequired: item.isRequired,
          responseType: item.responseType,
          failureCreatesFollowUp: item.failureCreatesFollowUp,
        })),
      ),
    [items],
  );

  function moveItem(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    setItems((current) => {
      const copy = [...current];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  return (
    <form
      action={upsertInspectionDefinitionAction}
      className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      onSubmit={(event) => {
        if (!name.trim() || items.some((item) => item.label.trim().length < 2)) {
          event.preventDefault();
          setError("Name and every item label (at least 2 characters) are required.");
        } else {
          setError(null);
        }
      }}
    >
      {props.definitionId ? <input type="hidden" name="definitionId" value={props.definitionId} /> : null}
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-zinc-800 sm:col-span-2">
          Name
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={140}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800 sm:col-span-2">
          Description / instructions
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Frequency (text)
          <input
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="e.g. Daily, Weekly — matches unit responsibility cadence"
            maxLength={120}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-end gap-2 text-sm font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border-zinc-300"
          />
          Active (available on Unit Workspace)
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Department (optional)
          <select
            name="departmentId"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Any / facility-wide</option>
            {props.departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Unit / location (optional)
          <select
            name="unitId"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All units (or department-wide)</option>
            {props.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-900">Inspection items</h3>
          <button
            type="button"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
            onClick={() => setItems((current) => [...current, newItem({ label: `Check ${current.length + 1}` })])}
          >
            Add item
          </button>
        </div>

        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={item.key} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Item {index + 1}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => moveItem(index, -1)}
                    disabled={index === 0}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700"
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    disabled={items.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Prompt
                  <input
                    value={item.label}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                      )
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
                  Help text (optional)
                  <input
                    value={item.description}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) => (i === index ? { ...row, description: e.target.value } : row)),
                      )
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-700">
                  Response type
                  <select
                    value={item.responseType}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index
                            ? { ...row, responseType: e.target.value as InspectionResponseType }
                            : row,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    {INSPECTION_RESPONSE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col justify-end gap-2 text-xs font-medium text-zinc-700">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.isRequired}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((row, i) => (i === index ? { ...row, isRequired: e.target.checked } : row)),
                        )
                      }
                      className="size-4 rounded border-zinc-300"
                    />
                    Required
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.failureCreatesFollowUp}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, failureCreatesFollowUp: e.target.checked } : row,
                          ),
                        )
                      }
                      className="size-4 rounded border-zinc-300"
                    />
                    Failure creates follow-up (later)
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-700"
      >
        {props.mode === "create" ? "Create inspection" : "Save changes"}
      </button>
    </form>
  );
}
