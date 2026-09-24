"use client";

import { useState, type ReactNode } from "react";

import { AppIcons } from "@/lib/design-system";

type EmployeesFiltersCollapsibleProps = {
  title?: string;
  defaultExpanded: boolean;
  filterCount: number;
  children: ReactNode;
};

export function EmployeesFiltersCollapsible({
  title = "Search & filters",
  defaultExpanded,
  filterCount,
  children,
}: EmployeesFiltersCollapsibleProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const ChevronIcon = AppIcons.chevronDown;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50/80"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span>{title}</span>
          {!open && filterCount > 0 ? (
            <span className="inline-flex shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800">
              {filterCount} active
            </span>
          ) : null}
        </span>
        <ChevronIcon
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-zinc-100 p-3">{children}</div> : null}
    </div>
  );
}
