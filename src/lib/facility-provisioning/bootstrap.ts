import { initialFacilityOnboarding } from "@/lib/onboarding/transitions";
import { EmployeeStatus, EmploymentType, type OrganizationType, type PrismaClient } from "@prisma/client";

import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";
import { createOrganizationForNewFacility } from "@/lib/organization";
import { rosterNameFromSignupDisplayName } from "@/lib/roster-name";
import { initialFacilityCreatorRoles } from "@/lib/signup-facility-creator";

import { FacilityProvisioningError } from "./errors";
import { DEFAULT_FACILITY_TIMEZONE, isValidFacilityTimezone } from "./timezones";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type FacilityBootstrapOrganizationInput =
  | {
      mode: "create";
      facilityName: string;
      managementCompanyName?: string | null;
      organizationName?: string | null;
      organizationType?: OrganizationType | null;
    }
  | { mode: "existing"; organizationId: string };

export type FacilityBootstrapAdministratorInput =
  | {
      mode: "create";
      email: string;
      displayName: string;
      passwordHash: string | null;
      emailVerifiedAt: Date | null;
    }
  | { mode: "reuse"; userId: string };

export type FacilityBootstrapInput = {
  organization: FacilityBootstrapOrganizationInput;
  facility: {
    displayName: string;
    billingEmail: string;
    timezone?: string;
    managementCompanyName?: string | null;
  };
  administrator: FacilityBootstrapAdministratorInput;
};

export type FacilityBootstrapResult = {
  organization: { id: string; name: string; created: boolean };
  facility: { id: string; displayName: string; created: boolean };
  user: { id: string; email: string; displayName: string; created: boolean };
  replayed: boolean;
};

export async function bootstrapFacilityCustomer(
  db: DbClient,
  input: FacilityBootstrapInput,
): Promise<FacilityBootstrapResult> {
  const displayName = input.facility.displayName.trim();
  const billingEmail = input.facility.billingEmail.trim().toLowerCase();
  const timezone = (input.facility.timezone ?? DEFAULT_FACILITY_TIMEZONE).trim();
  if (displayName.length < 2) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Facility name is required.");
  }
  if (!billingEmail.includes("@")) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Billing email is required.");
  }
  if (!isValidFacilityTimezone(timezone)) {
    throw new FacilityProvisioningError("INVALID_TIMEZONE", "Choose a valid facility timezone.");
  }

  const creatorRoles = initialFacilityCreatorRoles();
  const creatorUserRole = await db.role.findUnique({
    where: { key: creatorRoles.userRoleKey },
    select: { id: true, key: true },
  });
  if (!creatorUserRole) {
    throw new FacilityProvisioningError("ROLE_MISSING", "System roles are not initialized yet.");
  }

  const organization = await resolveOrganization(db, input.organization, displayName);
  const administrator = await resolveAdministrator(db, input.administrator);

  const replay = await findExactProvisionReplay(db, {
    organizationId: organization.id,
    displayName,
    userId: administrator.id,
  });
  if (replay) {
    return {
      organization: { id: organization.id, name: organization.name, created: organization.created },
      facility: { id: replay.id, displayName: replay.displayName, created: false },
      user: {
        id: administrator.id,
        email: administrator.email,
        displayName: administrator.displayName,
        created: false,
      },
      replayed: true,
    };
  }

  const now = new Date();
  const facility = await db.facility.create({
    data: {
      displayName,
      managementCompanyName: input.facility.managementCompanyName ?? null,
      organizationId: organization.id,
      billingEmail,
      timezone,
      ...initialFacilityOnboarding(now),
    },
    select: { id: true, displayName: true },
  });

  let userId = administrator.id;
  let userEmail = administrator.email;
  let userDisplayName = administrator.displayName;
  let userCreated = false;

  if (input.administrator.mode === "create") {
    const createdUser = await db.user.create({
      data: {
        facilityId: facility.id,
        roleId: creatorUserRole.id,
        displayName: input.administrator.displayName.trim(),
        email: input.administrator.email.trim().toLowerCase(),
        passwordHash: input.administrator.passwordHash,
        isActive: true,
        emailVerifiedAt: input.administrator.emailVerifiedAt,
      },
      select: { id: true, email: true, displayName: true },
    });
    userId = createdUser.id;
    userEmail = createdUser.email;
    userDisplayName = createdUser.displayName;
    userCreated = true;
  }

  await ensureUserFacilityAccessGrant(db, {
    userId,
    facilityId: facility.id,
    roleKey: creatorUserRole.key,
  });

  const { firstName, lastName } = rosterNameFromSignupDisplayName(userDisplayName);
  await db.employee.create({
    data: {
      facilityId: facility.id,
      firstName,
      lastName,
      email: userEmail,
      userId,
      roleType: creatorRoles.employeeRoleType,
      status: EmployeeStatus.ACTIVE,
      employmentType: EmploymentType.FULL_TIME,
    },
  });

  return {
    organization: { id: organization.id, name: organization.name, created: organization.created },
    facility: { id: facility.id, displayName: facility.displayName, created: true },
    user: { id: userId, email: userEmail, displayName: userDisplayName, created: userCreated },
    replayed: false,
  };
}

