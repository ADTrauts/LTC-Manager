import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DepartmentViewNotice } from "@/components/department-view-notice";
import { hasAtLeastRole } from "@/lib/access";
import { departmentViewOnlyNotice } from "@/lib/department-authority/view-notice";
import { getSession } from "@/lib/auth";
import { isAnyStaffingOperationalFeatureEnabled } from "@/lib/department-operations";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  loadDailyAssignmentBoard,
  loadAssignmentFormOptions,
  loadAssignmentEvents,
  buildAssignmentFulfillmentSummary,
  resolveAssignmentAuthority,
  type AssignmentEventView,
} from "@/lib/scheduling/operational-assignments";
import {
  ensureAssignmentPlan,
  loadAssignmentPlanView,
} from "@/lib/scheduling/operational-assignments/assignment-plan";
import { buildDietaryCoverageSummary } from "@/lib/scheduling/operational-assignments/build-coverage-summary";
import { prisma } from "@/lib/prisma";
import { sessionUserIdForFk } from "@/lib/auth";
import { loadTemplatesForDepartment } from "@/lib/scheduling/operational-assignments/load-templates";
import { assignmentStatusLabel } from "@/lib/scheduling/operational-assignments/assignment-status";
import type { TemplateView } from "@/lib/scheduling/operational-assignments/template-types";

import {
  createAssignmentAction,
  editAssignmentAction,
  assignmentLifecycleAction,
  reassignAction,
  confirmAssignmentPlanAction,
  reopenAssignmentPlanAction,
} from "./actions";

void editAssignmentAction;
import { applyTemplateAction } from "./template-actions";
import { isCoverageTemplateEffectiveOnDate } from "@/lib/scheduling/coverage-expectations/publication";
import { loadDepartmentVisibility } from "@/lib/department-authority/visibility";
import { AssignmentSpaceScopePicker } from "@/components/assignments/assignment-space-scope-picker";
import { buildLocationCoverageSummary } from "@/lib/scheduling/operational-assignments/location-coverage";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import {
  createDepartmentZoneAction,
  retireDepartmentZoneAction,
} from "./zone-actions";
import { loadZonesForDepartment } from "@/lib/department-zones";

function getToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateOrToday(raw: string | string[] | undefined) {
  const value = typeof raw === "string" ? raw : "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return getToday();
  const parsed = new Date(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10) - 1,
    Number.parseInt(match[3]!, 10),
    0, 0, 0, 0,
  );
  return Number.isNaN(parsed.getTime()) ? getToday() : parsed;
}

function dateHref(date: Date) {
  return `/staffing/assignments?date=${toIsoDate(date)}`;
}

type AssignmentPageProps = {
  searchParams?: Promise<{ date?: string | string[] | undefined; department?: string | string[] | undefined }>;
};

