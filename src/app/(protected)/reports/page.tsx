import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { LogSubmissionStatus, RepairStatus } from "@prisma/client";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ReportsPageProps = {
  searchParams: Promise<{
    start?: string;
    end?: string;
    unitId?: string;
    repairStatus?: string;
  }>;
};

function parseDateInput(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange(start: Date, end: Date) {
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  noStore();
  const params = await searchParams;

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;

  const defaultEnd = new Date();
  defaultEnd.setHours(0, 0, 0, 0);
  const defaultStart = new Date(defaultEnd);
  defaultStart.setDate(defaultStart.getDate() - 6);

  const start = parseDateInput(params.start, defaultStart);
  const end = parseDateInput(params.end, defaultEnd);
  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const unitIdFilter = params.unitId && params.unitId.length > 0 ? params.unitId : undefined;
  const repairStatusFilter =
    params.repairStatus && Object.values(RepairStatus).includes(params.repairStatus as RepairStatus)
      ? (params.repairStatus as RepairStatus)
      : undefined;

  const unitScope = unitIdFilter
    ? { id: unitIdFilter, facilityId, isActive: true as const }
    : { facilityId, isActive: true as const };

  const [units, assignments, submissions, repairs, schedules, overrides] = await Promise.all([
    prisma.unit.findMany({
      where: unitScope,
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.logAssignment.findMany({
      where: { isActive: true, unit: unitScope },
      select: { id: true, unitId: true, timesPerDay: true },
    }),
    prisma.logSubmission.findMany({
      where: {
        submittedAt: { gte: start, lt: endExclusive },
        unit: unitIdFilter ? { id: unitIdFilter, facilityId } : { facilityId },
      },
      select: {
        id: true,
        unitId: true,
        status: true,
        template: { select: { category: true, name: true } },
      },
    }),
    prisma.repair.findMany({
      where: {
        createdAt: { gte: start, lt: endExclusive },
        ...(repairStatusFilter ? { status: repairStatusFilter } : {}),
        unit: unitIdFilter ? { id: unitIdFilter, facilityId } : { facilityId },
      },
      select: { id: true, unitId: true, status: true, priority: true, title: true, repairCode: true },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: start, lt: endExclusive },
        unit: unitIdFilter ? { id: unitIdFilter, facilityId } : { facilityId },
      },
      select: { date: true, unitId: true },
    }),
    prisma.assignmentOverride.findMany({
      where: {
        date: { gte: start, lt: endExclusive },
        employee: { facilityId },
        ...(unitIdFilter
          ? { OR: [{ oldUnitId: unitIdFilter }, { newUnitId: unitIdFilter }] }
          : {}),
      },
      select: { date: true, oldUnitId: true, newUnitId: true },
    }),
  ]);

  const dayCount = Math.max(getDateRange(start, end).length, 1);
  const unitMap = new Map(units.map((unit) => [unit.id, unit.name]));

  const assignmentsByUnit = new Map<string, number>();
  for (const assignment of assignments) {
    assignmentsByUnit.set(
      assignment.unitId,
      (assignmentsByUnit.get(assignment.unitId) ?? 0) + assignment.timesPerDay,
    );
  }

  const submissionsByUnit = new Map<
    string,
    { total: number; completed: number; failed: number; missed: number }
  >();
  for (const submission of submissions) {
    const current = submissionsByUnit.get(submission.unitId) ?? {
      total: 0,
      completed: 0,
      failed: 0,
      missed: 0,
    };
    current.total += 1;
    if (submission.status === LogSubmissionStatus.COMPLETED) current.completed += 1;
    if (submission.status === LogSubmissionStatus.FAILED) current.failed += 1;
    if (submission.status === LogSubmissionStatus.MISSED) current.missed += 1;
    submissionsByUnit.set(submission.unitId, current);
  }

  const logCompletionRows = units.map((unit) => {
    const expected = (assignmentsByUnit.get(unit.id) ?? 0) * dayCount;
    const stats = submissionsByUnit.get(unit.id) ?? {
      total: 0,
      completed: 0,
      failed: 0,
      missed: 0,
    };
    return {
      unitId: unit.id,
      unitName: unit.name,
      expected,
      completed: stats.completed,
      failed: stats.failed,
      missed: stats.missed,
      missing: Math.max(expected - stats.total, 0),
    };
  });

  const failedTempRows = submissions
    .filter(
      (submission) =>
        submission.status === LogSubmissionStatus.FAILED &&
        submission.template.category.toLowerCase().includes("temp"),
    )
    .map((submission) => ({
      unitName: unitMap.get(submission.unitId) ?? "Unknown",
      templateName: submission.template.name,
    }));

  const repairsByStatus = Object.values(RepairStatus).map((status) => ({
    status,
    count: repairs.filter((repair) => repair.status === status).length,
  }));

  const repairsByUnit = units.map((unit) => ({
    unitName: unit.name,
    count: repairs.filter((repair) => repair.unitId === unit.id).length,
  }));

  const staffingCoverageByDay = getDateRange(start, end).map((date) => {
    const key = dateKey(date);
    const daySchedules = schedules.filter((entry) => dateKey(entry.date) === key);
    const dayOverrides = overrides.filter((entry) => dateKey(entry.date) === key);
    let effective = daySchedules.length;
    for (const override of dayOverrides) {
      if (override.oldUnitId) effective -= 1;
      effective += 1;
    }
    return {
      date: key,
      scheduled: daySchedules.length,
      overrides: dayOverrides.length,
      effective: Math.max(effective, 0),
    };
  });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Reports</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Run operational reports for logs, repairs, and staffing coverage.
        </p>
      </header>

      <section className="app-card">
        <h2 className="text-lg font-semibold text-zinc-900">Filters</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5" method="get">
          <input
            className="app-input"
            type="date"
            name="start"
            defaultValue={formatDateInput(start)}
          />
          <input
            className="app-input"
            type="date"
            name="end"
            defaultValue={formatDateInput(end)}
          />
          <select className="app-input" name="unitId" defaultValue={unitIdFilter ?? ""}>
            <option value="">All units</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select
            className="app-input"
            name="repairStatus"
            defaultValue={repairStatusFilter ?? ""}
          >
            <option value="">All repair statuses</option>
            {Object.values(RepairStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="app-button bg-zinc-900 text-white hover:bg-zinc-700"
            >
              Apply
            </button>
            <Link href="/reports" className="app-button border border-zinc-300 hover:bg-zinc-100">
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="app-card">
          <h2 className="text-lg font-semibold text-zinc-900">Log Completion by Unit</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Expected</th>
                  <th className="py-2 pr-3">Completed</th>
                  <th className="py-2 pr-3">Missing</th>
                </tr>
              </thead>
              <tbody>
                {logCompletionRows.map((row) => (
                  <tr key={row.unitId} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{row.unitName}</td>
                    <td className="py-2 pr-3">{row.expected}</td>
                    <td className="py-2 pr-3">{row.completed}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          row.missing > 0
                            ? "status-pill status-pill-alert"
                            : "status-pill status-pill-complete"
                        }
                      >
                        {row.missing}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="app-card">
          <h2 className="text-lg font-semibold text-zinc-900">Failed Temp Logs</h2>
          <div className="mt-3 space-y-2 text-sm">
            {failedTempRows.map((row, index) => (
              <div
                key={`${row.unitName}-${row.templateName}-${index}`}
                className="rounded border border-zinc-200 p-2"
              >
                <p className="font-medium text-zinc-900">{row.unitName}</p>
                <p className="text-zinc-600">{row.templateName}</p>
              </div>
            ))}
            {failedTempRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No failed temperature logs in this range.</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="app-card">
          <h2 className="text-lg font-semibold text-zinc-900">Repairs by Status</h2>
          <div className="mt-3 space-y-2 text-sm">
            {repairsByStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between rounded border border-zinc-200 p-2">
                <span className="text-zinc-700">{row.status}</span>
                <span className="font-semibold text-zinc-900">{row.count}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="app-card">
          <h2 className="text-lg font-semibold text-zinc-900">Repairs by Unit</h2>
          <div className="mt-3 space-y-2 text-sm">
            {repairsByUnit.map((row) => (
              <div key={row.unitName} className="flex items-center justify-between rounded border border-zinc-200 p-2">
                <span className="text-zinc-700">{row.unitName}</span>
                <span className="font-semibold text-zinc-900">{row.count}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-card">
        <h2 className="text-lg font-semibold text-zinc-900">Staffing Coverage by Day</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Scheduled</th>
                <th className="py-2 pr-3">Overrides</th>
                <th className="py-2 pr-3">Effective Coverage</th>
              </tr>
            </thead>
            <tbody>
              {staffingCoverageByDay.map((row) => (
                <tr key={row.date} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">{row.date}</td>
                  <td className="py-2 pr-3">{row.scheduled}</td>
                  <td className="py-2 pr-3">{row.overrides}</td>
                  <td className="py-2 pr-3">{row.effective}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
