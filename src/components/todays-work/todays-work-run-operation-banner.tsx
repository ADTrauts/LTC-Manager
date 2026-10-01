import Link from "next/link";

import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles";

type Props = {
  presentation: RunDepartmentOperationPresentation;
  builderHref?: string | null;
};

export function TodaysWorkRunOperationBanner({ presentation, builderHref }: Props) {
  const { configuration, currentOperations, nextOperation, keyTimeSummaries } = presentation;

  return (
    <div className="space-y-3" data-testid="todays-work-run-operation">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 sm:px-4">
        {configuration === "not_configured" ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Operating rhythm
            </p>
            <p className="mt-0.5 text-sm text-zinc-700" data-testid="run-rhythm-not-configured">
              No published operating rhythm is configured.
            </p>
          </>
        ) : configuration === "missing_participation" ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Operating rhythm
            </p>
            <p className="mt-0.5 text-sm text-zinc-700" data-testid="run-rhythm-missing-participation">
              This operating rhythm has no participating locations.
            </p>
            {builderHref ? (
              <p className="mt-1 text-xs text-zinc-600">
                <Link href={builderHref} className="font-medium text-zinc-800 underline hover:text-zinc-600">
                  Assign rooms in Department Builder
                </Link>
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Current operations
            </p>
            {currentOperations.length === 0 ? (
              <p className="mt-0.5 text-sm text-zinc-700" data-testid="run-rhythm-quiet">
                No active operation right now.
              </p>
            ) : (
              <ul className="mt-1 space-y-2">
                {currentOperations.map((operation) => {
                  const singlePhase =
                    operation.phaseLabel && operation.phases.length === 1
                      ? operation.phases[0]
                      : null;
                  return (
                    <li key={operation.cycleLabel}>
                      <p className="text-sm font-semibold text-zinc-900">
                        {operation.cycleLabel}
                      </p>
                      {singlePhase ? (
                        <p className="text-xs text-zinc-600">
                          Current phase · {singlePhase.label}
                          {singlePhase.windowLabel ? ` · ${singlePhase.windowLabel}` : ""}
                          {singlePhase.roomCount > 0
                            ? ` · ${singlePhase.roomCount} Room${singlePhase.roomCount === 1 ? "" : "s"}`
                            : ""}
                        </p>
                      ) : operation.phases.length > 0 ? (
                        <>
                          {operation.windowLabel ? (
                            <p className="text-xs text-zinc-600">{operation.windowLabel}</p>
                          ) : null}
                          <ul className="mt-0.5 text-xs text-zinc-700">
                            {operation.phases.map((phase) => (
                              <li key={phase.label}>
                                {phase.label}
                                {phase.roomCount > 0
                                  ? ` · ${phase.roomCount} Room${phase.roomCount === 1 ? "" : "s"}`
                                  : ""}
                                {phase.windowLabel ? ` · ${phase.windowLabel}` : ""}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          {operation.windowLabel ? (
                            <p className="text-xs text-zinc-600">{operation.windowLabel}</p>
                          ) : null}
                          <p className="text-xs text-zinc-500">No active phase right now.</p>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {nextOperation ? (
              <p className="mt-2 text-sm text-zinc-700" data-testid="run-rhythm-next">
                Next: {nextOperation.label}
                {nextOperation.windowLabel ? ` · ${nextOperation.windowLabel}` : ""}
              </p>
            ) : null}
          </>
        )}
      </div>

      {keyTimeSummaries.length > 0 ? (
        <div
          className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 sm:px-4"
          data-testid="todays-work-key-times"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Today’s Key Points
          </p>
          <ul className="mt-1 space-y-1.5">
            {keyTimeSummaries.map((group) => (
              <li key={`${group.label}-${group.dueLabel}`} className="text-sm text-zinc-800">
                <p className="font-medium text-zinc-900">{group.label}</p>
                <p className="text-xs text-zinc-600">
                  {group.dueLabel} · {group.completed} / {group.total} complete
                  {group.overdue > 0 ? ` · ${group.overdue} overdue` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
