import Link from "next/link";

import { CachedMorningBriefPreview } from "@/components/business-workspace/cached-morning-brief-preview";
import {
  WorkspaceCollapsibleSection,
  WorkspaceCustomizePanel,
} from "@/components/business-workspace/workspace-customize";
import {
  ActionCard,
  AppCard,
  EmptyState,
  MetricCard,
  OperationalListRow,
  PageHeader,
  StatusBadge,
  operationalListShellClass,
} from "@/components/design-system";
import type {
  BusinessWorkspaceView as WorkspaceViewModel,
  ManagementAgendaBucket,
  WorkspaceSectionId,
} from "@/lib/business-workspace";
import {
  DASHBOARD_COVERAGE_UNAVAILABLE_LABEL,
  type DashboardWorkspaceViewModel,
} from "@/lib/business-workspace/dashboard/types";
import { orderedWorkspaceSections } from "@/lib/business-workspace";
import type { StatusTone } from "@/lib/design-system/status-styles";
import { OperationsCenterKeyTimeSummaries } from "@/components/operations-center/operations-center-key-time-summaries";
import { TodaysWorkRunOperationBanner } from "@/components/todays-work/todays-work-run-operation-banner";

function priorityStatusLabel(tone: StatusTone): string {
  if (tone === "blocked") return "Needs attention";
  if (tone === "warning") return "Watch";
  if (tone === "in_progress") return "In progress";
  if (tone === "ready") return "On track";
  return "Info";
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
        <li data-testid="dashboard-runtime-attention">
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
  if (view.data.dashboardRuntime) {
    return (
      <div className="space-y-6">
        <DashboardOverview runtime={view.data.dashboardRuntime} />
        <DashboardInterventions runtime={view.data.dashboardRuntime} />
      </div>
    );
  }

  const cards = view.data.managerFocus;
  const healthy = view.data.managerFocusHealthy;

  if (cards.length === 0 && healthy) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5"
        data-testid="workspace-focus-healthy"
      >
        <p className="text-lg font-semibold text-zinc-900">{healthy.title}</p>
        <p className="mt-1 text-sm text-zinc-600">{healthy.detail}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={healthy.primary.href}
            className="inline-flex rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          >
            {healthy.primary.label}
          </Link>
          {healthy.secondary.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className="text-sm font-medium text-zinc-800 underline"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="Current operations are on track."
        description="Open Today&apos;s Work when you are ready for the current-day walk."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/today" className="text-sm font-medium text-zinc-800 underline">
              Today&apos;s Work
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card, index) => (
        <AppCard
          key={card.id}
          title={card.title}
          subtitle={card.locationLabel}
          className={index === 0 ? "border-zinc-900 sm:col-span-2 xl:col-span-1" : undefined}
          data-testid={`workspace-focus-${card.id}`}
        >
          <div className="space-y-3">
            <p className="text-sm text-zinc-700">{card.explanation}</p>
            <p className="text-sm text-zinc-500">{card.whyItMatters}</p>
            <StatusBadge variant={card.tone === "default" ? "neutral" : card.tone}>
              {priorityStatusLabel(card.tone)}
            </StatusBadge>
            <Link
              href={card.href}
              className="inline-flex min-h-11 items-center rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            >
              {card.actionLabel}
            </Link>
          </div>
        </AppCard>
      ))}
    </div>
  );
}

function agendaBucketClass(bucket: ManagementAgendaBucket): string {
  if (bucket.temporal === "current") return "border-zinc-900 bg-zinc-50";
  if (bucket.temporal === "past") return "border-zinc-200 bg-zinc-50/50 opacity-80";
  return "border-zinc-200 bg-white";
}

