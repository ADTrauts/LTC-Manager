"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ChrcStatus,
  DisciplinePointCategory,
  EmploymentType,
  EmployeeStatus,
  JobClassification,
  Prisma,
  RoleKey,
  SeparationKind,
  WorkStation,
} from "@prisma/client";

/** Structural type so tooling stays valid even if `@prisma/client` types lag behind `prisma generate`. */
type UnitAccessTransaction = {
  employeeUnitAccess: {
    deleteMany: (args: { where: { employeeId: string } }) => Promise<unknown>;
    createMany: (args: { data: { employeeId: string; unitId: string }[] }) => Promise<unknown>;
  };
  unit: {
    findMany: (args: {
      where: { facilityId: string; id: { in: string[] }; isActive: boolean };
      select: { id: true };
    }) => Promise<{ id: string }[]>;
  };
};
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { accessMethodValues, requiresEmailPasswordAccount } from "@/lib/credential-policy";
import { sessionUserIdForFk } from "@/lib/auth";
import { SHIRT_SIZE_VALUES } from "@/lib/employee-hr-labels";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  buildTerminationSnapshotJson,
  diffProfileForAudit,
  snapshotFromEmployeeRow,
  snapshotFromProfileForm,
} from "@/lib/hr-audit";
import { isValidPinFormat, pinDigestForFacility } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

const roleKeyValues = [
  RoleKey.GM,
  RoleKey.MANAGER,
  RoleKey.SUPERVISOR,
  RoleKey.LEAD_TEAM_MEMBER,
  RoleKey.STAFF,
] as const;
const employmentValues = [
  EmploymentType.FULL_TIME,
  EmploymentType.PART_TIME,
  EmploymentType.PER_DIEM,
] as const;
const statusValues = [EmployeeStatus.ACTIVE, EmployeeStatus.OFF, EmployeeStatus.TERMINATED] as const;

const jobClassificationValues = [
  JobClassification.COOK,
  JobClassification.FOOD_SERVICE_WORKER,
  JobClassification.DIET_CLERK,
  JobClassification.DIETITIAN,
  JobClassification.OTHER,
] as const;
const chrcStatusValues = [
  ChrcStatus.NOT_STARTED,
  ChrcStatus.PENDING,
  ChrcStatus.CLEARED,
  ChrcStatus.NOT_APPLICABLE,
] as const;

const createEmployeeSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  roleType: z.enum(roleKeyValues),
  employmentType: z.enum(employmentValues),
  status: z.enum(statusValues),
  accessMethod: z.enum(accessMethodValues),
  initialPassword: z.string().min(8).max(128).optional(),
  confirmInitialPassword: z.string().min(8).max(128).optional(),
}).superRefine((value, ctx) => {
  if (requiresEmailPasswordAccount(value.roleType) && value.accessMethod !== "EMAIL_PASSWORD") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["accessMethod"],
      message: "GM, Manager, and Supervisor require email and password sign-in.",
    });
  }
  if (value.accessMethod !== "EMAIL_PASSWORD") {
    return;
  }
  if (!value.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Email is required when creating an email/password sign-in.",
    });
  }
  if (!value.initialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialPassword"],
      message: "Initial password is required.",
    });
  }
  if (!value.confirmInitialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmInitialPassword"],
      message: "Confirm password is required.",
    });
  }
  if (value.initialPassword && value.confirmInitialPassword && value.initialPassword !== value.confirmInitialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmInitialPassword"],
      message: "Passwords do not match.",
    });
  }
});

const setDefaultAssignmentSchema = z.object({
  employeeId: z.string().cuid(),
  unitId: z.string().cuid(),
  roleType: z.enum(roleKeyValues),
  isActive: z.coerce.boolean().default(true),
});

const setEmployeePinSchema = z.object({
  employeeId: z.string().cuid(),
  pin: z.string().trim().min(6).max(6),
});

