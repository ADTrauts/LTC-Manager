import Link from "next/link";

import type { DepartmentTodayCoverage } from "@/lib/department-administration/today-coverage";

type Props = {
  coverage: DepartmentTodayCoverage;
};

export function TodayCoveragePanel({ coverage }: Props) {
  const { view } = coverage;

  return (
    <section className="space-y-3" data-testid="department-today-coverage">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-zinc-900">Today</h2>
        <p className="text-sm text-zinc-600">
          {view.serviceDateKey}. Required staffing compared with today&apos;s assignments. A
          schedule alone does not fill a requirement.
        </p>
      </div>
      <div
        className={`rounded-lg border p-4 ${
          view.configured && view.rows.length > 0
            ? "border-amber-200 bg-amber-50"
            : "border-zinc-200 bg-white"
        }`}
      >
        <p className="text-sm font-semibold text-zinc-900" data-testid="today-coverage-headline">
          {view.headline}
        </p>
        {view.configured && view.rows.length > 0 ? (
          <ul className="mt-3 divide-y divide-amber-100">
            {view.rows.map((row) => (
              <li
                key={`${row.locationName}-${row.periodLabel}-${row.roleLabel}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
              >
                <span className="text-zinc-800">
                  {row.locationName} · {row.periodLabel} · {row.roleLabel}
                </span>
                <span className="text-zinc-700">
                  {row.required} required · {row.assigned} assigned
                  {row.shortfall > 0 ? ` · ${row.shortfall} short` : ""} · {row.label}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3">
          <Link
            href={coverage.runHref}
            className="text-sm font-medium text-zinc-800 underline-offset-2 hover:underline"
          >
            Open Run to place someone
          </Link>
        </p>
      </div>
    </section>
  );
}
