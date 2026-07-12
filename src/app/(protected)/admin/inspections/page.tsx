import Link from "next/link";

import {
  setInspectionDefinitionActiveAction,
} from "@/app/(protected)/admin/inspections/actions";
import { InspectionDefinitionEditor } from "@/components/inspections/inspection-definition-editor";
import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";
import { prisma } from "@/lib/prisma";
import { buildInspectionScheduleSummary } from "@/lib/work/inspections/inspection-cadence";

type AdminInspectionsPageProps = {
  searchParams?: Promise<{ saved?: string; edit?: string }>;
};

export default async function AdminInspectionsPage({ searchParams }: AdminInspectionsPageProps) {
  const session = await assertFacilityAdministratorPage();
  const query = searchParams ? await searchParams : undefined;

  const [definitions, departments, units, recentSubmissions] = await Promise.all([
    prisma.inspectionDefinition.findMany({
      where: { facilityId: session.facilityId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        department: { select: { name: true } },
        unit: { select: { name: true } },
        items: { orderBy: { sortOrder: "asc" } },
        _count: { select: { submissions: true, items: true } },
      },
    }),
    prisma.department.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.unit.findMany({
      where: { facilityId: session.facilityId, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.inspectionSubmission.findMany({
      where: { facilityId: session.facilityId },
      orderBy: { submittedAt: "desc" },
      take: 12,
      select: {
        id: true,
        result: true,
        submittedAt: true,
        unit: { select: { name: true } },
        definition: { select: { name: true } },
        submittedByEmployee: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const editing = query?.edit
    ? definitions.find((definition) => definition.id === query.edit)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm text-zinc-500">
          <Link href="/admin" className="font-medium text-zinc-700 hover:text-zinc-900">
            Admin
          </Link>
          <span className="mx-1.5 text-zinc-400">/</span>
          <span className="text-zinc-600">Inspections</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Inspection definitions</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Build structured location or department inspections for Unit Workspace. Separate from compliance logs.
          Recurring due generation is not enabled yet — active definitions appear as available work on matching
          units.
        </p>
      </header>

      {query?.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Inspection definition saved.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">
          {editing ? `Edit · ${editing.name}` : "Create inspection"}
        </h2>
        {editing ? (
          <p className="text-sm text-zinc-600">
            <Link href="/admin/inspections" className="font-medium text-zinc-800 underline">
              Cancel edit / create new
            </Link>
          </p>
        ) : null}
        <InspectionDefinitionEditor
          key={editing?.id ?? "create"}
          mode={editing ? "edit" : "create"}
          definitionId={editing?.id}
          initialName={editing?.name}
          initialDescription={editing?.description ?? ""}
          initialFrequency={editing?.frequency ?? ""}
          initialCadenceType={editing?.cadenceType}
          initialDueTimeLocal={editing?.dueTimeLocal}
          initialDaysOfWeek={editing?.daysOfWeek ?? []}
          initialDayOfMonth={editing?.dayOfMonth}
          initialDepartmentId={editing?.departmentId ?? ""}
          initialUnitId={editing?.unitId ?? ""}
          initialIsActive={editing?.isActive ?? true}
          initialItems={editing?.items.map((item) => ({
            key: item.id,
            id: item.id,
            label: item.label,
            description: item.description ?? "",
            responseType: item.responseType,
            isRequired: item.isRequired,
            failureCreatesFollowUp: item.failureCreatesFollowUp,
          }))}
          departments={departments}
          units={units}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Definitions</h2>
        {definitions.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
            No inspection definitions yet. Create one above to make it available on Unit Workspace.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
            {definitions.map((definition) => (
              <li key={definition.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{definition.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {definition.isActive ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Active</span>
                      ) : (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">Inactive</span>
                      )}
                      <span className="ml-2">
                        {buildInspectionScheduleSummary({
                          cadenceType: definition.cadenceType,
                          dueTimeLocal: definition.dueTimeLocal,
                          daysOfWeek: definition.daysOfWeek,
                          dayOfMonth: definition.dayOfMonth,
                        })}
                        {" · "}
                        {definition._count.items} items · {definition._count.submissions} submissions
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {[definition.department?.name, definition.unit?.name, definition.frequency]
                        .filter(Boolean)
                        .join(" · ") || "Facility-wide"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/inspections?edit=${definition.id}`}
                      className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Edit
                    </Link>
                    <form action={setInspectionDefinitionActiveAction}>
                      <input type="hidden" name="definitionId" value={definition.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={definition.isActive ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-900 hover:bg-zinc-50"
                      >
                        {definition.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Recent submissions</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Inspection</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Result</th>
                <th className="px-4 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {recentSubmissions.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="px-4 py-2 text-zinc-700">{row.submittedAt.toLocaleString()}</td>
                  <td className="px-4 py-2 text-zinc-700">{row.definition.name}</td>
                  <td className="px-4 py-2 text-zinc-700">{row.unit?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-zinc-700">{row.result}</td>
                  <td className="px-4 py-2 text-zinc-700">
                    {row.submittedByEmployee
                      ? `${row.submittedByEmployee.firstName} ${row.submittedByEmployee.lastName}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentSubmissions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No inspection submissions yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
