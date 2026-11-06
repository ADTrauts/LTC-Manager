"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createOneOffWorkAction } from "@/app/(protected)/staffing/operations/work-actions";

type Props = {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
  units: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; displayName: string }>;
};

/**
 * Supervisor one-off Work create UI — mutations go through occurrence-service only.
 */
export function SupervisorOneOffWorkForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [unitId, setUnitId] = useState(props.units[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assignedEmployeeId, setAssignedEmployeeId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-md border p-4"
      data-testid="supervisor-one-off-work-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        startTransition(async () => {
          try {
            const result = await createOneOffWorkAction({
              work: {
                facilityId: props.facilityId,
                departmentId: props.departmentId,
                operationalDate: props.operationalDate,
                unitId,
                title,
                instructions,
                assignedEmployeeId: assignedEmployeeId || null,
              },
            });
            setMessage(`Created one-off work ${result.occurrenceId}`);
            setTitle("");
            setInstructions("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      }}
    >
      <h3 className="text-sm font-semibold">Create one-off Work</h3>
      <label className="block text-xs">
        Unit
        <select
          className="mt-1 w-full rounded-md border px-2 py-1.5"
          data-testid="one-off-unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          required
        >
          {props.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        Title
        <input
          className="mt-1 w-full rounded-md border px-2 py-1.5"
          data-testid="one-off-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label className="block text-xs">
        Instructions
        <textarea
          className="mt-1 w-full rounded-md border px-2 py-1.5"
          data-testid="one-off-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        Assign employee (optional)
        <select
          className="mt-1 w-full rounded-md border px-2 py-1.5"
          data-testid="one-off-employee"
          value={assignedEmployeeId}
          onChange={(e) => setAssignedEmployeeId(e.target.value)}
        >
          <option value="">Unit shared</option>
          {props.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.displayName}
            </option>
          ))}
        </select>
      </label>
      {message ? (
        <p className="text-xs text-emerald-700" data-testid="one-off-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700" data-testid="one-off-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white"
        data-testid="one-off-submit"
        disabled={pending || !unitId || !title.trim()}
      >
        Create one-off
      </button>
    </form>
  );
}
