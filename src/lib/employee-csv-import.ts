import {
  ChrcStatus,
  EmployeeStatus,
  EmploymentType,
  JobClassification,
  RoleKey,
  WorkStation,
} from "@prisma/client";

import { SHIRT_SIZE_VALUES } from "@/lib/employee-hr-labels";

export const EMPLOYEE_CSV_TEMPLATE = `firstName,lastName,email,phone,roleType,employmentType,status,unionMember,onLeave,hireDate,jobClassification,chrcStatus,chrcClearedAt,chrcNotes,birthMonth,birthDay,shirtSize,hrNotes,workStations,primaryUnit,terminationDate,chrcOffboardingCompletedAt,chrcOffboardingNotes
Jane,Doe,jane@example.com,,STAFF,FULL_TIME,ACTIVE,true,false,2024-01-15,COOK,NOT_STARTED,,,3,15,M,,COOK|SERVER,,,`;

export function normalizeHeaderKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Map normalized header → canonical field key */
const HEADER_ALIASES: Record<string, string> = {
  firstname: "firstName",
  first_name: "firstName",
  first: "firstName",
  lastname: "lastName",
  last_name: "lastName",
  last: "lastName",
  email: "email",
  phone: "phone",
  roletype: "roleType",
  role: "roleType",
  employmenttype: "employmentType",
  employment: "employmentType",
  status: "status",
  unionmember: "unionMember",
  union: "unionMember",
  onleave: "onLeave",
  hiredate: "hireDate",
  hire_date: "hireDate",
  jobclassification: "jobClassification",
  classification: "jobClassification",
  chrcstatus: "chrcStatus",
  chrcclearedat: "chrcClearedAt",
  chrc_cleared_at: "chrcClearedAt",
  chrcnotes: "chrcNotes",
  chrc_notes: "chrcNotes",
  birthmonth: "birthMonth",
  birth_month: "birthMonth",
  birthday: "birthDay",
  birth_day: "birthDay",
  shirtsize: "shirtSize",
  shirt_size: "shirtSize",
  hrnotes: "hrNotes",
  hr_notes: "hrNotes",
  workstations: "workStations",
  work_stations: "workStations",
  stations: "workStations",
  primaryunit: "primaryUnit",
  primary_unit: "primaryUnit",
  terminationdate: "terminationDate",
  termination_date: "terminationDate",
  chrcoffboardingcompletedat: "chrcOffboardingCompletedAt",
  chrc_offboarding_completed_at: "chrcOffboardingCompletedAt",
  chrcoffboardingnotes: "chrcOffboardingNotes",
  chrc_offboarding_notes: "chrcOffboardingNotes",
};

export function mapHeaders(headers: string[]): Map<number, string> {
  const m = new Map<number, string>();
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[normalizeHeaderKey(h)];
    if (key) m.set(i, key);
  });
  return m;
}

