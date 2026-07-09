import type { UnitType } from "@prisma/client";

import type { OperationContext } from "@/lib/operations-center";

export type ReadinessState = "ready" | "in_progress" | "blocked";

export type ReadinessReasonCode =
  | "failed_logs"
  | "missed_logs"
  | "pending_logs"
  | "urgent_repair"
  | "high_repair"
  | "open_repair"
  | "no_staffing"
  | "servery_not_live"
  | "logs_behind";

export type UnitReadinessSignals = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  failed: number;
  missed: number;
  pending: number;
  expected: number;
  completed: number;
  staffingCount: number;
  openRepairCount: number;
  urgentRepairCount: number;
  highRepairCount: number;
  serveryMealNotLive: boolean;
  operationPhase: OperationContext["phase"];
};

export type UnitReadiness = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  state: ReadinessState;
  reason: string;
  reasonCodes: ReadinessReasonCode[];
};

export type ReadinessSummary = {
  total: number;
  ready: number;
  inProgress: number;
  blocked: number;
};

export type ReadinessBatchResult = {
  items: UnitReadiness[];
  byUnitId: Map<string, UnitReadiness>;
  summary: ReadinessSummary;
  operationContext: OperationContext;
};
