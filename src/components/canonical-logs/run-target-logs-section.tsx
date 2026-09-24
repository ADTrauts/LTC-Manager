import Link from "next/link";

import type { TargetRunLogsView } from "@/lib/canonical-logs/load-target-run-logs";
import { RunLogRequirementList } from "@/components/canonical-logs/run-log-requirement-list";

type Props = {
  view: TargetRunLogsView;
  isManager: boolean;
};

function cellText(
  cell: TargetRunLogsView["history"][number]["days"][number]["cells"][number],
): string {
  if (cell.state === "NOT_REQUIRED" && !cell.stateLabel) return "";
  if (cell.displayValue) return cell.displayValue;
  return cell.stateLabel;
}

export function RunTargetLogsSection({ view, isManager }: Props) {
  const hasLive = view.requirements.length > 0 || view.adHocAttachments.length > 0;
  const hasHistory = view.history.some(
    (table) =>
      table.days.some((d) => d.cells.some((c) => c.state !== "NOT_REQUIRED" || c.stateLabel)) ||
      table.unscheduled.length > 0,
  );
  const testId =
    view.targetKind === "ASSET"
      ? "run-asset-logs-section"
      : view.targetKind === "SPACE"
        ? "run-space-logs-section"
        : view.targetKind === "DEPARTMENT"
          ? "run-department-logs-section"
          : "run-unit-logs-section";

  return (
    <section className="space-y-4" data-testid={testId} aria-labelledby={`${testId}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${testId}-heading`} className="text-base font-semibold text-zinc-900">
            Logs
          </h2>
          <p className="text-xs text-zinc-500">{view.targetLabel}</p>
        </div>
        {isManager ? (
          <Link href={view.buildHref} className="text-xs font-medium underline underline-offset-2">
            Manage in Build
          </Link>
        ) : null}
      </div>

      {hasLive ? (
        <RunLogRequirementList
          requirements={view.requirements}
          adHocAttachments={view.adHocAttachments}
          includeNeedsSetup={isManager}
          isManager={isManager}
          upcoming={view.upcoming}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-600" data-testid={`${testId}-empty`}>
            {view.emptyLabel}
          </p>
          {view.upcoming.length > 0 ? (
            <ul className="space-y-1 text-xs text-zinc-600" data-testid={`${testId}-upcoming`}>
              {view.upcoming.map((row) => (
                <li key={`${row.displayName}-${row.startsOnLabel}`}>
                  <span className="font-medium text-zinc-800">{row.displayName}</span> —{" "}
                  {row.startsOnLabel}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {hasHistory ? (
        <div className="space-y-4" data-testid="target-log-history">
          <h3 className="text-sm font-semibold text-zinc-900">Recent history</h3>
          {view.history.map((table) => (
            <div key={table.lineageKey} className="space-y-2">
              <p className="text-sm font-medium text-zinc-800">{table.displayName}</p>
              {table.columns.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-zinc-200">
                  <table className="min-w-full text-left text-sm">
                    <caption className="sr-only">
                      {table.displayName} history for {view.targetLabel}
                    </caption>
                    <thead className="bg-zinc-50 text-xs text-zinc-600">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Date</th>
                        {table.columns.map((col) => (
                          <th key={col} className="px-2 py-1.5 font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                      {table.days.map((day) => (
                        <tr key={day.operationalDateKey}>
                          <td className="whitespace-nowrap px-2 py-1.5 text-xs text-zinc-700">
                            {day.dateLabel}
                          </td>
                          {day.cells.map((cell) => (
                            <td
                              key={`${day.operationalDateKey}-${cell.slotLabel}`}
                              className="px-2 py-1.5 text-xs text-zinc-800"
                              data-state={cell.state}
                              aria-label={cell.accessibleLabel}
                            >
                              {cell.recordId ? (
                                <Link
                                  href={`/staffing/logs/records/${cell.recordId}`}
                                  className="font-medium underline underline-offset-2"
                                >
                                  {cellText(cell)}
                                </Link>
                              ) : (
                                cellText(cell)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {table.unscheduled.length > 0 ? (
                <ul className="text-xs text-zinc-700">
                  {table.unscheduled.map((row) => (
                    <li key={row.recordId}>
                      {row.dateLabel} ·{" "}
                      <Link
                        href={`/staffing/logs/records/${row.recordId}`}
                        className="underline underline-offset-2"
                        aria-label={row.accessibleLabel}
                      >
                        {row.display ?? "Submitted"}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** @deprecated Use RunTargetLogsSection */
export const RunAssetLogsSection = RunTargetLogsSection;
