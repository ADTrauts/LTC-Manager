import { ChrcStatus, EmployeeStatus, EmploymentType, JobClassification, RoleKey, WorkStation } from "@prisma/client";
import { SHIRT_SIZE_VALUES } from "@/lib/employee-hr-labels";

export class EmployeeCsvInputError extends Error {}

export const EMPLOYEE_UPDATE_CONTRACT = "vssyl-onboarding/1";
export const EMPLOYEE_UPDATE_TEMPLATE_VERSION = "employee-update/1";
export const EMPLOYEE_CSV_MAX_BYTES = 2_000_000;
export const EMPLOYEE_CSV_MAX_ROWS = 500;
export const EMPLOYEE_CLEAR = "__CLEAR__";

export const EMPLOYEE_CSV_FIELDS = [
  "employeeId", "firstName", "lastName", "email", "phone", "roleType", "employmentType", "status",
  "unionMember", "onLeave", "hireDate", "jobClassification", "chrcStatus", "chrcClearedAt", "chrcNotes",
  "birthMonth", "birthDay", "shirtSize", "hrNotes", "workStations", "primaryUnit", "terminationDate",
  "chrcOffboardingCompletedAt", "chrcOffboardingNotes",
] as const;
export type EmployeeCsvField = (typeof EMPLOYEE_CSV_FIELDS)[number];
// Header only: example people are never mistaken for real import rows.
export const EMPLOYEE_CSV_TEMPLATE = EMPLOYEE_CSV_FIELDS.join(",") + "\r\n";
export const EMPLOYEE_CLEARABLE_FIELDS: ReadonlySet<EmployeeCsvField> = new Set([
  "email", "phone", "hireDate", "jobClassification", "chrcStatus", "chrcClearedAt", "chrcNotes",
  "birthMonth", "birthDay", "shirtSize", "hrNotes", "primaryUnit", "workStations",
]);

export type EmployeeUpdateValues = Partial<{
  employeeId: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  roleType: RoleKey; employmentType: EmploymentType; status: EmployeeStatus; unionMember: boolean;
  onLeave: boolean; hireDate: Date | null; jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null; chrcClearedAt: Date | null; chrcNotes: string | null;
  birthMonth: number | null; birthDay: number | null; shirtSize: string | null; hrNotes: string | null;
  workStations: WorkStation[]; primaryUnit: string | null; terminationDate: Date;
  chrcOffboardingCompletedAt: Date; chrcOffboardingNotes: string;
}>;
export type EmployeeUpdateRow = {
  row: number;
  values: EmployeeUpdateValues;
  columns: Partial<Record<EmployeeCsvField, { column: number; header: string }>>;
  errors: string[];
};

export function normalizeHeaderKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
const aliases: Record<string, EmployeeCsvField> = Object.fromEntries(
  EMPLOYEE_CSV_FIELDS.flatMap((field) => [
    [normalizeHeaderKey(field), field],
    [field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), field],
  ]),
);
Object.assign(aliases, { first: "firstName", last: "lastName", role: "roleType", employment: "employmentType", union: "unionMember", classification: "jobClassification", stations: "workStations" });

/** Strict RFC-style reader, retaining physical source line numbers and multiline quoted cells. */
export function readRecords(text: string): Array<{ row: number; cells: string[] }> {
  const records: Array<{ row: number; cells: string[] }> = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false, line = 1, start = 1;
  const pushCell = () => { cells.push(cell.trim()); cell = ""; closed = false; };
  const pushRow = () => {
    pushCell();
    if (cells.some((value) => value !== "")) records.push({ row: start, cells });
    cells = [];
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { cell += char; if (char === "\n") line++; }
    } else if (char === ",") pushCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      pushRow(); line++; start = line;
    } else if (char === '"' && !closed && cell.trim() === "") { quoted = true; cell = ""; }
    else {
      if (char === '"' || (closed && char.trim() !== "")) throw new EmployeeCsvInputError(`Row ${line}: malformed CSV quoting.`);
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new EmployeeCsvInputError(`Row ${start}: unclosed quoted cell.`);
  if (cell || cells.length || closed) pushRow();
  return records;
}

