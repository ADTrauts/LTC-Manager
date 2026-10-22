import Link from "next/link";

import { CachedMorningBriefPreview } from "@/components/business-workspace/cached-morning-brief-preview";
import {
  WorkspaceCollapsibleSection,
  WorkspaceCustomizePanel,
} from "@/components/business-workspace/workspace-customize";
import {
  ActionCard,
  EmptyState,
  MetricCard,
  OperationalListRow,
  PageHeader,
  operationalListShellClass,
} from "@/components/design-system";
import type {
  BusinessWorkspaceView as WorkspaceViewModel,
  WorkspaceSectionId,
} from "@/lib/business-workspace";
import {
  DASHBOARD_COVERAGE_UNAVAILABLE_LABEL,
  type DashboardWorkspaceViewModel,
} from "@/lib/business-workspace/dashboard/types";
import { orderedWorkspaceSections } from "@/lib/business-workspace";

function paceSummary(runtime: DashboardWorkspaceViewModel): string {
  const parts: string[] = [];
  if (runtime.pace.at_risk > 0) {
    parts.push(
      runtime.pace.at_risk === 1 ? "1 at risk" : `${runtime.pace.at_risk} at risk`,
    );
  }
  if (runtime.pace.on_time > 0) {
    parts.push(
      runtime.pace.on_time === 1 ? "1 on time" : `${runtime.pace.on_time} on time`,
    );
  }
  if (runtime.pace.ready > 0) {
    parts.push(runtime.pace.ready === 1 ? "1 ready" : `${runtime.pace.ready} ready`);
  }
  if (runtime.pace.idle > 0) {
    parts.push(runtime.pace.idle === 1 ? "1 idle" : `${runtime.pace.idle} idle`);
  }
  if (runtime.pace.unprogrammed > 0) {
    parts.push(
      runtime.pace.unprogrammed === 1
        ? "1 not programmed"
        : `${runtime.pace.unprogrammed} not programmed`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "No operational spaces in scope.";
}

function DashboardOverview({ runtime }: { runtime: DashboardWorkspaceViewModel }) {
  return (
    <section className="space-y-3" data-testid="dashboard-runtime-overview">
      <p className="text-lg font-semibold text-zinc-900" data-testid="dashboard-runtime-operation">
        {runtime.operation.label}
      </p>
      <ul className="space-y-1 text-sm text-zinc-600">
        <li>
          {runtime.operatingCount === 1
            ? "1 location operating"
            : `${runtime.operatingCount} locations operating`}
          {runtime.spaceCount > 0
            ? ` · ${runtime.spaceCount} operational ${runtime.spaceCount === 1 ? "space" : "spaces"}`
            : null}
        </li>
        <li data-testid="dashboard-runtime-pace">{paceSummary(runtime)}</li>
        <li className={runtime.attentionCount === 0 ? "hidden sm:list-item" : undefined} data-testid="dashboard-runtime-attention">
          {runtime.attentionCount === 0
            ? "No locations currently need attention"
            : runtime.attentionCount === 1
              ? "1 location needs attention"
              : `${runtime.attentionCount} locations need attention`}
        </li>
        {runtime.overdueEvidenceCount > 0 ? (
          <li>
            {runtime.overdueEvidenceCount === 1
              ? "1 overdue evidence item"
              : `${runtime.overdueEvidenceCount} overdue evidence items`}
          </li>
        ) : null}
        {runtime.assetImpactCount > 0 ? (
          <li>
            {runtime.assetImpactCount === 1
              ? "1 operational asset issue"
              : `${runtime.assetImpactCount} operational asset issues`}
          </li>
        ) : null}
        {runtime.configurationCount > 0 ? (
          <li className="text-zinc-500">
            {runtime.configurationCount === 1
              ? "1 location needs configuration"
              : `${runtime.configurationCount} locations need configuration`}
          </li>
        ) : null}
      </ul>
      <p className="text-sm text-zinc-600" data-testid="dashboard-runtime-coverage">
        Coverage: {runtime.coverage.unavailable ? DASHBOARD_COVERAGE_UNAVAILABLE_LABEL : runtime.coverage.summary}
      </p>
      {runtime.next ? (
        <p className="text-sm text-zinc-700" data-testid="dashboard-runtime-next">
          Next: {runtime.next.label} — {runtime.next.spaceName} — {runtime.next.timeLabel}
        </p>
      ) : null}
    </section>
  );
}

function DashboardInterventions({ runtime }: { runtime: DashboardWorkspaceViewModel }) {
  if (runtime.interventions.length === 0) {
    return (
      <EmptyState
        title="No locations currently need attention"
        description="Open Today's Work when you want the detailed walk, or view locations."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/today" className="text-sm font-medium text-zinc-800 underline">
              Today&apos;s Work
            </Link>
            <Link href="/units" className="text-sm font-medium text-zinc-800 underline">
              View locations
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="dashboard-runtime-interventions">
      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
        {runtime.interventions.map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="block min-h-11 px-3 py-3 hover:bg-zinc-50"
              data-testid="dashboard-runtime-intervention"
            >
              <p className="text-sm font-semibold text-zinc-900">{row.spaceName}</p>
              <p className="text-sm text-zinc-700">{row.label}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/today" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2">
        Open Today&apos;s Work
      </Link>
    </div>
  );
}

function DashboardUpcoming({ runtime }: { runtime: DashboardWorkspaceViewModel }) {
  if (runtime.upcoming.length === 0) {
    return <p className="text-sm text-zinc-600">No upcoming location events in scope.</p>;
  }
  return (
    <ul className="space-y-2" data-testid="dashboard-runtime-upcoming">
      {runtime.upcoming.map((row) => (
        <li key={`${row.spaceId}:${row.label}:${row.timeLabel}`}>
          <Link href={row.href} className="block min-h-11 rounded-md px-2 py-2 hover:bg-zinc-50">
            <p className="text-sm font-semibold text-zinc-900">{row.label}</p>
            <p className="text-sm text-zinc-600">
              {row.spaceName} · {row.timeLabel}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ManagerFocusSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="space-y-6">
      <DashboardOverview runtime={view.data.dashboardRuntime} />
      <DashboardInterventions runtime={view.data.dashboardRuntime} />
    </div>
  );
}

function ManagementAgendaSection({ view }: { view: WorkspaceViewModel }) {
  return <DashboardUpcoming runtime={view.data.dashboardRuntime} />;
}

function QuickActionsSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {view.data.quickActions.map((action) => (
        <ActionCard
          key={action.id}
          title={action.title}
          description={action.description}
          icon={action.icon}
          data-testid={`workspace-quick-${action.id}`}
          cta={
            <Link
              href={action.href}
              className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-900 underline"
            >
              Open
            </Link>
          }
        />
      ))}
    </div>
  );
}

function LinkCardsSection({
  cards,
}: {
  cards: WorkspaceViewModel["data"]["todaysWorkLinks"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <ActionCard
          key={card.id}
          title={card.title}
          description={card.description}
          icon={card.icon}
          cta={
            <Link href={card.href} className="text-sm font-medium text-zinc-900 underline">
              Open
            </Link>
          }
        />
      ))}
    </div>
  );
}

function PerformanceSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {view.data.performance.map((metric) => {
        if (!metric.href) {
          return (
            <MetricCard
              key={metric.id}
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              tone={metric.tone}
            />
          );
        }
        return (
          <Link
            key={metric.id}
            href={metric.href}
            className="block transition hover:opacity-95"
            data-testid={`workspace-metric-${metric.id}`}
          >
            <MetricCard
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              tone={metric.tone}
            />
          </Link>
        );
      })}
    </div>
  );
}

function RecentActivitySection({ view }: { view: WorkspaceViewModel }) {
  if (view.data.recentActivity.length === 0) {
    return (
      <EmptyState
        title="No recent activity"
        description="Meaningful inspections, issues, and knowledge updates will appear here."
        inset
      />
    );
  }

  return (
    <ul className={operationalListShellClass}>
      {view.data.recentActivity.map((item) => (
        <li key={item.id}>
          <OperationalListRow title={item.title} meta={item.meta} href={item.href} />
        </li>
      ))}
    </ul>
  );
}

function renderSection(id: WorkspaceSectionId, view: WorkspaceViewModel) {
  switch (id) {
    case "manager_focus":
      return <ManagerFocusSection view={view} />;
    case "management_agenda":
      return <ManagementAgendaSection view={view} />;
    case "quick_actions":
      return <QuickActionsSection view={view} />;
    case "todays_work":
      return <LinkCardsSection cards={view.data.todaysWorkLinks} />;
    case "operations":
      return <LinkCardsSection cards={view.data.operationsLinks} />;
    case "performance":
      return <PerformanceSection view={view} />;
    case "recent_activity":
      return <RecentActivitySection view={view} />;
    default:
      return null;
  }
}

export function BusinessWorkspaceScreen({ view }: { view: WorkspaceViewModel }) {
  const { header } = view.data;
  const sections = orderedWorkspaceSections(view.visibleSections, view.sectionOrder);
  const collapsed = new Set(view.collapsedSections);
  const hiddenOptional = view.customizableSections.filter(
    (id) => !view.visibleSections.includes(id),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-1 py-1 sm:space-y-6 sm:px-2 sm:py-2" data-testid="business-workspace">
      <PageHeader
        icon="operationsCenter"
        title="Business Workspace"
        subtitle={`${header.facilityName} · ${header.departmentLabel}`}
        below={
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-600">
            <p className="font-medium text-zinc-900">{header.greeting}</p>
          </div>
        }
      />

      {view.data.cachedMorningBrief ? (
        <CachedMorningBriefPreview brief={view.data.cachedMorningBrief} />
      ) : null}

      {view.canCustomize ? (
        <WorkspaceCustomizePanel
          customizableSections={view.customizableSections}
          hiddenSectionIds={hiddenOptional}
          preferredLandingSectionId={view.preferredLandingSectionId}
          visibleSectionIds={view.visibleSections}
          sectionOrder={view.sectionOrder}
        />
      ) : null}

      {sections.map((section) => {
        const title =
          section.id === "manager_focus"
            ? "Needs Attention"
            : section.id === "management_agenda"
              ? "Upcoming"
              : section.id === "performance"
                ? "Operation snapshot"
                : section.title;
        const description =
          section.id === "manager_focus"
            ? "Where you should intervene — canonical exceptions only."
            : section.id === "management_agenda"
              ? "Earliest upcoming events across visible spaces."
              : section.id === "performance"
                ? "Factual counts from current location state."
                : section.description;
        return (
          <WorkspaceCollapsibleSection
            key={section.id}
            sectionId={section.id}
            title={title}
            description={description}
            collapsed={collapsed.has(section.id)}
          >
            {renderSection(section.id, view)}
          </WorkspaceCollapsibleSection>
        );
      })}
    </div>
  );
}
