import type { OperationalDepartmentKey } from "@/lib/department-nav";

export type SnapshotReadinessState = "ready" | "in_progress" | "needs_attention";

export type OperationalSnapshotActiveOperation = {
  label: string;
  phase: "Preparation" | "Execution";
  scheduledTime: string | null;
  source: "operations_center";
};

export type OperationalSnapshotPriorityLocation = {
  unitId: string;
  name: string;
  state: SnapshotReadinessState;
  primaryReason: string;
  signals: string[];
  sourcePath: string;
};

export type OperationalSnapshotHandoff = {
  type: string;
  location: string;
  summary: string;
  sourcePath: string;
};

export type OperationalSnapshot = {
  generatedAt: string;
  facilityLocalTime: string;
  timezone: string;
  serviceDate: string;
  activeDepartment: OperationalDepartmentKey | "ALL";
  activeOperation: OperationalSnapshotActiveOperation;
  readiness: {
    ready: number;
    inProgress: number;
    needsAttention: number;
  };
  priorityLocations: OperationalSnapshotPriorityLocation[];
  staffing: {
    gaps: number;
    thinCoverage: number;
    openCallDowns: number;
  };
  issues: {
    urgent: number;
    high: number;
    inProgress: number;
    supplyShorts: number;
  };
  inspections: {
    overdue: number;
    dueNow: number;
    openFindings: number;
  };
  handoffs: OperationalSnapshotHandoff[];
  /** Allowlisted source paths the model may cite. */
  allowedSourcePaths: string[];
};

export type BuildOperationalSnapshotInput = {
  facilityId: string;
  departmentContext?: OperationalDepartmentKey | null;
  now?: Date;
};