const enumFields: Partial<Record<EmployeeCsvField, readonly string[]>> = {
  roleType: Object.values(RoleKey), employmentType: Object.values(EmploymentType), status: Object.values(EmployeeStatus),
  jobClassification: Object.values(JobClassification), chrcStatus: Object.values(ChrcStatus), shirtSize: [...SHIRT_SIZE_VALUES],
};
const dateFields = new Set(["hireDate", "chrcClearedAt", "terminationDate", "chrcOffboardingCompletedAt"]);
const limits: Partial<Record<EmployeeCsvField, number>> = {
  employeeId: 128, firstName: 60, lastName: 60, email: 120, phone: 30, primaryUnit: 200,
  chrcNotes: 2000, hrNotes: 20000, chrcOffboardingNotes: 2000,
};

function parseValue(field: EmployeeCsvField, raw: string): unknown {
  if (raw === EMPLOYEE_CLEAR) {
    if (!EMPLOYEE_CLEARABLE_FIELDS.has(field)) throw new EmployeeCsvInputError(`${field} cannot be cleared.`);
    return field === "workStations" ? [] : null;
  }
  const max = limits[field];
  if (max && raw.length > max) throw new EmployeeCsvInputError(`${field} exceeds ${max} characters.`);
  if ((field === "firstName" || field === "lastName") && raw.length < 2) throw new EmployeeCsvInputError(`${field} needs at least 2 characters.`);
  if (enumFields[field]) {
    const value = raw.toUpperCase();
    if (!enumFields[field]!.includes(value)) throw new EmployeeCsvInputError(`Invalid ${field}: ${raw}.`);
    return value;
  }
  if (dateFields.has(field)) {
    const value = new Date(`${raw}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== raw)
      throw new EmployeeCsvInputError(`${field} must be a real date in YYYY-MM-DD format.`);
    return value;
  }
  if (field === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw new EmployeeCsvInputError("Invalid email format.");
    return raw.toLowerCase();
  }
  if (field === "unionMember" || field === "onLeave") {
    if (["true", "yes", "1", "y"].includes(raw.toLowerCase())) return true;
    if (["false", "no", "0", "n"].includes(raw.toLowerCase())) return false;
    throw new EmployeeCsvInputError(`${field} must be true or false.`);
  }
  if (field === "birthMonth" || field === "birthDay") {
    const maxValue = field === "birthMonth" ? 12 : 31;
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maxValue) throw new EmployeeCsvInputError(`${field} must be 1–${maxValue}.`);
    return Number(raw);
  }
  if (field === "workStations") {
    const values = raw.split(/[|,;]/).map((part) => part.trim().toUpperCase());
    if (values.some((part) => !Object.values(WorkStation).includes(part as WorkStation))) throw new EmployeeCsvInputError("Invalid workStations value.");
    return [...new Set(values)].sort();
  }
  return raw;
}

export function parseEmployeeUpdateCsv(text: string): EmployeeUpdateRow[] {
  const [header, ...records] = readRecords(text);
  if (!header) throw new EmployeeCsvInputError("No header row found.");
  if (records.length === 0) throw new EmployeeCsvInputError("The CSV has no employee update rows.");
  if (records.length > EMPLOYEE_CSV_MAX_ROWS) throw new EmployeeCsvInputError(`Too many rows (max ${EMPLOYEE_CSV_MAX_ROWS}).`);
  const fields = header.cells.map((value) => Object.hasOwn(aliases, normalizeHeaderKey(value)) ? aliases[normalizeHeaderKey(value)] : undefined);
  if (fields.some((field) => !field)) throw new EmployeeCsvInputError("Unknown or blank header. Download the supported employee update template; credentials and access columns are not supported.");
  if (new Set(fields).size !== fields.length) throw new EmployeeCsvInputError("Duplicate columns resolve to the same employee field.");
  if (!fields.includes("employeeId") && !fields.includes("email") && !(fields.includes("firstName") && fields.includes("lastName")))
    throw new EmployeeCsvInputError("Supply employeeId, email, or both firstName and lastName for matching.");
  return records.map(({ row, cells }) => {
    const parsed: EmployeeUpdateRow = { row, values: {}, columns: {}, errors: [] };
    if (cells.length < fields.length || cells.slice(fields.length).some(Boolean)) parsed.errors.push("Row length does not match the header. Truncated rows and extra populated cells are blocked.");
    fields.forEach((field, index) => {
      const raw = cells[index]?.trim();
      if (!raw) return; // Omitted and blank values are both preserve, never defaults.
      parsed.columns[field!] = { column: index + 1, header: header.cells[index]! };
      try { Object.assign(parsed.values, { [field!]: parseValue(field!, raw) }); }
      catch (error) { parsed.errors.push(`Column ${index + 1} (${header.cells[index]}): ${(error as Error).message}`); }
    });
    return parsed;
  });
}
