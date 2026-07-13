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
