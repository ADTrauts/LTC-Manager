/**
 * Supervisor operating-location projection for Today's Work.
 *
 * Room = where operational truth is recorded.
 * Neighborhood / standalone Room = how the supervisor manages the operation.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { RunLocationKeyTimeView } from "@/lib/operational-cycles/present-run-operation";

export type OperatingLocationKind = "NEIGHBORHOOD" | "STANDALONE_ROOM" | "LEGACY_UNIT";

export type OperatingLocationStatusKey = "needs_attention" | "in_progress" | "on_track";

export type UnderlyingOperatingRoom = {
  spaceId: string;
  unitId: string;
  name: string;
  href: string;
  roomTypeLabel: string | null;
};

export type SupervisorOperatingLocation = {
  id: string;
  kind: OperatingLocationKind;
  displayName: string;
  unitId: string;
  departmentKey: OperationalDepartmentKey | null;
  departmentLabel: string | null;
  floorLabel: string | null;
  facilityOrder: number;
  rooms: readonly UnderlyingOperatingRoom[];
};

export type OperatingLocationStaffingKind =
  | "unknown"
  | "assigned_only"
  | "covered"
  | "short"
  | "uncovered";

export type OperatingLocationStaffing = {
  kind: OperatingLocationStaffingKind;
  label: string;
  assignedCount: number | null;
  expectedCount: number | null;
};

export type OperatingLocationCurrentOperation = {
  label: string | null;
  detail: string | null;
  phaseCount: number;
};

export type OperatingLocationKeyTime = {
  label: string;
  summary: string;
  statusKey: RunLocationKeyTimeView["statusKey"] | "mixed";
  overdueCount: number;
  completedCount: number;
  total: number;
};

export type OperatingLocationIssue = {
  kind: "key_time" | "repair" | "log" | "staffing";
  label: string;
  spaceId: string | null;
  spaceName: string | null;
};

export type OperatingLocationIssueFacts = {
  failedLogs: number;
  missedLogs: number;
  pendingLogs: number;
  openRepairCount: number;
  urgentRepairCount: number;
};

export type OperatingLocationStatus = {
  location: SupervisorOperatingLocation;
  displayName: string;
  contextLabel: string | null;
  href: string;
  staffing: OperatingLocationStaffing;
  currentOperation: OperatingLocationCurrentOperation;
  keyTime: OperatingLocationKeyTime | null;
  issues: readonly OperatingLocationIssue[];
  derivedStatus: OperatingLocationStatusKey;
  issueSummary: string | null;
  facilityOrder: number;
  riskPriority: number;
  floorLabel: string | null;
};

export type OperatingLocationBoardSummary = {
  total: number;
  needsAttention: number;
  inProgress: number;
  onTrack: number;
};

export type OperatingLocationBoard = {
  locations: OperatingLocationStatus[];
  summary: OperatingLocationBoardSummary;
  lensMode: "DEPARTMENT" | "FACILITY";
};

export const TODAYS_WORK_HUB_SUBTITLE =
  "See where the department stands right now, then focus on the locations that need attention.";
