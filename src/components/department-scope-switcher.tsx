"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Dept = { id: string; name: string };

type Props = {
  departments: Dept[];
  /** Resolved scoped department id, or null when FA is in full-nav mode. */
  selectedDepartmentId: string | null;
  isFacilityAdministrator: boolean;
};

export function DepartmentScopeSwitcher({
  departments,
  selectedDepartmentId,
  isFacilityAdministrator,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex min-w-0 max-w-[14rem] flex-col gap-1">
      <label
        className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
        htmlFor="operational-mode"
      >
        Operational mode
      </label>
      <select
        id="operational-mode"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-800"
        disabled={pending}
        value={selectValue}
        onChange={(e) => void commit(e.target.value)}
        aria-describedby="operational-mode-hint"
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
      <p id="operational-mode-hint" className="text-[10px] leading-snug text-zinc-500">
        Narrows navigation to the selected operational mode.
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
