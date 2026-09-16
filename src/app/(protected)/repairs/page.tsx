import Link from "next/link";
import { cookies } from "next/headers";
import { RepairPriority } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { createRepairAction } from "@/app/(protected)/repairs/actions";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  compareRepairsForQueue,
  departmentDisplayLabel,
  formatAssetLocationLabel,
  parseRepairQueueFilter,
  preferredRepairProviderDisplayLabel,
  projectAssetResponsibility,
  repairDepartmentWhere,
  repairMatchesQueueFilter,
  repairOpenedAgeLabel,
  repairSourceCompactLine,
  repairSourceKind,
  repairStatusProductLabel,
  responsibleOrganizationDisplayLabel,
  type RepairQueueFilter,
} from "@/lib/asset-operations";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

type RepairsPageProps = {
  searchParams: Promise<{ status?: string; q?: string }>;
};

const FILTER_TABS: Array<{ value: RepairQueueFilter; label: string }> = [
  { value: "OPEN", label: "Open work" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ALL", label: "All" },
];

function filterHref(status: RepairQueueFilter, q: string) {
  const params = new URLSearchParams();
  if (status !== "OPEN") params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/repairs?${qs}` : "/repairs";
}

export default async function RepairsPage({ searchParams }: RepairsPageProps) {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const params = await searchParams;
  const statusFilter = parseRepairQueueFilter(
    typeof params.status === "string" ? params.status : undefined,
  );
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const departmentWhere = repairDepartmentWhere(deptNav.activeDepartmentId);

  const activeDepartmentName = deptNav.activeDepartmentId
    ? (
        await prisma.department.findFirst({
          where: { id: deptNav.activeDepartmentId, facilityId },
          select: { name: true },
        })
      )?.name ?? null
    : null;

  const [units, assets, vendors, repairs] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.asset.findMany({
      where: {
        unit: { facilityId },
        status: { not: "RETIRED" },
      },
      orderBy: { assetCode: "asc" },
      select: {
        id: true,
        assetCode: true,
        name: true,
        unitId: true,
        vendorId: true,
        vendor: { select: { name: true } },
      },
    }),
    prisma.vendor.findMany({
      where: { facilityId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.repair.findMany({
      where: {
        unit: { facilityId },
        ...departmentWhere,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { repairCode: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { asset: { name: { contains: q, mode: "insensitive" } } },
                { asset: { assetCode: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        unit: { select: { name: true } },
        asset: {
          select: {
            assetCode: true,
            name: true,
            criticality: true,
            department: { select: { id: true, name: true } },
            responsibleOrganization: {
              select: { id: true, name: true, isActive: true },
            },
            vendor: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                contactName: true,
              },
            },
            space: { select: { name: true } },
          },
        },
        vendor: { select: { id: true, name: true } },
        responsibleDepartment: { select: { id: true, name: true } },
        sourceAssetIssue: { select: { id: true, summary: true, status: true } },
      },
    }),
  ]);

  const filtered = repairs
    .filter((repair) => repairMatchesQueueFilter(repair.status, statusFilter))
    .sort(compareRepairsForQueue);

  const emptyMessage =
    repairs.length === 0 && !q
      ? statusFilter === "OPEN" || statusFilter === "IN_PROGRESS" || statusFilter === "WAITING"
        ? "No open repairs."
        : "No repairs yet."
      : filtered.length === 0
        ? "No repairs match these filters."
        : null;

  const deptLabel = deptNav.activeDepartmentId
    ? activeDepartmentName ?? "Selected department"
    : "All departments";

  return (
    <section className="space-y-6" data-testid="repairs-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Repairs</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Work being done to fix a problem or perform maintenance. Reported equipment problems stay
          on Asset Issues until you open a repair.
        </p>
        <p className="mt-1 text-xs text-zinc-500" data-testid="repairs-department-context">
          Showing: {deptLabel}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <nav
          className="flex flex-wrap gap-2"
          aria-label="Repair status filters"
          data-testid="repairs-status-filters"
        >
          {FILTER_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <Link
                key={tab.value}
                href={filterHref(tab.value, q)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white"
                    : "inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <form method="get" className="flex min-h-10 gap-2" role="search">
          {statusFilter !== "OPEN" ? (
            <input type="hidden" name="status" value={statusFilter} />
          ) : null}
          <label className="sr-only" htmlFor="repairs-search">
            Search repairs
          </label>
          <input
            id="repairs-search"
            name="q"
            defaultValue={q}
            placeholder="Search asset or title"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm sm:w-56"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Search
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">New repair</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Direct repair — no Asset Issue required. If you pick an asset and leave provider blank,
          the preferred provider is used when one exists.
        </p>
        <form
          action={createRepairAction}
          className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          data-testid="repairs-create-form"
        >
          <label className="block text-sm text-zinc-700">
            Unit
            <select
              name="unitId"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Select unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Asset (optional)
            <select
              name="assetId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">No asset linked</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.assetCode} · {asset.name}
                  {asset.vendor ? ` · preferred: ${asset.vendor.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Actual repair provider
            <select
              name="vendorId"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Use preferred / none</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700">
            Priority
            <select
              name="priority"
              defaultValue={RepairPriority.MEDIUM}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {Object.values(RepairPriority).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-700 md:col-span-2">
            Work title
            <input
              name="title"
              required
              placeholder="e.g. Compressor service"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm text-zinc-700 md:col-span-2 xl:col-span-4">
            Description
            <textarea
              name="description"
              required
              placeholder="Describe the work needed"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              rows={3}
            />
          </label>
          <div className="md:col-span-2 xl:col-span-4">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Create repair
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Repair queue</h2>
        <div className="mt-3 space-y-3" data-testid="repairs-queue">
          {filtered.map((repair) => {
            const sourceKind = repairSourceKind({
              workOrderKind: repair.workOrderKind,
              hasLinkedAssetIssue: Boolean(repair.sourceAssetIssue),
            });
            const sourceLine = repairSourceCompactLine({
              kind: sourceKind,
              issueSummary: repair.sourceAssetIssue?.summary ?? null,
            });
            const responsibility = projectAssetResponsibility({
              department: repair.asset?.department ?? repair.responsibleDepartment,
              responsibleOrganization: repair.asset?.responsibleOrganization ?? null,
              preferredRepairProvider: repair.asset?.vendor ?? null,
            });
            const locationLabel = formatAssetLocationLabel({
              unitName: repair.unit.name,
              spaceName: repair.asset?.space?.name ?? null,
            });
            const subject = repair.asset
              ? `${repair.asset.assetCode} · ${repair.asset.name}`
              : repair.title;
            const actualProvider = repair.vendor?.name ?? null;

            return (
              <article
                key={repair.id}
                className="rounded-lg border border-zinc-200 p-3"
                data-testid="repair-queue-row"
                data-source-kind={sourceKind}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-zinc-900">
                      <span className="text-zinc-500">{repair.repairCode}</span>
                      {" · "}
                      {repair.title}
                    </p>
                    <p className="text-sm text-zinc-800">{subject}</p>
                    <p className="text-xs text-zinc-600">{locationLabel}</p>
                    <p className="text-xs text-zinc-700" data-testid="repair-queue-source">
                      {sourceLine}
                    </p>
                    <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-zinc-600 sm:grid-cols-2">
                      <div>
                        <dt className="inline text-zinc-500">Department: </dt>
                        <dd className="inline">
                          {departmentDisplayLabel(responsibility.department)}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-zinc-500">Maintainer: </dt>
                        <dd className="inline">
                          {responsibleOrganizationDisplayLabel(
                            responsibility.responsibleOrganization,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-zinc-500">Vendor: </dt>
                        <dd className="inline">
                          {actualProvider ?? "No external provider assigned"}
                        </dd>
                      </div>
                      {!actualProvider && responsibility.preferredRepairProvider ? (
                        <div>
                          <dt className="inline text-zinc-500">Preferred vendor: </dt>
                          <dd className="inline">
                            {preferredRepairProviderDisplayLabel(
                              responsibility.preferredRepairProvider,
                            )}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="inline text-zinc-500">Opened: </dt>
                        <dd className="inline">{repairOpenedAgeLabel(repair.requestedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-800"
                      data-testid="repair-queue-status"
                    >
                      {repairStatusProductLabel(repair.status)}
                      {repair.priority === "URGENT" || repair.priority === "HIGH"
                        ? ` · ${repair.priority}`
                        : ""}
                    </span>
                    <Link
                      href={issueDetailPath(repair.id)}
                      className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                    >
                      Open repair
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
          {emptyMessage ? (
            <p className="text-sm text-zinc-500" data-testid="repairs-empty">
              {emptyMessage}
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
