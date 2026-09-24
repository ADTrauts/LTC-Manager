export type FacilityBillingStatus = "UNMANAGED" | "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export type DepartmentEntitlementRecord = {
  departmentKey: string;
  status: "ACTIVE" | "REVOKED";
};

/**
 * Purchase licenses are independent of `showInEmployeeApp` and department
 * feature flags. Those remain visibility / rollout controls.
 */
export function isDepartmentLicensed(input: {
  enforcementEnabled: boolean;
  billingStatus: FacilityBillingStatus | null;
  entitlements: DepartmentEntitlementRecord[];
  departmentKey: string;
}): boolean {
  if (!input.enforcementEnabled) {
    return true;
  }
  if (!input.billingStatus || input.billingStatus === "UNMANAGED") {
    return true;
  }
  if (input.billingStatus === "INCOMPLETE" || input.billingStatus === "CANCELED") {
    return false;
  }
  return input.entitlements.some(
    (row) => row.departmentKey === input.departmentKey && row.status === "ACTIVE",
  );
}
