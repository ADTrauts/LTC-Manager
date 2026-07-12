"use client";

import { useMemo, useState } from "react";

import { INSPECTION_RESPONSE_TYPE_OPTIONS } from "@/lib/work/inspections/list-unit-inspections";
import { buildInspectionScheduleSummary } from "@/lib/work/inspections/inspection-cadence";
import type { InspectionCadenceType, InspectionResponseType } from "@prisma/client";

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
  initialCadenceType?: InspectionCadenceType;
  initialDueTimeLocal?: string | null;
  initialDaysOfWeek?: number[];
  initialDayOfMonth?: number | null;
  initialDepartmentId?: string;
  initialUnitId?: string;
  initialIsActive?: boolean;
  initialItems?: EditorItem[];
  departments: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string }>;
};

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

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
  const [cadenceType, setCadenceType] = useState<InspectionCadenceType>(
    props.initialCadenceType ?? "ON_DEMAND",
  );
  const [dueTimeLocal, setDueTimeLocal] = useState(props.initialDueTimeLocal ?? "09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(props.initialDaysOfWeek ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(String(props.initialDayOfMonth ?? 1));
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

  const scheduleSummary = buildInspectionScheduleSummary({
    cadenceType,
    dueTimeLocal: cadenceType === "ON_DEMAND" ? null : dueTimeLocal,
    daysOfWeek,
    dayOfMonth: Number(dayOfMonth) || 1,
  });

  function toggleWeekday(day: number) {
    setDaysOfWeek((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort(),
    );
  }

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
          Schedule
          <select
            name="cadenceType"
            value={cadenceType}
            onChange={(e) => setCadenceType(e.target.value as InspectionCadenceType)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="ON_DEMAND">On demand</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
          <span className="mt-1 block text-xs font-normal text-zinc-500">{scheduleSummary}</span>
        </label>
        {cadenceType !== "ON_DEMAND" ? (
          <label className="block text-sm font-medium text-zinc-800">
            Due time (facility local)
            <input
              name="dueTimeLocal"
              type="time"
              value={dueTimeLocal}
              onChange={(e) => setDueTimeLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        ) : (
          <input type="hidden" name="dueTimeLocal" value="" />
        )}
        {cadenceType === "WEEKLY" ? (
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-zinc-800">Weekdays</p>
            <input type="hidden" name="daysOfWeekJson" value={JSON.stringify(daysOfWeek)} />
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => (
                <label
                  key={day.value}
                  className={`inline-flex min-h-10 cursor-pointer items-center rounded-md border px-3 text-sm ${
                    daysOfWeek.includes(day.value)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={daysOfWeek.includes(day.value)}
                    onChange={() => toggleWeekday(day.value)}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <input type="hidden" name="daysOfWeekJson" value="[]" />
        )}
        {cadenceType === "MONTHLY" ? (
          <label className="block text-sm font-medium text-zinc-800">
            Day of month
            <input
              name="dayOfMonth"
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        ) : (
          <input type="hidden" name="dayOfMonth" value="" />
        )}
        <label className="block text-sm font-medium text-zinc-800">
          Frequency notes (optional)
          <input
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="Optional note — structured schedule above is authoritative"
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
