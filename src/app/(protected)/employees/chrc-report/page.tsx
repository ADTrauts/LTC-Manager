import { ChrcStatus, EmployeeStatus } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CHRC_STATUS_LABEL } from "@/lib/employee-hr-labels";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function EmployeesChrcReportPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;

  const employees = await prisma.employee.findMany({
    where: {
      facilityId,
      status: { not: EmployeeStatus.TERMINATED },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      chrcStatus: true,
      chrcClearedAt: true,
    },
  });

  const cleared = employees.filter((e) => e.chrcStatus === ChrcStatus.CLEARED);
  const notCleared = employees.filter((e) => e.chrcStatus !== ChrcStatus.CLEARED);

  function statusLabel(chrcStatus: ChrcStatus | null): string {
    if (chrcStatus === null) return "Not set";
    return CHRC_STATUS_LABEL[chrcStatus];
  }

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">CHRC status</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Active and off-duty roster (excludes terminated). <span className="font-medium text-zinc-800">Cleared</span> means
            CHRC status is set to Cleared; everyone else appears under <span className="font-medium text-zinc-800">Not cleared</span>
            (pending, not started, N/A, or unset).
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Cleared ({cleared.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Cleared date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cleared.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    {row.lastName}, {row.firstName}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">{formatDate(row.chrcClearedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/employees#employee-${row.id}`}
                      className="text-zinc-700 underline hover:text-zinc-950"
                    >
                      Open card
                    </Link>
                  </td>
                </tr>
              ))}
              {cleared.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    No one on this roster is marked Cleared yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Not cleared ({notCleared.length})</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">CHRC status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {notCleared.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-4 py-2 font-medium text-zinc-900">
                    {row.lastName}, {row.firstName}
                  </td>
                  <td className="px-4 py-2 text-zinc-700">{statusLabel(row.chrcStatus)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/employees#employee-${row.id}`}
                      className="text-zinc-700 underline hover:text-zinc-950"
                    >
                      Open card
                    </Link>
                  </td>
                </tr>
              ))}
              {notCleared.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    Everyone on this roster is marked Cleared.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
