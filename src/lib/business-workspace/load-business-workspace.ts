import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import { buildDepartmentHealth } from "./build-department-health";
import { buildManagementAgenda } from "./build-management-agenda";
import {
  buildManagerFocus,
  buildManagerFocusHealthyGuidance,
} from "./build-manager-focus";
import { buildPerformanceSnapshot } from "./build-performance-snapshot";
import { buildQuickActions } from "./build-quick-actions";
import { buildRecentActivity } from "./build-recent-activity";
import {
  buildWorkspacePriorities,
  workspaceIsHealthy,
} from "./build-workspace-priorities";
import { loadCachedMorningBriefPreview } from "./load-cached-morning-brief";
import { loadBusinessWorkspaceInputs } from "./load-workspace-inputs";
import type {
  BusinessWorkspaceData,
  BusinessWorkspaceView,
  WorkspaceCachedMorningBrief,
  WorkspaceContext,
  WorkspaceLinkCard,
  WorkspacePreferenceState,
} from "./types";
import {
  isLinkAllowedForContext,
  resolveCompositionConfig,
  scopeInputsForContext,
} from "./workspace-composition";
import { greetingForLocalHour } from "./workspace-layout";
import { canAccessBusinessWorkspace } from "./workspace-permissions";
import {
  applyWorkspacePreferences,
  emptyWorkspacePreferenceState,
  loadWorkspacePreferenceState,
} from "./workspace-preferences";

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

export type LoadBusinessWorkspaceInput = {
  facilityId: string;
  facilityName: string;
  userDisplayName: string;
  role: AppRole;
  userId?: string | null;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentId?: string | null;
  activeDepartmentName?: string | null;
  preferences?: WorkspacePreferenceState;
  cachedMorningBrief?: WorkspaceCachedMorningBrief | null;
  /** Injected context for tests. Normally resolved from department inputs. */
  workspaceContext?: WorkspaceContext;
};

export function resolveWorkspaceContext(input: {
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentId?: string | null;
  activeDepartmentName?: string | null;
}): WorkspaceContext {
  if (input.activeDepartmentKey && input.activeDepartmentId && input.activeDepartmentName) {
    return {
      mode: "department",
      departmentId: input.activeDepartmentId,
      departmentKey: input.activeDepartmentKey,
      departmentName: input.activeDepartmentName,
    };
  }
  return { mode: "facility", departmentId: null, departmentKey: null, departmentName: null };
}

/**
 * Compose Business Workspace from one coordinated facility input pipeline,
 * then pure section builders. Department context scopes signals before
 * builders run — builders see only their department's data.
 */
export async function loadBusinessWorkspace(
  input: LoadBusinessWorkspaceInput,
): Promise<BusinessWorkspaceView | null> {
  if (!canAccessBusinessWorkspace(input.role)) {
    return null;
  }

  const context = input.workspaceContext ?? resolveWorkspaceContext(input);
  const config = resolveCompositionConfig(context);

  const [facilityInputs, preferences] = await Promise.all([
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

  const inputs = scopeInputsForContext(facilityInputs, context);

  const priorities = buildWorkspacePriorities(inputs);
  const managerFocus = buildManagerFocus(inputs, context);
  const healthy = workspaceIsHealthy(priorities) && managerFocus.length === 0;
  const managerFocusHealthy =
    managerFocus.length === 0 ? buildManagerFocusHealthyGuidance(inputs, context) : null;
  const oc = inputs.dashboard;
  const staffingGaps = oc.unitsMissingStaffing.length;
  const callDownOpen = inputs.callDownSummary.open;
  const composed = applyWorkspacePreferences({
    role: input.role,
    preferences,
  });

  const cachedMorningBrief =
    input.cachedMorningBrief !== undefined
      ? input.cachedMorningBrief
      : context.mode === "facility"
        ? null
        : await loadCachedMorningBriefPreview({
            facilityId: input.facilityId,
            facilityLocalDate: facilityInputs.operationalTime.facilityLocalDate,
            activeDepartmentKey: input.activeDepartmentKey,
          });

  const allTodaysWorkLinks: WorkspaceLinkCard[] = [
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
  ];

  const allOperationsLinks: WorkspaceLinkCard[] = [
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
      id: "employees",
      title: "Employees",
      description: "Roster and HR surfaces",
      href: "/employees",
      icon: "employees",
    },
    {
      id: "logs",
      title: "Logs",
      description: "Compliance and temperature logs",
      href: "/logs",
      icon: "logs",
    },
  ];

  const todaysWorkLinkIds = new Set(config.todaysWorkLinkIds);
  const opsLinkIds = new Set(config.operationsLinkIds);

  const data: BusinessWorkspaceData = {
    header: {
      greeting: greetingForLocalHour(
        facilityInputs.operationalTime.facilityLocal.hour,
        firstName(input.userDisplayName),
      ),
      facilityName: input.facilityName,
      departmentLabel:
        context.mode === "department"
          ? context.departmentName
          : "Facility Overview",
      operation: oc.operationContext,
      healthy,
    },
    managerFocus,
    managerFocusHealthy,
    managementAgenda: buildManagementAgenda(inputs, context),
    quickActions: buildQuickActions({
      supervisor: input.role === "SUPERVISOR",
      promotedHrefs: managerFocus.map((card) => card.href),
      context,
      config,
    }),
    cachedMorningBrief,
    priorities,
    departmentHealth: buildDepartmentHealth(facilityInputs, context),
    todaysWorkLinks: allTodaysWorkLinks
      .filter((link) => todaysWorkLinkIds.has(link.id))
      .filter((link) => isLinkAllowedForContext(link.href, context)),
    operationsLinks: allOperationsLinks
      .filter((link) => opsLinkIds.has(link.id))
      .filter((link) => isLinkAllowedForContext(link.href, context)),
    performance: buildPerformanceSnapshot(inputs, config),
    recentActivity: buildRecentActivity(inputs, context),
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
