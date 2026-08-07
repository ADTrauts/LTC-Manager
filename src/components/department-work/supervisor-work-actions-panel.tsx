"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createOneOffWorkAction,
  markWorkNotRequiredAction,
  reopenWorkOccurrenceAction,
} from "@/app/(protected)/staffing/work-plans/work-runtime-actions";

type UnitOption = { id: string; name: string };

type Props = {
  facilityId: string;
  departmentId: string;
  units: UnitOption[];
  focusOccurrenceKey?: string | null;
  focusUnitId?: string | null;
};

export function SupervisorWorkActionsPanel({
  facilityId,
  departmentId,
  units,
  focusOccurrenceKey = null,
  focusUnitId = null,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unitId, setUnitId] = useState(focusUnitId ?? units[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [occurrenceKey, setOccurrenceKey] = useState(focusOccurrenceKey ?? "");
  const [notRequiredReason, setNotRequiredReason] = useState("");

  function run(action: () => Promise<void>, ok: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(ok);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      data-testid="supervisor-work-actions"
    >
      <h2 className="text-sm font-semibold text-zinc-900">Work actions</h2>
      <p className="text-xs text-zinc-600">
        Create one-off Work, mark Not Required, or reopen. Viewing a Procedure never completes Work.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Unit
          <select
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            data-testid="one-off-work-unit"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={pending}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          One-off title
          <input
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            data-testid="one-off-work-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
          />
        </label>
      </div>
      <label className="block text-xs font-medium">
        Instructions
        <textarea
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          data-testid="one-off-work-instructions"
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={pending}
        />
      </label>
      <button
        type="button"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        data-testid="create-one-off-work"
        disabled={pending || !unitId || !title.trim()}
        onClick={() =>
          run(async () => {
            await createOneOffWorkAction({
              facilityId,
              departmentId,
              unitId,
              title: title.trim(),
              instructions: instructions.trim() || null,
            });
            setTitle("");
            setInstructions("");
          }, "One-off Work created.")
        }
      >
        Create one-off Work
      </button>

      <div className="border-t border-zinc-100 pt-3">
        <label className="block text-xs font-medium">
          Occurrence key
          <input
            className="mt-1 w-full rounded-md border px-2 py-1.5 font-mono text-xs"
            data-testid="work-occurrence-key"
            value={occurrenceKey}
            onChange={(e) => setOccurrenceKey(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="mt-2 block text-xs font-medium">
          Not Required reason
          <input
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            data-testid="work-not-required-reason"
            value={notRequiredReason}
            onChange={(e) => setNotRequiredReason(e.target.value)}
            disabled={pending}
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            data-testid="mark-work-not-required"
            disabled={pending || !occurrenceKey.trim() || !notRequiredReason.trim()}
            onClick={() =>
              run(async () => {
                await markWorkNotRequiredAction({
                  facilityId,
                  departmentId,
                  unitId: unitId || null,
                  occurrenceKey: occurrenceKey.trim(),
                  reason: notRequiredReason.trim(),
                });
              }, "Marked Not Required.")
            }
          >
            Not Required
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            data-testid="reopen-work"
            disabled={pending || !occurrenceKey.trim()}
            onClick={() =>
              run(async () => {
                await reopenWorkOccurrenceAction({
                  facilityId,
                  departmentId,
                  unitId: unitId || null,
                  occurrenceKey: occurrenceKey.trim(),
                });
              }, "Work reopened.")
            }
          >
            Reopen
          </button>
        </div>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700" data-testid="supervisor-work-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" data-testid="supervisor-work-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
