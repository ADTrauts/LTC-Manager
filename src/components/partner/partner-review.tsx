import Link from "next/link";

import type {
  OperationalReviewDayPresentation,
  OperationalReviewRangePresentation,
} from "@/lib/operational-review";

function SummaryList({
  items,
}: {
  items: { id: string; label: string; count: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-zinc-800">
      {items.map((item) => (
        <li key={item.id}>
          {item.count} {item.label}
        </li>
      ))}
    </ul>
  );
}

function EvidenceList({
  rows,
}: {
  rows: OperationalReviewDayPresentation["evidence"]["attention"];
}) {
  if (rows.length === 0) return <p className="text-sm text-zinc-600">None</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={`${row.requirementKey}-${row.spaceId ?? "none"}-${row.occurredAtLabel ?? ""}`}>
          <span className="font-medium">{row.locationLabel}</span>
          {" · "}
          {row.requirementLabel}
          {" · "}
          {row.stateLabel}
          {row.recordHref ? (
            <>
              {" · "}
              <Link href={row.recordHref} className="underline underline-offset-2">
                Record
              </Link>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PartnerReviewDay({
  departmentName,
  presentation,
}: {
  departmentName: string;
  presentation: OperationalReviewDayPresentation;
}) {
  return (
    <section className="space-y-6" data-testid="partner-review-day">
      <div>
        <h2 className="text-lg font-semibold">Review</h2>
        <p className="text-sm text-zinc-600">
          {departmentName} · {presentation.serviceDateLabel}
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label>
          <span className="block text-xs text-zinc-500">Service date</span>
          <input
            type="date"
            name="date"
            defaultValue={presentation.serviceDate}
            className="rounded-md border border-zinc-300 px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-white">
          Show day
        </button>
      </form>
      {presentation.empty || presentation.quiet ? (
        <p className="text-sm text-zinc-700">
          No Review items for {departmentName} on this service day.
        </p>
      ) : (
        <>
          <SummaryList items={presentation.summaryItems} />
          <div>
            <h3 className="text-sm font-semibold">Needs attention</h3>
            <EvidenceList rows={presentation.evidence.attention} />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Completed</h3>
            <EvidenceList rows={presentation.evidence.completed} />
          </div>
        </>
      )}
    </section>
  );
}

export function PartnerReviewRange({
  departmentName,
  presentation,
  validationMessage,
  start,
  end,
}: {
  departmentName: string;
  presentation: OperationalReviewRangePresentation | null;
  validationMessage: string | null;
  start: string;
  end: string;
}) {
  return (
    <section className="space-y-6" data-testid="partner-review-range">
      <div>
        <h2 className="text-lg font-semibold">Review</h2>
        <p className="text-sm text-zinc-600">
          {departmentName}
          {presentation ? ` · ${presentation.rangeLabel}` : ` · ${start} – ${end}`}
        </p>
      </div>
      {validationMessage ? <p className="text-sm text-zinc-700">{validationMessage}</p> : null}
      {presentation?.empty || presentation?.quiet ? (
        <p className="text-sm text-zinc-700">
          No Review items for {departmentName} in this range.
        </p>
      ) : null}
      {presentation && !presentation.empty && !presentation.quiet ? (
        <>
          <SummaryList items={presentation.summaryItems} />
          <ul className="space-y-2 text-sm">
            {presentation.days.map((day) => (
              <li key={day.serviceDate}>
                <Link href={day.href} className="underline underline-offset-2">
                  {day.serviceDateLabel}
                </Link>
                {day.exceptionLabels.length > 0 ? ` · ${day.exceptionLabels.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
