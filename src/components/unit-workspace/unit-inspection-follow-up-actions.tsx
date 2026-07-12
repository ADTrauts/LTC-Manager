"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateInspectionFollowUpTaskAction } from "@/app/(protected)/unit/[unitId]/actions";

type UnitInspectionFollowUpActionsProps = {
  unitId: string;
  task: {
    id: string;
    title: string;
    status: "OPEN" | "IN_PROGRESS";
    description: string | null;
  };
};

export function UnitInspectionFollowUpActions({ unitId, task }: UnitInspectionFollowUpActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    const formData = new FormData();
    formData.set("unitId", unitId);
    formData.set("taskId", task.id);
    formData.set("status", status);
    startTransition(async () => {
      const result = await updateInspectionFollowUpTaskAction(formData);
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      router.push(`/unit/${unitId}?unitTab=overview`);
      router.refresh();
    });
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
      data-testid="inspection-follow-up-actions"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Follow-up needed from inspection
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900">{task.title}</h2>
        {task.description ? (
          <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{task.description}</pre>
        ) : null}
        <p className="mt-2 text-sm text-zinc-600">
          {task.status === "IN_PROGRESS" ? "Corrective work is in progress." : "Open corrective work."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {task.status === "OPEN" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run("IN_PROGRESS")}
            className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
          >
            Start work
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => run("COMPLETED")}
          className="inline-flex min-h-11 items-center rounded-md border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
        >
          Mark complete
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("CANCELLED")}
          className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 touch-manipulation disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
