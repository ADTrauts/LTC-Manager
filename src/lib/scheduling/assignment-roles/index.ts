export type OperationalRoleDefinition = {
  key: string;
  label: string;
  departmentKeys: string[];
  description?: string;
  defaultUnitTypes?: string[];
};

const DIETARY_ROLES: OperationalRoleDefinition[] = [
  { key: "COOK", label: "Cook", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "HOT_PREP", label: "Hot Prep", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "COLD_PREP", label: "Cold Prep", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "NOURISHMENT", label: "Nourishment", departmentKeys: ["DIETARY"] },
  { key: "BAKER", label: "Baker", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "PUREE", label: "Puree", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "RECEIVING", label: "Receiving", departmentKeys: ["DIETARY"], defaultUnitTypes: ["STORAGE"] },
  { key: "PORTER", label: "Porter", departmentKeys: ["DIETARY"] },
  { key: "DISHWASHING", label: "Dishwashing", departmentKeys: ["DIETARY"], defaultUnitTypes: ["KITCHEN"] },
  { key: "SERVER", label: "Server", departmentKeys: ["DIETARY"], defaultUnitTypes: ["SERVERY", "RESIDENT_AREA"] },
  { key: "CALL_DOWN_RUNNER", label: "Call-Down Runner", departmentKeys: ["DIETARY"] },
  { key: "DIETARY_SUPERVISOR_ROUNDING", label: "Supervisor Rounding", departmentKeys: ["DIETARY"] },
];

const EVS_ROLES: OperationalRoleDefinition[] = [
  { key: "CLEANING_ROUND", label: "Cleaning Round", departmentKeys: ["EVS"], defaultUnitTypes: ["RESIDENT_AREA", "EVS_ZONE"] },
  { key: "DISCHARGE_CLEAN", label: "Discharge Clean", departmentKeys: ["EVS"], defaultUnitTypes: ["RESIDENT_AREA"] },
  { key: "ISOLATION_CLEAN", label: "Isolation Clean", departmentKeys: ["EVS"], defaultUnitTypes: ["RESIDENT_AREA"] },
  { key: "FLOOR_CARE", label: "Floor Care", departmentKeys: ["EVS"], defaultUnitTypes: ["COMMON_AREA", "EVS_ZONE"] },
  { key: "PUBLIC_AREA", label: "Public Area", departmentKeys: ["EVS"], defaultUnitTypes: ["COMMON_AREA"] },
  { key: "EVS_SUPERVISOR_ROUNDING", label: "Supervisor Rounding", departmentKeys: ["EVS"] },
];

const PLANT_ROLES: OperationalRoleDefinition[] = [
  { key: "WORK_ORDER_RESPONSE", label: "Work Order Response", departmentKeys: ["PLANT"] },
  { key: "PREVENTIVE_MAINTENANCE", label: "Preventive Maintenance", departmentKeys: ["PLANT"], defaultUnitTypes: ["MECHANICAL"] },
  { key: "EQUIPMENT_ROUND", label: "Equipment Round", departmentKeys: ["PLANT"], defaultUnitTypes: ["MECHANICAL"] },
  { key: "ON_CALL_COVERAGE", label: "On-Call Coverage", departmentKeys: ["PLANT"] },
  { key: "RECEIVING_VENDOR", label: "Receiving / Vendor", departmentKeys: ["PLANT"], defaultUnitTypes: ["STORAGE"] },
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
