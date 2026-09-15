import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles";

type Props = {
  presentation: RunDepartmentOperationPresentation;
};

export function TodaysWorkRunOperationBanner({ presentation }: Props) {
  const { currentOperations, keyTimeSummaries } = presentation;

  return (
    <div className="space-y-3" data-testid="todays-work-run-operation">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 sm:px-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Current operations
        </p>
        {currentOperations.length === 0 ? (
          <p className="mt-0.5 text-sm text-zinc-700">No active operation right now.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {currentOperations.map((operation) => {
              const singlePhase = operation.phases.length === 1 ? operation.phases[0] : null;
              return (
              <li key={operation.parentLabel}>
                <p className="text-sm font-semibold text-zinc-900">
                  {singlePhase
                    ? `${operation.parentLabel} → ${singlePhase.label}`
                    : operation.parentLabel}
                </p>
                {singlePhase ? (
                  <p className="text-xs text-zinc-600">
                    {singlePhase.windowLabel}
                    {singlePhase.roomCount > 0
                      ? ` · ${singlePhase.roomCount} Room${singlePhase.roomCount === 1 ? "" : "s"}`
                      : ""}
                  </p>
                ) : (
                  <>
                    {operation.windowLabel ? (
                      <p className="text-xs text-zinc-600">{operation.windowLabel}</p>
                    ) : null}
                    {operation.phases.length > 0 ? (
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
                    ) : null}
                  </>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {keyTimeSummaries.length > 0 ? (
        <div
          className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 sm:px-4"
          data-testid="todays-work-key-times"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Today’s Key Times
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