async function resolveOrganization(
  db: DbClient,
  input: FacilityBootstrapOrganizationInput,
  facilityDisplayName: string,
): Promise<{ id: string; name: string; created: boolean }> {
  if (input.mode === "existing") {
    const organization = await db.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true, displayName: true, isActive: true },
    });
    if (!organization) {
      throw new FacilityProvisioningError("ORGANIZATION_NOT_FOUND", "Organization not found.");
    }
    if (!organization.isActive) {
      throw new FacilityProvisioningError("ORGANIZATION_INACTIVE", "Organization is inactive.");
    }
    return {
      id: organization.id,
      name: organization.displayName?.trim() || organization.name,
      created: false,
    };
  }

  const created = await createOrganizationForNewFacility(db, {
    facilityName: input.facilityName || facilityDisplayName,
    managementCompanyName: input.managementCompanyName,
    organizationName: input.organizationName,
    organizationType: input.organizationType,
  });
  return { ...created, created: true };
}

async function resolveAdministrator(
  db: DbClient,
  input: FacilityBootstrapAdministratorInput,
): Promise<{ id: string; email: string; displayName: string }> {
  if (input.mode === "create") {
    return {
      id: "",
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
    };
  }

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, displayName: true, isActive: true },
  });
  if (!user) {
    throw new FacilityProvisioningError("INVALID_INPUT", "Administrator account was not found.");
  }
  if (!user.isActive) {
    throw new FacilityProvisioningError("USER_INACTIVE", "That Vssyl account is inactive.");
  }
  return user;
}

export async function findExactProvisionReplay(
  db: DbClient,
  input: { organizationId: string; displayName: string; userId: string },
): Promise<{ id: string; displayName: string } | null> {
  if (!input.userId) return null;
  const now = new Date();
  const matches = await db.facility.findMany({
    where: {
      organizationId: input.organizationId,
      displayName: input.displayName,
      onboardingCompletedAt: null,
    },
    select: {
      id: true,
      displayName: true,
      userFacilityAccesses: {
        where: { userId: input.userId, isActive: true, revokedAt: null },
        select: {
          rolePeriods: {
            select: { roleKey: true, startsAt: true, endsAt: true },
          },
        },
      },
    },
  });

  return (
    matches.find((facility) =>
      facility.userFacilityAccesses.some((access) =>
        access.rolePeriods.some(
          (period) =>
            period.roleKey === "FACILITY_ADMINISTRATOR" &&
            period.startsAt <= now &&
            (period.endsAt == null || period.endsAt > now),
        ),
      ),
    ) ?? null
  );
}

export async function findSiblingFacilitiesWithName(
  db: DbClient,
  input: { organizationId: string; displayName: string },
): Promise<Array<{ id: string; displayName: string }>> {
  return db.facility.findMany({
    where: { organizationId: input.organizationId, displayName: input.displayName },
    select: { id: true, displayName: true },
  });
}
