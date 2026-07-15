import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { loadDailyAssignmentBoard, loadAssignmentFormOptions } from "@/lib/scheduling/operational-assignments";
import { loadTemplatesForDepartment } from "@/lib/scheduling/operational-assignments/load-templates";
import { assignmentStatusLabel } from "@/lib/scheduling/operational-assignments/assignment-status";
import type { TemplateView } from "@/lib/scheduling/operational-assignments/template-types";

import {
  createAssignmentAction,
  editAssignmentAction,
  assignmentLifecycleAction,
  reassignAction,
} from "./actions";
import {
  createTemplateAction,
  editTemplateAction,
  addTemplateItemAction,
  removeTemplateItemAction,
  moveTemplateItemAction,
  applyTemplateAction,
} from "./template-actions";

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
  searchParams?: Promise<{ date?: string | string[] | undefined }>;
};

export default async function AssignmentBoardPage({ searchParams }: AssignmentPageProps) {
  noStore();

  if (!isOperationalAssignmentsEnabled()) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const query = searchParams ? await searchParams : undefined;
  const selectedDate = parseIsoDateOrToday(query?.date);
  const selectedDateIso = toIsoDate(selectedDate);

  const canEdit = hasAtLeastRole(session.role, "MANAGER");
  const deptKey = deptNav.activeOperationalDepartmentKey;

  const board = await loadDailyAssignmentBoard({
    facilityId: session.facilityId,
    serviceDate: selectedDateIso,
    departmentId: deptNav.activeDepartmentId,
    departmentKey: deptKey,
  });

  const [formOptions, templates] = await Promise.all([
    canEdit && deptNav.activeDepartmentId && deptKey
      ? loadAssignmentFormOptions({
          facilityId: session.facilityId,
          departmentId: deptNav.activeDepartmentId,
          departmentKey: deptKey,
          serviceDate: selectedDateIso,
        })
      : null,
    canEdit && deptNav.activeDepartmentId && deptKey
      ? loadTemplatesForDepartment({
          facilityId: session.facilityId,
          departmentId: deptNav.activeDepartmentId,
          departmentKey: deptKey,
        })
      : [],
  ]);

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
            Who is working, what they are assigned to, and where gaps or overlaps exist.
            {board.departmentKey ? ` Showing ${board.departmentKey} assignments.` : ""}
          </p>
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
            <Link href={`/staffing?date=${selectedDateIso}`} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
              Schedule View
            </Link>
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
      {canEdit && formOptions && deptNav.activeDepartmentId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Create Assignment</h2>
            <form action={createAssignmentAction} className="mt-3 space-y-2">
              <input type="hidden" name="departmentId" value={deptNav.activeDepartmentId} />
              <input type="hidden" name="serviceDate" value={selectedDateIso} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="employeeId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Employee…</option>
                  {formOptions.employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>
                  ))}
                </select>
                <select name="roleKey" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Role…</option>
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
                <select name="operationInstanceId" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Operation (optional)…</option>
                  {formOptions.operations.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="time" name="startsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Start" />
                <input type="time" name="endsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="End" />
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
              <input type="hidden" name="departmentId" value={deptNav.activeDepartmentId} />
              <input type="hidden" name="serviceDate" value={selectedDateIso} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="employeeId" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Covering employee…</option>
                  {formOptions.employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.lastName}, {e.firstName}</option>
                  ))}
                </select>
                <select name="roleKey" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
                  <option value="">Role…</option>
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
              <div className="grid gap-2 sm:grid-cols-2">
                <input type="time" name="startsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Start" />
                <input type="time" name="endsAt" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="End" />
              </div>
              <input type="text" name="notes" placeholder="Notes (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
              <button type="submit" className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-600">
                Add Coverage
              </button>
            </form>
          </article>
        </div>
      )}

      {/* Template Management for Manager+ */}
      {canEdit && formOptions && deptNav.activeDepartmentId && (
        <TemplateManagementSection
          templates={templates}
          departmentId={deptNav.activeDepartmentId}
          serviceDate={selectedDateIso}
          formOptions={formOptions}
        />
      )}

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
    </section>
  );
}

