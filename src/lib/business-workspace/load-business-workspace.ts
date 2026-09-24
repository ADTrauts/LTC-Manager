import type { AppRole } from "@/lib/access";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { PROCEDURES_RESOURCES_VISIBLE } from "@/lib/knowledge/surface";

import type { DashboardWorkspaceViewModel } from "./dashboard/types";
import { buildQuickActions } from "./build-quick-actions";
import { buildRecentActivity } from "./build-recent-activity";
import { loadCachedMorningBriefPreview } from "./load-cached-morning-brief";
import { loadWorkspaceNonOperationalExtras } from "./load-workspace-extras";
import type { ProjectedBusinessWorkspaceScope } from "./projection";
import type {
  BusinessWorkspaceData,
  BusinessWorkspaceView,
  WorkspaceCachedMorningBrief,
  WorkspaceContext,
  WorkspaceLinkCard,
  WorkspaceMetric,
  WorkspacePreferenceState,
  WorkspaceSectionId,
} from "./types";
import {
  isLinkAllowedForContext,
  resolveCompositionConfig,
  type WorkspaceCompositionConfig,
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
  /**
   * Wave 15K — when set with skipLegacyScope, Projection owns eligibility.
   */
  projectedScope?: ProjectedBusinessWorkspaceScope | null;
  projectedCompositionConfig?: WorkspaceCompositionConfig | null;
  skipLegacyScope?: boolean;
  /**
   * Required. Operational truth comes from RLS Dashboard Runtime.
   */
  dashboardRuntime?: DashboardWorkspaceViewModel;
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

function runtimeMetrics(runtime: DashboardWorkspaceViewModel): WorkspaceMetric[] {
  const metrics: WorkspaceMetric[] = [
    {
      id: "operating",
      label: "Locations operating",
      value: runtime.operatingCount,
      hint: `${runtime.spaceCount} operational ${runtime.spaceCount === 1 ? "space" : "spaces"}`,
      href: "/units",
    },
    {
      id: "attention",
      label: "Need attention",
      value: runtime.attentionCount,
      hint:
        runtime.attentionCount === 0
          ? "No locations currently need attention"
          : `${runtime.attentionCount} ${runtime.attentionCount === 1 ? "location has" : "locations have"} canonical exceptions`,
      href: "/today",
    },
  ];
  if (runtime.overdueEvidenceCount > 0) {
    metrics.push({
      id: "overdue-evidence",
      label: "Overdue evidence",
      value: runtime.overdueEvidenceCount,
      href: "/staffing/log-book",
    });
  }
  metrics.push({
    id: "coverage",
    label: "Coverage",
    value: runtime.coverage.unavailable
      ? "Unavailable"
      : runtime.coverage.uncoveredSlotCount + runtime.coverage.atRiskSlotCount,
    hint: runtime.coverage.summary,
    href: "/units",
  });
  if (runtime.assetImpactCount > 0) {
    metrics.push({
      id: "assets",
      label: "Operational asset issues",
      value: runtime.assetImpactCount,
      href: "/assets",
    });
  }
  return metrics;
}

function runtimeTodaysWorkLinks(runtime: DashboardWorkspaceViewModel): WorkspaceLinkCard[] {
  return [
    {
      id: "walk",
      title: "Today's Work",
      description:
        runtime.attentionCount === 0
          ? "No locations currently need attention"
          : `${runtime.attentionCount} ${runtime.attentionCount === 1 ? "location needs" : "locations need"} attention`,
      href: "/today",
      icon: "todaysWork",
    },
    {
      id: "locations",
      title: "View locations",
      description: `${runtime.spaceCount} operational ${runtime.spaceCount === 1 ? "space" : "spaces"}`,
      href: "/units",
      icon: "locations",
    },
    {
      id: "handoffs",
      title: "Handoffs",
      description: "Exceptions and follow-ups for the next leader",
      href: "/today/handoffs",
      icon: "todaysWork",
    },
  ];
}

function runtimeOperationsLinks(): WorkspaceLinkCard[] {
  return [
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
    ...(PROCEDURES_RESOURCES_VISIBLE
      ? [
          {
            id: "knowledge",
            title: "Knowledge",
            description: "SOPs and reference",
            href: "/admin/knowledge",
            icon: "administration",
          } satisfies WorkspaceLinkCard,
        ]
      : []),
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
}

/**
 * Compose Business Workspace from canonical Dashboard Runtime plus
 * non-operational extras. Callers must supply `dashboardRuntime`.
 */
export async function loadBusinessWorkspace(
  input: LoadBusinessWorkspaceInput,
): Promise<BusinessWorkspaceView | null> {
  if (!canAccessBusinessWorkspace(input.role)) {
    return null;
  }

  if (!input.dashboardRuntime) {
    throw new Error("Business Workspace requires canonical dashboardRuntime.");
  }

  const context = input.workspaceContext ?? resolveWorkspaceContext(input);
  const runtime = input.dashboardRuntime;
  const useProjection =
    Boolean(input.skipLegacyScope && input.projectedScope) &&
    input.projectedCompositionConfig != null;
  const config = useProjection
    ? input.projectedCompositionConfig!
    : resolveCompositionConfig(context);

  const [extras, preferences] = await Promise.all([
    loadWorkspaceNonOperationalExtras({ facilityId: input.facilityId }),
    input.preferences
      ? Promise.resolve(input.preferences)
      : input.userId
        ? loadWorkspacePreferenceState({
            userId: input.userId,
            facilityId: input.facilityId,
          })
        : Promise.resolve(emptyWorkspacePreferenceState()),
  ]);

  const briefDepartmentKey = useProjection
    ? input.projectedScope!.lensMode === "FACILITY"
      ? null
      : input.projectedScope!.departmentKey
    : input.activeDepartmentKey;

  const cachedMorningBrief =
    input.cachedMorningBrief !== undefined
      ? input.cachedMorningBrief
      : context.mode === "facility" ||
          (useProjection && input.projectedScope!.lensMode === "FACILITY") ||
          briefDepartmentKey == null
        ? null
        : await loadCachedMorningBriefPreview({
            facilityId: input.facilityId,
            facilityLocalDate: extras.operationalTime.facilityLocalDate,
            activeDepartmentKey: briefDepartmentKey,
          });

  const composed = applyWorkspacePreferences({
    role: input.role,
    preferences,
  });
  const hiddenWhenRuntime = new Set<WorkspaceSectionId>(["department_health", "priorities"]);
  const visibleSections = composed.visibleSections.filter((id) => !hiddenWhenRuntime.has(id));
  const todaysWorkLinkIds = new Set(config.todaysWorkLinkIds);
  const opsLinkIds = new Set(config.operationsLinkIds);

  const data: BusinessWorkspaceData = {
    header: {
      greeting: greetingForLocalHour(
        extras.operationalTime.facilityLocal.hour,
        firstName(input.userDisplayName),
      ),
      facilityName: input.facilityName,
      departmentLabel:
        context.mode === "department" ? context.departmentName : "Facility Overview",
      operation: {
        mealType: "BREAKFAST",
        mealLabel: runtime.operation.label,
        serviceLabel: runtime.operation.label,
        phase: "Preparation",
        scheduledTimeLabel: runtime.next?.timeLabel ?? null,
        minutesUntilService: null,
      },
      healthy: runtime.attentionCount === 0,
      keyTimeSummaries: [],
      runPresentation: null,
    },
    managerFocus: [],
    managerFocusHealthy: null,
    managementAgenda: [],
    quickActions: buildQuickActions({
      supervisor: input.role === "SUPERVISOR",
      promotedHrefs: ["/today", "/units"],
      context,
      config,
    }).filter((action) => action.href !== "/dashboard"),
    cachedMorningBrief,
    priorities: [],
    departmentHealth: [],
    todaysWorkLinks: runtimeTodaysWorkLinks(runtime).filter(
      (link) => todaysWorkLinkIds.has(link.id) || link.id === "locations" || link.id === "walk",
    ),
    operationsLinks: runtimeOperationsLinks()
      .filter((link) => opsLinkIds.has(link.id))
      .filter((link) => isLinkAllowedForContext(link.href, context)),
    performance: runtimeMetrics(runtime),
    recentActivity: buildRecentActivity(
      {
        activity: extras.activity,
        facilityTimezone: extras.facilityTimezone,
      },
      context,
    ),
    dashboardRuntime: runtime,
  };

  return {
    role: input.role,
    visibleSections,
    customizableSections: composed.customizableSections.filter((id) => !hiddenWhenRuntime.has(id)),
    collapsedSections: composed.collapsedSections,
    preferredLandingSectionId:
      composed.preferredLandingSectionId && hiddenWhenRuntime.has(composed.preferredLandingSectionId)
        ? "manager_focus"
        : composed.preferredLandingSectionId,
    sectionOrder: composed.sectionOrder.filter((id) => !hiddenWhenRuntime.has(id)),
    canCustomize: composed.canCustomize,
    data,
  };
}
