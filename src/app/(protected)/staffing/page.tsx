import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { ShiftType, UnitType } from "@prisma/client";
import { redirect } from "next/navigation";

import { createScheduleEntryAction, deleteScheduleEntryAction } from "@/app/(protected)/staffing/actions";
import { StaffingAutoAssignForm } from "@/components/staffing-auto-assign-form";
import { StaffingDateAutoAdvance } from "@/components/staffing-date-auto-advance";
import { StaffingToolbar } from "@/components/staffing-toolbar";
import { getSession } from "@/lib/auth";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { parseCallDownReason } from "@/lib/todays-work/call-down";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { employeeBelongsToDepartmentWhere } from "@/lib/employee-department-scope";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";
import { isEmployeeEligibleForUnit } from "@/lib/scheduling-eligibility";

function getToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

type StaffingPageProps = {
  searchParams?: Promise<{ date?: string | string[] | undefined }>;
};

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
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10) - 1,
    Number.parseInt(match[3], 10),
    0,
    0,
    0,
    0,
  );
  return Number.isNaN(parsed.getTime()) ? getToday() : parsed;
}

function dateHref(date: Date) {
  return `/staffing?date=${toIsoDate(date)}`;
}

export default async function StaffingPage({ searchParams }: StaffingPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const isFa = isFacilityAdministratorRole(session.role);
  const deptScope =
    !isFa && deptNav.activeDepartmentId
      ? employeeBelongsToDepartmentWhere(deptNav.activeDepartmentId)
      : undefined;

  const query = searchParams ? await searchParams : undefined;
  const selectedDate = parseIsoDateOrToday(query?.date);
  const selectedDateEnd = new Date(selectedDate);
  selectedDateEnd.setDate(selectedDateEnd.getDate() + 1);

  const [employeesRaw, units, schedulesRaw, overridesRaw] = await Promise.all([
    prisma.employee.findMany({
      where: { status: "ACTIVE", facilityId, ...(deptScope ? { AND: [deptScope] } : {}) },
      orderBy: [{ roleType: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roleType: true,
        workStations: { select: { station: true } },
        unitAccesses: { select: { unitId: true } },
      },
    }),
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, unitType: true },
    }),
    prisma.scheduleEntry.findMany({
      where: { date: { gte: selectedDate, lt: selectedDateEnd }, unit: { facilityId } },
      orderBy: { createdAt: "desc" },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        unit: { select: { name: true } },
      },
    }),
    prisma.assignmentOverride.findMany({
      where: { date: { gte: selectedDate, lt: selectedDateEnd }, employee: { facilityId } },
      orderBy: { changedAt: "desc" },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        oldUnit: { select: { name: true } },
        newUnit: { select: { name: true } },
      },
    }),
  ]);

  const employeeIds = new Set(employeesRaw.map((e) => e.id));
  const employees = employeesRaw;
  const schedules = schedulesRaw.filter((s) => employeeIds.has(s.employeeId));
  const overrides = overridesRaw.filter((o) => employeeIds.has(o.employeeId));

  const selectedDateIso = toIsoDate(selectedDate);
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
  const eligibleEmployeesByUnit = new Map(
    units.map((unit) => [
      unit.id,
      employees.filter((employee) =>
        isEmployeeEligibleForUnit({
          unitId: unit.id,
          unitType: unit.unitType,
          workStations: employee.workStations.map((item) => item.station),
          allowedUnitIds:
            employee.unitAccesses.length > 0 ? new Set(employee.unitAccesses.map((access) => access.unitId)) : null,
        }),
      ),
    ]),
  );
  const serveryUnits = units.filter((unit) => unit.unitType === UnitType.SERVERY);
  const kitchenUnits = units.filter((unit) => unit.unitType === UnitType.KITCHEN);
  const retailUnits = units.filter((unit) => unit.unitType === UnitType.RETAIL);

  return (
    <section className="space-y-6">
      <StaffingDateAutoAdvance selectedDateIso={selectedDateIso} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Staffing</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Assign employees to each location by category. Servery locations capture breakfast, lunch, and dinner
            service slots, and those assignments appear automatically on each location card.
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
            <Link href="/staffing" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
              Today
            </Link>
            {isOperationalAssignmentsEnabled() && (
              <Link href={`/staffing/assignments?date=${selectedDateIso}`} className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100">
                Assignment Board
              </Link>
            )}
          </div>
        </div>
        <StaffingToolbar
          employees={employees}
          units={units}
          schedules={schedules}
          todayIso={selectedDateIso}
        />
      </header>

      <section className="space-y-4">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Serveries</h2>
          <p className="mt-1 text-sm text-zinc-600">Schedule one employee per meal service slot.</p>
          <div className="mt-3 space-y-3">
            {serveryUnits.map((unit) => {
              const eligible = eligibleEmployeesByUnit.get(unit.id) ?? [];
              const unitSchedules = schedules.filter((entry) => entry.unitId === unit.id);
              const scheduleForShift = (shift: ShiftType) => unitSchedules.find((entry) => entry.shift === shift);
              return (
                <div key={unit.id} id={`staffing-unit-${unit.id}`} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-900">{unit.name}</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {[
                      { label: "Breakfast", shift: ShiftType.BREAKFAST },
                      { label: "Lunch", shift: ShiftType.LUNCH },
                      { label: "Dinner", shift: ShiftType.DINNER },
                    ].map((slot) => {
                      const assigned = scheduleForShift(slot.shift);
                      return (
                      <div key={slot.shift} className="rounded border border-zinc-200 p-2">
                        <p className="text-xs font-medium text-zinc-700">{slot.label}</p>
                        <StaffingAutoAssignForm
                          action={createScheduleEntryAction}
                          unitId={unit.id}
                          dateIso={selectedDateIso}
                          employees={eligible}
                          fixedShift={slot.shift}
                          compact
                        />
                        <div className="mt-2">
                          {assigned ? (
                            <div className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1 text-xs">
                              <span className="text-zinc-700">
                                {assigned.employee.firstName} {assigned.employee.lastName}
                              </span>
                              <form action={deleteScheduleEntryAction}>
                                <input type="hidden" name="scheduleEntryId" value={assigned.id} />
                                <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100">
                                  Remove
                                </button>
                              </form>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500">No one assigned.</p>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              );
            })}
            {serveryUnits.length === 0 ? <p className="text-sm text-zinc-500">No active serveries found.</p> : null}
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Kitchens</h2>
          <p className="mt-1 text-sm text-zinc-600">Add as many employees as needed for each kitchen location.</p>
          <div className="mt-3 space-y-3">
            {kitchenUnits.map((unit) => {
              const eligible = eligibleEmployeesByUnit.get(unit.id) ?? [];
              const unitSchedules = schedules.filter((entry) => entry.unitId === unit.id);
              return (
                <div key={unit.id} id={`staffing-unit-${unit.id}`} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-900">{unit.name}</p>
                  <StaffingAutoAssignForm
                    action={createScheduleEntryAction}
                    unitId={unit.id}
                    dateIso={selectedDateIso}
                    employees={eligible}
                    defaultShift={ShiftType.FULL_DAY}
                  />
                  <div className="mt-2 space-y-1">
                    {unitSchedules.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1 text-xs">
                        <span className="text-zinc-700">
                          {entry.employee.firstName} {entry.employee.lastName} ({entry.shift})
                        </span>
                        <form action={deleteScheduleEntryAction}>
                          <input type="hidden" name="scheduleEntryId" value={entry.id} />
                          <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100">
                            Remove
                          </button>
                        </form>
                      </div>
                    ))}
                    {unitSchedules.length === 0 ? <p className="text-xs text-zinc-500">Assigned today: None</p> : null}
                  </div>
                </div>
              );
            })}
            {kitchenUnits.length === 0 ? <p className="text-sm text-zinc-500">No active kitchens found.</p> : null}
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Retail</h2>
          <p className="mt-1 text-sm text-zinc-600">Add as many employees as needed for each retail location.</p>
          <div className="mt-3 space-y-3">
            {retailUnits.map((unit) => {
              const eligible = eligibleEmployeesByUnit.get(unit.id) ?? [];
              const unitSchedules = schedules.filter((entry) => entry.unitId === unit.id);
              return (
                <div key={unit.id} id={`staffing-unit-${unit.id}`} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-900">{unit.name}</p>
                  <StaffingAutoAssignForm
                    action={createScheduleEntryAction}
                    unitId={unit.id}
                    dateIso={selectedDateIso}
                    employees={eligible}
                    defaultShift={ShiftType.FULL_DAY}
                  />
                  <div className="mt-2 space-y-1">
                    {unitSchedules.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2 py-1 text-xs">
                        <span className="text-zinc-700">
                          {entry.employee.firstName} {entry.employee.lastName} ({entry.shift})
                        </span>
                        <form action={deleteScheduleEntryAction}>
                          <input type="hidden" name="scheduleEntryId" value={entry.id} />
                          <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 text-zinc-700 hover:bg-zinc-100">
                            Remove
                          </button>
                        </form>
                      </div>
                    ))}
                    {unitSchedules.length === 0 ? <p className="text-xs text-zinc-500">Assigned today: None</p> : null}
                  </div>
                </div>
              );
            })}
            {retailUnits.length === 0 ? <p className="text-sm text-zinc-500">No active retail locations found.</p> : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Schedule</h2>
          <div className="mt-3 space-y-2 text-sm">
            {schedules.map((entry) => (
              <div key={entry.id} className="rounded border border-zinc-200 p-2">
                <p className="font-medium text-zinc-900">
                  {entry.employee.firstName} {entry.employee.lastName}
                </p>
                <p className="text-zinc-600">
                  {entry.unit.name} · {entry.shift} · {entry.roleType}
                  {entry.plannedStart && entry.plannedEnd
                    ? ` · ${entry.plannedStart}-${entry.plannedEnd}`
                    : ""}
                </p>
              </div>
            ))}
            {schedules.length === 0 ? (
              <p className="text-sm text-zinc-500">No schedule entries for this date.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Overrides</h2>
          <div className="mt-3 space-y-2 text-sm">
            {overrides.map((override) => {
              const parsedReason = parseCallDownReason(override.reason);
              return (
              <div key={override.id} className="rounded border border-zinc-200 p-2">
                <p className="font-medium text-zinc-900">
                  {override.employee.firstName} {override.employee.lastName}
                </p>
                <p className="text-zinc-600">
                  {override.oldUnit?.name ?? "Unassigned"} → {override.newUnit.name}
                  {override.mealType ? ` · ${override.mealType}` : ""}
                </p>
                <p className="text-xs text-zinc-500">{parsedReason.displayReason}</p>
              </div>
            )})}
            {overrides.length === 0 ? (
              <p className="text-sm text-zinc-500">No overrides logged for this date.</p>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}