function TemplateManagementSection({
  templates,
  departmentId,
  serviceDate,
  formOptions,
}: {
  templates: TemplateView[];
  departmentId: string;
  serviceDate: string;
  formOptions: NonNullable<Awaited<ReturnType<typeof loadAssignmentFormOptions>>>;
}) {
  const activeTemplates = templates.filter((t) => t.isActive);
  const inactiveTemplates = templates.filter((t) => !t.isActive);

  return (
    <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-900">
        Assignment Templates ({activeTemplates.length} active)
      </summary>
      <div className="border-t border-zinc-100 px-4 py-3 space-y-4">
        {/* Apply template */}
        {activeTemplates.length > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <h3 className="text-sm font-semibold text-blue-900">Apply Template</h3>
            <p className="mt-0.5 text-xs text-blue-700">
              Review assignments before applying. Existing assignments are preserved.
            </p>
            <form action={applyTemplateAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="departmentId" value={departmentId} />
              <input type="hidden" name="serviceDate" value={serviceDate} />
              <select name="templateId" required className="rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm">
                <option value="">Select template…</option>
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.totalPositions} position{t.totalPositions !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">
                Apply
              </button>
            </form>
          </div>
        )}

        {/* Template list */}
        {activeTemplates.map((t) => (
          <TemplateCard key={t.id} template={t} formOptions={formOptions} />
        ))}

        {/* Create template */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold text-zinc-900">Create Template</h3>
          <form action={createTemplateAction} className="mt-2 space-y-2">
            <input type="hidden" name="departmentId" value={departmentId} />
            <input type="text" name="name" required placeholder="Template name" maxLength={100} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            <input type="text" name="description" placeholder="Description (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">
              Create
            </button>
          </form>
        </div>

        {/* Inactive templates */}
        {inactiveTemplates.length > 0 && (
          <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-zinc-600">
              Inactive Templates ({inactiveTemplates.length})
            </summary>
            <div className="mt-2 space-y-2">
              {inactiveTemplates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
                  <span className="text-zinc-500">{t.name}</span>
                  <form action={editTemplateAction} className="inline">
                    <input type="hidden" name="templateId" value={t.id} />
                    <input type="hidden" name="isActive" value="true" />
                    <button type="submit" className="text-xs text-blue-600 hover:underline">Reactivate</button>
                  </form>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

function TemplateCard({
  template,
  formOptions,
}: {
  template: TemplateView;
  formOptions: NonNullable<Awaited<ReturnType<typeof loadAssignmentFormOptions>>>;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-zinc-500">{template.description}</p>
          )}
          <p className="mt-0.5 text-xs text-zinc-500">
            {template.totalPositions} position{template.totalPositions !== 1 ? "s" : ""}
            {template.operationLabel ? ` · ${template.operationLabel}` : ""}
            {template.workShiftName ? ` · ${template.workShiftName}` : ""}
          </p>
        </div>
        <form action={editTemplateAction} className="inline">
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="isActive" value="false" />
          <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50">
            Deactivate
          </button>
        </form>
      </div>

      {/* Items */}
      {template.items.length > 0 && (
        <div className="space-y-1">
          {template.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5 text-sm">
              <div>
                <span className="font-medium text-zinc-800">{item.roleLabel}</span>
                {item.requiredCount > 1 && (
                  <span className="ml-1 text-xs text-zinc-500">&times;{item.requiredCount}</span>
                )}
                {item.unitName && (
                  <span className="ml-1.5 text-xs text-zinc-500">{item.unitName}</span>
                )}
                {item.startsAtLocal && item.endsAtLocal && (
                  <span className="ml-1.5 text-xs text-zinc-400">{item.startsAtLocal}–{item.endsAtLocal}</span>
                )}
              </div>
              <span className="flex items-center gap-0.5">
                <form action={moveTemplateItemAction} className="inline">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" className="px-1 text-xs text-zinc-400 hover:text-zinc-700" title="Move up">&uarr;</button>
                </form>
                <form action={moveTemplateItemAction} className="inline">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" className="px-1 text-xs text-zinc-400 hover:text-zinc-700" title="Move down">&darr;</button>
                </form>
                <form action={removeTemplateItemAction} className="inline">
                  <input type="hidden" name="itemId" value={item.id} />
                  <button type="submit" className="px-1 text-xs text-red-400 hover:text-red-600" title="Remove">&times;</button>
                </form>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add item form */}
      <details className="rounded-md border border-zinc-100 p-2">
        <summary className="cursor-pointer text-xs font-medium text-zinc-600">Add position</summary>
        <form action={addTemplateItemAction} className="mt-2 space-y-2">
          <input type="hidden" name="templateId" value={template.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select name="roleKey" required className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Role…</option>
              {formOptions.roles.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
            <select name="unitId" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
              <option value="">Unit (optional)…</option>
              {formOptions.units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input type="time" name="startsAtLocal" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Start" />
            <input type="time" name="endsAtLocal" className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="End" />
            <input type="number" name="requiredCount" defaultValue={1} min={1} max={20} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" placeholder="Count" />
          </div>
          <input type="text" name="notes" placeholder="Notes (optional)" maxLength={500} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          <button type="submit" className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Add Position
          </button>
        </form>
      </details>
    </div>
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
