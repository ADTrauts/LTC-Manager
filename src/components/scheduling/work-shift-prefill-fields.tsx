"use client";

import { useState } from "react";

export type WorkShiftSelectOption = {
  id: string;
  name: string;
  startLocal: string;
  endLocal: string;
};

/**
 * Minimal WorkShift quick-select that prefills start/end inputs.
 * Copied times become the date-specific Shift values on submit.
 */
export function WorkShiftPrefillFields({
  workShifts,
  initialStart = "",
  initialEnd = "",
}: {
  workShifts: WorkShiftSelectOption[];
  initialStart?: string;
  initialEnd?: string;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [workShiftId, setWorkShiftId] = useState("");

  function applyPattern(id: string) {
    setWorkShiftId(id);
    const pattern = workShifts.find((w) => w.id === id);
    if (!pattern) return;
    setStart(pattern.startLocal);
    setEnd(pattern.endLocal);
  }

  return (
    <div className="space-y-2">
      {workShifts.length > 0 ? (
        <select
          name="workShiftId"
          value={workShiftId}
          onChange={(e) => applyPattern(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          data-testid="workshift-select"
        >
          <option value="">Shift pattern (optional)…</option>
          {workShifts.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} · {w.startLocal}–{w.endLocal}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="workShiftId" value="" />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-zinc-600">
          Start
          <input
            type="time"
            name="plannedStart"
            required={!workShiftId}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setWorkShiftId("");
            }}
            className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            data-testid="shift-start-input"
          />
        </label>
        <label className="block text-xs text-zinc-600">
          End
          <input
            type="time"
            name="plannedEnd"
            required={!workShiftId}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setWorkShiftId("");
            }}
            className="mt-0.5 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            data-testid="shift-end-input"
          />
        </label>
      </div>
      <p className="text-xs text-zinc-500">
        Overnight shifts are supported (for example 11:00 PM–7:00 AM). End at or before start means the next day.
      </p>
    </div>
  );
}
