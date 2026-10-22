import type { AppRole } from "@/lib/access";
import type { DashboardWorkspaceViewModel } from "./dashboard/types";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { AppIconKey } from "@/lib/design-system";
import type { StatusTone } from "@/lib/design-system/status-styles";

export type WorkspaceContext =
  | {
      mode: "department";
      departmentId: string;
      departmentKey: OperationalDepartmentKey;
      departmentName: string;
    }
  | {
      mode: "facility";
      departmentId: null;
      departmentKey: null;
      departmentName: null;
    };

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

export type WorkspaceQuickAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: AppIconKey;
};

export type WorkspaceCachedMorningBrief = {
  headline: string;
  origin: "cached";
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
};

export type WorkspacePreferenceState = {
  hiddenSectionIds: WorkspaceSectionId[];
  collapsedSectionIds: WorkspaceSectionId[];
  sectionOrder: WorkspaceSectionId[];
  preferredLandingSectionId: WorkspaceSectionId | null;
};

export type BusinessWorkspaceData = {
  header: BusinessWorkspaceHeader;
  quickActions: WorkspaceQuickAction[];
  cachedMorningBrief: WorkspaceCachedMorningBrief | null;
  todaysWorkLinks: WorkspaceLinkCard[];
  operationsLinks: WorkspaceLinkCard[];
  performance: WorkspaceMetric[];
  recentActivity: WorkspaceActivityItem[];
  dashboardRuntime: DashboardWorkspaceViewModel;
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
