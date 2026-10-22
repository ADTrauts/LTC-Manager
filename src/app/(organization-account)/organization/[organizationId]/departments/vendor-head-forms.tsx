"use client";

import { useActionState } from "react";

import {
  acceptVendorHeadAction,
  assignVendorHeadAction,
  declineVendorHeadAction,
  moveVendorStaffAction,
  type VendorHeadActionResult,
} from "@/app/(organization-account)/organization/vendor-head-actions";

function Message({ state }: { state: VendorHeadActionResult | null }) {
  if (!state) return null;
  return (
    <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
      {state.message}
    </p>
  );
}

export function AssignVendorHeadForm({
  organizationId,
  departmentId,
  members,
}: {
  organizationId: string;
  departmentId: string;
  members: Array<{ userId: string; displayName: string; email: string }>;
}) {
  const [state, action, pending] = useActionState<VendorHeadActionResult | null, FormData>(
    assignVendorHeadAction.bind(null, organizationId),
    null,
  );
  return (
    <form action={action} className="mt-3 space-y-2" data-testid="assign-vendor-head-form">
      <input type="hidden" name="departmentId" value={departmentId} />
      <label className="block text-sm text-zinc-700">
        Head
        <select
          name="assigneeUserId"
          className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Choose a member
          </option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName} ({member.email})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Name head"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function MoveVendorStaffForm({
  organizationId,
  departmentId,
}: {
  organizationId: string;
  departmentId: string;
}) {
  const [state, action, pending] = useActionState<VendorHeadActionResult | null, FormData>(
    moveVendorStaffAction.bind(null, organizationId),
    null,
  );
  return (
    <form action={action} className="mt-3" data-testid="move-vendor-staff-form">
      <input type="hidden" name="departmentId" value={departmentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
      >
        {pending ? "Moving…" : "Move staff accounts"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function AnswerVendorHeadForm({
  organizationId,
  assignmentId,
}: {
  organizationId: string;
  assignmentId: string;
}) {
  const [acceptState, accept, acceptPending] = useActionState<VendorHeadActionResult | null, FormData>(
    acceptVendorHeadAction.bind(null, organizationId),
    null,
  );
  const [declineState, decline, declinePending] = useActionState<VendorHeadActionResult | null, FormData>(
    declineVendorHeadAction.bind(null, organizationId),
    null,
  );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="answer-vendor-head">
      <form action={accept}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <button
          type="submit"
          disabled={acceptPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          Accept
        </button>
      </form>
      <form action={decline}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <button
          type="submit"
          disabled={declinePending}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          Decline
        </button>
      </form>
      <Message state={acceptState ?? declineState} />
    </div>
  );
}
