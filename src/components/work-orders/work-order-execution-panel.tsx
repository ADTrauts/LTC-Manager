"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addWorkOrderNoteAction,
  assignWorkOrderAction,
  completeWorkOrderAction,
  holdWorkOrderAction,
  linkEvidenceToWorkOrderAction,
  resumeWorkOrderAction,
  startWorkOrderAction,
} from "@/app/(protected)/repairs/actions";

type Props = {
  repairId: string;
  departmentId: string;
  issueId?: string | null;
  status: string;
  canExecute: boolean;
  canAssign: boolean;
  employees: Array<{ id: string; name: string }>;
  assignedEmployeeId: string | null;
};

const HOLD_REASONS = [
  ["WAITING_FOR_PART", "Waiting for part"],
  ["WAITING_FOR_VENDOR", "Waiting for vendor"],
  ["WAITING_FOR_ACCESS", "Waiting for access"],
  ["SCHEDULED_LATER", "Scheduled later"],
  ["OTHER", "Other"],
] as const;

export function WorkOrderExecutionPanel({
  repairId,
  departmentId,
  issueId,
  status,
  canExecute,
  canAssign,
  employees,
  assignedEmployeeId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [holdReason, setHoldReason] = useState("WAITING_FOR_PART");
  const [assigneeId, setAssigneeId] = useState(assignedEmployeeId ?? "");

  function hiddenFields(fd: FormData) {
    fd.set("repairId", repairId);
    fd.set("departmentId", departmentId);
    if (issueId) fd.set("issueId", issueId);
    if (note) fd.set("note", note);
  }

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setNote("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <section className="space-y-3" data-testid="work-order-execution">
      <h2 className="text-lg font-semibold text-zinc-900">Work Order actions</h2>
      {canAssign ? (
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            data-testid="wo-assign-select"
          >
            <option value="">Unassigned</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            onClick={() =>
              run(async () => {
                const fd = new FormData();
                hiddenFields(fd);
                fd.set("assignedEmployeeId", assigneeId);
                await assignWorkOrderAction(fd);
              })
            }
            data-testid="wo-assign"
          >
            Assign
          </button>
        </div>
      ) : null}

      {canExecute ? (
        <>
          <textarea
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Update / note"
            data-testid="wo-note"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || status === "COMPLETED"}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  hiddenFields(fd);
                  await startWorkOrderAction(fd);
                })
              }
              data-testid="wo-start"
            >
              Start
            </button>
            <select
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              data-testid="wo-hold-reason"
            >
              {HOLD_REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  hiddenFields(fd);
                  fd.set("holdReason", holdReason);
                  await holdWorkOrderAction(fd);
                })
              }
              data-testid="wo-hold"
            >
              Hold
            </button>
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  hiddenFields(fd);
                  await resumeWorkOrderAction(fd);
                })
              }
              data-testid="wo-resume"
            >
              Resume
            </button>
            <button
              type="button"
              disabled={pending || !note.trim()}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  hiddenFields(fd);
                  await addWorkOrderNoteAction(fd);
                })
              }
              data-testid="wo-add-note"
            >
              Add update
            </button>
            <button
              type="button"
              disabled={pending || status === "COMPLETED"}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  const fd = new FormData();
                  hiddenFields(fd);
                  if (note) fd.set("resolution", note);
                  await completeWorkOrderAction(fd);
                })
              }
              data-testid="wo-complete"
            >
              Complete
            </button>
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              hiddenFields(fd);
              run(() => linkEvidenceToWorkOrderAction(fd));
            }}
          >
            <input
              name="evidenceRecordId"
              placeholder="Link Record ID"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="wo-evidence-id"
            />
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              Link evidence
            </button>
          </form>
        </>
      ) : (
        <p className="text-sm text-zinc-600">You can view this Work Order. Assigned technicians execute the work.</p>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </section>
  );
}
