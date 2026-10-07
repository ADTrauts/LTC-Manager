import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";

import { OrganizationMembershipError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Trusted foundation for creating an organization-only User account.
 * Does not create a Facility, RoleKey, or membership.
 * Invitation/claim acceptance (2B2/2B3) should call this then start a role period.
 */
export async function createOrganizationOnlyUserAccount(
  db: DbClient,
  input: {
    email: string;
    displayName: string;
    passwordHash?: string | null;
    emailVerifiedAt?: Date | null;
  },
): Promise<{ id: string; email: string; displayName: string }> {
  const email = normalizeAccountIdentifier(input.email);
  const displayName = input.displayName.trim();
  if (!email || displayName.length < 1) {
    throw new OrganizationMembershipError("INVALID_INPUT", "Email and display name are required.");
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new OrganizationMembershipError(
      "INVALID_INPUT",
      "A User with this email already exists.",
    );
  }

  const created = await db.user.create({
    data: {
      email,
      displayName,
      passwordHash: input.passwordHash ?? null,
      facilityId: null,
      roleId: null,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      isActive: true,
    },
    select: { id: true, email: true, displayName: true },
  });

  return created;
}

/** Rejects facility RoleKey without home Facility, and home Facility without RoleKey. */
export function assertValidUserIdentityShape(input: {
  facilityId: string | null | undefined;
  roleId: string | null | undefined;
}): void {
  const hasFacility = Boolean(input.facilityId);
  const hasRole = Boolean(input.roleId);
  if (hasFacility !== hasRole) {
    throw new OrganizationMembershipError(
      "INVALID_USER_IDENTITY",
      "Facility-native Users require both home Facility and Facility RoleKey; organization-only Users require neither.",
    );
  }
}
