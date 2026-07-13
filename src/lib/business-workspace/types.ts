import type { AppRole } from "@/lib/access";
import type { AppIconKey } from "@/lib/design-system";
import type { StatusBadgeVariant, StatusTone } from "@/lib/design-system/status-styles";
import type { OperationContext } from "@/lib/operations-center/types";

export type WorkspaceSectionId =
  | "priorities"
  | "department_health"
  | "todays_work"
  | "operations"
  | "performance"
  | "recent_activity";

export type WorkspaceHealthTone = "green" | "yellow" | "red" | "neutral";

export type WorkspacePriorityCard = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: StatusTone;
};

export type WorkspaceDepartmentHealth = {
  key: string;
  label: string;
  tone: WorkspaceHealthTone;
  badge: StatusBadgeVariant;
  summary: string;
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
};

export type WorkspaceActivityItem = {
  id: string;
  title: string;
  meta: string;
  href: string;
  kind: "inspection" | "issue" | "knowledge" | "repair";
};

export type BusinessWorkspaceHeader = {
  greeting: string;
  facilityName: string;
  departmentLabel: string;
  operation: OperationContext;
};

export type BusinessWorkspaceData = {
  header: BusinessWorkspaceHeader;
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
  data: BusinessWorkspaceData;
};
