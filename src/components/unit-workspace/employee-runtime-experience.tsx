import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/design-system/page-header";
import {
  EMPLOYEE_STALE_BUNDLE_LABEL,
  type EmployeeRuntimeExperienceView,
} from "@/lib/employee-runtime-flow";

type Props = {
  view: EmployeeRuntimeExperienceView;
  extras?: ReactNode;
};

function Card({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid={testId}
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
    >
      {children}
    </Link>
  );
}

export function EmployeeRuntimeExperience({ view, extras }: Props) {
  const hierarchy =
    view.grain === "space" && view.locationSummary
      ? view.locationSummary
      : view.locationSummary;

  return (
    <section
      className="mx-auto flex max-w-5xl flex-col gap-5 sm:gap-6"
      data-testid="employee-runtime-experience"
      data-grain={view.grain}
    >
      {view.stale ? (
        <p
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="employee-runtime-stale"
        >
          {EMPLOYEE_STALE_BUNDLE_LABEL}
        </p>
      ) : null}

      <section className="space-y-3" data-testid="employee-runtime-assignment">
        <PageHeader
          icon="locations"
          title={view.assignmentTitle}
          subtitle={view.roleLabel ?? undefined}
          compact
        />
        {view.assignmentAvailability === "evaluated" ? (
          <div className="space-y-1 text-sm text-zinc-700">
            {view.roleLabel ? (
              <p className="font-semibold text-zinc-900">{view.roleLabel}</p>
            ) : null}
            {hierarchy ? <p>{hierarchy}</p> : null}
            {view.currentAssignment && view.upcomingAssignment ? (
              <p data-testid="employee-runtime-upcoming">
                Upcoming: {view.upcomingAssignment.locationSummary ?? view.upcomingAssignment.roleLabel}
                {view.upcomingAssignment.startsAtLabel
                  ? ` · ${view.upcomingAssignment.startsAtLabel}`
                  : null}
              </p>
            ) : null}
            {!view.currentAssignment && view.upcomingAssignment ? (
              <p data-testid="employee-runtime-upcoming">
                {view.upcomingAssignment.locationSummary ?? view.upcomingAssignment.roleLabel}
                {view.upcomingAssignment.startsAtLabel
                  ? ` · ${view.upcomingAssignment.startsAtLabel}`
                  : null}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-600">{view.assignmentTitle}</p>
        )}
        {view.mismatchLabel ? (
          <p className="text-sm font-medium text-zinc-900" data-testid="employee-runtime-mismatch">
            {view.mismatchLabel}
          </p>
        ) : null}
        {view.spaceNotAssignedLabel ? (
          <p className="text-sm text-zinc-600" data-testid="employee-runtime-space-unassigned">
            {view.spaceNotAssignedLabel}
          </p>
        ) : null}
      </section>

      {view.next ? (
        <Card title="Next" testId="employee-runtime-next">
          <p className="text-base font-semibold text-zinc-900">{view.next.label}</p>
          {view.next.href ? <ActionLink href={view.next.href}>Start</ActionLink> : null}
          {view.locationNext ? (
            <p className="text-sm text-zinc-600" data-testid="employee-runtime-location-next">
              Location next: {view.locationNext.label}
              {view.locationNext.timeLabel ? ` · ${view.locationNext.timeLabel}` : null}
            </p>
          ) : null}
        </Card>
      ) : null}

      {view.grain === "neighborhood" && view.showExecution ? (
        <Card title="Your assigned locations" testId="employee-runtime-spaces">
          {view.assignedSpaces.length === 0 ? (
            <p className="text-sm text-zinc-600">No assigned spaces.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {view.assignedSpaces.map((space) => (
                <li key={space.spaceId} data-testid="employee-runtime-space-row">
                  <Link href={space.href} className="block min-h-11 px-3 py-3 hover:bg-zinc-50">
                    <p className="text-sm font-semibold text-zinc-900">{space.name}</p>
                    {space.operationLabel ? (
                      <p className="text-sm text-zinc-600">{space.operationLabel}</p>
                    ) : null}
                    {space.attentionLabel ? (
                      <p className="text-sm text-zinc-700">{space.attentionLabel}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {view.evsSequence ? (
        <Card title="Work sequence" testId="employee-runtime-evs-sequence">
          {view.evsSequence.now ? (
            <p className="text-sm">
              <span className="font-semibold">Now</span>{" "}
              <Link href={view.evsSequence.now.href} className="underline underline-offset-2">
                {view.evsSequence.now.label}
              </Link>
            </p>
          ) : null}
          {view.evsSequence.next ? (
            <p className="text-sm">
              <span className="font-semibold">Next</span>{" "}
              <Link href={view.evsSequence.next.href} className="underline underline-offset-2">
                {view.evsSequence.next.label}
              </Link>
            </p>
          ) : null}
          {view.evsSequence.queue.length > 0 ? (
            <ul className="space-y-1 text-sm text-zinc-700">
              {view.evsSequence.queue.map((row) => (
                <li key={row.href}>
                  Queue ·{" "}
                  <Link href={row.href} className="underline underline-offset-2">
                    {row.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {view.showExecution ? (
        <Card title="Work & Evidence" testId="employee-runtime-work-evidence">
          {view.work.length === 0 && view.evidenceGroups.length === 0 ? (
            <p className="text-sm text-zinc-600">No work or evidence needs your attention right now.</p>
          ) : (
            <div className="space-y-4">
              {view.work.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800">Work</h3>
                  <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
                    {view.work.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        data-testid="employee-runtime-work-item"
                      >
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                          {item.spaceName && view.grain === "neighborhood" ? (
                            <p className="text-sm text-zinc-600">{item.spaceName}</p>
                          ) : null}
                          <p className="text-sm text-zinc-500">{item.stateLabel}</p>
                        </div>
                        {item.href && item.actionLabel ? (
                          <ActionLink href={item.href}>{item.actionLabel}</ActionLink>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {view.evidenceGroups.map((group) => (
                <div key={group.id}>
                  <h3 className="text-sm font-semibold text-zinc-800">{group.title}</h3>
                  <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                        data-testid="employee-runtime-evidence-item"
                      >
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                          {item.spaceName && view.grain === "neighborhood" ? (
                            <p className="text-sm text-zinc-600">{item.spaceName}</p>
                          ) : null}
                          <p className="text-sm text-zinc-500">{item.stateLabel}</p>
                        </div>
                        {item.href && item.actionLabel ? (
                          <ActionLink href={item.href}>{item.actionLabel}</ActionLink>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {view.showExecution && view.milestones.length > 0 ? (
        <Card title="Milestones" testId="employee-runtime-milestones">
          <ul className="space-y-2">
            {view.milestones.map((row) => (
              <li key={`${row.spaceId}:${row.kind}:${row.label}`}>
                {view.grain === "neighborhood" ? (
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{row.spaceName}</p>
                ) : null}
                <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {view.showExecution && (view.issues.length > 0 || view.plantMessages.length > 0) ? (
        <Card title="Operational issues" testId="employee-runtime-issues">
          <ul className="space-y-2">
            {view.issues.map((row) => (
              <li key={row.issueId}>
                {view.grain === "neighborhood" ? (
                  <p className="text-xs uppercase tracking-wide text-zinc-500">{row.spaceName}</p>
                ) : null}
                <p className="text-sm font-semibold text-zinc-900">{row.summary}</p>
                <p className="text-sm text-zinc-600">{row.impactLabel}</p>
              </li>
            ))}
          </ul>
          {view.plantMessages.map((message) => (
            <p key={message} className="text-sm text-zinc-700">
              {message}
            </p>
          ))}
        </Card>
      ) : null}

      {view.showExecution && view.grain === "space" ? (
        <p className="text-sm text-zinc-600" data-testid="employee-runtime-operation">
          {view.operationLabel}
        </p>
      ) : null}

      {extras}
    </section>
  );
}
