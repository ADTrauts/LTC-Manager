import type { ResolvedCurrentAssignment } from "@/lib/scheduling/operational-assignments";

type Props = {
  assignment: ResolvedCurrentAssignment;
};

export function UnitMyAssignmentPanel({ assignment }: Props) {
  const { current, upcoming } = assignment;

  if (!current && !upcoming) {
    return (
      <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-medium text-zinc-500">
          No operational assignment is listed for this period.
        </p>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-zinc-200 bg-white shadow-sm" data-testid="my-assignment-panel">
      {current && (
        <div className="border-b border-zinc-100 px-3 py-2.5">
          <p className="text-xs font-medium text-zinc-500">Your current assignment</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-900">
            {current.roleLabel}
            {current.unitName ? ` — ${current.unitName}` : ""}
          </p>
          {current.operationLabel && (
            <p className="text-xs text-zinc-600">{current.operationLabel}</p>
          )}
          {current.startsAt && current.endsAt && (
            <p className="text-xs text-zinc-500">
              {current.startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–
              {current.endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {current.source !== "MANUAL" && (
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {current.source === "COVERAGE" ? "Coverage assignment" : current.source === "REASSIGNMENT" ? "Reassignment" : current.source.toLowerCase()}
            </span>
          )}
          {current.notes && (
            <p className="mt-1 text-xs italic text-zinc-500">{current.notes}</p>
          )}
        </div>
      )}
      {upcoming && (
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-zinc-400">
            Next: {upcoming.roleLabel}
            {upcoming.unitName ? ` — ${upcoming.unitName}` : ""}
            {upcoming.startsAt
              ? ` at ${upcoming.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : ""}
          </p>
        </div>
      )}
    </article>
  );
}
