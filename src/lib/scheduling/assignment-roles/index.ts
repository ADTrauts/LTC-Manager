export type OperationalRoleDefinition = {
  key: string;
  label: string;
  departmentKeys: string[];
  description?: string;
};

const DIETARY_ROLES: OperationalRoleDefinition[] = [
  { key: "COOK", label: "Cook", departmentKeys: ["DIETARY"] },
  { key: "HOT_PREP", label: "Hot Prep", departmentKeys: ["DIETARY"] },
  { key: "COLD_PREP", label: "Cold Prep", departmentKeys: ["DIETARY"] },
  { key: "NOURISHMENT", label: "Nourishment", departmentKeys: ["DIETARY"] },
  { key: "BAKER", label: "Baker", departmentKeys: ["DIETARY"] },
  { key: "PUREE", label: "Puree", departmentKeys: ["DIETARY"] },
  { key: "RECEIVING", label: "Receiving", departmentKeys: ["DIETARY"] },
  { key: "PORTER", label: "Porter", departmentKeys: ["DIETARY"] },
  { key: "DISHWASHING", label: "Dishwashing", departmentKeys: ["DIETARY"] },
  { key: "SERVER", label: "Server", departmentKeys: ["DIETARY"] },
  { key: "CALL_DOWN_RUNNER", label: "Call-Down Runner", departmentKeys: ["DIETARY"] },
  { key: "DIETARY_SUPERVISOR_ROUNDING", label: "Supervisor Rounding", departmentKeys: ["DIETARY"] },
  {
    key: "DIETARY_ON_CALL_COVERAGE",
    label: "On-Call Coverage",
    departmentKeys: ["DIETARY"],
    description: "Who responds to an operational incident for this Department during this window.",
  },
];

const EVS_ROLES: OperationalRoleDefinition[] = [
  { key: "CLEANING_ROUND", label: "Cleaning Round", departmentKeys: ["EVS"] },
  { key: "DISCHARGE_CLEAN", label: "Discharge Clean", departmentKeys: ["EVS"] },
  { key: "ISOLATION_CLEAN", label: "Isolation Clean", departmentKeys: ["EVS"] },
  { key: "FLOOR_CARE", label: "Floor Care", departmentKeys: ["EVS"] },
  { key: "PUBLIC_AREA", label: "Public Area", departmentKeys: ["EVS"] },
  { key: "EVS_SUPERVISOR_ROUNDING", label: "Supervisor Rounding", departmentKeys: ["EVS"] },
  {
    key: "EVS_ON_CALL_COVERAGE",
    label: "On-Call Coverage",
    departmentKeys: ["EVS"],
    description: "Who responds to an operational incident for this Department during this window.",
  },
];

const PLANT_ROLES: OperationalRoleDefinition[] = [
  { key: "WORK_ORDER_RESPONSE", label: "Work Order Response", departmentKeys: ["PLANT"] },
  { key: "PREVENTIVE_MAINTENANCE", label: "Preventive Maintenance", departmentKeys: ["PLANT"] },
  { key: "EQUIPMENT_ROUND", label: "Equipment Round", departmentKeys: ["PLANT"] },
  {
    key: "ON_CALL_COVERAGE",
    label: "On-Call Coverage",
    departmentKeys: ["PLANT"],
    description: "Who responds to an operational incident for this Department during this window.",
  },
  { key: "RECEIVING_VENDOR", label: "Receiving / Vendor", departmentKeys: ["PLANT"] },
  { key: "PLANT_SUPERVISOR_ROUNDING", label: "Supervisor Rounding", departmentKeys: ["PLANT"] },
];

export const OPERATIONAL_ROLE_REGISTRY: OperationalRoleDefinition[] = [
  ...DIETARY_ROLES,
  ...EVS_ROLES,
  ...PLANT_ROLES,
];

const roleByKey = new Map(OPERATIONAL_ROLE_REGISTRY.map((r) => [r.key, r]));

export function getRoleDefinition(key: string): OperationalRoleDefinition | undefined {
  return roleByKey.get(key);
}

export function getRolesForDepartment(departmentKey: string): OperationalRoleDefinition[] {
  return OPERATIONAL_ROLE_REGISTRY.filter((r) => r.departmentKeys.includes(departmentKey));
}

export function isRoleValidForDepartment(roleKey: string, departmentKey: string): boolean {
  const def = roleByKey.get(roleKey);
  if (!def) return false;
  return def.departmentKeys.includes(departmentKey);
}