const updateEmployeeProfileSchema = z
  .object({
    employeeId: z.string().cuid(),
    firstName: z.string().trim().min(2).max(60),
    lastName: z.string().trim().min(2).max(60),
    email: z.string().trim().email().max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    roleType: z.enum(roleKeyValues),
    employmentType: z.enum(employmentValues),
    status: z.enum(statusValues),
  })
  .superRefine((value, ctx) => {
    if (requiresEmailPasswordAccount(value.roleType) && !value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Email is required for GM, Manager, and Supervisor roles.",
      });
    }
  });

const promoteInitialPasswordSchema = z
  .object({
    initialPassword: z.string().min(8).max(128),
    confirmInitialPassword: z.string().min(8).max(128),
  })
  .refine((v) => v.initialPassword === v.confirmInitialPassword, {
    path: ["confirmInitialPassword"],
    message: "Passwords do not match.",
  });

function parseOptionalMonthDay(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n;
}

function parseOptionalDateField(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  return new Date(`${raw.trim()}T12:00:00.000Z`);
}

function parseHrProfileFields(formData: FormData) {
  const jc = String(formData.get("jobClassification") ?? "").trim();
  const cs = String(formData.get("chrcStatus") ?? "").trim();
  const birthMonth = parseOptionalMonthDay(formData.get("birthMonth"));
  const birthDay = parseOptionalMonthDay(formData.get("birthDay"));
  if (birthMonth !== null && (birthMonth < 1 || birthMonth > 12)) {
    throw new Error("Birth month must be 1–12.");
  }
  if (birthDay !== null && (birthDay < 1 || birthDay > 31)) {
    throw new Error("Birth day must be 1–31.");
  }

  const hireDate = parseOptionalDateField(toOptional(formData.get("hireDate")));
  const chrcClearedAt = parseOptionalDateField(toOptional(formData.get("chrcClearedAt")));

  const workStations = formData
    .getAll("workStations")
    .map(String)
    .filter((s): s is WorkStation => (Object.values(WorkStation) as string[]).includes(s));

  const chrcNotes = toOptional(formData.get("chrcNotes"));
  const hrNotes = toOptional(formData.get("hrNotes"));
  const chrcOffboardingNotes = toOptional(formData.get("chrcOffboardingNotes"));
  if (chrcNotes && chrcNotes.length > 2000) throw new Error("CHRC notes are too long.");
  if (hrNotes && hrNotes.length > 20000) throw new Error("HR notes are too long.");
  if (chrcOffboardingNotes && chrcOffboardingNotes.length > 2000) {
    throw new Error("CHRC offboarding notes are too long.");
  }

  const terminationDate = parseOptionalDateField(toOptional(formData.get("terminationDate")));
  const chrcOffboardingCompletedAt = parseOptionalDateField(
    toOptional(formData.get("chrcOffboardingCompletedAt")),
  );

  return {
    unionMember: formData.get("unionMember") === "on",
    onLeave: formData.get("onLeave") === "on",
    hireDate,
    birthMonth,
    birthDay,
    jobClassification: (jobClassificationValues as readonly string[]).includes(jc)
      ? (jc as JobClassification)
      : null,
    chrcStatus: (chrcStatusValues as readonly string[]).includes(cs) ? (cs as ChrcStatus) : null,
    chrcClearedAt,
    chrcNotes: chrcNotes ?? null,
    shirtSize: (() => {
      const raw = String(formData.get("shirtSize") ?? "").trim();
      if (raw === "") return null;
      if (!SHIRT_SIZE_VALUES.has(raw)) {
        throw new Error("Invalid shirt size.");
      }
      return raw;
    })(),
    hrNotes: hrNotes ?? null,
    workStations,
    terminationDate,
    chrcOffboardingCompletedAt,
    chrcOffboardingNotes: chrcOffboardingNotes ?? null,
  };
}

async function syncEmployeeWorkStationsTx(
  tx: {
    employeeWorkStation: {
      deleteMany: (args: { where: { employeeId: string } }) => Promise<unknown>;
      createMany: (args: { data: { employeeId: string; station: WorkStation }[] }) => Promise<unknown>;
    };
  },
  employeeId: string,
  stations: WorkStation[],
) {
  await tx.employeeWorkStation.deleteMany({ where: { employeeId } });
  if (stations.length === 0) return;
  await tx.employeeWorkStation.createMany({
    data: stations.map((station) => ({ employeeId, station })),
  });
}

