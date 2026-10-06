import Link from "next/link";

import { StatusBadge } from "@/components/design-system/StatusBadge";
import { formatProjectedDateLabel } from "@/lib/preventive-maintenance/presentation";
import {
  activePmRunWorkOrder,
  formatPmRunPriority,
  hasPmAttention,
  presentPmOccurrenceStateLabel,
  type PmRunRowInput,
  type PmRunBoardCounts,
} from "@/lib/preventive-maintenance/run-board";
import { repairStatusProductLabel } from "@/lib/asset-operations/repair-presentation";
import { presentPmOccurrence } from "@/lib/preventive-maintenance/version-semantics";
import { preventiveMaintenancePlanHref } from "@/lib/department-administration";

function occurrenceHref(occurrenceId: string | null) {
  return occurrenceId ? `/preventive-maintenance/${occurrenceId}` : null;
}

function rowStateLabel(row: PmRunRowInput) {
  if (!row.occurrenceId) return presentPmOccurrenceStateLabel("PROJECTED");
  if (row.configurationIssue && row.occurrenceStatus === "OPEN") return "Needs configuration";
  return presentPmOccurrenceStateLabel(
    presentPmOccurrence({
      status: row.occurrenceStatus,
      scheduledDate: row.scheduledDate,
      facilityToday: row.facilityToday,
    }),
  );
}

