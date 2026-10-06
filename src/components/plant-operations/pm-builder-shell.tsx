import type { ReactNode } from "react";

import { DepartmentAdminLocalNav } from "@/app/(protected)/admin/departments/[departmentId]/local-nav";
import { DepartmentBuildContextBar } from "@/components/build/DepartmentBuildContextBar";
import type { DepartmentBuilderContextSummary } from "@/lib/department-administration/builder-context-summary";
import {
  departmentAdminTabsForFlags,
  type DepartmentAdminTabId,
} from "@/lib/department-administration";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { getDepartmentProduct } from "@/lib/department-products";
import { hasDietaryDomainCapabilities } from "@/lib/department-admission";

export function plantMaintenanceTabs(input: {
  departmentKey: string;
  workEnabled: boolean;
}) {
  return departmentAdminTabsForFlags({
    profilesEnabled: false,
    locationsEnabled: true,
    workEnabled: input.workEnabled,
    recordsEnabled: isCanonicalLogsEnabled(),
    menusEnabled: hasDietaryDomainCapabilities(input.departmentKey),
    maintenanceEnabled: input.departmentKey === "PLANT",
  });
}

export function PmBuilderShell({
  departmentId,
  departmentName,
  departmentKey,
  locationCount,
  context,
  children,
  contentClassName = "max-w-5xl",
}: {
  departmentId: string;
  departmentName: string;
  departmentKey: string;
  locationCount: number;
  context: DepartmentBuilderContextSummary;
  children: ReactNode;
  contentClassName?: string;
}) {
  const product = getDepartmentProduct(departmentKey);
  const workEnabled =
    departmentKey === "PLANT" ||
    Boolean(product?.starters.workPresets) ||
    context.publishedWorkPlanCount > 0 ||
    context.draftWorkPlanCount > 0;
  const tabs = plantMaintenanceTabs({ departmentKey, workEnabled });
  const activeTab: DepartmentAdminTabId = "maintenance";

  return (
    <div className="space-y-3" data-testid="department-builder">
      <DepartmentBuildContextBar
        departmentId={departmentId}
        departmentName={departmentName}
        locationCount={locationCount}
        profileId={null}
        activeTab={activeTab}
        context={context}
      />
      <DepartmentAdminLocalNav
        departmentId={departmentId}
        activeTab={activeTab}
        profileId={null}
        tabs={tabs}
      />
      <div className={`min-w-0 ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}
