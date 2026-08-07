import type { OperationalAssignmentSource, OperationalAssignmentStatus } from "@prisma/client";

export type AssignmentBoardEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  departmentKey: string | null;
  departmentName: string | null;
  scheduledShift: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  unitName: string | null;
  hasCallDown: boolean;
  callDownReason: string | null;
};

export type AssignmentBoardEntry = {
  id: string;
  employeeId: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  operationInstanceId: string | null;
  operationLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: OperationalAssignmentStatus;
  source: OperationalAssignmentSource;
  notes: string | null;
  /** UNIT = whole unit (zero location rows). SPACES = explicit Room/Space snapshot. */
  scopeKind: "UNIT" | "SPACES";
  locationCount: number;
  locationLabels: string[];
  sourceZoneId: string | null;
  sourceZoneName: string | null;
};

export type AssignmentWarningKind =
  | "unassigned_employee"
  | "outside_shift"
  | "overlapping_primary"
  | "overlapping_location"
  | "inactive_unit"
  | "cancelled_operation"
  | "reassignment_conflict";

export type AssignmentWarning = {
  kind: AssignmentWarningKind;
  employeeId: string;
  assignmentId?: string;
  message: string;
};

export type DailyAssignmentBoardData = {
  serviceDate: string;
  facilityId: string;
  departmentKey: string | null;
  employees: AssignmentBoardEmployee[];
  assignments: AssignmentBoardEntry[];
  warnings: AssignmentWarning[];
};

export type ValidateAssignmentInput = {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  employeeId: string;
  employeeFacilityId: string;
  unitId?: string | null;
  unitFacilityId?: string | null;
  unitIsActive?: boolean;
  operationInstanceId?: string | null;
  operationFacilityId?: string | null;
  roleKey: string;
  serviceDate: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};
