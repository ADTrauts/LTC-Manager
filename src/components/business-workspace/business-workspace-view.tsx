import Link from "next/link";

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
  WorkspaceSectionId,
} from "@/lib/business-workspace";
import { orderedWorkspaceSections } from "@/lib/business-workspace";
import type { StatusTone } from "@/lib/design-system/status-styles";

function priorityStatusLabel(tone: StatusTone): string {
  if (tone === "blocked") return "Needs attention";
  if (tone === "warning") return "Watch";
  if (tone === "in_progress") return "In progress";
  if (tone === "ready") return "On track";
  return "Info";
}

function ManagerFocusSection({ view }: { view: WorkspaceViewModel }) {
  const cards = view.data.managerFocus;
  if (cards.length === 0) {
    return (
      <EmptyState
        title="Nothing needs your personal focus right now."
        description="Current operations are on track. Use the agenda or quick actions when you are ready."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-800 underline">
              Operations Center
            </Link>
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
      {cards.map((card) => (
        <AppCard
          key={card.id}
          title={card.title}
          subtitle={card.locationLabel}
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
              className="inline-flex rounded-lg border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            >
              {card.actionLabel}
            </Link>
          </div>
        </AppCard>
      ))}
    </div>
  );
}

function ManagementAgendaSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="workspace-agenda">
      {view.data.managementAgenda.map((bucket) => (
        <AppCard
          key={bucket.id}
          title={bucket.label}
          subtitle={bucket.isCurrent ? "Current window" : undefined}
          data-testid={`workspace-agenda-${bucket.id}`}
        >
          <ul className="space-y-3">
            {bucket.items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="block rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50">
                  <p className="font-medium text-zinc-900">{item.title}</p>
                  <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        </AppCard>
      ))}
    </div>
  );
}

function QuickActionsSection({ view }: { view: WorkspaceViewModel }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {view.data.quickActions.map((action) => (
        <ActionCard
          key={action.id}
          title={action.title}
          description={action.description}
          icon={action.icon}
          data-testid={`workspace-quick-${action.id}`}
          cta={
            <Link href={action.href} className="text-sm font-medium text-zinc-900 underline">
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
        description="Open Operations Center or Today&apos;s Work when you need the detailed walk."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-800 underline">
              Operations Center
            </Link>
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
    <div className="mx-auto max-w-6xl space-y-10 px-1 py-2 sm:px-2" data-testid="business-workspace">
      <PageHeader
        icon="operationsCenter"
        title="Business Workspace"
        subtitle={`${header.facilityName} · ${header.departmentLabel}`}
        below={
          <div className="mt-3 space-y-1 text-sm text-zinc-600">
            <p className="text-lg font-medium text-zinc-900">{header.greeting}</p>
            <p>
              {header.operation.serviceLabel} — {header.operation.phase}
              {header.operation.scheduledTimeLabel
                ? ` · ${header.operation.scheduledTimeLabel}`
                : ""}
            </p>
          </div>
        }
      />

      {view.canCustomize ? (
        <WorkspaceCustomizePanel
          customizableSections={view.customizableSections}
          hiddenSectionIds={hiddenOptional}
          preferredLandingSectionId={view.preferredLandingSectionId}
          visibleSectionIds={view.visibleSections}
          sectionOrder={view.sectionOrder}
        />
      ) : null}

      {sections.map((section) => (
        <WorkspaceCollapsibleSection
          key={section.id}
          sectionId={section.id}
          title={section.title}
          description={section.description}
          collapsed={collapsed.has(section.id)}
        >
          {renderSection(section.id, view)}
        </WorkspaceCollapsibleSection>
      ))}
    </div>
  );
}
