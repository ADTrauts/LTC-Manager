export type {
  BusinessWorkspaceData,
  BusinessWorkspaceHeader,
  BusinessWorkspaceView,
  ManagementAgendaBucket,
  ManagementAgendaBucketId,
  ManagementAgendaItem,
  ManagementAgendaTemporal,
  ManagerFocusCard,
  ManagerFocusHealthyGuidance,
  WorkspaceActivityItem,
  WorkspaceCachedMorningBrief,
  WorkspaceContext,
  WorkspaceDepartmentHealth,
  WorkspaceHealthTone,
  WorkspaceLinkCard,
  WorkspaceMetric,
  WorkspacePreferenceState,
  WorkspacePriorityCard,
  WorkspaceQuickAction,
  WorkspaceSectionId,
} from "./types";

export {
  canAccessBusinessWorkspace,
  canCustomizeWorkspace,
  resolveCustomizableSections,
  resolveWorkspaceSections,
  workspaceSectionVisible,
  WORKSPACE_OPTIONAL_SECTIONS,
  WORKSPACE_REQUIRED_SECTIONS,
} from "./workspace-permissions";

export {
  WORKSPACE_SECTION_DEFS,
  greetingForLocalHour,
  healthBadgeForTone,
  healthToneFromReadiness,
  orderedWorkspaceSections,
} from "./workspace-layout";

export {
  applyWorkspacePreferences,
  emptyWorkspacePreferenceState,
  isWorkspaceSectionId,
  loadWorkspacePreferenceState,
  parseWorkspacePreferenceRow,
  upsertWorkspacePreferenceState,
} from "./workspace-preferences";

export { loadBusinessWorkspace, resolveWorkspaceContext, type LoadBusinessWorkspaceInput } from "./load-business-workspace";
export { loadBusinessWorkspaceInputs } from "./load-workspace-inputs";
export { loadCachedMorningBriefPreview } from "./load-cached-morning-brief";
export { buildWorkspacePriorities, workspaceIsHealthy } from "./build-workspace-priorities";
export {
  buildManagerFocus,
  buildManagerFocusHealthyGuidance,
  inspectionFocusHref,
} from "./build-manager-focus";
export {
  AGENDA_BUCKET_ORDER,
  buildManagementAgenda,
  classifyAgendaTemporal,
  currentAgendaBucketId,
  resolveAgendaBucketId,
} from "./build-management-agenda";
export { buildQuickActions } from "./build-quick-actions";
export { buildDepartmentHealth } from "./build-department-health";
export { buildPerformanceSnapshot } from "./build-performance-snapshot";
export { buildRecentActivity } from "./build-recent-activity";
export {
  resolveCompositionConfig,
  scopeInputsForContext,
  isLinkAllowedForContext,
  type WorkspaceCompositionConfig,
} from "./workspace-composition";

/**
 * Pure Projection adapters only — never re-export `./projection/load` here.
 * That module uses session Projection (`next/headers`) and must stay off the
 * client graph (workspace-customize imports this barrel).
 */
export {
  adaptProjectionToBusinessWorkspace,
  contributionKindsFromContracts,
  emptyBusinessWorkspaceScope,
  intersectInputsToProjectedScope,
  resolveAllowedQuickActionIds,
  resolveProjectedCompositionConfig,
  type BwContributionKind,
  type BwDepartmentSection,
  type BwManagerSignalContributor,
  type ProjectedBusinessWorkspaceScope,
} from "./projection";
