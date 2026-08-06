"use client";

import { useFormStatus } from "react-dom";

import { resolveOfflineConflictAction } from "@/app/(protected)/unit/[unitId]/offline-actions";

type ConflictRow = {
  clientCommandId: string;
  conflictCategory: string | null;
  mealType: string;
  commandType: string;
  occurredAt: string;
};

function ConflictButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-9 rounded-md border border-zinc-300 px-2 text-xs font-semibold disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function OfflineConflictReview({
  unitId,
  conflicts,
}: {
  unitId: string;
  conflicts: ConflictRow[];
}) {
  if (conflicts.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
      data-testid="offline-conflict-review"
    >
      <p className="font-semibold">Conflict review required</p>
      <p className="mt-1 text-xs text-amber-900">
        A supervisor or manager must resolve these offline conflicts (milestones or evidence). Both
        histories are preserved. Purely local pending commands are not visible here until the tablet
        has synchronized a receipt or conflict.
      </p>
      <ul className="mt-3 space-y-2">
        {conflicts.map((c) => (
          <li key={c.clientCommandId} className="rounded-lg border border-amber-200 bg-white p-2">
            <p className="text-xs font-semibold">
              {c.commandType} · {c.mealType} · {new Date(c.occurredAt).toLocaleString()}
            </p>
            <p className="text-xs text-zinc-600">{c.conflictCategory ?? "CONFLICT"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <form action={resolveOfflineConflictAction}>
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="clientCommandId" value={c.clientCommandId} />
                <input type="hidden" name="resolution" value="MARKED_DUPLICATE" />
                <ConflictButton label="Mark duplicate" />
              </form>
              <form action={resolveOfflineConflictAction}>
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="clientCommandId" value={c.clientCommandId} />
                <input type="hidden" name="resolution" value="REJECTED_WITH_REASON" />
                <input type="hidden" name="reason" value="Rejected during offline conflict review" />
                <ConflictButton label="Reject with reason" />
              </form>
              <form action={resolveOfflineConflictAction}>
                <input type="hidden" name="unitId" value={unitId} />
                <input type="hidden" name="clientCommandId" value={c.clientCommandId} />
                <input type="hidden" name="resolution" value="APPLIED_AS_CORRECTION" />
                <input type="hidden" name="reason" value="Applied as correction during offline conflict review" />
                <input type="hidden" name="occurredAt" value={c.occurredAt} />
                <ConflictButton label="Apply as correction" />
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
