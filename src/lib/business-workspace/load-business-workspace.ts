import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import { buildDepartmentHealth } from "./build-department-health";
import { buildManagementAgenda } from "./build-management-agenda";
import { buildManagerFocus } from "./build-manager-focus";
import { buildPerformanceSnapshot } from "./build-performance-snapshot";
import { buildQuickActions } from "./build-quick-actions";
import { buildRecentActivity } from "./build-recent-activity";
import {
  buildWorkspacePriorities,
  workspaceIsHealthy,
} from "./build-workspace-priorities";
import { loadBusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { BusinessWorkspaceData, BusinessWorkspaceView } from "./types";
import { greetingForLocalHour } from "./workspace-layout";
import { canAccessBusinessWorkspace } from "./workspace-permissions";
import {
  applyWorkspacePreferences,
  emptyWorkspacePreferenceState,
  loadWorkspacePreferenceState,
} from "./workspace-preferences";
import type { WorkspacePreferenceState } from "./types";

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

export type LoadBusinessWorkspaceInput = {
  facilityId: string;
  facilityName: string;
  userDisplayName: string;
  role: AppRole;
  /** User.id when authKind=user; required for preference persistence. */
  userId?: string | null;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentName?: string | null;
  /** Optional injected preferences (tests). */
  preferences?: WorkspacePreferenceState;
};

/**
 * Compose Business Workspace from one coordinated facility input pipeline,
 * then pure section builders. Preferences are facility-scoped per user.
 */
export async function loadBusinessWorkspace(
  input: LoadBusinessWorkspaceInput,
): Promise<BusinessWorkspaceView | null> {
  if (!canAccessBusinessWorkspace(input.role)) {
    return null;
  }

  const [inputs, preferences] = await Promise.all([
    loadBusinessWorkspaceInputs({
      facilityId: input.facilityId,
      facilityName: input.facilityName,
      activeDepartmentKey: input.activeDepartmentKey,
      activeDepartmentName: input.activeDepartmentName,
    }),
    input.preferences
      ? Promise.resolve(input.preferences)
      : input.userId
        ? loadWorkspacePreferenceState({
            userId: input.userId,
            facilityId: input.facilityId,
          })
        : Promise.resolve(emptyWorkspacePreferenceState()),
  ]);

  const priorities = buildWorkspacePriorities(inputs);
  const managerFocus = buildManagerFocus(inputs);
  const healthy = workspaceIsHealthy(priorities) && managerFocus.length === 0;
  const oc = inputs.dashboard;
  const staffingGaps = oc.unitsMissingStaffing.length;
  const callDownOpen = inputs.callDownSummary.open;
  const composed = applyWorkspacePreferences({
    role: input.role,
    preferences,
  });

  const data: BusinessWorkspaceData = {
    header: {
      greeting: greetingForLocalHour(
        inputs.operationalTime.facilityLocal.hour,
        firstName(input.userDisplayName),
      ),
      facilityName: input.facilityName,
      departmentLabel: input.activeDepartmentName?.trim() || "All departments",
      operation: oc.operationContext,
      healthy,
    },
    managerFocus,
    managementAgenda: buildManagementAgenda(inputs),
    quickActions: buildQuickActions({ supervisor: input.role === "SUPERVISOR" }),
    priorities,
    departmentHealth: buildDepartmentHealth(inputs),
    todaysWorkLinks: [
      {
        id: "walk",
        title: "Walk",
        description: `${oc.sitePulse.blocked} need attention · ${oc.sitePulse.ready} ready`,
        href: "/today/walk",
        icon: "locations",
      },
      {
        id: "coverage",
        title: "Coverage",
        description: `${staffingGaps} staffing gap${staffingGaps === 1 ? "" : "s"}`,
        href: "/today/coverage",
        icon: "todaysWork",
      },
      {
        id: "calldowns",
        title: "Call-downs",
        description: `${callDownOpen} open`,
        href: "/today/coverage",
        icon: "todaysWork",
      },
      {
        id: "handoffs",
        title: "Handoffs",
        description: "Exceptions and follow-ups for the next leader",
        href: "/today/handoffs",
        icon: "todaysWork",
      },
    ],
    operationsLinks: [
      {
        id: "oc",
        title: "Operations Center",
        description: "What is happening right now",
        href: "/dashboard",
        icon: "operationsCenter",
      },
      {
        id: "issues",
        title: "Issues",
        description: "Open repairs and issues",
        href: "/issues",
        icon: "repairs",
      },
      {
        id: "inspections",
        title: "Inspections",
        description: "Checklists and findings",
        href: "/admin/inspections",
        icon: "logs",
      },
      {
        id: "knowledge",
        title: "Knowledge",
        description: "SOPs and reference",
        href: "/admin/knowledge",
        icon: "administration",
      },
      {
        id: "assets",
        title: "Assets",
        description: "Equipment and plant assets",
        href: "/assets",
        icon: "assets",
      },
      {
        id: "logs",
        title: "Logs",
        description: "Compliance and temperature logs",
        href: "/logs",
        icon: "logs",
      },
    ],
    performance: buildPerformanceSnapshot(inputs),
    recentActivity: buildRecentActivity(inputs),
  };

  return {
    role: input.role,
    visibleSections: composed.visibleSections,
    customizableSections: composed.customizableSections,
    collapsedSections: composed.collapsedSections,
    preferredLandingSectionId: composed.preferredLandingSectionId,
    sectionOrder: composed.sectionOrder,
    canCustomize: composed.canCustomize,
    data,
  };
}
