import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";

import type { WorkspaceSectionId } from "./types";

/** Staff and Lead Team Members never land in Business Workspace. */
export function canAccessBusinessWorkspace(role: AppRole): boolean {
  return hasAtLeastRole(role, "SUPERVISOR");
}

/**
 * Section visibility by role.
 * Supervisor: limited briefing. Manager+: full workspace.
 */
export function resolveWorkspaceSections(role: AppRole): WorkspaceSectionId[] {
  if (!canAccessBusinessWorkspace(role)) {
    return [];
  }

  if (role === "SUPERVISOR") {
    return ["priorities", "todays_work", "operations"];
  }

  // MANAGER, GM, FACILITY_ADMINISTRATOR
  return [
    "priorities",
    "department_health",
    "todays_work",
    "operations",
    "performance",
    "recent_activity",
  ];
}

export function workspaceSectionVisible(
  role: AppRole,
  sectionId: WorkspaceSectionId,
): boolean {
  return resolveWorkspaceSections(role).includes(sectionId);
}
