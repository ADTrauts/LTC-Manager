import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmployeeStatus, SeparationKind } from "@prisma/client";

import { RecordSeparationDrawer } from "@/app/(protected)/employees/record-separation-drawer";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  employeeWhereForFacilityAndDept,
  hrefWithEmployeesDept,
  resolveEmployeesDeptScope,
} from "@/lib/employees-department-tabs";
import { prisma } from "@/lib/prisma";

function separationKindLabel(k: SeparationKind): string {
  return k === SeparationKind.RESIGNED ? "Resigned" : "Terminated";
}

export default async function EmployeesSeparationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    redirect("/dashboard");
  }

  const facilityId = session.facilityId;
  const sp = await searchParams;
  const { deptId, deptName } = await resolveEmployeesDeptScope(prisma, facilityId, "/employees/separations", sp);

  const employeeScope = employeeWhereForFacilityAndDept(facilityId, deptId);

  const [rows, roster] = await Promise.all([
    prisma.employeeTerminationRecord.findMany({
      where: {
        facilityId,
        employee: employeeScope,
      },
      orderBy: { terminatedAt: "desc" },
      take: 200,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, status: true } },
        createdBy: { select: { displayName: true, email: true } },
      },
    }),
    prisma.employee.findMany({
      where: {
        ...employeeScope,
        status: { not: EmployeeStatus.TERMINATED },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const defaultDateIso = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Separations</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {deptName ? (
              <>
                Showing <span className="font-medium text-zinc-800">{deptName}</span> only.{" "}
              </>
            ) : null}
            Immutable log when someone leaves (a new row each time they are separated again after returning to
            active). Use <strong className="font-medium text-zinc-800">Record separation</strong> to end
            employment from the roster, or terminate from an employee card / import as before.
          </p>
        </div>
        <RecordSeparationDrawer roster={roster} defaultDateIso={defaultDateIso} />
      </header>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">Separation date</th>
              <th className="px-3 py-2">Last shift</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Rehire?</th>
              <th className="px-3 py-2">Current status</th>
              <th className="px-3 py-2">Recorded by</th>
              <th className="px-3 py-2">Snapshot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                  {r.terminatedAt.toISOString().slice(0, 10)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                  {r.lastShiftWorkedAt ? r.lastShiftWorkedAt.toISOString().slice(0, 10) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={hrefWithEmployeesDept("/employees", deptId, `#employee-${r.employee.id}`)}
                    className="font-medium text-zinc-900 underline decoration-zinc-300 hover:text-zinc-950"
                  >
                    {r.employee.firstName} {r.employee.lastName}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                  {separationKindLabel(r.separationKind)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                  {r.wouldRehire === null ? "—" : r.wouldRehire ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2 text-zinc-700">{r.employee.status}</td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  {r.createdBy?.displayName ?? r.createdBy?.email ?? "—"}
                </td>
                <td className="max-w-xl px-3 py-2">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-zinc-700">View JSON</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-zinc-800">
                      {r.snapshotJson}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No separation records yet.</p>
        ) : null}
      </div>
    </section>
  );
}