function ManagementAgendaSection({ view }: { view: WorkspaceViewModel }) {
  if (view.data.dashboardRuntime) {
    return <DashboardUpcoming runtime={view.data.dashboardRuntime} />;
  }

  const buckets = view.data.managementAgenda;
  const current = buckets.find((bucket) => bucket.isCurrent);
  const others = buckets.filter((bucket) => !bucket.isCurrent);

  return (
    <div className="space-y-4" data-testid="workspace-agenda">
      {current ? (
        <AppCard
          title={current.label}
          subtitle="Now · current period"
          className={agendaBucketClass(current)}
          data-testid={`workspace-agenda-${current.id}`}
        >
          <ul className="space-y-2">
            {current.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-lg border border-zinc-200 bg-white p-3 hover:bg-zinc-50"
                >
                  <p className="font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        </AppCard>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {others.map((bucket) => (
          <AppCard
            key={bucket.id}
            title={bucket.label}
            subtitle={bucket.temporal === "past" ? "Earlier" : "Upcoming"}
            className={agendaBucketClass(bucket)}
            data-testid={`workspace-agenda-${bucket.id}`}
          >
            <ul className="space-y-2">
              {bucket.items.slice(0, 3).map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="block rounded-md p-2 hover:bg-white/80">
                    <p className="text-sm font-medium text-zinc-800">{item.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </AppCard>
        ))}
      </div>
    </div>
  );
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

function PrioritiesSection({ view }: { view: WorkspaceViewModel }) {
  const { priorities, header } = view.data;

  if (priorities.length === 0) {
    return (
      <EmptyState
        title="Current operations are on track."
        description="Open Today&apos;s Work when you need the detailed current-day walk."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/today" className="text-sm font-medium text-zinc-800 underline">
              Today&apos;s Work
            </Link>
          </div>
        }
      />
    );
  }

  const primary = priorities.filter((card) => !card.isWatch);
  const watch = priorities.filter((card) => card.isWatch);
  const showCalm = header.healthy || primary.length === 0;

  return (
    <div className="space-y-4">
      {showCalm ? (
        <p className="text-sm text-zinc-600" data-testid="workspace-priorities-healthy">
          Current operations are on track.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(showCalm ? watch : primary).map((card) => (
          <Link key={card.id} href={card.href} className="block transition hover:opacity-95">
            <AppCard
              title={card.title}
              subtitle={[card.locationLabel, card.departmentLabel].filter(Boolean).join(" · ") || card.detail}
              data-testid={`workspace-priority-${card.id}`}
            >
              <div className="space-y-2">
                <p className="text-sm text-zinc-600">{card.detail}</p>
                <StatusBadge variant={card.tone === "default" ? "neutral" : card.tone}>
                  {priorityStatusLabel(card.tone)}
                </StatusBadge>
              </div>
            </AppCard>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DepartmentHealthSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {view.data.departmentHealth.map((dept) => (
        <Link key={dept.key} href={dept.href} className="block transition hover:opacity-95">
          <AppCard title={dept.label} subtitle={dept.summary} data-testid={`workspace-dept-${dept.key}`}>
            <div className="space-y-2">
              <StatusBadge variant={dept.badge}>
                {dept.tone === "green"
                  ? "Ready"
                  : dept.tone === "yellow"
                    ? "In Progress"
                    : dept.tone === "red"
                      ? "Needs Attention"
                      : "Unset"}
              </StatusBadge>
              <p className="text-sm text-zinc-600">{dept.reason}</p>
              {dept.openPriorityWorkCount > 0 ? (
                <p className="text-xs text-zinc-500">
                  {dept.openPriorityWorkCount} open priority work item
                  {dept.openPriorityWorkCount === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </AppCard>
        </Link>
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
    case "priorities":
      return <PrioritiesSection view={view} />;
    case "department_health":
      return <DepartmentHealthSection view={view} />;
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
    <div className="mx-auto max-w-6xl space-y-8 px-1 py-2 sm:px-2" data-testid="business-workspace">
      <PageHeader
        icon="operationsCenter"
        title="Business Workspace"
        subtitle={`${header.facilityName} · ${header.departmentLabel}`}
        below={
          <div className="mt-3 space-y-1 text-sm text-zinc-600">
            <p className="text-lg font-medium text-zinc-900">{header.greeting}</p>
            {view.data.dashboardRuntime ? (
              <p data-testid="dashboard-runtime-header-operation">
                {view.data.dashboardRuntime.operation.label}
              </p>
            ) : header.runPresentation?.provenance === "NEW_PERIOD_KEY_TIME" ? (
              <TodaysWorkRunOperationBanner presentation={header.runPresentation} />
            ) : (
              <p>
                {header.operation.serviceLabel} — {header.operation.phase}
                {header.operation.scheduledTimeLabel
                  ? ` · ${header.operation.scheduledTimeLabel}`
                  : ""}
              </p>
            )}
            {!view.data.dashboardRuntime &&
            header.runPresentation?.provenance !== "NEW_PERIOD_KEY_TIME" &&
            header.keyTimeSummaries &&
            header.keyTimeSummaries.length > 0 ? (
              <OperationsCenterKeyTimeSummaries summaries={header.keyTimeSummaries} />
            ) : null}
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
        const runtime = view.data.dashboardRuntime;
        const title =
          runtime && section.id === "manager_focus"
            ? "Needs Attention"
            : runtime && section.id === "management_agenda"
              ? "Upcoming"
              : runtime && section.id === "performance"
                ? "Operation snapshot"
                : section.title;
        const description =
          runtime && section.id === "manager_focus"
            ? "Where you should intervene — canonical exceptions only."
            : runtime && section.id === "management_agenda"
              ? "Earliest upcoming events across visible spaces."
              : runtime && section.id === "performance"
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