function parseUnitAccessMode(formData: FormData): "all" | "restricted" {
  return String(formData.get("unitAccessMode") ?? "all") === "restricted" ? "restricted" : "all";
}

function parseAllowedUnitIds(formData: FormData): string[] {
  return formData.getAll("allowedUnitIds").map(String).filter(Boolean);
}

async function validatePrimaryUnitId(
  facilityId: string,
  primaryRaw: string | undefined,
  mode: "all" | "restricted",
  allowedUnitIds: string[],
): Promise<string | null> {
  if (!primaryRaw) return null;
  const unit = await prisma.unit.findFirst({
    where: { id: primaryRaw, facilityId, isActive: true },
    select: { id: true },
  });
  if (!unit) {
    throw new Error("Invalid primary unit.");
  }
  if (mode === "restricted" && !allowedUnitIds.includes(primaryRaw)) {
    throw new Error("Primary unit must be one of the allowed units.");
  }
  return primaryRaw;
}

async function syncEmployeeUnitAccessTx(
  tx: UnitAccessTransaction,
  employeeId: string,
  facilityId: string,
  mode: "all" | "restricted",
  allowedUnitIds: string[],
) {
  await tx.employeeUnitAccess.deleteMany({ where: { employeeId } });
  if (mode !== "restricted") return;
  if (allowedUnitIds.length === 0) {
    throw new Error("Select at least one unit when restricting access.");
  }
  const valid = await tx.unit.findMany({
    where: { facilityId, id: { in: allowedUnitIds }, isActive: true },
    select: { id: true },
  });
  if (valid.length !== allowedUnitIds.length) {
    throw new Error("Invalid unit selection.");
  }
  await tx.employeeUnitAccess.createMany({
    data: allowedUnitIds.map((unitId) => ({ employeeId, unitId })),
  });
}

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateEmployeeViews() {
  revalidatePath("/employees");
  revalidatePath("/employees/points-summary");
  revalidatePath("/employees/hr-audit");
  revalidatePath("/employees/separations");
  revalidatePath("/employees/terminations");
  revalidatePath("/staffing");
  revalidatePath("/dashboard");
}

