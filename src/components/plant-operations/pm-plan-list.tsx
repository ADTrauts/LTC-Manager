import Link from "next/link";

import { Button } from "@/components/design-system/Button";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import {
  preventiveMaintenanceBuilderHref,
  preventiveMaintenanceNewHref,
  preventiveMaintenancePlanHref,
} from "@/lib/department-administration";
import {
  formatProjectedDateLabel,
} from "@/lib/preventive-maintenance/presentation";
import type { PmPlanListRow } from "@/lib/preventive-maintenance/builder-load";
import type { PmPlanListFilter } from "@/lib/preventive-maintenance/builder-load";

function statusVariant(key: PmPlanListRow["status"]["key"]) {
  if (key === "PUBLISHED") return "success" as const;
  if (key === "PUBLISHED_DRAFT") return "in_progress" as const;
  if (key === "RETIRED") return "warning" as const;
  return "neutral" as const;
}

export function PmPlanList({
  departmentId,
  rows,
  filter,
  assetQuery,
  canCreate,
  assetCount = 0,
}: {
  departmentId: string;
  rows: PmPlanListRow[];
  filter: PmPlanListFilter;
  assetQuery: string;
  canCreate: boolean;
  assetCount?: number;
}) {
  const filters: Array<{ id: PmPlanListFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "published", label: "Published" },
    { id: "draft", label: "Draft" },
    { id: "retired", label: "Retired" },
  ];

  const listHref = (next: PmPlanListFilter) => {
    const params = new URLSearchParams();
    if (next !== "all") params.set("filter", next);
    if (assetQuery.trim()) params.set("asset", assetQuery.trim());
    const qs = params.toString();
    const base = preventiveMaintenanceBuilderHref(departmentId);
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <section className="space-y-4" data-testid="pm-plan-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Preventive Maintenance</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Configure scheduled maintenance for Facility assets. Publishing a Plan does not create
            Work Orders until maintenance comes due.
          </p>
        </div>
        {canCreate ? (
          <Link href={preventiveMaintenanceNewHref(departmentId)}>
            <Button data-testid="pm-plan-create">Create Preventive Maintenance Plan</Button>
          </Link>
        ) : null}
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get" data-testid="pm-plan-filters">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-zinc-700">
          Asset
          <input
            type="search"
            name="asset"
            defaultValue={assetQuery}
            placeholder="Name or code"
            className="min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit" variant="secondary" size="compact">
          Search
        </Button>
        <div className="flex flex-wrap gap-1">
          {filters.map((item) => (
            <Link
              key={item.id}
              href={listHref(item.id)}
              className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm ${
                filter === item.id
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-800"
              }`}
              data-testid={`pm-filter-${item.id}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-700" data-testid="pm-plan-empty">
          <p>Preventive Maintenance Plans schedule service for real Assets.</p>
          {assetCount === 0 ? (
            <p className="mt-2">
              Add an Asset first.{" "}
              <Link href="/assets/builder" className="font-medium underline underline-offset-2">
                Configure Assets
              </Link>
            </p>
          ) : canCreate ? (
            <p className="mt-2">
              <Link href={preventiveMaintenanceNewHref(departmentId)} className="font-medium underline underline-offset-2">
                Create a Preventive Maintenance Plan
              </Link>
            </p>
          ) : (
            <p className="mt-2">No Preventive Maintenance Plans yet.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Asset</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Cadence</th>
                <th className="px-3 py-2 font-medium">Next scheduled</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Procedure</th>
                <th className="px-3 py-2 font-medium">Technician</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0" data-testid={`pm-plan-row-${row.id}`}>
                  <td className="px-3 py-2">
                    <Link
                      href={preventiveMaintenancePlanHref(departmentId, row.id)}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {row.assetName}
                    <span className="block text-xs text-zinc-500">{row.assetCode}</span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge variant={statusVariant(row.status.key)}>{row.status.label}</StatusBadge>
                    {row.generationWarning?.tone === "paused" ? (
                      <p className="mt-1 text-xs text-amber-800" data-testid="pm-generation-paused">
                        {row.generationWarning.title}
                        {" — "}
                        {row.generationWarning.detail}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">
                    {row.publishedVersion ? `v${row.publishedVersion}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{row.cadenceSummary}</td>
                  <td className="px-3 py-2 text-zinc-700" data-testid="pm-next-projected">
                    {row.nextProjectedDate
                      ? formatProjectedDateLabel(row.nextProjectedDate, { includeYear: true })
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{row.categoryLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.priorityLabel}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.procedureLabel ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.assigneeLabel ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
