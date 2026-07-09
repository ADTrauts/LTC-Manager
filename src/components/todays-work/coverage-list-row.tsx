import Link from "next/link";

import { OperationalListRow, operationalRowActionPrimaryClass, operationalRowActionSecondaryClass } from "@/components/design-system/OperationalListRow";
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
    <OperationalListRow
      emphasized={emphasized}
      title={item.unitName}
      meta={<span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{unitTypeLabel}</span>}
      description={item.reason}
      details={
        <>
          <p className="mt-1 text-xs text-zinc-500">{assignmentSummary}</p>
          {item.missingShifts.length > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-800">
              Open slots: {item.missingShifts.map((shift) => formatCoverageShift(shift)).join(", ")}
            </p>
          ) : null}
        </>
      }
      status={<CoverageLevelBadge level={item.level} />}
      actions={
        <>
          <Link href={item.staffingHref} className={operationalRowActionPrimaryClass}>
            Fix staffing
          </Link>
          <Link href={item.unitHref} className={operationalRowActionSecondaryClass}>
            Unit workspace
          </Link>
        </>
      }
    />
  );
}
