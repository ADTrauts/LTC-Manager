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

export { buildQuickActions } from "./build-quick-actions";
export { buildRecentActivity } from "./build-recent-activity";
export {
  resolveCompositionConfig,
  isLinkAllowedForContext,
  type WorkspaceCompositionConfig,
} from "./workspace-composition";

/**
 * Client-safe barrel. workspace-customize (`"use client"`) may import layout
 * helpers from here. Do not re-export Prisma / session loaders:
 * - `./load-business-workspace` (`loadBusinessWorkspace`, `resolveWorkspaceContext`)
 * - `./load-cached-morning-brief` (`loadCachedMorningBriefPreview`)
 * - `./projection/load` (session Projection + `next/headers`)
 *
 * Those pull `@/lib/auth` → `next/headers` (and Harbor work-session) into the
 * client graph and poison every route, including `/login`.
 */
export {
  adaptProjectionToBusinessWorkspace,
  contributionKindsFromContracts,
  emptyBusinessWorkspaceScope,
  resolveAllowedQuickActionIds,
  resolveProjectedCompositionConfig,
  type BwContributionKind,
  type BwDepartmentSection,
  type BwManagerSignalContributor,
  type ProjectedBusinessWorkspaceScope,
} from "./projection";