export default async function AssignmentBoardPage({ searchParams }: AssignmentPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const query = searchParams ? await searchParams : undefined;
  const selectedDate = parseIsoDateOrToday(query?.date);
  const selectedDateIso = toIsoDate(selectedDate);
  const visibility = await loadDepartmentVisibility(prisma, session, session.facilityId);
  const requestedDepartmentId = typeof query?.department === "string" ? query.department.trim() : "";
  let boardDepartmentId = deptNav.activeDepartmentId;
  let deptKey = deptNav.activeOperationalDepartmentKey;
  if (
    requestedDepartmentId &&
    (!visibility || visibility.pageDepartmentIds.has(requestedDepartmentId))
  ) {
    const requested = await prisma.department.findFirst({
      where: { id: requestedDepartmentId, facilityId: session.facilityId, isActive: true },
      select: { id: true, key: true },
    });
    if (requested) {
      boardDepartmentId = requested.id;
      deptKey = requested.key;
    }
  }

  const assignmentAuthority = await resolveAssignmentAuthority({
    session,
    departmentId: boardDepartmentId ?? "",
    facilityId: session.facilityId,
  });
  const viewNotice = departmentViewOnlyNotice(assignmentAuthority.reason);
  const canEdit = hasAtLeastRole(session.role, "SUPERVISOR") && assignmentAuthority.canManage && !viewNotice;

  const board = await loadDailyAssignmentBoard({
    facilityId: session.facilityId,
    serviceDate: selectedDateIso,
    departmentId: boardDepartmentId,
    departmentKey: deptKey,
  });

  const planView =
    boardDepartmentId != null
      ? await (async () => {
          await ensureAssignmentPlan(prisma, {
            facilityId: session.facilityId,
            departmentId: boardDepartmentId!,
            serviceDateKey: selectedDateIso,
            actorUserId: sessionUserIdForFk(session),
          });
          return loadAssignmentPlanView(prisma, {
            facilityId: session.facilityId,
            departmentId: boardDepartmentId!,
            serviceDateKey: selectedDateIso,
          });
        })()
      : null;

  const coverage = boardDepartmentId
    ? await buildDietaryCoverageSummary(prisma, {
        facilityId: session.facilityId,
        departmentId: boardDepartmentId,
        serviceDateKey: selectedDateIso,
        planStatus: planView?.status ?? null,
        assignments: board.assignments.map((a) => {
          const emp = board.employees.find((e) => e.id === a.employeeId);
          return {
            unitId: a.unitId,
            unitName: a.unitName,
            roleKey: a.roleKey,
            status: a.status,
            hasCallDown: emp?.hasCallDown ?? false,
          };
        }),
        scheduledEmployeeIds: board.employees.filter((e) => !e.hasCallDown).map((e) => e.id),
        assignedEmployeeIds: board.assignments
          .filter((a) => a.status === "PLANNED" || a.status === "ACTIVE")
          .map((a) => a.employeeId),
        callOffEmployeeIds: board.employees.filter((e) => e.hasCallDown).map((e) => e.id),
      })
    : null;

  const isEvsDept = deptKey === "EVS";
  const locationCoverage =
    isEvsDept && boardDepartmentId
      ? await buildLocationCoverageSummary(prisma, {
          facilityId: session.facilityId,
          departmentId: boardDepartmentId,
          serviceDate: facilityLocalDateToServiceDate(selectedDateIso),
          callOffEmployeeIds: board.employees.filter((e) => e.hasCallDown).map((e) => e.id),
        })
      : null;

  const zonesForManage =
    isEvsDept && boardDepartmentId
      ? await loadZonesForDepartment(prisma, {
          facilityId: session.facilityId,
          departmentId: boardDepartmentId,
          includeRetired: true,
        })
      : [];

  const [formOptions, templates] = await Promise.all([
    canEdit && boardDepartmentId && deptKey
      ? loadAssignmentFormOptions({
          facilityId: session.facilityId,
          departmentId: boardDepartmentId,
          departmentKey: deptKey,
        })
      : null,
    canEdit && boardDepartmentId && deptKey
      ? loadTemplatesForDepartment({
          facilityId: session.facilityId,
          departmentId: boardDepartmentId,
          departmentKey: deptKey,
        })
      : [],
  ]);

  const fulfillment = templates.length > 0
    ? buildAssignmentFulfillmentSummary({
        templates,
        assignments: board.assignments,
        scheduledEmployeeCount: board.employees.filter((e) => !e.hasCallDown).length,
      })
    : { available: false as const };

  const allAssignmentIds = board.assignments.map((a) => a.id);
  const events =
    allAssignmentIds.length > 0 || planView?.id
      ? await loadAssignmentEvents(allAssignmentIds, session.facilityId, planView?.id ?? null)
      : [];

  const prevDate = new Date(selectedDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const nextDate = new Date(selectedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const selectedDateLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const assignmentsByEmployee = new Map<string, typeof board.assignments>();
  for (const a of board.assignments) {
    const list = assignmentsByEmployee.get(a.employeeId) ?? [];
    list.push(a);
    assignmentsByEmployee.set(a.employeeId, list);
  }

  const activeAssignments = board.assignments.filter((a) => a.status === "PLANNED" || a.status === "ACTIVE");
  const historyAssignments = board.assignments.filter((a) => a.status === "COMPLETED" || a.status === "CANCELLED");

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Daily Assignment Board
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Who is working where during each responsibility window — Schedule (hours) stays on the
            Schedule View. Assignment is the official Unit responsibility plan.
            {board.departmentKey ? ` Showing ${board.departmentKey}.` : ""}
          </p>
          {viewNotice ? (
            <div className="mt-3">
              <DepartmentViewNotice notice={viewNotice} />
            </div>
          ) : null}
          {planView ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 font-medium text-zinc-800">
                Plan: {planView.status}
              </span>
              {planView.confirmedByName ? (
                <span>
                  Confirmed by {planView.confirmedByName}
                  {planView.confirmedAt
                    ? ` · ${new Date(planView.confirmedAt).toLocaleString()}`
                    : ""}
                </span>
              ) : null}
              {planView.lastChangedAt ? (
                <span>Last changed {new Date(planView.lastChangedAt).toLocaleString()}</span>
              ) : null}
            </div>
          ) : null}
          {coverage ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                Covered {coverage.covered}
              </span>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
                At Risk {coverage.atRisk}
              </span>
              <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-800">
                Uncovered {coverage.uncovered}
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                Not Yet Assigned {coverage.notYetAssigned}
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                Unassigned scheduled {coverage.unassignedScheduledCount}
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                Call-offs {coverage.callOffAffectedCount}
              </span>
            </div>
          ) : null}
          {locationCoverage ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs" data-testid="evs-location-coverage-summary">
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                Locations Covered {locationCoverage.covered}
              </span>
              <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
                Locations At Risk {locationCoverage.atRisk}
              </span>
              <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-800">
                Locations Unassigned {locationCoverage.uncovered}
              </span>
              <span className="rounded-md bg-violet-50 px-2 py-1 text-violet-900">
                Overlapping {locationCoverage.overlapping}
              </span>
              <span className="rounded-md bg-zinc-100 px-2 py-1 text-zinc-700">
                Required locations {locationCoverage.totalRequired}
              </span>
            </div>
          ) : null}
          {canEdit && boardDepartmentId && planView ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(planView.status === "DRAFT" || planView.status === "REOPENED") && (
                <form action={confirmAssignmentPlanAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="departmentId" value={boardDepartmentId} />
                  <input type="hidden" name="serviceDate" value={selectedDateIso} />
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input type="checkbox" name="acknowledgeCoverageGaps" value="true" />
                    Acknowledge remaining coverage risks
                  </label>
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Confirm plan
                  </button>
                </form>
              )}
              {(planView.status === "CONFIRMED" || planView.status === "CLOSED") && (
                <form action={reopenAssignmentPlanAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="departmentId" value={boardDepartmentId} />
                  <input type="hidden" name="serviceDate" value={selectedDateIso} />
                  <input
                    name="reopenReason"
                    required
                    placeholder="Reason to reopen"
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                  >
                    Reopen plan
                  </button>
                </form>
              )}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900">
              {selectedDateLabel}
            </span>
            <Link href={dateHref(prevDate)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
              Previous
            </Link>
            <Link href={dateHref(nextDate)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
              Next
            </Link>
            <Link href="/staffing/assignments" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
              Today
            </Link>
            <Link href={`/staffing?date=${selectedDateIso}`} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100">
              Schedule
            </Link>
            {isAnyStaffingOperationalFeatureEnabled("cycles", deptKey) ? (
              <Link
                href="/staffing/cycles"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                Cycle overview
              </Link>
            ) : null}
            {isAnyStaffingOperationalFeatureEnabled("jobFlow", deptKey) ? (
              <Link
                href="/staffing/operations"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                Operations Board
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {board.warnings.length > 0 && (
        <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Warnings ({board.warnings.length})
          </h2>
          <ul className="mt-2 space-y-1">
            {board.warnings.map((w, i) => (
              <li key={`${w.kind}-${w.employeeId}-${w.assignmentId ?? i}`} className="text-sm text-amber-800">
                {w.message}
              </li>
            ))}
          </ul>
        </article>
      )}

      {/* Create / Reassign forms for Manager+ */}
      {canEdit && formOptions && boardDepartmentId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Create Assignment</h2>
            <form action={createAssignmentAction} className="mt-3 space-y-2">
              <input type="hidden" name="departmentId" value={boardDepartmentId} />
              <input type="hidden" name="serviceDate" value={selectedDateIso} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="employeeId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Employee…</option>
                  {formOptions.employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>
                  ))}
                </select>
                <select name="roleKey" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Auto (Job Role)</option>
                  {formOptions.roles.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <select name="unitId" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                <option value="">Unit (optional)…</option>
                {formOptions.units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {isEvsDept && formOptions.spaces.length > 0 ? (
                <AssignmentSpaceScopePicker
                  spaces={formOptions.spaces}
                  zones={formOptions.zones}
                />
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="time" name="startsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Start" />
                <input type="time" name="endsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="End" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="source" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="SCHEDULED_EMPLOYEE">Scheduled employee</option>
                  <option value="MANUAL_ADDITION">Manual addition</option>
                  <option value="UNSCHEDULED_COVERAGE">Unscheduled coverage</option>
                  <option value="SUPERVISOR_OVERRIDE">Supervisor override</option>
                </select>
                <input
                  type="text"
                  name="changeReason"
                  placeholder="Reason (required for unscheduled / override)"
                  maxLength={500}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
              <input type="text" name="notes" placeholder="Notes (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
              <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
                Create Assignment
              </button>
            </form>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Add Coverage / Reassign</h2>
            <form action={reassignAction} className="mt-3 space-y-2">
              <input type="hidden" name="departmentId" value={boardDepartmentId} />
              <input type="hidden" name="serviceDate" value={selectedDateIso} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="employeeId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Covering employee…</option>
                  {formOptions.employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>
                  ))}
                </select>
                <select name="roleKey" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Auto (Job Role)</option>
                  {formOptions.roles.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="unitId" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Unit (optional)…</option>
                  {formOptions.units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <select name="mode" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="coverage">Add coverage</option>
                  <option value="reassignment">Temporary reassignment</option>
                  <option value="replace">Replace existing</option>
                </select>
              </div>
              {isEvsDept && formOptions.spaces.length > 0 ? (
                <AssignmentSpaceScopePicker
                  spaces={formOptions.spaces}
                  zones={formOptions.zones}
                />
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="time" name="startsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Start" />
                <input type="time" name="endsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="End" />
              </div>
              <select name="existingAssignmentId" className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                <option value="">Replace assignment (optional)…</option>
                {activeAssignments.map((a) => {
                  const emp = board.employees.find((e) => e.id === a.employeeId);
                  const name = emp ? `${emp.lastName}, ${emp.firstName}` : a.employeeId.slice(-6);
                  return (
                    <option key={a.id} value={a.id}>
                      {name} · {a.roleLabel}
                      {a.unitName ? ` · ${a.unitName}` : ""}
                    </option>
                  );
                })}
              </select>
              <input
                type="text"
                name="changeReason"
                required
                placeholder="Reason (required)"
                maxLength={500}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input type="text" name="notes" placeholder="Notes (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
              <button type="submit" className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600">
                Add Coverage
              </button>
            </form>
          </article>
        </div>
      )}

      {isEvsDept && canEdit && boardDepartmentId && formOptions ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="evs-zone-manager">
          <h2 className="text-sm font-semibold text-zinc-900">Department Zones</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Named groupings of Rooms / Spaces for Assignment convenience and Supervisor filters.
            Zones are not Assignments and do not grant authority. Membership changes never rewrite
            existing Assignments.
          </p>
          <form action={createDepartmentZoneAction} className="mt-3 space-y-2">
            <input type="hidden" name="departmentId" value={boardDepartmentId} />
            <input type="hidden" name="activate" value="true" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Zone name (e.g. Floor 1 East)"
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                data-testid="zone-name-input"
              />
              <input
                name="description"
                maxLength={500}
                placeholder="Description (optional)"
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </div>
            <AssignmentSpaceScopePicker
              spaces={formOptions.spaces}
              name="unitSpaceIds"
              zoneFieldName="unusedZoneField"
            />
            <button
              type="submit"
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create Zone
            </button>
          </form>
          {zonesForManage.length > 0 ? (
            <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
              {zonesForManage.map((z) => (
                <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">
                      {z.name}{" "}
                      <span className="text-xs font-normal text-zinc-500">
                        {z.status} · {z.locationCount} locations
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {z.locations
                        .slice(0, 5)
                        .map((l) => l.label)
                        .join(", ")}
                      {z.locations.length > 5 ? ` +${z.locations.length - 5} more` : ""}
                    </p>
                  </div>
                  {z.status !== "RETIRED" ? (
                    <form action={retireDepartmentZoneAction}>
                      <input type="hidden" name="zoneId" value={z.id} />
                      <button
                        type="submit"
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-50"
                      >
                        Retire
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}

      {/* Fulfillment Summary */}
      {fulfillment.available && (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Required Position Fulfillment</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span className="text-zinc-700">
              <strong>{fulfillment.requiredPositions}</strong> required
            </span>
            <span className="text-green-700">
              <strong>{fulfillment.filledPositions}</strong> filled
            </span>
            {fulfillment.unfilledPositions > 0 && (
              <span className="text-amber-700">
                <strong>{fulfillment.unfilledPositions}</strong> unfilled
              </span>
            )}
            {fulfillment.conflicts > 0 && (
              <span className="text-red-700">
                <strong>{fulfillment.conflicts}</strong> conflict{fulfillment.conflicts !== 1 ? "s" : ""}
              </span>
            )}
            {fulfillment.activeCoverageAssignments > 0 && (
              <span className="text-blue-700">
                <strong>{fulfillment.activeCoverageAssignments}</strong> coverage
              </span>
            )}
            {fulfillment.scheduledOnlyEmployees > 0 && (
              <span className="text-zinc-500">
                <strong>{fulfillment.scheduledOnlyEmployees}</strong> scheduled only
              </span>
            )}
          </div>
        </article>
      )}

      {/* Template Management for Manager+ */}
      {canEdit && formOptions && boardDepartmentId && (
        <TemplateManagementSection
          templates={templates}
          departmentId={boardDepartmentId}
          serviceDate={selectedDateIso}
        />
      )}

      {/* Coverage requirement rows */}
      {coverage && coverage.rows.length > 0 && (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="assignment-coverage-rows">
          <h2 className="text-sm font-semibold text-zinc-900">Coverage by Unit / Duty</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Staffing coverage is not proof that meal service succeeded.
          </p>
          <ul className="mt-3 divide-y divide-zinc-100">
            {coverage.rows.map((row) => (
              <li key={`${row.templateItemId ?? row.roleKey}-${row.unitId ?? "any"}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-zinc-800">
                  {row.unitName} · {row.roleLabel}
                  <span className="ml-2 text-xs text-zinc-500">
                    {row.filledCount}/{row.requiredCount}
                  </span>
                </span>
                <span
                  className={
                    row.state === "COVERED"
                      ? "rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                      : row.state === "AT_RISK"
                        ? "rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900"
                        : row.state === "UNCOVERED"
                          ? "rounded-md bg-rose-50 px-2 py-0.5 text-xs text-rose-800"
                          : "rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
                  }
                >
                  {row.state.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {/* Active assignments by unit */}
      <article className="rounded-xl border border-zinc-200 bg-white shadow-sm" data-testid="assignment-by-unit">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">By Unit</h2>
          <p className="text-sm text-zinc-600">
            Grouped by assigned Unit. Unassigned-to-unit rows appear under Unassigned.
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {Array.from(
            activeAssignments.reduce((map, a) => {
              const key = a.unitId ?? "__none__";
              const list = map.get(key) ?? [];
              list.push(a);
              map.set(key, list);
              return map;
            }, new Map<string, typeof activeAssignments>()),
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([unitKey, list]) => {
              const unitName = list[0]?.unitName ?? "Unassigned unit";
              return (
                <div key={unitKey} className="px-4 py-3">
                  <p className="text-sm font-semibold text-zinc-900">{unitName}</p>
                  <ul className="mt-2 space-y-1">
                    {list.map((a) => {
                      const emp = board.employees.find((e) => e.id === a.employeeId);
                      return (
                        <li key={a.id} className="text-sm text-zinc-700">
                          {emp ? `${emp.lastName}, ${emp.firstName}` : "Employee"} · {a.roleLabel}
                          {a.startsAt && a.endsAt
                            ? ` · ${new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(a.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          {activeAssignments.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">No active assignments for this date.</p>
          )}
        </div>
      </article>

      {/* Active assignments by employee */}
      <article className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">By Employee</h2>
          <p className="text-sm text-zinc-600">
            {board.employees.length} scheduled employee{board.employees.length !== 1 ? "s" : ""} ·{" "}
            {activeAssignments.length} active assignment{activeAssignments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {board.employees.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">
              No scheduled employees for this date.
            </p>
          )}
          {board.employees.map((emp) => {
            const empAssignments = (assignmentsByEmployee.get(emp.id) ?? [])
              .filter((a) => a.status === "PLANNED" || a.status === "ACTIVE");
            return (
              <div key={emp.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {emp.departmentName ?? ""}
                      {emp.scheduledShift ? ` · ${emp.scheduledShift}` : ""}
                      {emp.plannedStart && emp.plannedEnd ? ` · ${emp.plannedStart}–${emp.plannedEnd}` : ""}
                      {emp.unitName ? ` · ${emp.unitName}` : ""}
                    </p>
                  </div>
                  {emp.hasCallDown && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                      Call-down: {emp.callDownReason ?? "Unknown"}
                    </span>
                  )}
                </div>

                {empAssignments.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {empAssignments.map((a) => {
                      const statusInfo = assignmentStatusLabel(a.status);
                      const toneClasses = {
                        neutral: "border-zinc-200 bg-zinc-50",
                        active: "border-blue-200 bg-blue-50",
                        completed: "border-green-200 bg-green-50",
                        cancelled: "border-zinc-200 bg-zinc-100 opacity-60",
                      }[statusInfo.tone];
                      return (
                        <div key={a.id} className={`rounded-lg border p-2 ${toneClasses}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              {a.roleLabel}
                              {a.source !== "MANUAL" && (
                                <span className="ml-1.5 text-xs font-normal text-zinc-500">
                                  ({a.source.toLowerCase()})
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-600 shadow-sm">
                                {statusInfo.label}
                              </span>
                              {canEdit && (
                                <LifecycleButtons assignmentId={a.id} status={a.status} />
                              )}
                            </div>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-600">
                            {a.unitName ?? "No unit"}
                            {a.operationLabel ? ` · ${a.operationLabel}` : ""}
                            {a.startsAt && a.endsAt
                              ? ` · ${new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${new Date(a.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                              : ""}
                          </p>
                          {a.scopeKind === "SPACES" ? (
                            <p className="mt-0.5 text-xs text-zinc-600" data-testid="assignment-location-scope">
                              {a.sourceZoneName ? `${a.sourceZoneName} · ` : ""}
                              {a.scopeSummaryLabel}
                            </p>
                          ) : a.unitName ? (
                            <p className="mt-0.5 text-xs text-zinc-500">Entire Unit</p>
                          ) : null}
                          {a.notes && (
                            <p className="mt-1 text-xs italic text-zinc-500">{a.notes}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  !emp.hasCallDown && (
                    <p className="mt-1 text-xs text-zinc-400">No assignments</p>
                  )
                )}
              </div>
            );
          })}
        </div>
      </article>

      {/* History */}
      {historyAssignments.length > 0 && (
        <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-700">
            Completed / Cancelled ({historyAssignments.length})
          </summary>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {historyAssignments.map((a) => {
              const statusInfo = assignmentStatusLabel(a.status);
              return (
                <div key={a.id} className="px-4 py-2 opacity-60">
                  <p className="text-sm text-zinc-700">
                    {a.roleLabel} — {a.unitName ?? "No unit"}
                    <span className="ml-2 text-xs text-zinc-500">{statusInfo.label}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </details>
      )}
      {/* Assignment History */}
      {events.length > 0 && (
        <AssignmentHistory events={events} />
      )}
    </section>
  );
}

function AssignmentHistory({ events }: { events: AssignmentEventView[] }) {
  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-700">
        Assignment History ({events.length})
      </summary>
      <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto border-t border-zinc-100">
        {events.map((e) => (
          <div key={e.id} className="px-4 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-zinc-800">{e.summary}</span>
              <span className="whitespace-nowrap text-xs text-zinc-400">
                {new Date(e.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              {e.actorName ?? "System"}
              {e.fromStatus && e.toStatus ? ` · ${e.fromStatus} → ${e.toStatus}` : ""}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function TemplateManagementSection({
  templates,
  departmentId,
  serviceDate,
}: {
  templates: TemplateView[];
  departmentId: string;
  serviceDate: string;
}) {
  const applicable = templates.filter(
    (template) =>
      template.status != null &&
      isCoverageTemplateEffectiveOnDate(
        {
          status: template.status,
          isActive: template.isActive,
          effectiveFrom: template.effectiveFrom ?? null,
          effectiveTo: template.effectiveTo ?? null,
        },
        serviceDate,
      ),
  );

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Apply published Coverage</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Coverage requirements are configured in Department Builder. This board can place people
        from a published requirement that is effective on this date. A draft cannot be applied.
      </p>
      <p className="mt-2 text-xs">
        <a
          className="font-medium text-zinc-800 underline-offset-2 hover:underline"
          href={`/build/departments/${departmentId}?tab=people`}
        >
          Open Coverage requirements
        </a>
      </p>
      {applicable.length > 0 ? (
        <form action={applyTemplateAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="serviceDate" value={serviceDate} />
          <select name="templateId" required className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Select published Coverage…</option>
            {applicable.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.totalPositions} required)
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
            Apply
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No published Coverage is effective on this date.</p>
      )}
    </section>
  );
}

function LifecycleButtons({ assignmentId, status }: { assignmentId: string; status: string }) {
  return (
    <span className="flex gap-0.5">
      {status === "PLANNED" && (
        <form action={assignmentLifecycleAction} className="inline">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="action" value="activate" />
          <button type="submit" className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800 hover:bg-blue-100" title="Mark Active">
            Activate
          </button>
        </form>
      )}
      {status === "ACTIVE" && (
        <form action={assignmentLifecycleAction} className="inline">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="action" value="complete" />
          <button type="submit" className="rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-xs text-green-800 hover:bg-green-100" title="Mark Complete">
            Complete
          </button>
        </form>
      )}
      {(status === "PLANNED" || status === "ACTIVE") && (
        <form action={assignmentLifecycleAction} className="inline">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="action" value="cancel" />
          <button type="submit" className="rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100" title="Cancel">
            Cancel
          </button>
        </form>
      )}
    </span>
  );
}
