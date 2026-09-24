import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/design-system/page-header";
import {
  SPACE_COVERAGE_UNAVAILABLE_LABEL,
  SPACE_NO_COVERAGE_EXPECTATION_LABEL,
  SPACE_UNTYPED_LABEL,
  spaceWorkspaceAnchorId,
  spaceWorkspaceEvidenceAnchorId,
  type SpaceWorkspaceSectionId,
  type SpaceWorkspaceViewModel,
} from "@/lib/unit-workspace/space";
import { SpaceWorkspaceFocus } from "@/components/unit-workspace/space-workspace-focus";

type Props = {
  view: SpaceWorkspaceViewModel;
  extras?: Partial<Record<SpaceWorkspaceSectionId, ReactNode>>;
};

function Card({
  id,
  title,
  children,
  className = "",
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
      data-testid={`space-workspace-${id}`}
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function sectionOrderClass(
  id: SpaceWorkspaceSectionId,
  employee: boolean,
): string {
  if (employee) return "";
  switch (id) {
    case "overview":
      return "order-1";
    case "coverage":
      return "order-3 md:order-2";
    case "evidence":
      return "order-2 md:order-3";
    case "assets":
      return "order-4";
    case "milestones":
      return "order-5";
    case "today":
      return "order-6";
  }
}

function Overview({ view }: { view: SpaceWorkspaceViewModel }) {
  const hierarchy = view.identity.breadcrumbs.map((row) => row.label).join(" → ");
  return (
    <section
      id={spaceWorkspaceAnchorId("overview")}
      className="scroll-mt-20 space-y-4"
      data-testid="space-workspace-overview"
    >
      <PageHeader
        icon="locations"
        title={view.identity.displayName}
        subtitle={[hierarchy, view.identity.operationalTypeName].filter(Boolean).join(" · ")}
        compact
        actions={
          view.configureHref ? (
            <Link
              href={view.configureHref}
              className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-800 underline underline-offset-2"
            >
              Configure this location
            </Link>
          ) : null
        }
      />

      {view.identity.untyped ? (
        <p className="text-sm text-zinc-600" data-testid="space-workspace-untyped">
          {SPACE_UNTYPED_LABEL}
        </p>
      ) : (
        <div data-testid="space-workspace-operation">
          <p className="text-sm font-semibold text-zinc-900">{view.operation.label}</p>
          {view.operation.windowLabel ? (
            <p className="text-sm text-zinc-600">{view.operation.windowLabel}</p>
          ) : null}
          {view.operation.upcomingLabel ? (
            <p className="text-sm text-zinc-600">Next operation: {view.operation.upcomingLabel}</p>
          ) : null}
        </div>
      )}

      {view.exceptions.length > 0 ? (
        <ul className="space-y-1" data-testid="space-workspace-exceptions">
          {view.exceptions.map((row) => (
            <li key={`${row.source}-${row.label}`} className="text-sm text-zinc-800">
              {row.href ? (
                <Link href={row.href} className="underline underline-offset-2">
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {view.next ? (
        <p className="text-sm text-zinc-700" data-testid="space-workspace-next">
          Next: {view.next.label} · {view.next.timeLabel}
        </p>
      ) : null}

      {view.recentChanges.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-600" data-testid="space-workspace-recent-changes">
          {view.recentChanges.map((row) => (
            <li key={`${row.atLabel}-${row.detail}`}>
              {row.atLabel ? `${row.atLabel} · ` : null}
              {row.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Coverage({ view }: { view: SpaceWorkspaceViewModel }) {
  return (
    <Card id={spaceWorkspaceAnchorId("coverage")} title="Staffing & Coverage">
      {view.coverage.unavailable ? (
        <p className="text-sm text-zinc-600" data-testid="space-workspace-coverage-unavailable">
          {SPACE_COVERAGE_UNAVAILABLE_LABEL}
        </p>
      ) : view.coverage.noExpectation ? (
        <p className="text-sm text-zinc-600">{SPACE_NO_COVERAGE_EXPECTATION_LABEL}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {view.coverage.slots.map((slot) => (
            <li key={slot.expectationId} className="px-3 py-3" data-testid="space-workspace-coverage-slot">
              <p className="text-sm font-semibold text-zinc-900">{slot.roleLabel}</p>
              <p className="mt-1 text-sm text-zinc-600">
                Required: {slot.requiredCount}
                {" · "}
                Assigned: {slot.filledCount}
                {" · "}
                Coverage: {slot.coverageLabel}
              </p>
              <p className="text-sm text-zinc-600">{slot.assignedSummary}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Evidence({ view }: { view: SpaceWorkspaceViewModel }) {
  return (
    <Card id={spaceWorkspaceAnchorId("evidence")} title="Work & Evidence">
      {view.retiredLogsTab ? (
        <p className="text-xs text-zinc-500">Logs is now part of Work & Evidence.</p>
      ) : null}
      {view.evidence.groups.length === 0 ? (
        <p className="text-sm text-zinc-600">No required evidence for this location right now.</p>
      ) : (
        view.evidence.groups.map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-semibold text-zinc-800">{group.title}</h3>
            <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {group.items.map((item) => (
                <li
                  key={item.requirementKey}
                  id={spaceWorkspaceEvidenceAnchorId(item.requirementKey)}
                  className={`flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
                    item.focused ? "bg-amber-50" : ""
                  }`}
                  data-testid="space-workspace-evidence-item"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.displayName}</p>
                    {item.windowLabel ? (
                      <p className="text-xs text-zinc-600">{item.windowLabel}</p>
                    ) : null}
                  </div>
                  {item.href && item.actionLabel ? (
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 min-w-[7rem] items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white"
                    >
                      {item.actionLabel}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {view.evidence.logBookHref ? (
        <Link
          href={view.evidence.logBookHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-800 underline underline-offset-2"
        >
          Open Log Book
        </Link>
      ) : null}
    </Card>
  );
}

function Assets({
  view,
  extra,
}: {
  view: SpaceWorkspaceViewModel;
  extra?: ReactNode;
}) {
  return (
    <Card id={spaceWorkspaceAnchorId("assets")} title="Assets & Issues">
      {view.assets.items.length === 0 ? (
        <p className="text-sm text-zinc-600">No local assets.</p>
      ) : (
        <ul className="space-y-3">
          {view.assets.items.map((asset) => (
            <li
              key={asset.assetId}
              className="rounded-md border border-zinc-200 px-3 py-3"
              data-testid="space-workspace-asset"
            >
              <p className="text-sm font-semibold text-zinc-900">{asset.name}</p>
              <p className="text-sm text-zinc-600">{asset.statusLabel}</p>
              <p className="text-xs text-zinc-500">
                Issues: {asset.openIssueCount}
                {" · "}
                Work orders: {asset.openWorkOrderCount}
              </p>
              {asset.issues.map((issue) => (
                <p key={issue.issueId} className="mt-1 text-sm text-zinc-700">
                  {issue.summary}
                  {" · "}
                  Impact: {issue.impactLabel}
                  {issue.href ? (
                    <>
                      {" · "}
                      <Link href={issue.href} className="underline underline-offset-2">
                        Open issue
                      </Link>
                    </>
                  ) : null}
                </p>
              ))}
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href={asset.href} className="text-sm underline underline-offset-2">
                  Open asset
                </Link>
                <Link href={asset.reportHref} className="text-sm underline underline-offset-2">
                  Report problem
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {view.managerLinks.maintenanceHref ? (
        <Link
          href={view.managerLinks.maintenanceHref}
          className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-800 underline underline-offset-2"
        >
          Open Maintenance
        </Link>
      ) : null}
      {extra}
    </Card>
  );
}

function Milestones({
  view,
  extra,
}: {
  view: SpaceWorkspaceViewModel;
  extra?: ReactNode;
}) {
  return (
    <Card id={spaceWorkspaceAnchorId("milestones")} title="Operations & Milestones">
      <ul className="space-y-3">
        {view.milestones.items.map((item) => (
          <li key={`${item.kind}-${item.label}`} data-testid="space-workspace-milestone">
            <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
            <dl className="mt-1 grid gap-1 text-sm text-zinc-600">
              {item.timing.configured ? (
                <div>
                  <dt className="inline text-zinc-500">Configured: </dt>
                  <dd className="inline">{item.timing.configured}</dd>
                </div>
              ) : null}
              {item.timing.adjusted ? (
                <div>
                  <dt className="inline text-zinc-500">Adjusted: </dt>
                  <dd className="inline">{item.timing.adjusted}</dd>
                </div>
              ) : null}
              {item.timing.actual ? (
                <div>
                  <dt className="inline text-zinc-500">Actual: </dt>
                  <dd className="inline">{item.timing.actual}</dd>
                </div>
              ) : null}
              {item.timing.recorded ? (
                <div>
                  <dt className="inline text-zinc-500">Recorded: </dt>
                  <dd className="inline">{item.timing.recorded}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
      {extra}
    </Card>
  );
}

function Today({ view }: { view: SpaceWorkspaceViewModel }) {
  return (
    <Card id={spaceWorkspaceAnchorId("today")} title="Today">
      <ol className="space-y-2" data-testid="space-workspace-today">
        {view.today.items.map((row) => (
          <li key={`${row.atLabel}-${row.detail}`} className="text-sm text-zinc-700">
            {row.atLabel ? <span className="font-medium text-zinc-900">{row.atLabel}</span> : null}
            {row.atLabel ? " · " : null}
            {row.detail}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function SpaceWorkspaceView({ view, extras }: Props) {
  const employee = view.sectionOrder[1] === "evidence";
  const present = new Set(view.sections.filter((row) => row.present).map((row) => row.id));
  const focusId =
    view.evidence.focusRequirementKey
      ? spaceWorkspaceEvidenceAnchorId(view.evidence.focusRequirementKey)
      : view.focusSectionId
        ? spaceWorkspaceAnchorId(view.focusSectionId)
        : null;

  return (
    <section
      className="mx-auto flex max-w-5xl flex-col gap-5 sm:gap-6"
      data-testid="space-workspace"
    >
      <SpaceWorkspaceFocus targetId={focusId} />
      {view.sectionOrder.map((id) => {
        if (id !== "overview" && !present.has(id)) {
          if (id === "assets" && extras?.assets) {
            return (
              <div key={id} className={sectionOrderClass(id, employee)}>
                <Assets view={view} extra={extras.assets} />
              </div>
            );
          }
          if (id === "milestones" && extras?.milestones) {
            return (
              <div key={id} className={sectionOrderClass(id, employee)}>
                <Milestones view={view} extra={extras.milestones} />
              </div>
            );
          }
          return null;
        }
        const className = sectionOrderClass(id, employee);
        switch (id) {
          case "overview":
            return (
              <div key={id} className={className}>
                <Overview view={view} />
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
                <Assets view={view} extra={extras?.assets} />
              </div>
            );
          case "milestones":
            return (
              <div key={id} className={className}>
                <Milestones view={view} extra={extras?.milestones} />
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
