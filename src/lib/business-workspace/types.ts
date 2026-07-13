import type { AppRole } from "@/lib/access";
import type { AppIconKey } from "@/lib/design-system";
import type { StatusBadgeVariant, StatusTone } from "@/lib/design-system/status-styles";
import type { OperationContext } from "@/lib/operations-center/types";

export type WorkspaceSectionId =
  | "manager_focus"
  | "management_agenda"
  | "quick_actions"
  | "priorities"
  | "department_health"
  | "todays_work"
  | "operations"
  | "performance"
  | "recent_activity";

export type WorkspaceHealthTone = "green" | "yellow" | "red" | "neutral";

export type WorkspacePriorityRank = 1 | 2 | 3 | 4 | 5 | 6;

export type WorkspacePriorityCard = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: StatusTone;
  rank: WorkspacePriorityRank;
  /** Watch / healthy-state items — shown after primaries, never as urgent. */
  isWatch?: boolean;
  departmentLabel?: string;
  locationLabel?: string;
};

export type ManagerFocusCard = {
  id: string;
  title: string;
  explanation: string;
  whyItMatters: string;
  actionLabel: string;
  href: string;
  tone: StatusTone;
  locationLabel?: string;
  rank: number;
};

export type ManagementAgendaBucketId = "morning" | "midday" | "afternoon" | "evening";

export type ManagementAgendaItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone?: StatusTone;
};

export type ManagementAgendaBucket = {
  id: ManagementAgendaBucketId;
  label: string;
  isCurrent: boolean;
  items: ManagementAgendaItem[];
};

export type WorkspaceQuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: AppIconKey;
};

export type WorkspaceDepartmentHealth = {
  key: string;
  label: string;
  tone: WorkspaceHealthTone;
  badge: StatusBadgeVariant;
  summary: string;
  reason: string;
  locationCounts: { ready: number; inProgress: number; blocked: number; total: number };
  openPriorityWorkCount: number;
  href: string;
};

export type WorkspaceLinkCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: AppIconKey;
};

export type WorkspaceMetric = {
  id: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: StatusTone;
  href?: string;
};

export type WorkspaceActivityItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  kind: "inspection" | "issue" | "knowledge" | "repair" | "asset";
};

export type BusinessWorkspaceHeader = {
  greeting: string;
  facilityName: string;
  departmentLabel: string;
  operation: OperationContext;
  healthy: boolean;
};

export type WorkspacePreferenceState = {
  hiddenSectionIds: WorkspaceSectionId[];
  collapsedSectionIds: WorkspaceSectionId[];
  sectionOrder: WorkspaceSectionId[];
  preferredLandingSectionId: WorkspaceSectionId | null;
};

export type BusinessWorkspaceData = {
  header: BusinessWorkspaceHeader;
  managerFocus: ManagerFocusCard[];
  managementAgenda: ManagementAgendaBucket[];
  quickActions: WorkspaceQuickAction[];
  priorities: WorkspacePriorityCard[];
  departmentHealth: WorkspaceDepartmentHealth[];
  todaysWorkLinks: WorkspaceLinkCard[];
  operationsLinks: WorkspaceLinkCard[];
  performance: WorkspaceMetric[];
  recentActivity: WorkspaceActivityItem[];
};

export type BusinessWorkspaceView = {
  role: AppRole;
  visibleSections: WorkspaceSectionId[];
  /** Sections the role may customize (show/hide). */
  customizableSections: WorkspaceSectionId[];
  collapsedSections: WorkspaceSectionId[];
  preferredLandingSectionId: WorkspaceSectionId | null;
  sectionOrder: WorkspaceSectionId[];
  canCustomize: boolean;
  data: BusinessWorkspaceData;
};
