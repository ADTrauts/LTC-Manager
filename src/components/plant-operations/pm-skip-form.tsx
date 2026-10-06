"use client";

import { useActionState } from "react";

import { Button } from "@/components/design-system/Button";
import { TextArea } from "@/components/design-system/Field";
import { WAIVE_REASON_MIN_LENGTH } from "@/lib/asset-operations/work-order-closeout-gate";
import {
  skipPmOccurrenceAction,
  type PmRunActionState,
} from "@/app/(protected)/preventive-maintenance/actions";

export function PmSkipForm({
  occurrenceId,
  blockedReason,
}: {
  occurrenceId: string;
  blockedReason: string | null;
}) {
  const bound = skipPmOccurrenceAction.bind(null, occurrenceId);
  const [state, action] = useActionState(bound, null as PmRunActionState | null);

  if (blockedReason) {
    return (
      <p className="text-sm text-zinc-700" data-testid="pm-skip-blocked">
        {blockedReason}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3" data-testid="pm-skip-form">
      <p className="text-sm text-zinc-600">
        This skips only this scheduled maintenance occurrence. Future schedule dates will not
        change.
      </p>
      <TextArea
        label="Skip reason"
        name="reason"
        required
        minLength={WAIVE_REASON_MIN_LENGTH}
        data-testid="pm-skip-reason"
      />
      {state?.ok === false ? (
        <p className="text-sm text-red-700" role="alert" data-testid="pm-skip-error">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" data-testid="pm-skip-confirm">
        Skip this occurrence
      </Button>
    </form>
  );
}
