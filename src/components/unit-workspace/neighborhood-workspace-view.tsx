import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/design-system/page-header";
import { SpaceWorkspaceFocus } from "@/components/unit-workspace/space-workspace-focus";
import {
  NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL,
  neighborhoodWorkspaceAnchorId,
  type NeighborhoodWorkspaceSectionId,
  type NeighborhoodWorkspaceViewModel,
} from "@/lib/unit-workspace/neighborhood";

type Props = {
  view: NeighborhoodWorkspaceViewModel;
};

function Card({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      data-testid={`neighborhood-workspace-${id}`}
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function sectionOrderClass(
  id: NeighborhoodWorkspaceSectionId,
  employee: boolean,
): string {
  if (employee) return "";
  switch (id) {
    case "overview":
      return "order-1";
    case "spaces":
      return "order-2";
    case "coverage":
      return "order-4 md:order-3";
    case "evidence":
      return "order-3 md:order-4";
    case "assets":
      return "order-5";
    case "milestones":
      return "order-6";
    case "today":
      return "order-7";
  }
}

function Overview({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  const path = view.identity.breadcrumbs.map((row) => row.label).join(" → ");
  return (
    <section
      id={neighborhoodWorkspaceAnchorId("overview")}
      className="scroll-mt-20 space-y-4"
      data-testid="neighborhood-workspace-overview"
    >
      <PageHeader
        icon="locations"
        title={view.identity.displayName}
        subtitle={path}
        compact
      />
      <p className="text-sm font-semibold text-zinc-900" data-testid="neighborhood-workspace-operation">
        {view.operation.label}
      </p>
      <ul className="space-y-1 text-sm text-zinc-600">
        <li>
          {view.spaceCount === 1
            ? "1 operational space"
            : `${view.spaceCount} operational spaces`}
        </li>
        {view.attentionCount > 0 ? (
          <li>
            {view.attentionCount === 1
              ? "1 needs attention"
              : `${view.attentionCount} need attention`}
          </li>
        ) : null}
        {view.overdueEvidenceCount > 0 ? (
          <li>
            {view.overdueEvidenceCount === 1
              ? "1 overdue evidence item"
              : `${view.overdueEvidenceCount} overdue evidence items`}
          </li>
        ) : null}
      </ul>
      {view.next ? (
        <p className="text-sm text-zinc-700" data-testid="neighborhood-workspace-next">
          Next: {view.next.label} — {view.next.spaceName} — {view.next.timeLabel}
        </p>
      ) : null}
    </section>
  );
}

function Spaces({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("spaces")} title="Spaces">
      {view.spaces.length === 0 ? (
        <div className="space-y-3" data-testid="neighborhood-workspace-empty-spaces">
          <p className="text-sm text-zinc-600">
            {view.emptySpaces?.copy ??
              "No operational spaces are configured for this location."}
          </p>
          {view.emptySpaces?.facilityBuilderHref ? (
            <Link
              href={view.emptySpaces.facilityBuilderHref}
              className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
              data-testid="neighborhood-workspace-facility-builder"
            >
              Open Facility Builder
            </Link>
          ) : null}
          {view.emptySpaces?.departmentLocationsHref ? (
            <Link
              href={view.emptySpaces.departmentLocationsHref}
              className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
              data-testid="neighborhood-workspace-department-locations"
            >
              Open Department Locations
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {view.spaces.map((space) => (
            <li key={space.spaceId} data-testid="neighborhood-workspace-space-row">
              <Link
                href={space.href}
                className="block min-h-11 px-3 py-3 hover:bg-zinc-50"
              >
                <p className="text-sm font-semibold text-zinc-900">{space.name}</p>
                {space.landing.configurationLabel ? (
                  <p className="text-sm text-zinc-600">{space.landing.configurationLabel}</p>
                ) : null}
                {space.landing.operationLabel ? (
                  <p className="text-sm text-zinc-600">{space.landing.operationLabel}</p>
                ) : null}
                {space.landing.coverageLabel ? (
                  <p className="text-sm text-zinc-500">{space.landing.coverageLabel}</p>
                ) : null}
                {space.landing.exceptionLabels.map((label) => (
                  <p key={label} className="text-sm text-zinc-800">
                    {label}
                  </p>
                ))}
                {space.landing.moreExceptionCount > 0 ? (
                  <p className="text-sm text-zinc-500">+{space.landing.moreExceptionCount} more</p>
                ) : null}
                {space.landing.nextLabel ? (
                  <p className="text-sm text-zinc-600">{space.landing.nextLabel}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Coverage({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("coverage")} title="Staffing & Coverage">
      <p className="text-sm text-zinc-600" data-testid="neighborhood-workspace-coverage">
        {view.coverage.unavailable
          ? NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL
          : view.coverage.summary}
      </p>
    </Card>
  );
}

function Evidence({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("evidence")} title="Work & Evidence">
      {view.retiredLogsTab ? (
        <p className="text-xs text-zinc-500">Logs is now part of Work & Evidence.</p>
      ) : null}
      {view.evidence.groups.length === 0 ? (
        <p className="text-sm text-zinc-600">No required evidence across these spaces right now.</p>
      ) : (
        view.evidence.groups.map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-semibold text-zinc-800">{group.title}</h3>
            <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {group.items.map((item) => (
                <li
                  key={`${item.spaceId}:${item.requirementKey}`}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="neighborhood-workspace-evidence-item"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.displayName}</p>
                    <p className="text-sm text-zinc-600">{item.spaceName}</p>
                    <p className="text-sm text-zinc-500">
                      {item.productState === "OVERDUE"
                        ? "Overdue"
                        : item.productState === "DUE"
                          ? "Due now"
                          : item.productState === "UPCOMING"
                            ? "Upcoming"
                            : item.productState === "COMPLETED_WITH_EXCEPTION"
                              ? "Completed with exception"
                              : "Completed"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
                    >
                      Open space
                    </Link>
                    {item.actionHref && item.actionLabel ? (
                      <Link
                        href={item.actionHref}
                        className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
                      >
                        {item.actionLabel}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {view.managerLinks.logBookHref ? (
        <Link
          href={view.managerLinks.logBookHref}
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
        >
          Open Log Book
        </Link>
      ) : null}
    </Card>
  );
}

function Assets({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("assets")} title="Assets & Issues">
      <ul className="space-y-3">
        {view.assets.map((asset) => (
          <li
            key={`${asset.spaceId}:${asset.assetId}`}
            className="rounded-md border border-zinc-200 px-3 py-3"
            data-testid="neighborhood-workspace-asset"
          >
            <p className="text-xs uppercase tracking-wide text-zinc-500">{asset.spaceName}</p>
            <p className="text-sm font-semibold text-zinc-900">{asset.name}</p>
            <p className="text-sm text-zinc-600">{asset.statusLabel}</p>
            {asset.issues.map((issue) => (
              <p key={issue.issueId} className="mt-1 text-sm text-zinc-700">
                {issue.summary} · Impact: {issue.impactLabel}
              </p>
            ))}
            <Link href={asset.href} className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-2">
              Open asset
            </Link>
          </li>
        ))}
      </ul>
      {view.managerLinks.maintenanceHref ? (
        <Link
          href={view.managerLinks.maintenanceHref}
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2"
        >
          Open Maintenance
        </Link>
      ) : null}
    </Card>
  );
}

function Milestones({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("milestones")} title="Operations & Milestones">
      <ul className="space-y-3">
        {view.milestones.map((item) => (
          <li key={`${item.spaceId}:${item.kind}:${item.label}`}>
            <p className="text-xs uppercase tracking-wide text-zinc-500">{item.spaceName}</p>
            <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
            {item.configured ? <p className="text-sm text-zinc-600">Configured: {item.configured}</p> : null}
            {item.adjusted ? <p className="text-sm text-zinc-600">Adjusted: {item.adjusted}</p> : null}
            {item.actual ? <p className="text-sm text-zinc-600">Actual: {item.actual}</p> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Today({ view }: { view: NeighborhoodWorkspaceViewModel }) {
  return (
    <Card id={neighborhoodWorkspaceAnchorId("today")} title="Today">
      <ol className="space-y-2">
        {view.today.map((row) => (
          <li key={`${row.spaceId}:${row.atLabel}:${row.detail}`} className="text-sm text-zinc-700">
            {row.atLabel ? <span className="font-medium text-zinc-900">{row.atLabel}</span> : null}
            {row.atLabel ? " · " : null}
            {row.spaceName} · {row.detail}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function NeighborhoodWorkspaceView({ view }: Props) {
  const employee = view.sectionOrder[2] === "evidence";
  const present = new Set(view.sections.filter((row) => row.present).map((row) => row.id));
  const focusId = view.focusSectionId ? neighborhoodWorkspaceAnchorId(view.focusSectionId) : null;

  return (
    <section
      className="mx-auto flex max-w-5xl flex-col gap-5 sm:gap-6"
      data-testid="neighborhood-workspace"
    >
      <SpaceWorkspaceFocus targetId={focusId} />
      {view.sectionOrder.map((id) => {
        if (id !== "overview" && id !== "spaces" && !present.has(id)) return null;
        const className = sectionOrderClass(id, employee);
        switch (id) {
          case "overview":
            return (
              <div key={id} className={className}>
                <Overview view={view} />
              </div>
            );
          case "spaces":
            return (
              <div key={id} className={className}>
                <Spaces view={view} />
              </div>
            );
          case "coverage":
            return (
              <div key={id} className={className}>
                <Coverage view={view} />
              </div>
            );
          case "evidence":
            return (
              <div key={id} className={className}>
                <Evidence view={view} />
              </div>
            );
          case "assets":
            return (
              <div key={id} className={className}>
                <Assets view={view} />
              </div>
            );
          case "milestones":
            return (
              <div key={id} className={className}>
                <Milestones view={view} />
              </div>
            );
          case "today":
            return (
              <div key={id} className={className}>
                <Today view={view} />
              </div>
            );
        }
      })}
    </section>
  );
}