export async function createEmployeeAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const mode = parseUnitAccessMode(formData);
  const allowedUnitIds = parseAllowedUnitIds(formData);

  const parsed = createEmployeeSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: toOptional(formData.get("email")),
    phone: toOptional(formData.get("phone")),
    roleType: formData.get("roleType"),
    employmentType: formData.get("employmentType"),
    status: formData.get("status"),
    accessMethod: formData.get("accessMethod"),
    initialPassword: toOptional(formData.get("initialPassword")),
    confirmInitialPassword: toOptional(formData.get("confirmInitialPassword")),
  });
  const hr = parseHrProfileFields(formData);
  const normalizedEmail = parsed.email?.toLowerCase();

  const primaryUnitId = await validatePrimaryUnitId(
    session.facilityId,
    toOptional(formData.get("primaryUnitId")),
    mode,
    allowedUnitIds,
  );

  try {
    await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          facilityId: session.facilityId,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          email: normalizedEmail,
          phone: parsed.phone,
          roleType: parsed.roleType,
          employmentType: parsed.employmentType,
          status: parsed.status,
          primaryUnitId,
          unionMember: hr.unionMember,
          onLeave: hr.onLeave,
          hireDate: hr.hireDate,
          birthMonth: hr.birthMonth,
          birthDay: hr.birthDay,
          jobClassification: hr.jobClassification,
          chrcStatus: hr.chrcStatus,
          chrcClearedAt: hr.chrcClearedAt,
          chrcNotes: hr.chrcNotes,
          shirtSize: hr.shirtSize,
          hrNotes: hr.hrNotes,
        } as Prisma.EmployeeUncheckedCreateInput,
      });
      await syncEmployeeUnitAccessTx(tx as unknown as UnitAccessTransaction, emp.id, session.facilityId, mode, allowedUnitIds);
      await syncEmployeeWorkStationsTx(tx, emp.id, hr.workStations);

      if (parsed.accessMethod === "EMAIL_PASSWORD") {
        const role = await tx.role.findFirst({
          where: { key: parsed.roleType, isActive: true },
          select: { id: true },
        });
        if (!role || !normalizedEmail || !parsed.initialPassword) {
          throw new Error("Unable to create email/password sign-in for this employee.");
        }
        const passwordHash = await bcrypt.hash(parsed.initialPassword, 12);
        await tx.user.create({
          data: {
            email: normalizedEmail,
            displayName: `${parsed.firstName} ${parsed.lastName}`,
            passwordHash,
            facilityId: session.facilityId,
            roleId: role.id,
            isActive: true,
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Email is already in use by another account.");
    }
    throw e;
  }

  revalidateEmployeeViews();
  redirect("/employees");
}

export async function updateEmployeeProfileAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const mode = parseUnitAccessMode(formData);
  const allowedUnitIds = parseAllowedUnitIds(formData);

  const parsed = updateEmployeeProfileSchema.parse({
    employeeId: formData.get("employeeId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: toOptional(formData.get("email")),
    phone: toOptional(formData.get("phone")),
    roleType: formData.get("roleType"),
    employmentType: formData.get("employmentType"),
    status: formData.get("status"),
  });
  const hr = parseHrProfileFields(formData);

  const normalizedProfileEmail = parsed.email ? parsed.email.toLowerCase() : undefined;

  const existingUserForEmail =
    normalizedProfileEmail ?
      await prisma.user.findFirst({
        where: {
          email: normalizedProfileEmail,
          facilityId: session.facilityId,
          isActive: true,
        },
        select: { id: true },
      })
    : null;

  let newAppLoginPasswordHash: string | undefined;
  if (requiresEmailPasswordAccount(parsed.roleType) && normalizedProfileEmail && !existingUserForEmail) {
    const pwParsed = promoteInitialPasswordSchema.safeParse({
      initialPassword: toOptional(formData.get("initialPassword")),
      confirmInitialPassword: toOptional(formData.get("confirmInitialPassword")),
    });
    if (!pwParsed.success) {
      throw new Error(
        pwParsed.error.issues[0]?.message ??
          "Set an initial app password (and confirmation) to create the login for this role.",
      );
    }
    newAppLoginPasswordHash = await bcrypt.hash(pwParsed.data.initialPassword, 12);
  }

  const primaryUnitId = await validatePrimaryUnitId(
    session.facilityId,
    toOptional(formData.get("primaryUnitId")),
    mode,
    allowedUnitIds,
  );

  await prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId },
      include: { workStations: { select: { station: true } } },
    });
    if (!existing) {
      throw new Error("Employee not found.");
    }

    const beforeSnap = snapshotFromEmployeeRow(existing);
    const terminated = parsed.status === EmployeeStatus.TERMINATED;
    const afterSnap = snapshotFromProfileForm(
      { ...parsed, email: normalizedProfileEmail },
      hr,
      terminated,
    );

    await syncEmployeeUnitAccessTx(tx as unknown as UnitAccessTransaction, parsed.employeeId, session.facilityId, mode, allowedUnitIds);
    await syncEmployeeWorkStationsTx(tx, parsed.employeeId, hr.workStations);

    await tx.employee.update({
      where: { id: parsed.employeeId },
      data: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        email: normalizedProfileEmail,
        phone: parsed.phone,
        roleType: parsed.roleType,
        employmentType: parsed.employmentType,
        status: parsed.status,
        primaryUnitId,
        unionMember: hr.unionMember,
        onLeave: hr.onLeave,
        hireDate: hr.hireDate,
        birthMonth: hr.birthMonth,
        birthDay: hr.birthDay,
        jobClassification: hr.jobClassification,
        chrcStatus: hr.chrcStatus,
        chrcClearedAt: hr.chrcClearedAt,
        chrcNotes: hr.chrcNotes,
        shirtSize: hr.shirtSize,
        hrNotes: hr.hrNotes,
        ...(terminated
          ? {
              terminationDate: hr.terminationDate,
              chrcOffboardingCompletedAt: hr.chrcOffboardingCompletedAt,
              chrcOffboardingNotes: hr.chrcOffboardingNotes,
            }
          : {
              terminationDate: null,
              chrcOffboardingCompletedAt: null,
              chrcOffboardingNotes: null,
            }),
      } as Prisma.EmployeeUncheckedUpdateInput,
    });

    if (
      requiresEmailPasswordAccount(parsed.roleType) &&
      normalizedProfileEmail &&
      !existingUserForEmail &&
      newAppLoginPasswordHash
    ) {
      const roleRow = await tx.role.findFirst({
        where: { key: parsed.roleType, isActive: true },
        select: { id: true },
      });
      if (!roleRow) {
        throw new Error("Role configuration is missing for this facility.");
      }
      try {
        await tx.user.create({
          data: {
            email: normalizedProfileEmail,
            displayName: `${parsed.firstName} ${parsed.lastName}`,
            passwordHash: newAppLoginPasswordHash,
            facilityId: session.facilityId,
            roleId: roleRow.id,
            isActive: true,
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new Error("That email is already used by another app account.");
        }
        throw e;
      }
    } else if (requiresEmailPasswordAccount(parsed.roleType) && existingUserForEmail) {
      await tx.user.update({
        where: { id: existingUserForEmail.id },
        data: { displayName: `${parsed.firstName} ${parsed.lastName}` },
      });
    }

    const transitionToTerminated =
      existing.status !== EmployeeStatus.TERMINATED && parsed.status === EmployeeStatus.TERMINATED;

    if (transitionToTerminated) {
      const fresh = await tx.employee.findUnique({
        where: { id: parsed.employeeId },
        include: { workStations: { select: { station: true } } },
      });
      if (fresh) {
        const td = hr.terminationDate ?? new Date();
        const terminatedAt = new Date(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate()));
        await tx.employeeTerminationRecord.create({
          data: {
            facilityId: session.facilityId,
            employeeId: parsed.employeeId,
            terminatedAt,
            lastShiftWorkedAt: null,
            separationKind: SeparationKind.TERMINATED,
            wouldRehire: null,
            snapshotJson: buildTerminationSnapshotJson(fresh),
            createdByUserId: sessionUserIdForFk(session),
          },
        });
      }
    }

    const diffs = diffProfileForAudit(beforeSnap, afterSnap);
    const actorUserId = sessionUserIdForFk(session);
    if (diffs.length > 0) {
      await tx.employeeHrAuditLog.createMany({
        data: diffs.map((d) => ({
          facilityId: session.facilityId,
          employeeId: parsed.employeeId,
          userId: actorUserId,
          fieldKey: d.fieldKey,
          oldValue: d.oldValue,
          newValue: d.newValue,
        })),
      });
    }
  });

  revalidateEmployeeViews();
}

