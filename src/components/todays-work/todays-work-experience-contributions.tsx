import Link from "next/link";

import type { ExperienceWalkContribution } from "@/lib/todays-work";

type TodaysWorkExperienceContributionsProps = {
  contributions: readonly ExperienceWalkContribution[];
};

export function TodaysWorkExperienceContributions({
  contributions,
}: TodaysWorkExperienceContributionsProps) {
  if (contributions.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        No projected Experiences contribute work for the active department.
      </p>
    );
  }

  return (
    <div className="space-y-5" data-testid="todays-work-experience-contributions">
      {contributions.map((contribution, index) => {
        const showArea =
          index === 0 ||
          contributions[index - 1]?.areaKey !== contribution.areaKey;
        return (
          <div key={`${contribution.areaKey}:${contribution.experienceKey}`} className="space-y-2">
            {showArea ? (
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {contribution.areaLabel}
              </h3>
            ) : null}
            <article
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
              data-experience-key={contribution.experienceKey}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-zinc-900">
                    {contribution.label}
                  </h4>
                  {contribution.tools.length > 0 ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {contribution.tools.map((tool) => (
                        <li
                          key={tool.key}
                          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600"
                        >
                          {tool.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <span className="text-xs text-zinc-500">
                  {contribution.items.length} location
                  {contribution.items.length === 1 ? "" : "s"}
                </span>
              </div>

              {contribution.items.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No outstanding work signals.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {contribution.items.slice(0, 5).map((item) => (
                    <li key={item.unitId}>
                      <Link
                        href={item.href}
                        className="flex min-h-10 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                      >
                        <span className="truncate font-medium">{item.unitName}</span>
                        <span className="shrink-0 text-xs text-zinc-500">{item.reason}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        );
      })}
    </div>
  );
}

export function TodaysWorkProjectionUnavailable({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm"
      role="status"
      data-testid="todays-work-projection-unavailable"
    >
      <p className="font-semibold text-zinc-900">Today&apos;s Work unavailable</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
