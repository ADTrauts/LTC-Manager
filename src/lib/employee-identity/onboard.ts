import { EmployeeStatus, type EmploymentType, Prisma, type PrismaClient, type RoleKey } from "@prisma/client";

import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { mayAuthenticateWithQuickPin } from "@/lib/credential-policy";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";

import { isGlobalAccountActivated } from "./activation";
import { findExistingUserByEmail } from "./invitations";
import { restoreInternalAccessForRehire } from "./lifecycle";
import { EmployeeIdentityError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type EmployeeAccountPreview = {
  exists: boolean;
  activated: boolean;
  displayName: string;
  email: string;
};

export type OnboardFacilityEmployeeInput = {
  facilityId: string;
  actorUserId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  roleType: RoleKey;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  pinDigest?: string | null;
  /** Explicit pending enrollment for reviewed, email-backed bulk onboarding only.
   * No PIN is generated. Normal creation still requires a real eligible PIN. */
  pendingPinEnrollment?: boolean;
  confirmExistingUser: boolean;
  extras?: Partial<Prisma.EmployeeUncheckedCreateInput>;
};

export type OnboardFacilityEmployeeResult = {
  employeeId: string;
  userId: string;
  userCreated: boolean;
  userActivated: boolean;
  reusedExistingUser: boolean;
};

export async function previewEmployeeAccount(
  db: DbClient,
  email: string,
): Promise<EmployeeAccountPreview> {
  const normalized = normalizeAccountIdentifier(email);
  if (!normalized || !normalized.includes("@")) {
    throw new EmployeeIdentityError("CONFLICT", "Enter a valid email.");
  }
  const user = await db.user.findUnique({
    where: { email: normalized },
    select: {
      displayName: true,
      email: true,
      isActive: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  });
  if (!user) {
    return { exists: false, activated: false, displayName: "", email: normalized };
  }
  if (!user.isActive) {
    throw new EmployeeIdentityError("USER_INACTIVE", "That Vssyl account is inactive.");
  }
  return {
    exists: true,
    activated: isGlobalAccountActivated(user),
    displayName: user.displayName,
    email: user.email,
  };
}

export async function onboardFacilityEmployee(
  db: DbClient,
  input: OnboardFacilityEmployeeInput,
): Promise<OnboardFacilityEmployeeResult> {
  const email = normalizeAccountIdentifier(input.email);
  if (!email || !email.includes("@")) {
    throw new EmployeeIdentityError("CONFLICT", "Email is required.");
  }
  if (mayAuthenticateWithQuickPin(input.roleType) && !input.pinDigest && input.pendingPinEnrollment !== true) {
    throw new EmployeeIdentityError("CONFLICT", "PIN is required for this role.");
  }

  // Serialize canonical creation/reuse with imports and concurrent manual creates.
  if (typeof db.$queryRaw === "function") {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "Facility" WHERE "id"=${input.facilityId} FOR UPDATE`);
  }

  const role = await db.role.findFirst({
    where: { key: input.roleType, isActive: true },
    select: { id: true, key: true },
  });
  if (!role) {
    throw new EmployeeIdentityError("CONFLICT", "System roles are not initialized yet.");
  }

  let existingUser = await findExistingUserByEmail(db, email);
  if (existingUser && !existingUser.isActive) {
    throw new EmployeeIdentityError("USER_INACTIVE", "That Vssyl account is inactive.");
  }

  const previewUser = existingUser
    ? await db.user.findUnique({
        where: { id: existingUser.id },
        select: {
          id: true,
          email: true,
          displayName: true,
          isActive: true,
          passwordHash: true,
          emailVerifiedAt: true,
          facilityId: true,
        },
      })
    : null;

  if (previewUser && !input.confirmExistingUser) {
    throw new EmployeeIdentityError(
      "EXISTING_USER",
      "This existing Vssyl account will be added to this Facility.",
    );
  }

  const existingEmployee = await db.employee.findFirst({
    where: {
      facilityId: input.facilityId,
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        ...(previewUser ? [{ userId: previewUser.id }] : []),
      ],
    },
    select: { id: true, status: true, userId: true },
  });
  if (existingEmployee?.status === EmployeeStatus.ACTIVE || existingEmployee?.status === EmployeeStatus.OFF) {
    throw new EmployeeIdentityError("CONFLICT", "An employee with this email already exists at this Facility.");
  }
  if (existingEmployee?.userId && previewUser && existingEmployee.userId !== previewUser.id) {
    throw new EmployeeIdentityError("ALREADY_LINKED", "This employee is already connected to a different account.");
  }

  let userId = previewUser?.id ?? "";
  let userCreated = false;

  if (!previewUser) {
    try {
      const created = await db.user.create({
        data: {
          email,
          displayName: `${input.firstName} ${input.lastName}`.trim(),
          passwordHash: null,
          emailVerifiedAt: null,
          isActive: true,
          facilityId: input.facilityId,
          roleId: role.id,
        },
        select: { id: true },
      });
      userId = created.id;
      userCreated = true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await findExistingUserByEmail(db, email);
        if (!raced?.isActive) {
          throw new EmployeeIdentityError("CONFLICT", "A Vssyl account already exists for this email.");
        }
        if (!input.confirmExistingUser) {
          throw new EmployeeIdentityError(
            "EXISTING_USER",
            "This existing Vssyl account will be added to this Facility.",
          );
        }
        userId = raced.id;
        existingUser = raced;
      } else {
        throw error;
      }
    }
  }

  const employeeData = {
    ...(input.extras ?? {}),
    facilityId: input.facilityId,
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone: input.phone ?? null,
    roleType: input.roleType,
    employmentType: input.employmentType,
    status: input.status === EmployeeStatus.TERMINATED ? EmployeeStatus.ACTIVE : input.status,
    userId,
    pinDigest: mayAuthenticateWithQuickPin(input.roleType) ? input.pinDigest ?? null : null,
    terminationDate: null,
  } satisfies Prisma.EmployeeUncheckedCreateInput;

  let employeeId: string;
  if (existingEmployee) {
    const updated = await db.employee.update({
      where: { id: existingEmployee.id },
      data: employeeData,
      select: { id: true },
    });
    employeeId = updated.id;
    await restoreInternalAccessForRehire(db, {
      userId,
      facilityId: input.facilityId,
      roleKey: input.roleType,
      grantedByUserId: input.actorUserId,
    });
  } else {
    const created = await db.employee.create({
      data: employeeData,
      select: { id: true },
    });
    employeeId = created.id;
    await ensureUserFacilityAccessGrant(db, {
      userId,
      facilityId: input.facilityId,
      grantedByUserId: input.actorUserId,
      roleKey: input.roleType,
    });
  }

  const activatedUser = previewUser
    ? previewUser
    : await db.user.findUnique({
        where: { id: userId },
        select: { isActive: true, passwordHash: true, emailVerifiedAt: true },
      });

  return {
    employeeId,
    userId,
    userCreated,
    userActivated: activatedUser ? isGlobalAccountActivated(activatedUser) : false,
    reusedExistingUser: !userCreated,
  };
}