export async function setEmployeePinAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "GM");

  const parsed = setEmployeePinSchema.parse({
    employeeId: formData.get("employeeId"),
    pin: formData.get("pin"),
  });

  if (!isValidPinFormat(parsed.pin)) {
    throw new Error("PIN must be exactly 6 digits.");
  }

  const digest = pinDigestForFacility(session.facilityId, parsed.pin);

  const before = await prisma.employee.findFirst({
    where: { id: parsed.employeeId, facilityId: session.facilityId },
    select: { pinDigest: true },
  });
  if (!before) {
    throw new Error("Employee not found.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: parsed.employeeId, facilityId: session.facilityId },
        data: { pinDigest: digest },
      });
      await tx.employeeHrAuditLog.create({
        data: {
          facilityId: session.facilityId,
          employeeId: parsed.employeeId,
          userId: sessionUserIdForFk(session),
          fieldKey: "employee.pinDigest",
          oldValue: before.pinDigest ? "set" : "unset",
          newValue: "set",
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("That PIN is already assigned at this facility.");
    }
    throw e;
  }

  revalidateEmployeeViews();
}

export async function clearEmployeePinAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "GM");

  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) {
    throw new Error("Invalid employee.");
  }

  const before = await prisma.employee.findFirst({
    where: { id: employeeId, facilityId: session.facilityId },
    select: { pinDigest: true },
  });
  if (!before) {
    throw new Error("Employee not found.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId, facilityId: session.facilityId },
      data: { pinDigest: null },
    });
    await tx.employeeHrAuditLog.create({
      data: {
        facilityId: session.facilityId,
        employeeId,
        userId: sessionUserIdForFk(session),
        fieldKey: "employee.pinDigest",
        oldValue: before.pinDigest ? "set" : "unset",
        newValue: "unset",
      },
    });
  });

  revalidateEmployeeViews();
}

