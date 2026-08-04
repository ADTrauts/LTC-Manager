import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  employeeWhereForFacilityAndDept,
  hrefWithEmployeesDept,
  resolveEmployeesDeptScope,
} from "@/lib/employees-department-tabs";
import { prisma } from "@/lib/prisma";

export default async function EmployeesHrAuditPage({
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
  const { deptId, deptName } = await resolveEmployeesDeptScope(prisma, facilityId, "/employees/hr-audit", sp);

  const rows = await prisma.employeeHrAuditLog.findMany({
    where: {
      facilityId,
      employee: employeeWhereForFacilityAndDept(facilityId, deptId),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      employee: { select: { firstName: true, lastName: true } },
      user: { select: { displayName: true, email: true } },
    },
  });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">HR audit log</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          {deptName ? (
            <>
              Showing <span className="font-medium text-zinc-800">{deptName}</span> only.{" "}
            </>
          ) : null}
          Recent field-level changes to employee profiles and floor PIN lifecycle (up to 500 entries). Open an
          employee from the directory to continue editing.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium uppercase tracking-wide text-zinc-600">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Field</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-700">{r.createdAt.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <Link
                    href={hrefWithEmployeesDept("/employees", deptId, `#employee-${r.employeeId}`)}
                    className="font-medium text-zinc-900 underline decoration-zinc-300 hover:text-zinc-950"
                  >
                    {r.employee.firstName} {r.employee.lastName}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-800">{r.fieldKey}</td>
                <td className="max-w-[12rem] break-words px-3 py-2 text-zinc-600">{r.oldValue ?? "—"}</td>
                <td className="max-w-[12rem] break-words px-3 py-2 text-zinc-600">{r.newValue ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  {r.user?.displayName ?? r.user?.email ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No audit entries yet.</p>
        ) : null}
      </div>
    </section>
  );
}
