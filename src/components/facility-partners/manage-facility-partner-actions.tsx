"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  activateFacilityPartnerAction,
  addPartnerDepartmentScopeAction,
  endFacilityPartnerAction,
  removePartnerDepartmentScopeAction,
  resumeFacilityPartnerAction,
  suspendFacilityPartnerAction,
} from "@/app/(protected)/admin/organization/partners/actions";
import type { FacilityPartnerLifecycleState } from "@/lib/partner-access";

type DeptOption = { id: string; name: string };

type Props = {
  partnershipId: string;
  lifecycleState: FacilityPartnerLifecycleState;
  currentScopeDepartmentIds: string[];
  operableDepartments: DeptOption[];
  suggestedDepartments: DeptOption[];
};

export function ManageFacilityPartnerActions({
  partnershipId,
  lifecycleState,
  currentScopeDepartmentIds,
  operableDepartments,
  suggestedDepartments,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run(
    action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>,
    formData: FormData,
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.message ?? "Update failed.");
        return;
      }
      setMessage(result.message ?? "Updated.");
      router.refresh();
    });
  }

  const addable = operableDepartments.filter(
    (dept) => !currentScopeDepartmentIds.includes(dept.id),
  );

  return (
    <div className="space-y-6" data-testid="manage-facility-partner-actions">
      {lifecycleState !== "ENDED" ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">Authorization</h3>
          <div className="flex flex-wrap gap-2">
            {lifecycleState === "PENDING" || lifecycleState === "SUSPENDED" ? (
              <form
                action={(fd) =>
                  run(
                    lifecycleState === "PENDING"
                      ? activateFacilityPartnerAction
                      : resumeFacilityPartnerAction,
                    fd,
                  )
                }
              >
                <input type="hidden" name="partnershipId" value={partnershipId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {lifecycleState === "PENDING" ? "Activate now" : "Resume"}
                </button>
              </form>
            ) : null}
            {lifecycleState === "ACTIVE" ? (
              <form action={(fd) => run(suspendFacilityPartnerAction, fd)}>
                <input type="hidden" name="partnershipId" value={partnershipId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 disabled:opacity-50"
                >
                  Suspend
                </button>
              </form>
            ) : null}
            <form action={(fd) => run(endFacilityPartnerAction, fd)}>
              <input type="hidden" name="partnershipId" value={partnershipId} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 disabled:opacity-50"
              >
                End partnership
              </button>
            </form>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-600">
          This partnership has ended. History is preserved; it cannot be reactivated in Phase 2A.
        </p>
      )}

      {lifecycleState !== "ENDED" ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-900">Department authorization scope</h3>
          <p className="text-xs text-zinc-500">
            Explicit save required. Operating relationships never auto-create scope.
          </p>

          {suggestedDepartments.length > 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <p className="font-medium text-zinc-900">
                Suggested from current operating relationships
              </p>
              <ul className="mt-1 list-disc pl-5">
                {suggestedDepartments.map((dept) => (
                  <li key={dept.id}>{dept.name}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-zinc-500">Informational only — not authorization.</p>
            </div>
          ) : null}

          {addable.length > 0 ? (
            <form action={(fd) => run(addPartnerDepartmentScopeAction, fd)} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="partnershipId" value={partnershipId} />
              <label className="text-sm">
                <span className="font-medium text-zinc-700">Add Department</span>
                <select
                  name="departmentId"
                  className="mt-1 block rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {addable.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Authorize
              </button>
            </form>
          ) : (
            <p className="text-sm text-zinc-500">No additional operable Departments to authorize.</p>
          )}

          {currentScopeDepartmentIds.length > 0 ? (
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {operableDepartments
                .filter((dept) => currentScopeDepartmentIds.includes(dept.id))
                .map((dept) => (
                  <li
                    key={dept.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-zinc-900">{dept.name}</span>
                    <form action={(fd) => run(removePartnerDepartmentScopeAction, fd)}>
                      <input type="hidden" name="partnershipId" value={partnershipId} />
                      <input type="hidden" name="departmentId" value={dept.id} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="text-xs font-medium text-zinc-700 underline underline-offset-2 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}
