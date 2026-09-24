"use client";

import { SubNav } from "@/components/design-system";
import { hasAtLeastRole, type AppRole } from "@/lib/access";
import {
  maintenanceSubNavItems,
  type MaintenanceSubNavId,
} from "@/lib/asset-operations/maintenance-nav";

type MaintenanceSubNavProps = {
  role: AppRole;
  activeId: MaintenanceSubNavId;
};

export function MaintenanceSubNav({ role, activeId }: MaintenanceSubNavProps) {
  const items = maintenanceSubNavItems(hasAtLeastRole(role, "SUPERVISOR"));
  if (items.length < 2) return null;

  return (
    <SubNav
      items={items}
      activeId={activeId}
      aria-label="Maintenance"
      data-testid="maintenance-sub-nav"
    />
  );
}
