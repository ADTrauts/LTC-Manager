"use client";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { discardAllCycleDraftsAction } from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";

type Props = {
  departmentId: string;
  /** Stronger confirm copy when discarding real changes. */
  hasChanges?: boolean;
  className?: string;
  label?: string;
};

export function DiscardAllDraftsButton({
  departmentId,
  hasChanges = false,
  className,
  label = "Discard draft",
}: Props) {
  return (
    <DepartmentAdminActionForm action={discardAllCycleDraftsAction} className={className}>
      <input type="hidden" name="departmentId" value={departmentId} />
      <button
        type="submit"
        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
        data-testid="discard-all-drafts"
        onClick={(event) => {
          const message = hasChanges
            ? "Discard all draft changes?\n\nUnpublished draft cycles for this Department will be removed. Current configuration is unchanged."
            : "Discard draft?\n\nThis draft matches Current and will be removed. Current configuration is unchanged.";
          if (!window.confirm(message)) {
            event.preventDefault();
          }
        }}
      >
        {label}
      </button>
    </DepartmentAdminActionForm>
  );
}
