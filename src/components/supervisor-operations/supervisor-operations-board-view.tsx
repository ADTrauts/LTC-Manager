import Link from "next/link";
import type { ReactNode } from "react";

import {
  EmptyState,
  OperationalListRow,
  PageHeader,
  SectionHeader,
  StatusBadge,
  operationalListShellClass,
} from "@/components/design-system";
import {
  presentSupervisorOperationsBoardUi,
  type BoardAttentionCategory,
  type PresentedAttentionRow,
  type PresentedChip,
} from "@/lib/dietary-job-flow/supervisor-operations/present-ui";
import type { SupervisorOperationsViewModel } from "@/lib/dietary-job-flow/supervisor-operations/types";

type BoardViewProps = {
  view: SupervisorOperationsViewModel;
  canOpenBuilder: boolean;
  builderHref: string;
  overlay?: ReactNode;
};

function chipClass(chip: PresentedChip): string {
  if (chip.label === "Uncovered" && chip.value > 0) {
    return "rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-900";
  }
  if (chip.label === "At Risk" && chip.value > 0) {
    return "rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900";
  }
  if (chip.emphasis === "low") {
    return "rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600";
  }
  return "rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800";
}

function evidenceKindLabel(kind: PresentedAttentionRow["kind"]): string | null {
  if (kind === "historical") return "Historical";
  if (kind === "current") return "Current";
  return null;
}

function categoryEyebrow(category: BoardAttentionCategory): string {
  return category;
}

