import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader, StatusBadge } from "@/components/design-system";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  isAnyStaffingOperationalFeatureEnabled,
  resolveStaffingOperationalDepartment,
} from "@/lib/department-operations";
import { searchEvidenceRecords, resolveEvidenceAuthority } from "@/lib/operational-evidence";
import { toServiceDateKey } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function EvidenceLogBookPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();

  if (!isAnyStaffingOperationalFeatureEnabled("evidence")) {
    redirect("/staffing");
  }

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) redirect("/workspace");
  if (session.authMethod === "QUICK_PIN") {
    return (
      <section className="mx-auto max-w-5xl space-y-4">
        <PageHeader
          title="Log Book"
          subtitle="Password sign-in is required for the Department Log Book."
          compact
        />
      </section>
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const department = await resolveStaffingOperationalDepartment({
    facilityId: session.facilityId,
    activeDepartmentId: deptNav.activeDepartmentId,
    feature: "evidence",
  });

  if (!department) {
    return (
      <section className="mx-auto max-w-5xl">
        <PageHeader title="Log Book" subtitle="No operational department found." compact />
      </section>
    );
  }

  const authority = await resolveEvidenceAuthority(session, session.facilityId, department.id);
  if (!authority.canViewLogBook) {
    return (
      <section className="mx-auto max-w-5xl" data-testid="evidence-log-book-denied">
        <PageHeader
          title="Log Book"
          subtitle={authority.reason ?? "Insufficient Log Book authority."}
          compact
        />
      </section>
    );
  }

  const params = await searchParams;
  const unitId = one(params.unitId);
  const assetId = one(params.assetId);
  const templateStableKey = one(params.template);
  const dateFromKey = one(params.from);
  const dateToKey = one(params.to);
  const correctiveOnly = one(params.corrective) === "1";

  const result = await searchEvidenceRecords(session, {
    facilityId: session.facilityId,
    departmentId: department.id,
    unitId,
    assetId,
    templateStableKey,
    dateFromKey,
    dateToKey,
    correctiveOnly: correctiveOnly || undefined,
    page: 1,
    pageSize: 50,
  });

  const unitIds = [...new Set(result.records.map((r) => r.unitId).filter(Boolean))] as string[];
  const assetIds = [...new Set(result.records.map((r) => r.assetId).filter(Boolean))] as string[];
  const [unitsNamed, assetsNamed, units] = await Promise.all([
    unitIds.length
      ? prisma.unit.findMany({
          where: { id: { in: unitIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    assetIds.length
      ? prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, name: true, assetCode: true },
        })
      : Promise.resolve([]),
    prisma.unit.findMany({
      where: {
        facilityId: session.facilityId,
        isActive: true,
        departmentResponsibilities: { some: { departmentId: department.id } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);
  const unitNameById = new Map(unitsNamed.map((u) => [u.id, u.name]));
  const assetNameById = new Map(
    assetsNamed.map((a) => [a.id, `${a.name} (${a.assetCode})`]),
  );

  return (
    <section className="mx-auto max-w-5xl space-y-4" data-testid="evidence-log-book">
      <PageHeader
        title="Log Book"
        subtitle={`${department.name} historical operational evidence.`}
        compact
        actions={
          <Link href="/staffing/templates" className="text-sm underline-offset-2 hover:underline">
            Template Builder
          </Link>
        }
      />

      <form
        className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="log-book-filters"
        method="get"
      >
        <label className="text-xs text-zinc-600">
          From
          <input
            name="from"
            type="date"
            defaultValue={dateFromKey ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          To
          <input
            name="to"
            type="date"
            defaultValue={dateToKey ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Unit
          <select
            name="unitId"
            defaultValue={unitId ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            data-testid="log-book-filter-unit"
          >
            <option value="">All units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Asset id
          <input
            name="assetId"
            defaultValue={assetId ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            data-testid="log-book-filter-asset"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Template key
          <input
            name="template"
            defaultValue={templateStableKey ?? ""}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-end gap-2 text-xs text-zinc-700">
          <input type="checkbox" name="corrective" value="1" defaultChecked={correctiveOnly} />
          Corrective action only
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            data-testid="log-book-apply-filters"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="rounded-md border border-zinc-200 bg-white" data-testid="log-book-results">
        <p className="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">
          {result.total} record{result.total === 1 ? "" : "s"}
        </p>
        <ul className="divide-y divide-zinc-100">
          {result.records.length === 0 ? (
            <li className="px-4 py-6 text-sm text-zinc-500">No records match these filters.</li>
          ) : (
            result.records.map((row) => (
              <li key={row.id} className="px-4 py-3" data-testid={`log-book-row-${row.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {row.templateName}{" "}
                      <span className="text-xs font-normal text-zinc-500">
                        v{row.templateVersion}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-600">
                      {toServiceDateKey(row.operationalDate)}
                      {row.windowStartLocal
                        ? ` · ${row.windowStartLocal}–${row.windowEndLocal ?? ""}`
                        : ""}
                      {row.unitId && unitNameById.get(row.unitId)
                        ? ` · ${unitNameById.get(row.unitId)}`
                        : ""}
                      {row.assetId && assetNameById.get(row.assetId)
                        ? ` · ${assetNameById.get(row.assetId)}`
                        : ""}
                      {row.recordedByLabel ? ` · ${row.recordedByLabel}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Occurred {row.occurredAt.toISOString()} · Recorded {row.recordedAt.toISOString()}
                      {row.synchronizedAt ? ` · Synced ${row.synchronizedAt.toISOString()}` : ""}
                      {row.recordedOnline ? " · Online" : " · Offline"}
                      {row._count.corrections > 0 ? " · Corrected" : ""}
                      {row.outOfStandard ? " · Out of standard" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      variant={
                        row.status === "COMPLETED"
                          ? "success"
                          : row.status === "NEEDS_REVIEW"
                            ? "warning"
                            : "in_progress"
                      }
                    >
                      {row.status.replaceAll("_", " ")}
                    </StatusBadge>
                    <Link
                      href={`/staffing/log-book/${row.id}`}
                      className="text-xs font-medium underline-offset-2 hover:underline"
                      data-testid={`log-book-open-${row.id}`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
