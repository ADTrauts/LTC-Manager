import type { Prisma, PrismaClient } from "@prisma/client";

import {
  createAccountSessionToken,
  createOrganizationSessionToken,
  createPartnerFacilitySessionToken,
  createSessionToken,
} from "@/lib/auth";
import {
  internalRoleKeyAsAppRole,
  resolveCurrentInternalFacilityRole,
} from "@/lib/facility-access/internal-facility-role";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { getCurrentOrganizationRole } from "@/lib/organization-membership";
import { resolveFacilityAuthorization } from "@/lib/partner-user-access";

import { parseContextKey } from "./parse";
import { ContextEntryError, type EnterAccountContextResult, type EnterContextResult } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

type UserIdentityRow = {
  id: string;
  isActive: boolean;
  sessionVersion: number;
  displayName: string;
  email: string | null;
};

export type EnterContextInput = {
  userId: string;
  contextKey: string;
  now?: Date;
  sessionVersion?: number;
};

export type EnterAccountContextInput = {
  userId: string;
  sessionVersion?: number;
};

async function loadUserIdentity(db: DbClient, userId: string): Promise<UserIdentityRow> {
  if (!userId.trim()) {
    throw new ContextEntryError("USER_NOT_FOUND", "User not found.");
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      sessionVersion: true,
      displayName: true,
      email: true,
    },
  });
  if (!user) {
    throw new ContextEntryError("USER_NOT_FOUND", "User not found.");
  }
  if (!user.isActive) {
    throw new ContextEntryError("USER_INACTIVE", "User is inactive.");
  }
  if (!user.email) {
    throw new ContextEntryError("USER_INACTIVE", "User is inactive.");
  }
  return user;
}

function assertSessionVersion(user: UserIdentityRow, sessionVersion: number | undefined): void {
  if (typeof sessionVersion === "number" && user.sessionVersion !== sessionVersion) {
    throw new ContextEntryError("SESSION_VERSION_STALE", "Session is no longer valid.");
  }
}

async function enterOrganizationContext(
  db: DbClient,
  input: { user: UserIdentityRow; organizationId: string; now?: Date },
): Promise<EnterContextResult> {
  const role = await getCurrentOrganizationRole(db, {
    userId: input.user.id,
    organizationId: input.organizationId,
    now: input.now,
  });
  if (!role) {
    throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
  }

  const token = await createOrganizationSessionToken({
    uid: input.user.id,
    name: input.user.displayName,
    email: input.user.email!,
    organizationId: input.organizationId,
    sessionVersion: input.user.sessionVersion,
  });

  return {
    token,
    redirectPath: `/organization/${input.organizationId}`,
    kind: "organization",
    organizationId: input.organizationId,
  };
}

async function enterInternalFacilityContext(
  db: DbClient,
  input: { user: UserIdentityRow; facilityId: string; now?: Date },
): Promise<EnterContextResult> {
  const resolved = await resolveCurrentInternalFacilityRole(db, {
    userId: input.user.id,
    facilityId: input.facilityId,
    instant: input.now,
  });
  if (!resolved) {
    throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
  }

  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { id: true, organization: { select: { isActive: true } } },
  });
  if (!facility?.organization.isActive) {
    throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
  }

  const role = internalRoleKeyAsAppRole(resolved.roleKey);
  const token = await createSessionToken({
    uid: input.user.id,
    authKind: "user",
    role,
    name: input.user.displayName,
    email: input.user.email!,
    facilityId: facility.id,
    sessionVersion: input.user.sessionVersion,
  });

  return {
    token,
    redirectPath: resolveDefaultHomePath({ authKind: "user", role }),
    kind: "facility_internal",
    facilityId: facility.id,
    role,
  };
}

async function enterPartnerFacilityContext(
  db: DbClient,
  input: { user: UserIdentityRow; facilityPartnerOrganizationId: string; now?: Date },
): Promise<EnterContextResult> {
  const partnership = await db.facilityPartnerOrganization.findUnique({
    where: { id: input.facilityPartnerOrganizationId },
    select: { id: true, facilityId: true, organizationId: true },
  });
  if (!partnership) {
    throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
  }

  const resolved = await resolveFacilityAuthorization(db, {
    userId: input.user.id,
    facilityId: partnership.facilityId,
    accessKind: "partner",
    facilityPartnerOrganizationId: partnership.id,
    instant: input.now,
  });
  if (
    resolved.authorization.path !== "partner" ||
    resolved.authorization.facilityId !== partnership.facilityId ||
    resolved.authorization.partnerOrganizationId !== partnership.organizationId ||
    resolved.authorization.facilityPartnerOrganizationId !== partnership.id ||
    resolved.authorization.allowedDepartmentIds.length === 0
  ) {
    throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
  }

  const token = await createPartnerFacilitySessionToken({
    uid: input.user.id,
    name: input.user.displayName,
    email: input.user.email!,
    facilityId: resolved.authorization.facilityId,
    partnerOrganizationId: resolved.authorization.partnerOrganizationId,
    facilityPartnerOrganizationId: resolved.authorization.facilityPartnerOrganizationId,
    sessionVersion: input.user.sessionVersion,
  });

  return {
    token,
    redirectPath: "/partner",
    kind: "facility_partner",
    facilityId: resolved.authorization.facilityId,
    partnerOrganizationId: resolved.authorization.partnerOrganizationId,
    facilityPartnerOrganizationId: resolved.authorization.facilityPartnerOrganizationId,
    allowedDepartmentIds: resolved.authorization.allowedDepartmentIds,
  };
}

/**
 * Live-validate one requested workspace and mint an exclusive session for it.
 * Does not list available contexts. Source session kind is irrelevant.
 */
export async function enterContext(
  db: DbClient,
  input: EnterContextInput,
): Promise<EnterContextResult> {
  const parsed = parseContextKey(input.contextKey);
  const user = await loadUserIdentity(db, input.userId);
  assertSessionVersion(user, input.sessionVersion);

  if (parsed.kind === "organization") {
    return enterOrganizationContext(db, {
      user,
      organizationId: parsed.organizationId,
      now: input.now,
    });
  }
  if (parsed.kind === "facility_internal") {
    return enterInternalFacilityContext(db, {
      user,
      facilityId: parsed.facilityId,
      now: input.now,
    });
  }
  return enterPartnerFacilityContext(db, {
    user,
    facilityPartnerOrganizationId: parsed.facilityPartnerOrganizationId,
    now: input.now,
  });
}

/**
 * Leave the current workspace while remaining the same authenticated User.
 * No context relationship is required.
 */
export async function enterAccountContext(
  db: DbClient,
  input: EnterAccountContextInput,
): Promise<EnterAccountContextResult> {
  const user = await loadUserIdentity(db, input.userId);
  assertSessionVersion(user, input.sessionVersion);
  const token = await createAccountSessionToken({
    uid: user.id,
    name: user.displayName,
    email: user.email!,
    sessionVersion: user.sessionVersion,
  });
  return { token, redirectPath: "/access", kind: "account" };
}
