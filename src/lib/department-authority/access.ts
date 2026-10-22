import type { DepartmentOperatingModel } from "@/lib/department-operators/types";

/**
 * Contracted Department Authority access modes (CDA ARCHITECTURE §2).
 * MANAGE is a ceiling, not a grant: each module still applies its role, PIN and feature rules.
 */
export type DepartmentAccessMode = "MANAGE" | "VIEW" | "SUMMARY" | "NONE";

export type DepartmentSessionKind = "internal" | "vendor" | "harbor";

export type DepartmentAccessDecisionInput = {
  enforcementEnabled: boolean;
  sessionKind: DepartmentSessionKind;
  operatingModel: DepartmentOperatingModel;
  vendorHeadAccepted: boolean;
  isFacilityAdministrator: boolean;
  isMember: boolean;
  isHead: boolean;
  /** Vendor sessions only: the vendor's Organization operates this Department on the service date. */
  vendorOperatesDepartment: boolean;
};

export type DepartmentAccess = {
  departmentId: string;
  mode: DepartmentAccessMode;
  canReadComplianceRecords: boolean;
  operatingModel: DepartmentOperatingModel;
  /** Operating Organization label when the Department is contracted. */
  operatorName: string | null;
  /** The DepartmentOperatorRelationship in force. Null when the Department has no operator row. */
  operatorPeriodId: string | null;
  vendorHeadAccepted: boolean;
  isMember: boolean;
  isHead: boolean;
  /** Why the mode is below MANAGE. Null at MANAGE. */
  reason: string | null;
};

/** Rules R1–R9 (CDA ARCHITECTURE §3.1). */
export function decideDepartmentAccess(input: DepartmentAccessDecisionInput): DepartmentAccessMode {
  if (!input.enforcementEnabled) return "MANAGE";
  if (input.sessionKind === "harbor") return "MANAGE";
  if (input.sessionKind === "vendor") {
    if (!input.vendorOperatesDepartment) return "NONE";
    return input.isHead || input.isMember ? "MANAGE" : "NONE";
  }
  if (input.isHead || input.isMember) return "MANAGE";
  if (input.isFacilityAdministrator) {
    if (input.operatingModel === "FACILITY_OPERATED") return "VIEW";
    return input.vendorHeadAccepted ? "SUMMARY" : "MANAGE";
  }
  return "NONE";
}

/** MANAGE, VIEW, and the Facility Administrator in SUMMARY (CDA-Q01). */
export function canReadComplianceRecordsInMode(
  mode: DepartmentAccessMode,
  isFacilityAdministrator: boolean,
): boolean {
  if (mode === "MANAGE" || mode === "VIEW") return true;
  return mode === "SUMMARY" && isFacilityAdministrator;
}

export const DEPARTMENT_VIEW_REASON =
  "You can view this Department. Changes are made by its head and team.";

export const DEPARTMENT_NONE_REASON =
  "This Department's information is available only to its team.";

export function departmentSummaryReason(operatorName: string | null): string {
  const operator = operatorName?.trim() || "Its operator";
  return `${operator} runs this Department. You can see its summary and its compliance Records.`;
}

export function departmentAccessReason(
  mode: DepartmentAccessMode,
  operatorName: string | null,
): string | null {
  switch (mode) {
    case "MANAGE":
      return null;
    case "VIEW":
      return DEPARTMENT_VIEW_REASON;
    case "SUMMARY":
      return departmentSummaryReason(operatorName);
    case "NONE":
      return DEPARTMENT_NONE_REASON;
  }
}

export class DepartmentAccessError extends Error {
  readonly departmentId: string;
  readonly mode: DepartmentAccessMode;

  constructor(access: Pick<DepartmentAccess, "departmentId" | "mode" | "reason">) {
    super(access.reason ?? DEPARTMENT_NONE_REASON);
    this.name = "DepartmentAccessError";
    this.departmentId = access.departmentId;
    this.mode = access.mode;
  }
}

export function requireDepartmentManage(access: DepartmentAccess): void {
  if (access.mode !== "MANAGE") {
    throw new DepartmentAccessError(access);
  }
}
