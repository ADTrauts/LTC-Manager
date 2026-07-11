import type { RoomAreaOperationalStatus, UnitType } from "@prisma/client";

import type { OperationContext, OperationsCenterUnitCard } from "@/lib/operations-center";
import type { OperationalTimeContext } from "@/lib/operational-time";

import type { ReadinessProfileKey } from "./profiles/types";

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
  | "logs_behind"
  | "evs_isolation"
  | "evs_terminal_clean"
  | "evs_discharge"
  | "evs_dirty"
  | "evs_room_complete";

export type UnitReadinessSignals = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  /** Log counts must already be scoped to the active meal/operation. */
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
  /** Department profile used for evaluation. */
  profileKey: ReadinessProfileKey;
  mealLabel: string;
  /** Best-effort repair titles for operator-friendly reasons. */
  primaryUrgentRepairTitle: string | null;
  primaryHighRepairTitle: string | null;
  /** Significant repairs (HIGH/URGENT) with an assignee or IN_PROGRESS status. */
  assignedSignificantRepairCount: number;
  /** HIGH/URGENT with no assignee. */
  unassignedUrgentOrHighCount: number;
  /** HIGH/URGENT with dueAt in the past. */
  overdueCriticalRepairCount: number;
  /** MEDIUM/LOW open repairs. */
  normalPriorityOpenRepairCount: number;
  /** MEDIUM/LOW open repairs that are assigned or IN_PROGRESS. */
  assignedNormalRepairCount: number;
  /** PREVENTIVE work orders currently IN_PROGRESS. */
  preventiveMaintenanceInProgressCount: number;
  /** EVS areas that expect scheduled coverage (has schedule rows or coverage flag). */
  requiresEvsCoverage: boolean;
  /** Facility-local service-date RoomAreaStatus (null when unset). */
  evsRoomStatus: RoomAreaOperationalStatus | null;
  evsRoomStatusUpdatedAt: Date | null;
  evsCriticalRoomCondition: boolean;
  evsDischargePending: boolean;
  evsActiveCleaning: boolean;
  evsRoomServiceComplete: boolean;
  evsRoomStatusPresent: boolean;
};

export type UnitReadiness = {
  unitId: string;
  unitName: string;
  unitType: UnitType;
  state: ReadinessState;
  reason: string;
  reasonCodes: ReadinessReasonCode[];
  profileKey: ReadinessProfileKey;
  evaluatedAt: Date;
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
  unitCards: OperationsCenterUnitCard[];
  operationalTime: OperationalTimeContext;
};
