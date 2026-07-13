export type {
  BusinessWorkspaceData,
  BusinessWorkspaceHeader,
  BusinessWorkspaceView,
  WorkspaceActivityItem,
  WorkspaceDepartmentHealth,
  WorkspaceHealthTone,
  WorkspaceLinkCard,
  WorkspaceMetric,
  WorkspacePriorityCard,
  WorkspaceSectionId,
} from "./types";

export {
  canAccessBusinessWorkspace,
  resolveWorkspaceSections,
  workspaceSectionVisible,
} from "./workspace-permissions";

export {
  WORKSPACE_SECTION_DEFS,
  greetingForLocalHour,
  healthBadgeForTone,
  healthToneFromReadiness,
  orderedWorkspaceSections,
} from "./workspace-layout";

export { loadBusinessWorkspace, type LoadBusinessWorkspaceInput } from "./load-business-workspace";
export { loadBusinessWorkspaceInputs } from "./load-workspace-inputs";
export { buildWorkspacePriorities, workspaceIsHealthy } from "./build-workspace-priorities";
export { buildDepartmentHealth } from "./build-department-health";
export { buildPerformanceSnapshot } from "./build-performance-snapshot";
export { buildRecentActivity } from "./build-recent-activity";
