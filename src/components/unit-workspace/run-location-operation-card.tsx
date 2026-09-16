import {
  completeKeyTimeExpectationAction,
  delayKeyTimeExpectationAction,
} from "@/app/(protected)/staffing/cycles/actions";
import type { RunLocationOperationPresentation } from "@/lib/operational-cycles";

type Props = {
  presentation: RunLocationOperationPresentation;
};

export function RunLocationOperationCard({ presentation }: Props) {
  const { currentOperation, keyTimes, attention } = presentation;

  return (
    <div className="space-y-3" data-testid="run-location-operation">
      <article className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3.5 py-3 sm:px-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Current operation
        </p>
        {currentOperation.state === "ACTIVE" && currentOperation.hierarchyLabel ? (
          <>
            <p className="mt-0.5 text-sm font-semibold text-zinc-900">
              {currentOperation.hierarchyLabel}
            </p>
            {currentOperation.windowLabel ? (
              <p className="text-xs text-zinc-600">{currentOperation.windowLabel}</p>
            ) : null}
          </>
        ) : (
          <p className="mt-0.5 text-sm text-zinc-700">No active operation right now.</p>
        )}
      </article>

      {keyTimes.length > 0 ? (
        <article
          className="rounded-lg border border-zinc-200 bg-white px-3.5 py-3 sm:px-4"
          data-testid="run-location-key-times"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {keyTimes.every((row) => row.statusKey === "upcoming" || row.statusKey === "adjusted")
              ? "Upcoming Key Time"
              : "Key Times"}
          </p>
          <ul className="mt-2 space-y-3">
            {keyTimes.map((keyTime) => (
              <li key={keyTime.expectationId} className="text-sm text-zinc-800">
                <p className="font-semibold text-zinc-900">{keyTime.label}</p>
                <p className="text-xs text-zinc-600">
                  Due {keyTime.dueLabel}
                  {keyTime.statusKey === "upcoming" ? " · Upcoming" : ""}
                  {keyTime.statusKey === "due" ? " · Due now" : ""}
                  {keyTime.statusKey === "overdue" ? ` · ${keyTime.statusLabel}` : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  Configured {keyTime.configuredLabel}
                  {" · "}
                  Expected today {keyTime.expectedTodayLabel}
                </p>
                {keyTime.actualLabel ? (
                  <p className="text-xs text-zinc-600">Actual {keyTime.actualLabel}</p>
                ) : null}
                {keyTime.canAdjust || keyTime.canComplete ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {keyTime.canAdjust ? (
                      <form action={delayKeyTimeExpectationAction}>
                        <input type="hidden" name="expectationId" value={keyTime.expectationId} />
                        <input type="hidden" name="minutes" value="5" />
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                        >
                          +5 min
                        </button>
                      </form>
                    ) : null}
                    {keyTime.canComplete ? (
                      <form action={completeKeyTimeExpectationAction}>
                        <input type="hidden" name="expectationId" value={keyTime.expectationId} />
                        <button
                          type="submit"
                          className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700"
                        >
                          Mark complete
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {currentOperation.state !== "ACTIVE" || attention.kind !== "all_caught_up" ? (
        <p className="text-xs text-zinc-500" data-testid="run-location-attention">
          {attention.kind === "upcoming"
            ? `Upcoming · ${attention.description}`
            : attention.kind === "needs_attention"
              ? `Needs attention · ${attention.description}`
              : attention.description}
        </p>
      ) : null}
    </div>
  );
}
