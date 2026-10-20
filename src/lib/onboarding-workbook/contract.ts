import { HEADERS, type Dataset } from "@/lib/setup-imports/public-contract";
export const VERSION = "vssyl.onboarding.xlsx/1";
export const LIMITS = { compressed: 5*1024*1024, expanded: 20*1024*1024, entry: 4*1024*1024, entries: 128, sheets: 9, rows: 1000, people: 500, cells: 50000, textBytes: 2_000_000, columns: 24, text: 2000, nesting: 32, nestedArchives: 0, milliseconds: 5000 } as const;
export const SHEETS: Array<{ name: string; dataset: Dataset; headers: readonly string[] }> = [
  { name: "Locations", dataset: "locations", headers: HEADERS.locations },
  { name: "People", dataset: "workforce", headers: HEADERS.workforce },
  { name: "Department Locations", dataset: "department_locations", headers: HEADERS.department_locations },
  { name: "Department Memberships", dataset: "employee_departments", headers: HEADERS.employee_departments },
  { name: "Assets", dataset: "assets", headers: HEADERS.assets },
];
export type WorkbookRow = { id: number; sheet: string; row: number; dataset: Dataset; values: Record<string,string>; errors: string[] };
export type WorkbookSource = { version: string; facilityId: string; sourceHash: string; fileName: string; rows: WorkbookRow[] };
export class WorkbookError extends Error {}
export const csv = (headers: readonly string[], values: Record<string,string>[]) => [headers,...values.map(v => headers.map(h => v[h] || ""))].map(row => row.map(x => `"${x.replaceAll('"','""')}"`).join(",")).join("\n");
