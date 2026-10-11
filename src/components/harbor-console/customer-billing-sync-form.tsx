"use client";

import { useActionState } from "react";

import {
  syncCustomerBillingFromStripeAction,
  type ConsoleSyncFromStripeState,
} from "@/app/console/(staff)/customers/actions";
import { SupportSubmitButton } from "@/components/harbor-console/support-submit-button";

export function CustomerBillingSyncForm({ facilityId }: { facilityId: string }) {
  const [state, action] = useActionState<ConsoleSyncFromStripeState, FormData>(
    syncCustomerBillingFromStripeAction,
    null,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="facilityId" value={facilityId} />
      <SupportSubmitButton pendingLabel="Syncing…" variant="secondary">
        Sync from Stripe
      </SupportSubmitButton>
      {state ? (
        <p
          className={`text-sm ${state.ok ? "text-[var(--text-secondary)]" : "text-red-700"}`}
          data-testid="console-billing-sync-result"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
