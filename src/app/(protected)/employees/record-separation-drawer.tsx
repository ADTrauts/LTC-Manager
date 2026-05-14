"use client";

import { useState } from "react";

import { recordEmployeeSeparationAction } from "@/app/(protected)/employees/actions";
import { Drawer } from "@/components/drawer";

export type SeparationRosterOption = { id: string; firstName: string; lastName: string };

type RecordSeparationDrawerProps = {
  roster: SeparationRosterOption[];
  /** YYYY-MM-DD for default date fields (usually today, server-rendered). */
  defaultDateIso: string;
};

export function RecordSeparationDrawer({ roster, defaultDateIso }: RecordSeparationDrawerProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...roster].sort((a, b) => {
    const ln = a.lastName.localeCompare(b.lastName);
    return ln !== 0 ? ln : a.firstName.localeCompare(b.firstName);
  });

  const emptyRoster = roster.length === 0;

  return (
    <>
      <button
        type="button"
        disabled={emptyRoster}
        title={emptyRoster ? "No active employees on the roster" : undefined}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Record separation
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Record separation">
        <form
          className="space-y-4"
          action={async (formData) => {
            setError(null);
            try {
              await recordEmployeeSeparationAction(formData);
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save separation.");
            }
          }}
        >
          <p className="text-sm text-zinc-600">
            Ends employment for the selected person, adds a row to this log, and sets their roster status to
            Terminated.
          </p>

          <label className="block text-xs text-zinc-600">
            Employee
            <select
              name="employeeId"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Select employee…
              </option>
              {sorted.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.lastName}, {e.firstName}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-600">
              Termination / separation date
              <input
                name="terminationDate"
                type="date"
                required
                defaultValue={defaultDateIso}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-zinc-600">
              Last shift worked
              <input
                name="lastShiftWorked"
                type="date"
                required
                defaultValue={defaultDateIso}
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-zinc-700">Separation type</legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="separationKind" value="RESIGNED" required defaultChecked />
              Resigned (voluntary)
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="separationKind" value="TERMINATED" />
              Terminated (involuntary)
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-zinc-700">Would you rehire this person?</legend>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="wouldRehire" value="yes" required defaultChecked />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input type="radio" name="wouldRehire" value="no" />
              No
            </label>
          </fieldset>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Save separation
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
