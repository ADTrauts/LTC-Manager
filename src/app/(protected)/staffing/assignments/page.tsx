import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { loadDailyAssignmentBoard } from "@/lib/scheduling/operational-assignments";
import { assignmentStatusLabel } from "@/lib/scheduling/operational-assignments/assignment-status";

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

  const board = await loadDailyAssignmentBoard({
    facilityId: session.facilityId,
    serviceDate: selectedDateIso,
    departmentId: deptNav.activeDepartmentId,
    departmentKey: deptNav.activeOperationalDepartmentKey,
  });

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

      <article className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">By Employee</h2>
          <p className="text-sm text-zinc-600">
            {board.employees.length} scheduled employee{board.employees.length !== 1 ? "s" : ""} ·{" "}
            {board.assignments.length} assignment{board.assignments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="divide-y divide-zinc-100">
          {board.employees.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">
              No scheduled employees for this date.
            </p>
          )}
          {board.employees.map((emp) => {
            const empAssignments = assignmentsByEmployee.get(emp.id) ?? [];
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
                            </span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-600 shadow-sm">
                              {statusInfo.label}
                              {a.source !== "MANUAL" ? ` · ${a.source.toLowerCase()}` : ""}
                            </span>
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
    </section>
  );
}
