import Link from "next/link";

import { SectionHeader } from "@/components/design-system/SectionHeader";
import {
  operationalListShellClass,
  operationalListShellMutedClass,
} from "@/components/design-system/OperationalListRow";
import type { SupervisorDailyCoverageProjection } from "@/lib/scheduling/supervisor-daily-coverage";
import { timeStateLabel } from "@/lib/scheduling/supervisor-daily-coverage";

type Props = {
  coverage: SupervisorDailyCoverageProjection;
  canManage: boolean;
};

/**
 * Supervisor Daily Coverage panel for Today's Work.
 * Read-only projection with links into canonical Schedule / Daily Assignment flows.
 */
export function SupervisorDailyCoveragePanel({ coverage, canManage }: Props) {
  const { summary, employees, floors, neighborhoods } = coverage;
  const exceptions = employees.filter(
    (e) =>
      e.relationship === "SCHEDULED_UNASSIGNED" || e.relationship === "ASSIGNED_UNSCHEDULED",
  );
  const healthy = employees.filter((e) => e.relationship === "SCHEDULED_AND_ASSIGNED");

  return (
    <div className="space-y-5" data-testid="supervisor-daily-coverage">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            {coverage.departmentName} staffing
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            Who is working today, what they own, and what still needs action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-800">
            {summary.workingCount} working
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-800">
            {summary.assignedCount} assigned
          </span>
          {summary.needAssignmentCount > 0 ? (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
              {summary.needAssignmentCount} need assignment
            </span>
          ) : null}
          {summary.assignedUnscheduledCount > 0 ? (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
              {summary.assignedUnscheduledCount} not scheduled
            </span>
          ) : null}
          {summary.floorUncoveredCount > 0 ? (
            <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-800">
              {summary.floorUncoveredCount} floor{summary.floorUncoveredCount === 1 ? "" : "s"} need
              coverage
            </span>
          ) : null}
        </div>
      </div>

      {coverage.emptyMessage ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {coverage.emptyMessage}
        </p>
      ) : null}

      {coverage.locationScopeNote ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {coverage.locationScopeNote}
        </p>
      ) : null}

      {exceptions.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Needs action" className="mb-3" />
          <div className={`${operationalListShellClass} border-amber-200`}>
            <ul className="divide-y divide-zinc-100">
              {exceptions.map((row) => (
                <li
                  key={row.employeeId}
                  className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
                  data-testid={`coverage-exception-${row.employeeId}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {row.employeeFirstName} {row.employeeLastName}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {[row.teamDisplayName, row.jobRoleDisplayName ?? "No Job Role"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-sm text-zinc-800">
                      {row.shiftWindowLabels.length > 0
                        ? row.shiftWindowLabels.join(", ")
                        : "No shift"}
                      {timeStateLabel(row.timeState) ? (
                        <span className="ml-2 text-xs text-zinc-500">
                          {timeStateLabel(row.timeState)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-amber-900">
                      {row.coverageContext ?? row.relationshipLabel}
                    </p>
                    {row.assignmentRoomLabels.length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-zinc-500 touch-manipulation">
                          View Rooms
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                          {row.assignmentRoomLabels.map((label) => (
                            <li key={label}>{label}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {row.relationship === "SCHEDULED_UNASSIGNED" ? (
                        <Link
                          href={row.assignCoverageHref}
                          className="inline-flex min-h-10 items-center rounded-md border border-indigo-300 bg-indigo-50 px-3 text-sm font-medium text-indigo-900 touch-manipulation hover:bg-indigo-100"
                        >
                          Assign coverage
                        </Link>
                      ) : null}
                      {row.relationship === "ASSIGNED_UNSCHEDULED" ? (
                        <Link
                          href={row.addShiftHref}
                          className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 touch-manipulation hover:bg-zinc-50"
                        >
                          Add shift
                        </Link>
                      ) : null}
                      <Link
                        href={row.editScheduleHref}
                        className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 touch-manipulation hover:bg-zinc-50"
                      >
                        Edit shift
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {floors.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Coverage by Floor" className="mb-3" />
          <div className={operationalListShellMutedClass}>
            <ul className="divide-y divide-zinc-100" data-testid="coverage-floor-list">
              {floors.map((floor) => (
                <li key={floor.floorUnitId} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{floor.summaryLabel}</p>
                    <span
                      className={
                        floor.status === "full"
                          ? "text-xs text-zinc-500"
                          : floor.status === "partial"
                            ? "text-xs text-amber-800"
                            : "text-xs text-rose-800"
                      }
                    >
                      {floor.status === "full"
                        ? "Covered"
                        : floor.status === "partial"
                          ? "Partial"
                          : floor.status === "uncovered"
                            ? "Needs coverage"
                            : "Unknown"}
                    </span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-zinc-500 touch-manipulation">
                      {floor.assignedRoomCount}/{floor.eligibleRoomCount} Rooms
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                      {floor.rooms.map((room) => (
                        <li key={room.unitSpaceId}>
                          {room.roomName}
                          {room.assignedEmployeeNames.length > 0
                            ? ` — ${room.assignedEmployeeNames.join(", ")}`
                            : " — unassigned"}
                        </li>
                      ))}
                    </ul>
                  </details>
                  {canManage && floor.status !== "full" ? (
                    <Link
                      href={`/staffing/assignments?date=${coverage.serviceDate}`}
                      className="mt-2 inline-flex min-h-10 items-center text-xs font-medium text-indigo-800 touch-manipulation hover:underline"
                    >
                      Assign employee
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {neighborhoods.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Coverage by Neighborhood" muted className="mb-3" />
          <div className={operationalListShellMutedClass}>
            <ul className="divide-y divide-zinc-100" data-testid="coverage-neighborhood-list">
              {neighborhoods.map((n) => (
                <li key={n.neighborhoodUnitId} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{n.summaryLabel}</p>
                    <span className="text-xs text-zinc-500">
                      {n.assignedRoomCount}/{n.eligibleRoomCount} Rooms
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {healthy.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Assigned staff" muted className="mb-3" />
          <div className={operationalListShellMutedClass}>
            <ul className="divide-y divide-zinc-100">
              {healthy.map((row) => (
                <li
                  key={row.employeeId}
                  className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
                  data-testid={`coverage-healthy-${row.employeeId}`}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {row.employeeFirstName} {row.employeeLastName}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {[row.teamDisplayName, row.jobRoleDisplayName ?? "No Job Role"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-800">
                      {row.shiftWindowLabels.join(", ")}
                      {row.coverageContext ? ` · ${row.coverageContext}` : ""}
                    </p>
                    {row.assignmentRoomLabels.length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-zinc-500 touch-manipulation">
                          View Rooms
                        </summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                          {row.assignmentRoomLabels.map((label) => (
                            <li key={label}>{label}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={row.assignCoverageHref}
                        className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 touch-manipulation hover:bg-zinc-50"
                      >
                        Change coverage
                      </Link>
                      <Link
                        href={row.editScheduleHref}
                        className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 touch-manipulation hover:bg-zinc-50"
                      >
                        Edit shift
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