export function SupervisorOperationsBoardView({
  view,
  canOpenBuilder,
  builderHref,
  overlay,
}: BoardViewProps) {
  const presented = presentSupervisorOperationsBoardUi(view);
  const { currentOperation, assignmentCoverage, needsAttention, people, sync, evs, locationsHref } =
    presented;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="supervisor-operations-board">
      <PageHeader
        title="Operations Board"
        subtitle={`${view.identity.facilityName} · ${view.identity.departmentName} · ${view.identity.operationalDateKey}`}
        compact
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={presented.assignmentHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Assignment Board
            </Link>
            <Link
              href={presented.cyclesHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cycle overview
            </Link>
            <Link
              href="/staffing"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Staffing
            </Link>
            <Link
              href={locationsHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              data-testid="supervisor-ops-view-locations"
            >
              View locations
            </Link>
            {canOpenBuilder ? (
              <Link
                href={builderHref}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Department Builder
              </Link>
            ) : null}
          </div>
        }
      />

      <section
        className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
        data-testid="supervisor-ops-current-operation"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Current operation
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-900">{currentOperation.label}</p>
        {currentOperation.planStatus ? (
          <p className="mt-0.5 text-xs text-zinc-500">{currentOperation.planStatus}</p>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="supervisor-ops-assignment-coverage">
        <SectionHeader title="Assignment & Coverage" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
          <Link
            href={assignmentCoverage.scheduledHref}
            className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-600 hover:bg-zinc-100"
            data-testid="supervisor-ops-scheduled"
          >
            Scheduled {assignmentCoverage.scheduledCount}
          </Link>
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1">
            Call-offs {assignmentCoverage.callOffCount}
          </span>
        </div>
        {assignmentCoverage.assignmentUnavailable || assignmentCoverage.coverageUnavailable ? (
          <div className="space-y-1 text-sm text-zinc-700">
            {assignmentCoverage.assignmentUnavailable ? (
              <p data-testid="supervisor-ops-assignment-unavailable">Assignment unavailable</p>
            ) : null}
            {assignmentCoverage.coverageUnavailable ? (
              <p data-testid="supervisor-ops-coverage-unavailable">Coverage unavailable</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {assignmentCoverage.chips.map((chip) => (
                <span key={chip.label} className={chipClass(chip)} data-testid={`supervisor-ops-chip-${chip.label.toLowerCase().replace(" ", "-")}`}>
                  {chip.label} {chip.value}
                </span>
              ))}
            </div>
            {assignmentCoverage.quietCoverage ? (
              <EmptyState
                title="No current coverage gaps"
                tone="neutral"
                inset
                data-testid="supervisor-ops-coverage-quiet"
              />
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-3" data-testid="supervisor-ops-needs-attention">
        <SectionHeader title="Needs Attention" />
        {needsAttention.quiet ? (
          <EmptyState
            title="No current supervisor interventions"
            tone="neutral"
            inset
            data-testid="supervisor-ops-attention-quiet"
          />
        ) : (
          needsAttention.sections.map((section) => (
            <div key={section.category} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {categoryEyebrow(section.category)}
              </h3>
              <ul className={operationalListShellClass}>
                {section.items.map((item, index) => (
                  <OperationalListRow
                    key={`${section.category}-${item.href}-${item.detail}-${index}`}
                    title={item.title}
                    description={item.detail}
                    meta={
                      evidenceKindLabel(item.kind) ? (
                        <StatusBadge variant={item.kind === "historical" ? "neutral" : "warning"}>
                          {evidenceKindLabel(item.kind)}
                        </StatusBadge>
                      ) : undefined
                    }
                    actions={
                      <Link
                        href={item.href}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        {item.actionLabel}
                      </Link>
                    }
                    testId="supervisor-operations-exception"
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {people.show ? (
        <section className="space-y-3" data-testid="supervisor-ops-people">
          <SectionHeader title="People" />
          <ul className={operationalListShellClass}>
            {people.rows.map((row, index) => (
              <OperationalListRow
                key={`${row.title}-${row.href}-${index}`}
                title={row.title}
                description={row.detail ?? undefined}
                actions={
                  <Link
                    href={row.href}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    {row.actionLabel}
                  </Link>
                }
                testId="supervisor-ops-person"
              />
            ))}
          </ul>
        </section>
      ) : null}

      {sync.show ? (
        <section className="space-y-3" data-testid="supervisor-ops-sync">
          <SectionHeader title="Offline / Sync" />
          <ul className={operationalListShellClass}>
            {sync.rows.map((row, index) => (
              <OperationalListRow
                key={`${row.title}-${row.href}-${index}`}
                title={row.title}
                description={row.detail ?? undefined}
                actions={
                  <Link
                    href={row.href}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    {row.actionLabel}
                  </Link>
                }
                testId="supervisor-ops-sync-row"
              />
            ))}
          </ul>
          {sync.limitationNote ? (
            <p className="text-xs text-zinc-500" data-testid="supervisor-ops-sync-limitation">
              {sync.limitationNote}
            </p>
          ) : null}
        </section>
      ) : null}

      {evs ? (
        <section className="space-y-4" data-testid="supervisor-ops-evs-overlay">
          <SectionHeader title="Location coverage" description="EVS location responsibility for the current filters." />
          <form
            method="get"
            className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4"
            data-testid="supervisor-ops-location-filters"
          >
            <label className="text-xs text-zinc-600">
              Floor
              <select
                name="floor"
                defaultValue={evs.filters.floor ?? ""}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">All floors</option>
                {evs.filters.floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              Unit
              <select
                name="unit"
                defaultValue={evs.filters.unit ?? ""}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">All units</option>
                {evs.filters.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              Zone
              <select
                name="zone"
                defaultValue={evs.filters.zone ?? ""}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">All zones</option>
                {evs.filters.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              Employee
              <select
                name="employee"
                defaultValue={evs.filters.employee ?? ""}
                className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="">All employees</option>
                {evs.filters.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Apply filters
            </button>
            <Link
              href="/staffing/operations"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              Clear
            </Link>
          </form>

          <div className="space-y-2" data-testid="supervisor-ops-location-exceptions">
            <h3 className="text-sm font-semibold text-zinc-900">
              Unassigned locations ({evs.locationCoverage.unassigned.length})
            </h3>
            {evs.locationCoverage.unassigned.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500">
                No unassigned Rooms / Spaces for the current filters.
              </p>
            ) : (
              <ul className={operationalListShellClass}>
                {evs.locationCoverage.unassigned.map((row) => (
                  <OperationalListRow
                    key={row.unitSpaceId}
                    title={row.label}
                    description={[row.floorName, row.unitName].filter(Boolean).join(" · ")}
                    actions={
                      <Link
                        href={presented.assignmentHref}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Open Assignment Board
                      </Link>
                    }
                    testId="supervisor-ops-unassigned-location"
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-900">
              Overlapping locations ({evs.locationCoverage.overlapping.length})
            </h3>
            {evs.locationCoverage.overlapping.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-500">
                No overlapping Room / Space responsibility for the current filters.
              </p>
            ) : (
              <ul className={operationalListShellClass}>
                {evs.locationCoverage.overlapping.map((row) => (
                  <OperationalListRow
                    key={row.unitSpaceId}
                    title={row.label}
                    description={[
                      [row.floorName, row.unitName].filter(Boolean).join(" · "),
                      row.employeeLabels.length > 0 ? row.employeeLabels.join(", ") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    actions={
                      <Link
                        href={presented.assignmentHref}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Open Assignment Board
                      </Link>
                    }
                    testId="supervisor-ops-overlapping-location"
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {overlay}
    </section>
  );
}
