import Link from "next/link";
import type { ReactNode } from "react";

import { DepartmentManagerForm } from "@/app/(protected)/admin/departments/[departmentId]/department-manager-form";
import { DepartmentVisibilityForm } from "@/app/(protected)/admin/departments/department-visibility-form";
import {
  departmentAdminHref,
  type DepartmentAdminView,
} from "@/lib/department-administration";
import { AppIcons } from "@/lib/design-system/icons";

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
  view?: DepartmentAdminView | null;
  profilesEnabled?: boolean;
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

export function OverviewPanel({
  department,
  locationCoverage,
  settings,
  view,
  profilesEnabled = false,
  logsSection,
}: Props) {
  void view;
  void profilesEnabled;

  const LocationIcon = AppIcons.locations;
  const TeamIcon = AppIcons.employees;
  const CycleIcon = AppIcons.todaysWork;

  return (
    <div className="max-w-4xl space-y-5" data-testid="department-overview-panel">
      {logsSection ? <div data-testid="department-logs-slot">{logsSection}</div> : null}

      <section data-testid="overview-department-manager">
        <h2 className="text-sm font-semibold text-zinc-900">Department Manager</h2>
        {settings.headLabel ? (
          <p className="mt-1 text-base font-medium text-zinc-900">{settings.headLabel}</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No Department Manager assigned.</p>
        )}
        <p className="text-xs text-zinc-500">Department Manager</p>
        {settings.canEditHead ? (
          <div className="mt-2">
            <DepartmentManagerForm
              departmentId={department.id}
              headEmployeeId={settings.headEmployeeId}
              employees={settings.employees}
            />
          </div>
        ) : null}
      </section>

      <div className="border-t border-zinc-200" />

      <section className="space-y-0" aria-labelledby="dept-config-heading">
        <h2 id="dept-config-heading" className="text-sm font-semibold text-zinc-900">
          Configuration
        </h2>
        <div className="mt-1 divide-y divide-zinc-100">
          <ConfigRow
            icon={<LocationIcon className="h-4 w-4" aria-hidden />}
            title="Locations"
            status={`${locationCoverage.total} assigned location${locationCoverage.total === 1 ? "" : "s"}`}
            description={`Where ${department.name} operates.`}
            href={departmentAdminHref(department.id, "locations")}
            actionLabel="View locations →"
          />
          <ConfigRow
            icon={<TeamIcon className="h-4 w-4" aria-hidden />}
            title="Teams"
            status={
              settings.activeTeamCount === 0
                ? "None configured — Teams are optional"
                : `${settings.activeTeamCount} active team${settings.activeTeamCount === 1 ? "" : "s"}`
            }
            description={`How ${department.name} is organizationally divided.`}
            href={departmentAdminHref(department.id, "teams")}
            actionLabel="Manage teams →"
            testId="overview-teams-summary"
          />
          <ConfigRow
            icon={<CycleIcon className="h-4 w-4" aria-hidden />}
            title="Operational Cycles"
            status={settings.cycleSummary}
            description="Recurring operating rhythm."
            href={departmentAdminHref(department.id, "cycles")}
            actionLabel="View cycles →"
          />
        </div>
      </section>

      <div className="border-t border-zinc-200" />

      {settings.canEditVisibility ? (
        <details data-testid="overview-advanced-settings">
          <summary className="cursor-pointer text-xs font-medium text-zinc-500">
            Advanced settings
          </summary>
          <div className="mt-3 max-w-lg">
            <p className="mb-2 text-xs text-zinc-500">
              Employee application visibility is a facility-wide picker setting, not day-to-day
              Department Builder configuration.
            </p>
            <DepartmentVisibilityForm
              departmentId={department.id}
              showInEmployeeApp={settings.showInEmployeeApp}
              assignedEmployeeCount={settings.assignedEmployeeCount}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
