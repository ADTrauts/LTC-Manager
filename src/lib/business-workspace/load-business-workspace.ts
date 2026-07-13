import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import { buildDepartmentHealth } from "./build-department-health";
import { buildPerformanceSnapshot } from "./build-performance-snapshot";
import { buildRecentActivity } from "./build-recent-activity";
import {
  buildWorkspacePriorities,
  workspaceIsHealthy,
} from "./build-workspace-priorities";
import { loadBusinessWorkspaceInputs } from "./load-workspace-inputs";
import type { BusinessWorkspaceData, BusinessWorkspaceView } from "./types";
import { greetingForLocalHour } from "./workspace-layout";
import { canAccessBusinessWorkspace, resolveWorkspaceSections } from "./workspace-permissions";

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

export type LoadBusinessWorkspaceInput = {
  facilityId: string;
  facilityName: string;
  userDisplayName: string;
  role: AppRole;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentName?: string | null;
};

/**
 * Compose Business Workspace from one coordinated facility input pipeline,
 * then pure section builders. Does not invoke OC + readiness loaders separately.
 */
export async function loadBusinessWorkspace(
  input: LoadBusinessWorkspaceInput,
): Promise<BusinessWorkspaceView | null> {
  if (!canAccessBusinessWorkspace(input.role)) {
    return null;
  }

  const inputs = await loadBusinessWorkspaceInputs({
    facilityId: input.facilityId,
    facilityName: input.facilityName,
    activeDepartmentKey: input.activeDepartmentKey,
    activeDepartmentName: input.activeDepartmentName,
  });

  const priorities = buildWorkspacePriorities(inputs);
  const healthy = workspaceIsHealthy(priorities);
  const oc = inputs.dashboard;
  const staffingGaps = oc.unitsMissingStaffing.length;
  const callDownOpen = inputs.callDownSummary.open;

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
    visibleSections: resolveWorkspaceSections(input.role),
    data,
  };
}
