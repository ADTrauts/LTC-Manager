import type { ChrcStatus, EmployeeStatus, EmploymentType, JobClassification, RoleKey, WorkStation } from "@prisma/client";

export type EmployeeProfileSnapshot = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleType: RoleKey;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  unionMember: boolean;
  onLeave: boolean;
  hireDateIso: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAtIso: string | null;
  chrcNotes: string | null;
  shirtSize: string | null;
  hrNotes: string | null;
  workStationsSorted: WorkStation[];
  terminationDateIso: string | null;
  chrcOffboardingCompletedAtIso: string | null;
  chrcOffboardingNotes: string | null;
  primaryDepartmentId: string | null;
  jobTitleId: string | null;
};

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function buildTerminationSnapshotJson(row: {
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
  birthMonth: number | null;
  birthDay: number | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAt: Date | null;
  chrcNotes: string | null;
  shirtSize: string | null;
  hrNotes: string | null;
  terminationDate: Date | null;
  chrcOffboardingCompletedAt: Date | null;
  chrcOffboardingNotes: string | null;
  workStations: { station: WorkStation }[];
},
  extras?: {
    separationKind?: string;
    lastShiftWorkedAtIso?: string | null;
    wouldRehire?: boolean | null;
  },
): string {
  const snap: Record<string, unknown> = {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    roleType: row.roleType,
    employmentType: row.employmentType,
    status: row.status,
    unionMember: row.unionMember,
    onLeave: row.onLeave,
    hireDate: row.hireDate ? row.hireDate.toISOString().slice(0, 10) : null,
    birthMonth: row.birthMonth,
    birthDay: row.birthDay,
    jobClassification: row.jobClassification,
    chrcStatus: row.chrcStatus,
    chrcClearedAt: row.chrcClearedAt ? row.chrcClearedAt.toISOString().slice(0, 10) : null,
    chrcNotes: row.chrcNotes,
    shirtSize: row.shirtSize,
    hrNotes: row.hrNotes,
    terminationDate: row.terminationDate ? row.terminationDate.toISOString().slice(0, 10) : null,
    chrcOffboardingCompletedAt: row.chrcOffboardingCompletedAt
      ? row.chrcOffboardingCompletedAt.toISOString()
      : null,
    chrcOffboardingNotes: row.chrcOffboardingNotes,
    workStations: row.workStations.map((w) => w.station).sort(),
  };
  if (extras) {
    if (extras.separationKind !== undefined) snap.separationKind = extras.separationKind;
    if (extras.lastShiftWorkedAtIso !== undefined) snap.lastShiftWorkedAt = extras.lastShiftWorkedAtIso;
    if (extras.wouldRehire !== undefined) snap.wouldRehire = extras.wouldRehire;
  }
  return JSON.stringify(snap);
}

export function diffProfileForAudit(
  before: EmployeeProfileSnapshot,
  after: EmployeeProfileSnapshot,
): { fieldKey: string; oldValue: string | null; newValue: string | null }[] {
  const keys: (keyof EmployeeProfileSnapshot)[] = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "roleType",
    "employmentType",
    "status",
    "unionMember",
    "onLeave",
    "hireDateIso",
    "birthMonth",
    "birthDay",
    "jobClassification",
    "chrcStatus",
    "chrcClearedAtIso",
    "chrcNotes",
    "shirtSize",
    "hrNotes",
    "workStationsSorted",
    "terminationDateIso",
    "chrcOffboardingCompletedAtIso",
    "chrcOffboardingNotes",
    "primaryDepartmentId",
    "jobTitleId",
  ];

  const out: { fieldKey: string; oldValue: string | null; newValue: string | null }[] = [];

  for (const k of keys) {
    const o = before[k];
    const n = after[k];
    const os =
      k === "workStationsSorted"
        ? (before.workStationsSorted ?? []).join(",")
        : str(o as unknown);
    const ns =
      k === "workStationsSorted"
        ? (after.workStationsSorted ?? []).join(",")
        : str(n as unknown);
    if (os !== ns) {
      out.push({ fieldKey: `profile.${k}`, oldValue: os, newValue: ns });
    }
  }

  return out;
}

