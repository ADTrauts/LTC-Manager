"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AppIcons } from "@/lib/design-system";

type Dept = { id: string; name: string };

type Props = {
  departments: Dept[];
  /** Resolved scoped department id, or null when FA is in full-nav mode. */
  selectedDepartmentId: string | null;
  isFacilityAdministrator: boolean;
};

const MODE_HINT = "Narrows navigation to the selected operational mode.";

export function DepartmentScopeSwitcher({
  departments,
  selectedDepartmentId,
  isFacilityAdministrator,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ModeIcon = AppIcons.operationalMode;

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
      setError(j?.error ?? "Could not update operational mode.");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (departments.length === 0) {
    return null;
  }

  return (
    <div className="flex w-[10.5rem] shrink-0 flex-col gap-0.5 sm:w-[12rem]">
      <label
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
        htmlFor="operational-mode"
      >
        Operational mode
      </label>
      <div
        className="flex min-h-10 items-stretch overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200"
        title={MODE_HINT}
      >
        <span
          className="flex shrink-0 items-center border-r border-zinc-200 bg-zinc-50 px-2 text-zinc-500"
          aria-hidden
        >
          <ModeIcon className="h-4 w-4" />
        </span>
        <select
          id="operational-mode"
          className="min-h-10 w-full min-w-0 border-0 bg-transparent px-2 py-1.5 text-sm text-zinc-800 focus:outline-none disabled:opacity-60"
          disabled={pending}
          value={selectValue}
          onChange={(e) => void commit(e.target.value)}
          aria-describedby="operational-mode-hint"
          title={MODE_HINT}
        >
          {isFacilityAdministrator ? (
            <option value="">All modes</option>
          ) : (
            <option value="">My department mode</option>
          )}
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <p id="operational-mode-hint" className="sr-only">
        {MODE_HINT}
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
