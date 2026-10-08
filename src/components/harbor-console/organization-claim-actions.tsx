"use client";

import { useState, useTransition } from "react";

import {
  approveOrganizationClaimAction,
  rejectOrganizationClaimAction,
  resendOrganizationClaimAction,
  revokeOrganizationClaimAction,
  type HarborClaimActionResult,
} from "@/app/console/(staff)/organization-claims/actions";

export function HarborOrganizationClaimActions({
  claimId,
  status,
  displayStatus,
  deliveryStatus,
}: {
  claimId: string;
  status: string;
  displayStatus: string;
  deliveryStatus: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<HarborClaimActionResult | null>(null);

  function run(action: (formData: FormData) => Promise<HarborClaimActionResult>) {
    const formData = new FormData();
    formData.set("claimId", claimId);
    startTransition(async () => {
      setResult(await action(formData));
    });
  }

  const showResend =
    status === "APPROVED" &&
    displayStatus !== "EXPIRED" &&
    (deliveryStatus === "FAILED" ||
      deliveryStatus === "NOT_CONFIGURED" ||
      deliveryStatus === "SENT" ||
      deliveryStatus == null);

  return (
    <div className="space-y-2" data-testid={`harbor-claim-actions-${claimId}`}>
      <div className="flex flex-wrap gap-2">
        {status === "REQUESTED" ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(approveOrganizationClaimAction)}
              className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(rejectOrganizationClaimAction)}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        ) : null}
        {status === "APPROVED" && displayStatus !== "EXPIRED" ? (
          <>
            {showResend ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(resendOrganizationClaimAction)}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-60"
              >
                Resend invitation
              </button>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(revokeOrganizationClaimAction)}
              className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-800 disabled:opacity-60"
            >
              Revoke invitation
            </button>
          </>
        ) : null}
      </div>
      {result ? (
        <p
          className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`}
          role="status"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
