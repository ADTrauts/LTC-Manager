import { FACILITY_STRUCTURE_CSV_HEADERS } from "@/lib/bulk-import/facility-structure";
import { ASSET_CSV_HEADERS } from "@/lib/bulk-import/asset-import";
export const IMPORT_VERSION = "vssyl.setup.csv/1";
export const DATASETS = ["workforce", "employee_departments", "department_locations", "assets"] as const;
export type Dataset = typeof DATASETS[number] | "locations";
export const HEADERS: Record<Dataset, readonly string[]> = {
  locations: ["rowRef", ...FACILITY_STRUCTURE_CSV_HEADERS],
  workforce: ["rowRef", "employeeId", "email", "firstName", "lastName", "roleType", "employmentType", "primaryDepartment", "phone", "teamId", "jobRoleId", "jobTitleId"],
  employee_departments: ["rowRef", "employeeId", "email", "department", "membership", "teamId", "teamPrimary", "jobRoleId"],
  department_locations: ["rowRef", "department", "locationType", "locationId", "kind"],
  assets: ["rowRef", ...ASSET_CSV_HEADERS],
};
export const MODE: Record<Dataset, string> = { locations: "create_reuse", workforce: "create_reuse", employee_departments: "add_relationships", department_locations: "add_relationships", assets: "create_reuse" };

export const safeCsvCell = (value: string) => { const s = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value; return `"${s.replaceAll('"','""')}"`; };
