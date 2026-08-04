import { DisciplinePointCategory } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { employeeWhereForFacilityAndDept, hrefWithEmployeesDept, resolveEmployeesDeptScope } from "@/lib/employees-department-tabs";
import { prisma } from "@/lib/prisma";

type Row = {
  employeeId: string;
  firstName: string;
  lastName: string;
  attendance: number;
  performance: number;
  total: number;
};

export default async function EmployeesPointsSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const sp = await searchParams;
  const { deptId, deptName } = await resolveEmployeesDeptScope(
    prisma,
    facilityId,
    "/employees/points-summary",
    sp,
  );

  const entries = await prisma.disciplinePointEntry.findMany({
    where: { employee: employeeWhereForFacilityAndDept(facilityId, deptId) },
    select: {
      employeeId: true,
      category: true,
      points: true,
      employee: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  const map = new Map<
    string,
    { attendance: number; performance: number; firstName: string; lastName: string }
  >();

  for (const e of entries) {
    const cur = map.get(e.employeeId) ?? {
      attendance: 0,
      performance: 0,
      firstName: e.employee.firstName,
      lastName: e.employee.lastName,
    };
    if (e.category === DisciplinePointCategory.ATTENDANCE) cur.attendance += e.points;
    else cur.performance += e.points;
    map.set(e.employeeId, cur);
  }

  const rows: Row[] = [...map.entries()]
    .map(([employeeId, v]) => ({
      employeeId,
      firstName: v.firstName,
      lastName: v.lastName,
      attendance: v.attendance,
      performance: v.performance,
      total: v.attendance + v.performance,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Discipline points summary</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {deptName ? (
              <>
                Showing <span className="font-medium text-zinc-800">{deptName}</span> only.{" "}
              </>
            ) : null}
            Union discipline totals (attendance + performance). Only employees with total points &gt; 0 are listed.
          </p>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Attendance</th>
              <th className="px-4 py-3">Performance</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId} className="border-b border-zinc-100">
                <td className="px-4 py-2 font-medium text-zinc-900">
                  {row.lastName}, {row.firstName}
                </td>
                <td className="px-4 py-2 text-zinc-700">{row.attendance}</td>
                <td className="px-4 py-2 text-zinc-700">{row.performance}</td>
                <td className="px-4 py-2 font-semibold text-zinc-900">{row.total}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={hrefWithEmployeesDept("/employees", deptId, `#employee-${row.employeeId}`)}
                    className="text-zinc-700 underline hover:text-zinc-950"
                  >
                    Open card
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No employees with recorded discipline points yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
