"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { departmentContextPresentation } from "@/lib/department-context";
import { AppIcons } from "@/lib/design-system";

type Dept = { id: string; name: string };

type Props = {
  /** Department contexts actually available to the current user (drives progressive display). */
  departments: Dept[];
  /** Resolved scoped department id, or null when FA is in full (all-departments) mode. */
  selectedDepartmentId: string | null;
  isFacilityAdministrator: boolean;
};

const CONTEXT_HINT = "The department context your navigation is showing. It is a lens, not access.";

/**
 * Department context control (a lens on navigation — never authorization).
 *
 * Progressive by design: when the user has a single available department it renders as a compact,
 * non-interactive identity chip rather than a dropdown that cannot switch anything. When several
 * department contexts are available it renders the selector. This is presentation only; the server
 * continues to authorize every request regardless of what is shown here.
 */
export function DepartmentScopeSwitcher({
  departments,
  selectedDepartmentId,
  isFacilityAdministrator,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const DeptIcon = AppIcons.facility;
  const presentation = departmentContextPresentation(departments.length);

  if (presentation === "hidden") {
    return null;
  }

  // Single available department → compact identity, no dropdown.
  if (presentation === "compact") {
    const only = departments[0];
    return (
      <div
        className="flex w-[8.75rem] shrink-0 flex-col justify-center gap-0.5 sm:w-[9.5rem] lg:w-[10.5rem]"
        data-testid="department-context"
        data-department-context="single"
      >
        <span className="sr-only lg:not-sr-only lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.12em] lg:text-zinc-500">
          Department
        </span>
        <div
          className="flex min-h-10 items-center gap-1.5 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 px-2 text-sm text-zinc-800"
          title={`Department context: ${only?.name ?? ""}`}
        >
          <DeptIcon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate font-medium">{only?.name}</span>
        </div>
      </div>
    );
  }

  const selectValue =
    selectedDepartmentId === null && isFacilityAdministrator ? "" : selectedDepartmentId ?? "";

  async function commit(departmentId: string) {
    setError(null);
    const body = { departmentId: departmentId === "" ? "" : departmentId };
    const res = await fetch("/api/auth/active-department", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(j?.error ?? "Could not update the department context.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div
      className="flex w-[8.75rem] shrink-0 flex-col justify-center gap-0.5 sm:w-[10rem] lg:w-[11.5rem]"
      data-testid="department-context"
      data-department-context="multi"
    >
      <label
        className="sr-only lg:not-sr-only lg:text-[10px] lg:font-semibold lg:uppercase lg:tracking-[0.12em] lg:text-zinc-500"
        htmlFor="department-context-select"
      >
        Department
      </label>
      <div
        className="flex min-h-10 items-stretch overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200"
        title={CONTEXT_HINT}
      >
        <span
          className="flex shrink-0 items-center border-r border-zinc-200 bg-zinc-50 px-1.5 text-zinc-500 sm:px-2"
          aria-hidden
        >
          <DeptIcon className="h-4 w-4" />
        </span>
        <select
          id="department-context-select"
          className="min-h-10 w-full min-w-0 border-0 bg-transparent px-1.5 py-1.5 text-sm text-zinc-800 focus:outline-none disabled:opacity-60 sm:px-2"
          disabled={pending}
          value={selectValue}
          onChange={(e) => void commit(e.target.value)}
          aria-describedby="department-context-hint"
          aria-label="Department"
          title={CONTEXT_HINT}
        >
          {isFacilityAdministrator ? (
            <option value="">All departments</option>
          ) : (
            <option value="">My department</option>
          )}
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <p id="department-context-hint" className="sr-only">
        {CONTEXT_HINT}
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
