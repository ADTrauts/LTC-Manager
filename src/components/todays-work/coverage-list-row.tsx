import Link from "next/link";

import { formatCoverageShift, type CoverageItem } from "@/lib/todays-work";

import { CoverageLevelBadge } from "./coverage-list-status";

type CoverageListRowProps = {
  item: CoverageItem;
  emphasized?: boolean;
};

export function CoverageListRow({ item, emphasized = false }: CoverageListRowProps) {
  const unitTypeLabel = item.unitType.charAt(0) + item.unitType.slice(1).toLowerCase().replace(/_/g, " ");
  const assignmentSummary =
    item.assignments.length > 0
      ? item.assignments.map((entry) => `${formatCoverageShift(entry.shift)}: ${entry.employeeName}`).join(" · ")
      : "No assignments scheduled";

  return (
    <li>
      <div
        className={`flex flex-wrap items-start gap-3 ${
          emphasized ? "rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm" : "py-3"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold text-zinc-900 ${emphasized ? "text-lg" : ""}`}>{item.unitName}</p>
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{unitTypeLabel}</span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">{item.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">{assignmentSummary}</p>
          {item.missingShifts.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-800">
              Open slots: {item.missingShifts.map((shift) => formatCoverageShift(shift)).join(", ")}
            </p>
          ) : null}
        </div>
        <CoverageLevelBadge level={item.level} />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Link
            href={item.staffingHref}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
          >
            Fix staffing
          </Link>
          <Link
            href={item.unitHref}
            className="inline-flex min-h-10 items-center rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Unit workspace
          </Link>
        </div>
      </div>
    </li>
  );
}
