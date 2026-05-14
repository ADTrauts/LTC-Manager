"use client";

import { useState } from "react";

type EmployeesFiltersCollapsibleProps = {
  defaultExpanded: boolean;
  filterCount: number;
  children: React.ReactNode;
};

export function EmployeesFiltersCollapsible({
  defaultExpanded,
  filterCount,
  children,
}: EmployeesFiltersCollapsibleProps) {
  const [open, setOpen] = useState(defaultExpanded);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50/80"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span>Search & filters</span>
          {!open && filterCount > 0 ? (
            <span className="inline-flex shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
              {filterCount} active
            </span>
          ) : null}
        </span>
        <svg
          className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open ? <div className="border-t border-zinc-100 p-3">{children}</div> : null}
    </div>
  );
}
