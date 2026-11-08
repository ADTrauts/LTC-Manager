"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setWorkOrderResponseRequirementAction } from "@/app/(protected)/repairs/actions";
import { StatusBadge } from "@/components/design-system";
import { WORK_ORDER_RESPONSE_PRIORITY_DISTINCTION } from "@/lib/asset-operations/work-order-semantics";

type Requirement = "STANDARD" | "IMMEDIATE";

type Props = {
  repairId: string;
  departmentId: string | null;
  issueId?: string | null;
  value: Requirement;
  priorityLabel: string;
  editable: boolean;
  readOnlyReason: "role" | "completed" | "cancelled" | "no_department" | null;
};

const CHOICES: Array<{ value: Requirement; label: string; detail: string }> = [
  {
    value: "STANDARD",
    label: "Standard",
    detail: "Uses the normal Work Order assignment and deadline workflow.",
  },
  {
    value: "IMMEDIATE",
    label: "Immediate",
    detail: "Immediate response uses the Department's On-Call Coverage to notify the current responder.",
  },
];

function readOnlyNote(reason: Props["readOnlyReason"]): string | null {
  switch (reason) {
    case "role":
      return "A supervisor who can manage this Work Order can change Response Requirement.";
    case "completed":
      return "This completed Work Order keeps its Response Requirement.";
    case "cancelled":
      return "This cancelled Work Order keeps its Response Requirement.";
    case "no_department":
      return "This Work Order has no responsible Department, so Response Requirement cannot be changed here.";
    default:
      return null;
  }
}

export function WorkOrderResponseRequirementControl({
  repairId,
  departmentId,
  issueId,
  value,
  priorityLabel,
  editable,
  readOnlyReason,
}: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<Requirement>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = editable && choice !== value;
  const note = readOnlyNote(readOnlyReason);

  function save() {
    if (!dirty || !departmentId || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("repairId", repairId);
        formData.set("departmentId", departmentId);
        formData.set("responseRequirement", choice);
        if (issueId) formData.set("issueId", issueId);
        await setWorkOrderResponseRequirementAction(formData);
        router.refresh();
      } catch {
        setChoice(value);
        setError("Response Requirement could not be saved.");
      }
    });
  }

  return (
    <div className="sm:col-span-2 space-y-3" data-testid="work-order-response-requirement">
      <p className="text-sm text-zinc-700" data-testid="work-order-priority-distinction">
        <span className="font-medium text-zinc-900">Priority: {priorityLabel}.</span>{" "}
        {WORK_ORDER_RESPONSE_PRIORITY_DISTINCTION}
      </p>
      <fieldset disabled={!editable || pending} className="space-y-2 disabled:opacity-80">
        <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Response Requirement
        </legend>
        {CHOICES.map((option) => {
          const selected = choice === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
                selected ? "border-zinc-400 bg-zinc-50" : "border-zinc-200 bg-white"
              } ${editable ? "" : "cursor-default"}`}
            >
              <input
                type="radio"
                name="responseRequirement"
                value={option.value}
                checked={selected}
                disabled={!editable || pending}
                onChange={() => setChoice(option.value)}
                className="mt-1 size-4"
                data-testid={`response-requirement-${option.value.toLowerCase()}`}
              />
              <span>
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-900">
                  {option.label}
                  {option.value === "IMMEDIATE" && value === "IMMEDIATE" ? (
                    <StatusBadge variant="warning">Immediate</StatusBadge>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-zinc-600">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {dirty ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-700" data-testid="response-requirement-consequence">
            {choice === "IMMEDIATE"
              ? "This Work Order will require immediate operational response. On-Call Coverage for this Department is notified. Priority, deadline, and assignee stay as they are."
              : "The current immediate-response attention will end. The Work Order will remain open."}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            data-testid="response-requirement-save"
          >
            {pending
              ? "Saving…"
              : choice === "IMMEDIATE"
                ? "Set Immediate response"
                : "Return to Standard response"}
          </button>
        </div>
      ) : null}
      {note ? (
        <p className="text-sm text-zinc-600" data-testid="response-requirement-readonly">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-zinc-800" role="alert" data-testid="response-requirement-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