export function snapshotFromProfileForm(
  parsed: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    roleType: RoleKey;
    employmentType: EmploymentType;
    status: EmployeeStatus;
    primaryDepartmentId?: string;
    jobTitleId?: string;
  },
  hr: {
    unionMember: boolean;
    onLeave: boolean;
    hireDate: Date | null;
    birthMonth: number | null;
    birthDay: number | null;
    jobClassification: JobClassification | null;
    chrcStatus: ChrcStatus | null;
    chrcClearedAt: Date | null;
    chrcNotes: string | null;
    shirtSize: string | null;
    hrNotes: string | null;
    workStations: WorkStation[];
    terminationDate: Date | null;
    chrcOffboardingCompletedAt: Date | null;
    chrcOffboardingNotes: string | null;
  },
  terminated: boolean,
): EmployeeProfileSnapshot {
  return {
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    email: parsed.email ?? null,
    phone: parsed.phone ?? null,
    roleType: parsed.roleType,
    employmentType: parsed.employmentType,
    status: parsed.status,
    unionMember: hr.unionMember,
    onLeave: hr.onLeave,
    hireDateIso: hr.hireDate ? hr.hireDate.toISOString().slice(0, 10) : null,
    birthMonth: hr.birthMonth,
    birthDay: hr.birthDay,
    jobClassification: hr.jobClassification,
    chrcStatus: hr.chrcStatus,
    chrcClearedAtIso: hr.chrcClearedAt ? hr.chrcClearedAt.toISOString().slice(0, 10) : null,
    chrcNotes: hr.chrcNotes,
    shirtSize: hr.shirtSize,
    hrNotes: hr.hrNotes,
    workStationsSorted: [...hr.workStations].sort(),
    terminationDateIso:
      terminated && hr.terminationDate ? hr.terminationDate.toISOString().slice(0, 10) : null,
    chrcOffboardingCompletedAtIso:
      terminated && hr.chrcOffboardingCompletedAt
        ? hr.chrcOffboardingCompletedAt.toISOString().slice(0, 10)
        : null,
    chrcOffboardingNotes: terminated ? hr.chrcOffboardingNotes : null,
    primaryDepartmentId: parsed.primaryDepartmentId ?? null,
    jobTitleId: parsed.jobTitleId ?? null,
  };
}

export function snapshotFromEmployeeRow(row: {
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
  birthMonth: number | null;
  birthDay: number | null;
  jobClassification: JobClassification | null;
  chrcStatus: ChrcStatus | null;
  chrcClearedAt: Date | null;
  chrcNotes: string | null;
  shirtSize: string | null;
  hrNotes: string | null;
  terminationDate: Date | null;
  chrcOffboardingCompletedAt: Date | null;
  chrcOffboardingNotes: string | null;
  workStations: { station: WorkStation }[];
  primaryDepartmentId: string | null;
  jobTitleId: string | null;
}): EmployeeProfileSnapshot {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    roleType: row.roleType,
    employmentType: row.employmentType,
    status: row.status,
    unionMember: row.unionMember,
    onLeave: row.onLeave,
    hireDateIso: row.hireDate ? row.hireDate.toISOString().slice(0, 10) : null,
    birthMonth: row.birthMonth,
    birthDay: row.birthDay,
    jobClassification: row.jobClassification,
    chrcStatus: row.chrcStatus,
    chrcClearedAtIso: row.chrcClearedAt ? row.chrcClearedAt.toISOString().slice(0, 10) : null,
    chrcNotes: row.chrcNotes,
    shirtSize: row.shirtSize,
    hrNotes: row.hrNotes,
    workStationsSorted: row.workStations.map((w) => w.station).sort(),
    terminationDateIso: row.terminationDate ? row.terminationDate.toISOString().slice(0, 10) : null,
    chrcOffboardingCompletedAtIso: row.chrcOffboardingCompletedAt
      ? row.chrcOffboardingCompletedAt.toISOString().slice(0, 10)
      : null,
    chrcOffboardingNotes: row.chrcOffboardingNotes,
    primaryDepartmentId: row.primaryDepartmentId,
    jobTitleId: row.jobTitleId,
  };
}
