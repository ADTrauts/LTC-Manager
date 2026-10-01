import type { TimingAuditRow } from "@/lib/audit/timing-audit";

import { ReviewCard, ReviewCell, ReviewTable, ReviewTableRow } from "./review-layout";

function sourceLabel(source: TimingAuditRow["source"]): string {
  if (source === "CANONICAL_KEY_POINT_ACTUAL") return "Key Point actual";
  return "Legacy milestone";
}

export function TimingAuditPanel({ rows }: { rows: readonly TimingAuditRow[] }) {
  return (
    <ReviewCard
      title="Operational timing"
      subtitle="One timing source per service date. Canonical dates use Key Point actuals. Earlier dates use legacy milestones."
      testId="timing-audit"
    >
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">No Key Points were effective for this range.</p>
      ) : (
        <ReviewTable
          caption="Operational timing"
          columns={["Date", "Location", "Key Point", "Planned", "Adjusted", "Actual", "Source"]}
        >
          {rows.map((row) => (
            <ReviewTableRow key={`${row.serviceDate}-${row.keyPointStableKey}-${row.locationId ?? "dept"}`}>
              <ReviewCell>{row.serviceDate}</ReviewCell>
              <ReviewCell>{row.locationLabel ?? "—"}</ReviewCell>
              <ReviewCell>{row.keyPointLabel}</ReviewCell>
              <ReviewCell>{row.plannedLocal ?? "—"}</ReviewCell>
              <ReviewCell>{row.adjustedLocal ?? "—"}</ReviewCell>
              <ReviewCell>{row.actual ?? "—"}</ReviewCell>
              <ReviewCell>{sourceLabel(row.source)}</ReviewCell>
            </ReviewTableRow>
          ))}
        </ReviewTable>
      )}
    </ReviewCard>
  );
}
