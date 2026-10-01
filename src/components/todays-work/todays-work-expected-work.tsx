import Link from "next/link";

import { SectionHeader } from "@/components/design-system/SectionHeader";
import { TodaysWorkConfirmWorkButton } from "@/components/todays-work/todays-work-confirm-work-button";
import {
  todaysExpectedWorkHasVisibleWork,
  type TodaysExpectedWorkLocationView,
  type TodaysExpectedWorkView,
} from "@/lib/todays-work/expected-work";

type Props = {
  view: TodaysExpectedWorkView;
};

function LocationWorkList({ locations }: { locations: TodaysExpectedWorkLocationView[] }) {
  return (
    <ul className="space-y-4">
      {locations.map((location) => (
        <li key={location.unitId || location.locationName} data-testid="todays-work-location">
          <p className="text-sm font-semibold text-zinc-900">{location.locationName}</p>
          <ul className="mt-2 space-y-3">
            {location.plans.map((plan) => (
              <li key={plan.workPlanId} data-testid="todays-work-plan">
                <p className="text-sm text-zinc-800">{plan.workPlanName}</p>
                {plan.assignmentLabel ? (
                  <p className="text-xs text-zinc-600" data-testid="todays-work-assignment">
                    {plan.assignmentLabel}
                  </p>
                ) : null}
                <ul className="mt-1.5 space-y-1.5">
                  {plan.items.map((item) => (
                    <li
                      key={item.occurrenceKey}
                      className="flex flex-wrap items-start justify-between gap-2"
                      data-testid="todays-work-item"
                      data-occurrence-key={item.occurrenceKey}
                      data-state={item.state}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-800">
                          <span aria-hidden className="mr-1.5 text-zinc-500">
                            {item.completed ? "✓" : "□"}
                          </span>
                          <span className={item.completed ? "text-zinc-600" : undefined}>
                            {item.label}
                          </span>
                        </p>
                        {item.statusLabel ? (
                          <p className="ml-5 text-xs text-zinc-600">{item.statusLabel}</p>
                        ) : null}
                      </div>
                      {item.canConfirm && item.unitId ? (
                        <TodaysWorkConfirmWorkButton
                          facilityId={item.facilityId}
                          departmentId={item.departmentId}
                          unitId={item.unitId}
                          occurrenceKey={item.occurrenceKey}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function TodaysWorkExpectedWork({ view }: Props) {
  if (!view.workCapabilityEnabled) return null;

  const hasWork = todaysExpectedWorkHasVisibleWork(view);
  if (!hasWork && !view.configureHref) return null;

  return (
    <section data-testid="todays-work-expected-work">
      <SectionHeader eyebrow="Expected work" className="mb-3" />
      {hasWork ? (
        <div className="space-y-5 rounded-lg border border-zinc-200 bg-white px-3.5 py-3 sm:px-4">
          {view.currentGroups.map((group) => (
            <div key={group.operationLabel} data-testid="todays-work-current-group">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {group.operationLabel}
                {group.windowLabel ? ` · ${group.windowLabel}` : " · Active"}
              </p>
              <div className="mt-2">
                <LocationWorkList locations={group.locations} />
              </div>
            </div>
          ))}

          {view.otherWork.length > 0 ? (
            <div data-testid="todays-work-other-work">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Other work today
              </p>
              <div className="mt-2">
                <LocationWorkList locations={view.otherWork} />
              </div>
            </div>
          ) : null}

          {view.upcoming ? (
            <div data-testid="todays-work-upcoming">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Up next
              </p>
              <p className="mt-1 text-sm text-zinc-700">
                {view.upcoming.operationLabel}
                {view.upcoming.windowLabel ? ` · ${view.upcoming.windowLabel}` : ""}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-800">
                {view.upcoming.locations.flatMap((location) =>
                  location.plans.map((plan) => (
                    <li key={`${location.unitId}-${plan.workPlanId}`}>
                      {location.locationName}
                      <span className="text-zinc-600"> · {plan.workPlanName}</span>
                    </li>
                  )),
                )}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {view.configureHref ? (
        <p className="mt-2 text-xs text-zinc-600" data-testid="todays-work-configure-work">
          <Link
            href={view.configureHref}
            className="font-medium text-zinc-800 underline hover:text-zinc-600"
          >
            {view.configureLabel ?? "Configure recurring work"}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