export function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00.000Z`);
}

export function parseBool(raw: string | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1" || v === "y";
}

function parseEnumStrict<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  label: string,
): { ok: true; value: T } | { ok: false; error: string } {
  if (!raw || !raw.trim()) {
    return { ok: false, error: `${label} is required for this row (or omit column to use defaults where allowed).` };
  }
  const v = raw.trim().toUpperCase() as T;
  if (!(allowed as readonly string[]).includes(v)) {
    return { ok: false, error: `Invalid ${label}: "${raw.trim()}". Expected one of: ${allowed.join(", ")}.` };
  }
  return { ok: true, value: v };
}

function parseEnumOptional<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | null {
  if (!raw || !raw.trim()) return null;
  const v = raw.trim().toUpperCase() as T;
  return (allowed as readonly string[]).includes(v) ? v : null;
}

export function parseWorkStations(raw: string | undefined): WorkStation[] {
  if (!raw || !raw.trim()) return [];
  const parts = raw
    .split(/[|,;]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const all = Object.values(WorkStation) as WorkStation[];
  const set = new Set<WorkStation>();
  for (const p of parts) {
    if ((all as string[]).includes(p)) set.add(p as WorkStation);
  }
  return [...set];
}

export type ParsedCsvEmployeeRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleType: RoleKey;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  unionMember: boolean;
  onLeave: boolean;
  hireDate: Date | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAt: Date | null;
  chrcNotes: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  shirtSize: string | null;
  hrNotes: string | null;
  workStations: WorkStation[];
  primaryUnitName: string | null;
  terminationDate: Date | null;
  chrcOffboardingCompletedAt: Date | null;
  chrcOffboardingNotes: string | null;
};

const ROLE_KEYS = Object.values(RoleKey);
const EMP_TYPES = Object.values(EmploymentType);
const STATUSES = Object.values(EmployeeStatus);
const JOB_CLASS = Object.values(JobClassification);
const CHRC = Object.values(ChrcStatus);

export function parseEmployeeRow(
  cells: string[],
  colMap: Map<number, string>,
): { ok: true; value: ParsedCsvEmployeeRow } | { ok: false; error: string } {
  const get = (key: string): string | undefined => {
    for (const [idx, k] of colMap) {
      if (k === key) return cells[idx]?.trim() ?? "";
    }
    return undefined;
  };

  const firstName = (get("firstName") ?? "").trim();
  const lastName = (get("lastName") ?? "").trim();
  if (firstName.length < 2 || lastName.length < 2) {
    return { ok: false, error: "firstName and lastName are required (min 2 characters each)." };
  }

  const emailRaw = get("email");
  let email: string | null = null;
  if (emailRaw) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return { ok: false, error: "Invalid email format." };
    }
    email = emailRaw.trim().slice(0, 120);
  }

  const phoneRaw = get("phone");
  const phone = phoneRaw ? phoneRaw.trim().slice(0, 30) : null;

  const roleParsed = get("roleType")?.trim()
    ? parseEnumStrict(get("roleType"), ROLE_KEYS, "roleType")
    : { ok: true as const, value: RoleKey.STAFF };
  if (!roleParsed.ok) return roleParsed;
  const roleType = roleParsed.value;

  const empParsed = get("employmentType")?.trim()
    ? parseEnumStrict(get("employmentType"), EMP_TYPES, "employmentType")
    : { ok: true as const, value: EmploymentType.FULL_TIME };
  if (!empParsed.ok) return empParsed;
  const employmentType = empParsed.value;

  const statusParsed = get("status")?.trim()
    ? parseEnumStrict(get("status"), STATUSES, "status")
    : { ok: true as const, value: EmployeeStatus.ACTIVE };
  if (!statusParsed.ok) return statusParsed;
  const status = statusParsed.value;

  const jcRaw = get("jobClassification");
  let jobClassification: JobClassification | null = null;
  if (jcRaw?.trim()) {
    const j = parseEnumOptional(jcRaw, JOB_CLASS);
    if (!j) return { ok: false, error: `Invalid jobClassification: "${jcRaw}".` };
    jobClassification = j;
  }

  const csRaw = get("chrcStatus");
  let chrcStatus: ChrcStatus | null = null;
  if (csRaw?.trim()) {
    const c = parseEnumOptional(csRaw, CHRC);
    if (!c) return { ok: false, error: `Invalid chrcStatus: "${csRaw}".` };
    chrcStatus = c;
  }

  const birthMonthStr = get("birthMonth");
  const birthDayStr = get("birthDay");
  let birthMonth: number | null = null;
  let birthDay: number | null = null;
  if (birthMonthStr) {
    const n = Number(birthMonthStr);
    if (Number.isInteger(n) && n >= 1 && n <= 12) birthMonth = n;
  }
  if (birthDayStr) {
    const n = Number(birthDayStr);
    if (Number.isInteger(n) && n >= 1 && n <= 31) birthDay = n;
  }

  const chrcNotesRaw = get("chrcNotes");
  const chrcNotes = chrcNotesRaw ? chrcNotesRaw.slice(0, 2000) : null;

  const hrNotesRaw = get("hrNotes");
  const hrNotes = hrNotesRaw ? hrNotesRaw.slice(0, 20000) : null;

  const chrcOffboardingNotesRaw = get("chrcOffboardingNotes");
  const chrcOffboardingNotes = chrcOffboardingNotesRaw
    ? chrcOffboardingNotesRaw.slice(0, 2000)
    : null;

  const shirtSizeRaw = get("shirtSize")?.trim() ?? "";
  let shirtSize: string | null = null;
  if (shirtSizeRaw) {
    if (!SHIRT_SIZE_VALUES.has(shirtSizeRaw)) {
      return {
        ok: false,
        error: `Invalid shirtSize: "${shirtSizeRaw}". Use XS, S, M, L, XL, 2XL, 3XL, 4XL, or 5XL.`,
      };
    }
    shirtSize = shirtSizeRaw;
  }

  return {
    ok: true,
    value: {
      firstName: firstName.slice(0, 60),
      lastName: lastName.slice(0, 60),
      email,
      phone,
      roleType,
      employmentType,
      status,
      unionMember: parseBool(get("unionMember")),
      onLeave: parseBool(get("onLeave")),
      hireDate: parseIsoDate(get("hireDate")),
      jobClassification,
      chrcStatus,
      chrcClearedAt: parseIsoDate(get("chrcClearedAt")),
      chrcNotes,
      birthMonth,
      birthDay,
      shirtSize,
      hrNotes,
      workStations: parseWorkStations(get("workStations")),
      primaryUnitName: get("primaryUnit")?.trim() || null,
      terminationDate: parseIsoDate(get("terminationDate")),
      chrcOffboardingCompletedAt: parseIsoDate(get("chrcOffboardingCompletedAt")),
      chrcOffboardingNotes,
    },
  };
}