export async function updateEmployeeStatusAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const employeeId = String(formData.get("employeeId") ?? "");
  const status = String(formData.get("status") ?? "") as EmployeeStatus;
  if (!employeeId || !statusValues.includes(status)) {
    throw new Error("Invalid employee status update.");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id: employeeId, facilityId: session.facilityId },
      include: { workStations: { select: { station: true } } },
    });
    if (!existing) {
      throw new Error("Employee not found.");
    }

    await tx.employee.update({
      where: { id: employeeId },
      data: {
        status,
        ...(status === EmployeeStatus.TERMINATED
          ? {}
          : {
              terminationDate: null,
              chrcOffboardingCompletedAt: null,
              chrcOffboardingNotes: null,
            }),
      },
    });

    const transitionToTerminated =
      existing.status !== EmployeeStatus.TERMINATED && status === EmployeeStatus.TERMINATED;

    if (transitionToTerminated) {
      const fresh = await tx.employee.findUnique({
        where: { id: employeeId },
        include: { workStations: { select: { station: true } } },
      });
      if (fresh) {
        const td = new Date();
        const terminatedAt = new Date(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate()));
        await tx.employeeTerminationRecord.create({
          data: {
            facilityId: session.facilityId,
            employeeId,
            terminatedAt,
            lastShiftWorkedAt: null,
            separationKind: SeparationKind.TERMINATED,
            wouldRehire: null,
            snapshotJson: buildTerminationSnapshotJson(fresh),
            createdByUserId: sessionUserIdForFk(session),
          },
        });
      }
    }

    if (existing.status !== status) {
      await tx.employeeHrAuditLog.create({
        data: {
          facilityId: session.facilityId,
          employeeId,
          userId: sessionUserIdForFk(session),
          fieldKey: "profile.status",
          oldValue: existing.status,
          newValue: status,
        },
      });
    }
  });

  revalidateEmployeeViews();
}

const recordSeparationSchema = z.object({
  employeeId: z.string().cuid(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lastShiftWorked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  separationKind: z.enum(["RESIGNED", "TERMINATED"]),
  wouldRehire: z.enum(["yes", "no"]),
});

function utcDateOnlyFromIsoDate(iso: string): Date {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** End employment from the Separations log: roster pick + dates + resignation vs termination + rehire flag. */
export async function recordEmployeeSeparationAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = recordSeparationSchema.parse({
    employeeId: formData.get("employeeId"),
    terminationDate: formData.get("terminationDate"),
    lastShiftWorked: formData.get("lastShiftWorked"),
    separationKind: formData.get("separationKind"),
    wouldRehire: formData.get("wouldRehire"),
  });

  const kind =
    parsed.separationKind === "RESIGNED" ? SeparationKind.RESIGNED : SeparationKind.TERMINATED;
  const wouldRehire = parsed.wouldRehire === "yes";

  await prisma.$transaction(async (tx) => {
    const existing = await tx.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId },
      include: { workStations: { select: { station: true } } },
    });
    if (!existing) {
      throw new Error("Employee not found.");
    }
    if (existing.status === EmployeeStatus.TERMINATED) {
      throw new Error("This employee is already terminated. Edit their profile if you need to change dates.");
    }

    const terminatedAt = utcDateOnlyFromIsoDate(parsed.terminationDate);
    const lastShiftWorkedAt = utcDateOnlyFromIsoDate(parsed.lastShiftWorked);

    await tx.employee.update({
      where: { id: parsed.employeeId },
      data: {
        status: EmployeeStatus.TERMINATED,
        terminationDate: terminatedAt,
        onLeave: false,
      },
    });

    const fresh = await tx.employee.findUnique({
      where: { id: parsed.employeeId },
      include: { workStations: { select: { station: true } } },
    });
    if (!fresh) {
      throw new Error("Employee not found after update.");
    }

    const lastShiftIso = parsed.lastShiftWorked;
    await tx.employeeTerminationRecord.create({
      data: {
        facilityId: session.facilityId,
        employeeId: parsed.employeeId,
        terminatedAt,
        lastShiftWorkedAt,
        separationKind: kind,
        wouldRehire,
        snapshotJson: buildTerminationSnapshotJson(fresh, {
          separationKind: kind,
          lastShiftWorkedAtIso: lastShiftIso,
          wouldRehire,
        }),
        createdByUserId: sessionUserIdForFk(session),
      },
    });

    const actorUserId = sessionUserIdForFk(session);
    await tx.employeeHrAuditLog.create({
      data: {
        facilityId: session.facilityId,
        employeeId: parsed.employeeId,
        userId: actorUserId,
        fieldKey: "profile.status",
        oldValue: existing.status,
        newValue: EmployeeStatus.TERMINATED,
      },
    });
  });

  revalidateEmployeeViews();
}

