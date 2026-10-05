import Link from "next/link";
import type { ReactNode } from "react";

import { prepareDietaryMealTimingUpgradeAction } from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";
import { AppIcons } from "@/lib/design-system/icons";
import type { OverviewGuidanceRow } from "@/lib/department-administration/overview-guidance";

export type OverviewEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  onRoster: boolean;
};

export type OverviewDepartmentSettings = {
  showInEmployeeApp: boolean;
  headEmployeeId: string | null;
  headLabel: string | null;
  assignedEmployeeCount: number;
  canEditHead: boolean;
  canEditVisibility: boolean;
  employees: OverviewEmployeeOption[];
  publishedCycleCount: number;
  cycleSummary: string;
  activeTeamCount: number;
  productName: string;
  isVssylProduct: boolean;
  licensed: boolean | null;
  guidanceRows: OverviewGuidanceRow[];
};

type Props = {
  department: { id: string; key: string; name: string };
  locationCoverage: {
    total: number;
    neighborhoodCount: number;
    roomCount: number;
    withPattern: number;
  };
  settings: OverviewDepartmentSettings;
  logsSection?: ReactNode;
};

function ConfigRow({
  icon,
  title,
  status,
  description,
  href,
  actionLabel,
  testId,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  description: string;
  href: string;
  actionLabel: string;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-12 gap-3 py-3 text-left transition-colors hover:bg-zinc-50"
      data-testid={testId}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-zinc-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900">{title}</span>
        <span className="block text-xs tabular-nums text-zinc-600">{status}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-xs text-zinc-500">{description}</span>
          <span className="shrink-0 text-xs font-medium text-zinc-700 group-hover:underline">
            {actionLabel}
          </span>
        </span>
      </span>
    </Link>
  );
}

const ROW_ICONS: Record<OverviewGuidanceRow["id"], typeof AppIcons.locations> = {
  locations: AppIcons.locations,
  rhythm: AppIcons.todaysWork,
  people: AppIcons.employees,
  work: AppIcons.todaysWork,
  records: AppIcons.logs,
};

export function OverviewPanel({
  department,
  locationCoverage,
  settings,
  logsSection,
}: Props) {
  void locationCoverage;

  return (
    <div className="max-w-4xl space-y-5" data-testid="department-overview-panel">
      {logsSection ? <div data-testid="department-logs-slot">{logsSection}</div> : null}

      <section data-testid="overview-product-identity">
        <p className="text-lg font-semibold text-zinc-900">{department.name}</p>
        {settings.isVssylProduct ? (
          <p className="text-xs text-zinc-500">
            Product: {settings.productName}
            {settings.licensed === true ? " · Licensed" : null}
            {settings.licensed === false ? " · Not on the current plan" : null}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">Local department</p>
        )}
      </section>

      <section className="space-y-0" aria-labelledby="dept-config-heading">
        <h2 id="dept-config-heading" className="text-sm font-semibold text-zinc-900">
          This department
        </h2>
        <div className="mt-1 divide-y divide-zinc-100">
          {settings.guidanceRows.map((row) => {
            const Icon = ROW_ICONS[row.id];
            return (
              <div key={row.id}>
                <ConfigRow
                  icon={<Icon className="h-4 w-4" aria-hidden />}
                  title={row.title}
                  status={row.status}
                  description={row.description}
                  href={row.href}
                  actionLabel={row.actionLabel}
                  testId={row.testId}
                />
                {row.status.includes("MEAL_TIMING_UPGRADE_REQUIRED") ? (
                  <form action={prepareDietaryMealTimingUpgradeAction} className="pb-3">
                    <input type="hidden" name="departmentId" value={department.id} />
                    <button
                      type="submit"
                      className="text-xs font-medium text-zinc-800 underline"
                      data-testid="prepare-meal-timing-upgrade"
                    >
                      Prepare timing upgrade
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
