"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RepairStatus } from "@prisma/client";

import {
  addIssueUpdateAction,
  assignIssueAction,
  closeIssueAction,
  markIssueWaitingAction,
  reopenIssueAction,
  startIssueWorkAction,
} from "@/app/(protected)/issues/actions";

type EmployeeOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string };

type IssueDetailActionsProps = {
  issueId: string;
  status: RepairStatus;
  assignedEmployeeId: string | null;
  responsibleDepartmentId: string | null;
  employees: EmployeeOption[];
  departments: DepartmentOption[];
  canMutate: boolean;
};

const STATUS_OPTIONS: Array<{ value: RepairStatus; label: string }> = [
  { value: "OPEN", label: "Reported / open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_PARTS", label: "Waiting" },
  { value: "CLOSED", label: "Resolved" },
];

export function IssueDetailActions({
  issueId,
  status,
  assignedEmployeeId,
  responsibleDepartmentId,
  employees,
  departments,
  canMutate,
}: IssueDetailActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateText, setUpdateText] = useState("");
  const [statusAfterUpdate, setStatusAfterUpdate] = useState<RepairStatus>(status);
  const [assigneeId, setAssigneeId] = useState(assignedEmployeeId ?? "");
  const [departmentId, setDepartmentId] = useState(responsibleDepartmentId ?? "");

  if (!canMutate) {
    return (
      <p className="text-sm text-zinc-600">
        You can view this issue. Ask a supervisor to assign or update recovery.
      </p>
    );
  }

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      setUpdateText("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-testid="issue-detail-actions">
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">Assign</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm text-zinc-700">
            Person
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Unassigned</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Responsible department
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Keep current</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("issueId", issueId);
            if (assigneeId) formData.set("assignedEmployeeId", assigneeId);
            if (departmentId) formData.set("responsibleDepartmentId", departmentId);
            run(() => assignIssueAction(formData));
          }}
        >
          Save assignment
        </button>
      </div>

      {status !== "CLOSED" ? (
        <div className="flex flex-wrap gap-2">
          {status !== "IN_PROGRESS" ? (
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              onClick={() => {
                const formData = new FormData();
                formData.set("issueId", issueId);
                run(() => startIssueWorkAction(formData));
              }}
            >
              Start work
            </button>
          ) : null}
          {status !== "WAITING_PARTS" ? (
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 disabled:opacity-60"
              onClick={() => {
                const formData = new FormData();
                formData.set("issueId", issueId);
                run(() => markIssueWaitingAction(formData));
              }}
            >
              Mark waiting
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-900 disabled:opacity-60"
            onClick={() => {
              const formData = new FormData();
              formData.set("issueId", issueId);
              run(() => closeIssueAction(formData));
            }}
          >
            Mark resolved
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950 disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("issueId", issueId);
            run(() => reopenIssueAction(formData));
          }}
        >
          Reopen issue
        </button>
      )}

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <h3 className="text-sm font-semibold text-zinc-900">Add update</h3>
        <label className="block text-sm text-zinc-700">
          Note
          <textarea
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            rows={3}
            minLength={2}
            maxLength={1000}
            placeholder="What changed?"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm text-zinc-700">
          Status after update
          <select
            value={statusAfterUpdate}
            onChange={(e) => setStatusAfterUpdate(e.target.value as RepairStatus)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={pending || updateText.trim().length < 2}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => {
            const formData = new FormData();
            formData.set("issueId", issueId);
            formData.set("updateText", updateText.trim());
            formData.set("statusAfterUpdate", statusAfterUpdate);
            run(() => addIssueUpdateAction(formData));
          }}
        >
          Save update
        </button>
      </div>
    </div>
  );
}