export async function setDefaultAssignmentAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = setDefaultAssignmentSchema.parse({
    employeeId: formData.get("employeeId"),
    unitId: formData.get("unitId"),
    roleType: formData.get("roleType"),
    isActive: formData.get("isActive") === "on",
  });

  const [employee, unit] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId },
      select: { id: true },
    }),
    prisma.unit.findFirst({
      where: { id: parsed.unitId, facilityId: session.facilityId },
      select: { id: true },
    }),
  ]);
  if (!employee || !unit) {
    throw new Error("Employee or unit not found.");
  }

  await prisma.defaultAssignment.create({
    data: {
      employeeId: parsed.employeeId,
      unitId: parsed.unitId,
      roleType: parsed.roleType,
      isActive: parsed.isActive,
    },
  });

  revalidateEmployeeViews();
}

const disciplinePointCategoryValues = [
  DisciplinePointCategory.ATTENDANCE,
  DisciplinePointCategory.PERFORMANCE,
] as const;

const addDisciplinePointSchema = z.object({
  employeeId: z.string().cuid(),
  category: z.enum(disciplinePointCategoryValues),
  points: z.coerce.number().int().min(1).max(999),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(5000).optional(),
});

export async function addDisciplinePointEntryAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = addDisciplinePointSchema.parse({
    employeeId: formData.get("employeeId"),
    category: formData.get("category"),
    points: formData.get("points"),
    occurredAt: formData.get("occurredAt"),
    note: toOptional(formData.get("note")),
  });

  const employee = await prisma.employee.findFirst({
    where: { id: parsed.employeeId, facilityId: session.facilityId },
    select: { id: true, unionMember: true },
  });
  if (!employee) {
    throw new Error("Employee not found.");
  }
  if (!employee.unionMember) {
    throw new Error("Discipline points only apply to union members.");
  }

  await prisma.disciplinePointEntry.create({
    data: {
      employeeId: parsed.employeeId,
      category: parsed.category,
      points: parsed.points,
      occurredAt: new Date(`${parsed.occurredAt}T12:00:00.000Z`),
      note: parsed.note ?? null,
      createdById: sessionUserIdForFk(session),
    },
  });

  revalidateEmployeeViews();
}

export async function deleteDisciplinePointEntryAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const entryId = String(formData.get("entryId") ?? "").trim();
  if (!entryId) {
    throw new Error("Invalid entry.");
  }

  const entry = await prisma.disciplinePointEntry.findFirst({
    where: { id: entryId, employee: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!entry) {
    throw new Error("Entry not found.");
  }

  await prisma.disciplinePointEntry.delete({ where: { id: entryId } });

  revalidateEmployeeViews();
}
