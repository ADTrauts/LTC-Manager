"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeWorkRequirementAction } from "@/app/(protected)/staffing/work-plans/work-runtime-actions";

type Props = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  occurrenceKey: string;
};

export function TodaysWorkConfirmWorkButton({
  facilityId,
  departmentId,
  unitId,
  occurrenceKey,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        data-testid="todays-work-confirm-work"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await completeWorkRequirementAction({
                facilityId,
                departmentId,
                unitId,
                occurrenceKey,
              });
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not confirm work.");
            }
          });
        }}
      >
        Confirm complete
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
