import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { MaintenanceSubNav } from "@/components/maintenance-sub-nav";
import { PmSkipForm } from "@/components/plant-operations/pm-skip-form";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { repairStatusProductLabel } from "@/lib/asset-operations/repair-presentation";
import { formatProjectedDateLabel } from "@/lib/preventive-maintenance/presentation";
import {
  activePmRunWorkOrder,
  formatPmRunPriority,
  presentPmOccurrenceStateLabel,
  presentPmProcedureField,
} from "@/lib/preventive-maintenance/run-board";
import { presentPmOccurrence } from "@/lib/preventive-maintenance/version-semantics";
import { isPmActiveWorkOrderStatus } from "@/lib/preventive-maintenance/active-work-order";
import { loadPlantRunDepartment, loadPmOccurrenceDetail } from "@/lib/preventive-maintenance/run-load";

type PageProps = {
  params: Promise<{ occurrenceId: string }>;
};

export default async function PreventiveMaintenanceOccurrencePage({ params }: PageProps) {
  noStore();
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) redirect("/repairs");

  const department = await loadPlantRunDepartment(session);
  if (!department) notFound();
  const { occurrenceId } = await params;
  const detail = await loadPmOccurrenceDetail(session, {
    facilityId: session.facilityId,
    departmentId: department.id,
    occurrenceId,
  });
  if (!detail.row) notFound();
  const row = detail.row;
  const active = activePmRunWorkOrder(row.workOrders);
  const state = presentPmOccurrenceStateLabel(
    presentPmOccurrence({
      status: row.occurrenceStatus,
      scheduledDate: row.scheduledDate,
      facilityToday: row.facilityToday,
    }),
  );
  const skipBlocked = active
    ? "Cancel or complete the active Work Order first."
    : row.occurrenceStatus !== "OPEN"
      ? "Only open scheduled maintenance can be skipped."
      : null;

  return (
    <section className="space-y-6" data-testid="pm-occurrence-detail">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Maintenance</h1>
        <MaintenanceSubNav role={session.role} activeId="preventive" />
      </header>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-zinc-500">
              <Link href="/preventive-maintenance" className="underline underline-offset-2">
                Preventive Maintenance
              </Link>
            </p>
            <h2 className="text-lg font-semibold text-zinc-900">{row.planName}</h2>
            <p className="text-sm text-zinc-700">
              {row.assetName} · {row.assetCode}
            </p>
          </div>
          <StatusBadge variant={state === "Overdue" ? "warning" : "neutral"}>{state}</StatusBadge>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scheduled</dt>
            <dd data-testid="pm-occurrence-scheduled">
              {formatProjectedDateLabel(row.scheduledDate, { includeYear: true })}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plan version</dt>
            <dd>v{detail.versionNumber} · {detail.cadenceSummary}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Location</dt>
            <dd>
              {row.locationLabel}
              {row.locationIsPreview ? " (current Asset location)" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Priority</dt>
            <dd>{formatPmRunPriority(row.priority)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Category</dt>
            <dd>{row.categoryLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Procedure</dt>
            <dd>{presentPmProcedureField(row.procedureLabel)}</dd>
          </div>
        </dl>
        {row.planStatus === "RETIRED" ? (
          <p className="text-sm text-zinc-700" data-testid="pm-plan-retired-flag">
            Plan retired
          </p>
        ) : null}
        {detail.planHref ? (
          <Link href={detail.planHref} className="text-sm font-medium underline underline-offset-2">
            {detail.authority.canPublish ? "Configure Plan" : "View Plan"}
          </Link>
        ) : null}

        <section className="space-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-4">
          <h3 className="text-base font-semibold text-zinc-900">Work Orders</h3>
          {row.workOrders.length === 0 ? (
            <p className="text-sm text-zinc-600">No Work Order has been generated for this scheduled maintenance.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {row.workOrders.map((wo) => {
                const isActive = isPmActiveWorkOrderStatus(wo.status);
                return (
                  <li key={wo.id} data-testid={isActive ? "pm-active-work-order" : "pm-historical-work-order"}>
                    <Link href={`/repairs/${wo.id}`} className="font-medium underline underline-offset-2">
                      {wo.repairCode}
                    </Link>
                    {" · "}
                    {repairStatusProductLabel(wo.status as "OPEN")}
                    {" · "}
                    {wo.assigneeLabel ?? "Unassigned"}
                    {isActive ? " · current" : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {row.occurrenceStatus === "SKIPPED" ? (
          <section className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4" data-testid="pm-skip-record">
            <h3 className="text-base font-semibold text-zinc-900">Skipped</h3>
            <p className="mt-1 text-sm text-zinc-700">{row.skipReason}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {row.skippedByLabel ?? "Supervisor"}
              {row.skippedAt ? ` · ${row.skippedAt.slice(0, 10)}` : ""}
            </p>
          </section>
        ) : detail.authority.canSkip ? (
          <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
            <h3 className="text-base font-semibold text-zinc-900">Skip this scheduled maintenance</h3>
            <div className="mt-2">
              <PmSkipForm occurrenceId={row.occurrenceId!} blockedReason={skipBlocked} />
            </div>
          </section>
        ) : null}

        {row.occurrenceStatus === "COMPLETED" ? (
          <p className="text-sm text-zinc-700" data-testid="pm-occurrence-completed">
            Completed
            {row.completedAt ? ` ${row.completedAt.slice(0, 10)}` : ""}
            {active ? "" : row.workOrders.find((wo) => wo.status === "COMPLETED")
              ? ` · ${row.workOrders.find((wo) => wo.status === "COMPLETED")?.repairCode}`
              : ""}
          </p>
        ) : null}
      </div>
    </section>
  );
}
