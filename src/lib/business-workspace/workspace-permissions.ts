import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";

import type { WorkspaceSectionId } from "./types";

/** Staff and Lead Team Members never land in Business Workspace. */
export function canAccessBusinessWorkspace(role: AppRole): boolean {
  return hasAtLeastRole(role, "SUPERVISOR");
}

/** Core sections that cannot be hidden when the role can see them. */
export const WORKSPACE_REQUIRED_SECTIONS: readonly WorkspaceSectionId[] = [
  "manager_focus",
  "management_agenda",
  "quick_actions",
] as const;

/** Optional sections Manager+ may hide. */
export const WORKSPACE_OPTIONAL_SECTIONS: readonly WorkspaceSectionId[] = [
  "priorities",
  "department_health",
  "todays_work",
  "operations",
  "performance",
  "recent_activity",
] as const;

/**
 * Role baseline (before preference filtering).
 * Supervisor: focus + agenda + quick actions + Today's Work.
 * Manager+: full workspace (priorities optional-default-on so watch list remains available).
 */
export function resolveWorkspaceSections(role: AppRole): WorkspaceSectionId[] {
  if (!canAccessBusinessWorkspace(role)) {
    return [];
  }

  if (role === "SUPERVISOR") {
    return ["manager_focus", "management_agenda", "quick_actions", "todays_work"];
  }

  // MANAGER, GM, FACILITY_ADMINISTRATOR
  return [
    "manager_focus",
    "management_agenda",
    "quick_actions",
    "priorities",
    "department_health",
    "todays_work",
    "operations",
    "performance",
    "recent_activity",
  ];
}

export function resolveCustomizableSections(role: AppRole): WorkspaceSectionId[] {
  if (!hasAtLeastRole(role, "MANAGER")) {
    return [];
  }
  const allowed = new Set(resolveWorkspaceSections(role));
  return WORKSPACE_OPTIONAL_SECTIONS.filter((id) => allowed.has(id));
}

export function canCustomizeWorkspace(role: AppRole): boolean {
  return resolveCustomizableSections(role).length > 0;
}

export function workspaceSectionVisible(
  role: AppRole,
  sectionId: WorkspaceSectionId,
): boolean {
  return resolveWorkspaceSections(role).includes(sectionId);
}
