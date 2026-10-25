import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";

import type { WorkspaceContext, WorkspaceSectionId } from "./types";

export type WorkspaceCompositionConfig = {
  contextLabel: string;
  contextDescription: string;
  visibleSectionIds: WorkspaceSectionId[];
  operationsLinkIds: string[];
  todaysWorkLinkIds: string[];
  quickActionIds: string[];
  showLogCompletion: boolean;
  showMealContext: boolean;
};

const ALL_SECTIONS: WorkspaceSectionId[] = [
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

const SHARED_OPS_LINKS = ["oc", "issues", "inspections", "knowledge", "employees"];
const SHARED_TODAYS_WORK = ["walk", "coverage", "calldowns", "handoffs"];

const SHARED_QUICK_ACTIONS = ["report-issue", "new-inspection", "operations-center", "todays-work", "knowledge"];

const COMPOSITIONS: Record<string, WorkspaceCompositionConfig> = {
  DIETARY: {
    contextLabel: "Dietary",
    contextDescription: "Dietary service, staffing, and compliance priorities.",
    visibleSectionIds: ALL_SECTIONS,
    // Phase 10A/11A: /assets is an authorized Dietary route (Asset Operations).
    operationsLinkIds: [...SHARED_OPS_LINKS, "logs", "assets"],
    todaysWorkLinkIds: SHARED_TODAYS_WORK,
    quickActionIds: [...SHARED_QUICK_ACTIONS, "logs", "assets"],
    showLogCompletion: true,
    showMealContext: true,
  },
  EVS: {
    contextLabel: "Environmental Services",
    contextDescription: "Environmental Services coverage, assignments, and cleaning priorities.",
    visibleSectionIds: ALL_SECTIONS,
    // Phase 11B: thin Asset / Issue reporting via shared Asset system (not Plant WO management).
    operationsLinkIds: [...SHARED_OPS_LINKS, "assets"],
    todaysWorkLinkIds: SHARED_TODAYS_WORK,
    quickActionIds: [...SHARED_QUICK_ACTIONS, "assets"],
    showLogCompletion: false,
    showMealContext: false,
  },
  PLANT: {
    contextLabel: "Plant Operations",
    contextDescription: "Plant Operations assets, preventive maintenance, and work-order priorities.",
    visibleSectionIds: ALL_SECTIONS,
    operationsLinkIds: [...SHARED_OPS_LINKS, "assets"],
    todaysWorkLinkIds: SHARED_TODAYS_WORK,
    quickActionIds: [...SHARED_QUICK_ACTIONS, "assets"],
    showLogCompletion: false,
    showMealContext: false,
  },
  FACILITY: {
    contextLabel: "Facility Overview",
    contextDescription: "Your facility's highest-priority operational work.",
    visibleSectionIds: ALL_SECTIONS,
    operationsLinkIds: [...SHARED_OPS_LINKS, "assets", "logs"],
    todaysWorkLinkIds: SHARED_TODAYS_WORK,
    quickActionIds: [...SHARED_QUICK_ACTIONS, "assets", "logs"],
    showLogCompletion: false,
    showMealContext: false,
  },
};

export function resolveCompositionConfig(ctx: WorkspaceContext): WorkspaceCompositionConfig {
  const key = ctx.mode === "department" ? ctx.departmentKey : "FACILITY";
  return COMPOSITIONS[key] ?? COMPOSITIONS["FACILITY"]!;
}

/**
 * Filter quick action and operations link hrefs by department nav rules.
 * Shared routes pass through; department-restricted routes are excluded
 * unless the department has access.
 */
export function isLinkAllowedForContext(
  href: string,
  ctx: WorkspaceContext,
): boolean {
  if (ctx.mode === "facility") return true;
  return pathnameAllowedForDepartmentKey(href, ctx.departmentKey);
}