function PmRunRow({
  row,
  departmentId,
  canConfigure,
}: {
  row: PmRunRowInput;
  departmentId: string;
  canConfigure: boolean;
}) {
  const href = occurrenceHref(row.occurrenceId);
  const active = activePmRunWorkOrder(row.workOrders);
  const historical = row.workOrders.filter((wo) => wo.id !== active?.id);
  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white px-3 py-3"
      data-testid={row.occurrenceId ? `pm-run-row-${row.occurrenceId}` : "pm-run-projected-row"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {href ? (
            <Link
              href={href}
              className="text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline"
            >
              {row.planName}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-zinc-900">{row.planName}</p>
          )}
          <p className="text-sm text-zinc-700">
            {row.assetName} · {row.assetCode}
          </p>
          <p className="text-xs text-zinc-600">
            {row.locationLabel}
            {row.locationIsPreview ? " · current Asset location (preview)" : ""}
          </p>
          <p className="text-xs text-zinc-700" data-testid="pm-run-scheduled">
            Scheduled {formatProjectedDateLabel(row.scheduledDate, { includeYear: true })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge variant={rowStateLabel(row) === "Overdue" ? "warning" : "neutral"}>
            {rowStateLabel(row)}
          </StatusBadge>
          {row.planStatus === "RETIRED" ? (
            <p className="text-xs text-zinc-600" data-testid="pm-plan-retired-flag">
              Plan retired
            </p>
          ) : null}
          {row.assetStatus === "RETIRED" ? (
            <p className="text-xs text-amber-800" data-testid="pm-asset-retired-flag">
              Asset retired
            </p>
          ) : null}
          {row.assetStatus === "OUT_OF_SERVICE" ? (
            <p className="text-xs text-zinc-600">Asset currently out of service</p>
          ) : null}
        </div>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="inline text-zinc-500">Priority: </dt>
          <dd className="inline">{formatPmRunPriority(row.priority)}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500">Category: </dt>
          <dd className="inline">{row.categoryLabel ?? "—"}</dd>
        </div>
        {active ? (
          <div>
            <dt className="inline text-zinc-500">Work Order: </dt>
            <dd className="inline">
              <Link href={`/repairs/${active.id}`} className="underline underline-offset-2">
                {active.repairCode}
              </Link>{" "}
              · {repairStatusProductLabel(active.status as "OPEN")} ·{" "}
              {active.assigneeLabel ?? "Unassigned"}
            </dd>
          </div>
        ) : row.configurationIssue ? (
          <div data-testid="pm-needs-configuration">
            <dt className="inline text-zinc-500">Work Order: </dt>
            <dd className="inline">Work Order could not be generated</dd>
          </div>
        ) : (
          <div>
            <dt className="inline text-zinc-500">Work Order: </dt>
            <dd className="inline">
              {row.workOrders.length > 0 ? "No active Work Order" : "—"}
            </dd>
          </div>
        )}
      </dl>
      {historical.length > 0 ? (
        <p className="mt-1 text-xs text-zinc-500">
          Earlier Work Orders: {historical.map((wo) => `${wo.repairCode} (${wo.status.toLowerCase()})`).join(", ")}
        </p>
      ) : null}
      <p className="mt-2 text-xs">
        <Link
          href={preventiveMaintenancePlanHref(departmentId, row.planId)}
          className="font-medium underline underline-offset-2"
          data-testid="pm-view-plan"
        >
          {canConfigure ? "Configure Plan" : "View Plan"}
        </Link>
      </p>
    </article>
  );
}

function Section({
  title,
  testId,
  rows,
  empty,
  departmentId,
  canConfigure,
}: {
  title: string;
  testId: string;
  rows: PmRunRowInput[];
  empty?: string;
  departmentId: string;
  canConfigure: boolean;
}) {
  if (rows.length === 0) {
    return empty ? (
      <p className="text-sm text-zinc-600" data-testid={`${testId}-empty`}>
        {empty}
      </p>
    ) : null;
  }
  return (
    <section className="space-y-2" data-testid={testId}>
      <h2 className="text-base font-semibold text-zinc-900">
        {title}{" "}
        <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
      </h2>
      <div className="space-y-2">
        {rows.map((row) => (
          <PmRunRow
            key={row.occurrenceId ?? `${row.planId}-${String(row.scheduledDate)}`}
            row={row}
            departmentId={departmentId}
            canConfigure={canConfigure}
          />
        ))}
      </div>
    </section>
  );
}

export function PmRunBoard({
  departmentId,
  publishedPlanCount,
  canConfigure,
  canDraft,
  grouped,
  counts,
  view,
}: {
  departmentId: string;
  publishedPlanCount: number;
  canConfigure: boolean;
  canDraft: boolean;
  grouped: {
    overdue: PmRunRowInput[];
    dueToday: PmRunRowInput[];
    unassigned: PmRunRowInput[];
    dueSoon: PmRunRowInput[];
    needsConfiguration: PmRunRowInput[];
    completed: PmRunRowInput[];
    skipped: PmRunRowInput[];
    projected: PmRunRowInput[];
  };
  counts: PmRunBoardCounts;
  view: "attention" | "completed" | "skipped" | "projected";
}) {
  const buildHref = `/build/departments/${departmentId}/preventive-maintenance`;
  const tabs: Array<{ id: typeof view; label: string }> = [
    { id: "attention", label: "Needs attention" },
    { id: "completed", label: "Completed" },
    { id: "skipped", label: "Skipped" },
    { id: "projected", label: "Upcoming schedule" },
  ];

  return (
    <div className="space-y-6" data-testid="pm-run-board">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Preventive Maintenance</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Operational schedule for published Plans. Execution stays on Work Orders.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="pm-run-counts">
        {[
          ["Overdue", counts.overdue, "overdue"],
          ["Due today", counts.dueToday, "due-today"],
          ["Unassigned", counts.unassigned, "unassigned"],
          ["Due soon", counts.dueSoon, "due-soon"],
        ].map(([label, value, id]) => (
          <div key={id} className="rounded-md border border-zinc-200 bg-white px-3 py-2">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="text-lg font-semibold text-zinc-900" data-testid={`pm-count-${id}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <nav className="flex flex-wrap gap-2" aria-label="Preventive Maintenance views">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.id === "attention" ? "/preventive-maintenance" : `/preventive-maintenance?view=${tab.id}`}
            className={
              view === tab.id
                ? "inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white"
                : "inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800"
            }
            data-testid={`pm-run-view-${tab.id}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {publishedPlanCount === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-700" data-testid="pm-run-no-plans">
          No Preventive Maintenance Plans are published.
          {canDraft ? (
            <>
              {" "}
              <Link href={buildHref} className="font-medium underline underline-offset-2">
                Configure a Plan
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {view === "attention" ? (
        publishedPlanCount > 0 && !hasPmAttention(counts) && grouped.needsConfiguration.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-700" data-testid="pm-run-empty">
            No preventive maintenance needs attention right now.
          </p>
        ) : (
          <div className="space-y-6">
            <Section
              title="Overdue"
              testId="pm-run-overdue"
              rows={grouped.overdue}
              departmentId={departmentId}
              canConfigure={canConfigure}
            />
            <Section
              title="Due today"
              testId="pm-run-due-today"
              rows={grouped.dueToday}
              departmentId={departmentId}
              canConfigure={canConfigure}
            />
            <Section
              title="Unassigned"
              testId="pm-run-unassigned"
              rows={grouped.unassigned}
              departmentId={departmentId}
              canConfigure={canConfigure}
            />
            <Section
              title="Due soon"
              testId="pm-run-due-soon"
              rows={grouped.dueSoon}
              departmentId={departmentId}
              canConfigure={canConfigure}
            />
            <Section
              title="Needs configuration"
              testId="pm-run-config"
              rows={grouped.needsConfiguration}
              departmentId={departmentId}
              canConfigure={canConfigure}
            />
          </div>
        )
      ) : null}

      {view === "completed" ? (
        <Section
          title="Completed"
          testId="pm-run-completed"
          rows={grouped.completed}
          empty="No completed preventive maintenance yet."
          departmentId={departmentId}
          canConfigure={canConfigure}
        />
      ) : null}
      {view === "skipped" ? (
        <Section
          title="Skipped"
          testId="pm-run-skipped"
          rows={grouped.skipped}
          empty="No skipped scheduled maintenance."
          departmentId={departmentId}
          canConfigure={canConfigure}
        />
      ) : null}
      {view === "projected" ? (
        <Section
          title="Upcoming schedule"
          testId="pm-run-projected"
          rows={grouped.projected}
          empty="No upcoming schedule dates."
          departmentId={departmentId}
          canConfigure={canConfigure}
        />
      ) : null}
    </div>
  );
}
