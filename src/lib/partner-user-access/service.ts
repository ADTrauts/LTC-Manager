import {
  Prisma,
  type OrganizationPartnerRole,
  type PrismaClient,
  type RoleKey,
} from "@prisma/client";

import { findPeriodContainingInstant, periodContainsInstant, periodsOverlap } from "@/lib/partner-access";
import { trackEvent } from "@/lib/telemetry";

import { isPartnerRoleAtOrBelow, minPartnerRole } from "./roles";
import {
  PartnerUserAccessError,
  UNVERSIONED_AUTHORIZATION_FACTS,
  type FacilityAuthorizationResult,
  type InternalFacilityAuthorization,
  type PartnerAssignmentAuthorityKind,
  type PartnerAssignmentMemberView,
  type PartnerAssignmentMutationAuthority,
  type PartnerFacilityAuthorization,
  type PartnerRoleHistoryRow,
  type PartnerRolePeriodView,
  type PartnerUserAccessAdminView,
  type PartnerUserRolePeriodEndReason,
  type RoleCeilingPeriodView,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

type ActorContext = {
  actorUserId: string;
  partnershipId: string;
  facilityId: string;
  /**
   * Omitted callers are Facility administrators.
   * partner_org_admin is accepted only for assignment mutations, and only inside the locked transaction.
   */
  authority?: PartnerAssignmentMutationAuthority;
};

const FACILITY_CREATED_AUTHORITY = {
  createdByAuthorityKind: "facility_admin" as const,
  createdByOrganizationId: null,
};

function facilityEndedAuthority(actorUserId: string) {
  return {
    endedByUserId: actorUserId,
    endedByAuthorityKind: "facility_admin" as const,
    endedByOrganizationId: null,
  };
}

function creationProvenance(input: ActorContext, organizationId: string) {
  if (input.authority?.kind === "partner_org_admin") {
    return {
      createdByAuthorityKind: "partner_org_admin" as const,
      createdByOrganizationId: organizationId,
    };
  }
  return FACILITY_CREATED_AUTHORITY;
}

function endingProvenance(input: ActorContext, organizationId: string) {
  if (input.authority?.kind === "partner_org_admin") {
    return {
      endedByUserId: input.actorUserId,
      endedByAuthorityKind: "partner_org_admin" as const,
      endedByOrganizationId: organizationId,
    };
  }
  return facilityEndedAuthority(input.actorUserId);
}

function assertFacilityOnlyWriter(authority: PartnerAssignmentMutationAuthority | undefined) {
  if (authority?.kind === "partner_org_admin") {
    throw new PartnerUserAccessError(
      "PARTNER_STAFFING_NOT_ENABLED",
      "Organization administrators cannot change Facility staffing policy or user restrictions.",
    );
  }
}

function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

async function lockPartnership(db: DbClient, partnershipId: string): Promise<void> {
  const client = db as PrismaClient;
  if (typeof client.$queryRaw !== "function") {
    throw new PartnerUserAccessError(
      "INVALID_INPUT",
      "Partner authorization mutations require a client that can lock the partnership row.",
    );
  }
  const rows = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "FacilityPartnerOrganization" WHERE "id" = ${partnershipId} FOR UPDATE`,
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new PartnerUserAccessError("PARTNERSHIP_NOT_FOUND", "Partner relationship not found.");
  }
}

function assertNoOverlap(
  periods: Array<{ startsAt: Date; endsAt: Date | null }>,
  message: string,
): void {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i]!, periods[j]!)) {
        throw new PartnerUserAccessError("OVERLAPPING_PERIOD", message);
      }
    }
  }
}

async function assertFacilityAdministrator(
  db: DbClient,
  input: ActorContext,
): Promise<void> {
  const actor = await db.user.findUnique({
    where: { id: input.actorUserId },
    select: {
      isActive: true,
      facilityId: true,
      role: { select: { key: true, isActive: true } },
      facilityAccesses: {
        where: { facilityId: input.facilityId, isActive: true, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  const isAdmin =
    actor?.isActive === true &&
    actor.role?.isActive === true &&
    actor.role.key === "FACILITY_ADMINISTRATOR" &&
    (actor.facilityId === input.facilityId || actor.facilityAccesses.length > 0);
  if (!isAdmin) {
    throw new PartnerUserAccessError(
      "NOT_FACILITY_ADMINISTRATOR",
      "Only a Facility Administrator for this Facility may manage partner user access.",
    );
  }
}

async function loadPartnership(
  db: DbClient,
  input: { partnershipId: string; facilityId: string },
) {
  const row = await db.facilityPartnerOrganization.findFirst({
    where: { id: input.partnershipId, facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      organizationId: true,
      endedAt: true,
      organization: { select: { id: true, isActive: true } },
    },
  });
  if (!row) {
    throw new PartnerUserAccessError(
      "PARTNERSHIP_NOT_FOUND",
      "Partner relationship not found for this Facility.",
    );
  }
  return row;
}

function toCeilingView(row: {
  id: string;
  facilityPartnerOrganizationId: string;
  maxPartnerRole: OrganizationPartnerRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
}): RoleCeilingPeriodView {
  return {
    id: row.id,
    facilityPartnerOrganizationId: row.facilityPartnerOrganizationId,
    maxPartnerRole: row.maxPartnerRole,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
  };
}

function toRolePeriodView(row: {
  id: string;
  partnerUserFacilityAccessId: string;
  partnerRole: OrganizationPartnerRole;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdByAuthorityKind: PartnerAssignmentAuthorityKind;
  createdByOrganizationId: string | null;
  endedByAuthorityKind: PartnerAssignmentAuthorityKind | null;
  endedByOrganizationId: string | null;
  endReason?: PartnerUserRolePeriodEndReason | null;
}): PartnerRolePeriodView {
  if (row.endsAt && !row.endedByAuthorityKind) {
    throw new PartnerUserAccessError(
      "INVALID_INPUT",
      "A closed partner role period must record ending authority.",
    );
  }
  if (!row.endsAt && row.endReason) {
    throw new PartnerUserAccessError(
      "INVALID_INPUT",
      "An open partner role period cannot record an end reason.",
    );
  }
  return {
    id: row.id,
    partnerUserFacilityAccessId: row.partnerUserFacilityAccessId,
    partnerRole: row.partnerRole,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
    createdByAuthorityKind: row.createdByAuthorityKind,
    createdByOrganizationId: row.createdByOrganizationId,
    endedByAuthorityKind: row.endedByAuthorityKind,
    endedByOrganizationId: row.endedByOrganizationId,
    endReason: row.endReason ?? null,
  };
}

/**
 * Close one current partner role period.
 * Does not check staffing policy, ceiling, scope, partnership access, or restrictions,
 * and does not delete the assignment identity or open a Facility restriction.
 */
async function closeCurrentPartnerUserRolePeriod(
  db: DbClient,
  input: {
    rolePeriodId: string;
    endsAt: Date;
    endedByUserId: string | null;
    endedByAuthorityKind: PartnerAssignmentAuthorityKind;
    endedByOrganizationId: string | null;
    endReason: PartnerUserRolePeriodEndReason;
  },
) {
  return db.partnerUserRolePeriod.update({
    where: { id: input.rolePeriodId },
    data: {
      endsAt: input.endsAt,
      endedByUserId: input.endedByUserId,
      endedByAuthorityKind: input.endedByAuthorityKind,
      endedByOrganizationId: input.endedByOrganizationId,
      endReason: input.endReason,
    },
  });
}

/**
 * Close every current personal assignment for one User through one Organization.
 * Caller must already hold the Organization row lock. This locks that Organization's
 * partnership rows in id order, then closes open role periods at the membership instant.
 */
export async function closeCurrentPartnerAssignmentsForOrganizationMembership(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    endsAt: Date;
    actorUserId: string | null;
  },
): Promise<void> {
  const client = db as PrismaClient;
  if (typeof client.$queryRaw !== "function") {
    throw new PartnerUserAccessError(
      "INVALID_INPUT",
      "Organization membership cleanup requires a client that can lock partnership rows.",
    );
  }
  const locked = await client.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "FacilityPartnerOrganization" WHERE "organizationId" = ${input.organizationId} ORDER BY "id" FOR UPDATE`,
  );
  const partnershipIds = Array.isArray(locked) ? locked.map((row) => row.id) : [];
  if (partnershipIds.length === 0) return;

  const assignments = await db.partnerUserFacilityAccess.findMany({
    where: {
      userId: input.userId,
      facilityPartnerOrganizationId: { in: partnershipIds },
    },
    include: { rolePeriods: true },
  });
  for (const assignment of assignments) {
    const current = findPeriodContainingInstant(assignment.rolePeriods, input.endsAt);
    if (!current) continue;
    await closeCurrentPartnerUserRolePeriod(db, {
      rolePeriodId: current.id,
      endsAt: input.endsAt,
      endedByUserId: input.actorUserId,
      endedByAuthorityKind: "partner_org_admin",
      endedByOrganizationId: input.organizationId,
      endReason: "ORGANIZATION_MEMBERSHIP_ENDED",
    });
  }
}

async function ceilingPeriods(db: DbClient, partnershipId: string) {
  return db.facilityPartnerRoleCeilingPeriod.findMany({
    where: { facilityPartnerOrganizationId: partnershipId },
    orderBy: { startsAt: "asc" },
  });
}

function currentCeilingAt(
  periods: Awaited<ReturnType<typeof ceilingPeriods>>,
  instant: Date,
) {
  const current = findPeriodContainingInstant(periods, instant);
  return current ? toCeilingView(current) : null;
}

async function scopedDepartmentIds(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; instant: Date },
): Promise<string[]> {
  const scopes = await db.facilityPartnerDepartmentScope.findMany({
    where: { facilityPartnerOrganizationId: input.partnershipId },
    include: { department: { select: { id: true, facilityId: true, isActive: true } } },
  });
  const ids = new Set<string>();
  for (const scope of scopes) {
    if (!periodContainsInstant(scope, input.instant)) continue;
    if (scope.department.facilityId !== input.facilityId) continue;
    if (!scope.department.isActive) continue;
    ids.add(scope.department.id);
  }
  return [...ids].sort();
}

async function membershipRoleAt(
  db: DbClient,
  input: { userId: string; organizationId: string; instant: Date },
) {
  const membership = await db.userOrganizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: input.userId,
        organizationId: input.organizationId,
      },
    },
    include: {
      organization: { select: { isActive: true } },
      rolePeriods: { orderBy: { startsAt: "asc" } },
    },
  });
  if (!membership) return null;
  if (!membership.organization.isActive) return null;
  return findPeriodContainingInstant(membership.rolePeriods, input.instant);
}

async function assertPartnershipAvailable(
  db: DbClient,
  partnership: Awaited<ReturnType<typeof loadPartnership>>,
  instant: Date,
) {
  if (partnership.endedAt && partnership.endedAt.getTime() <= instant.getTime()) {
    throw new PartnerUserAccessError("PARTNERSHIP_ENDED", "This partner relationship has ended.");
  }
  if (!partnership.organization.isActive) {
    throw new PartnerUserAccessError("ORGANIZATION_INACTIVE", "The partner Organization is inactive.");
  }
  const access = await db.facilityPartnerAccessPeriod.findMany({
    where: { facilityPartnerOrganizationId: partnership.id },
  });
  if (!findPeriodContainingInstant(access, instant)) {
    throw new PartnerUserAccessError(
      "PARTNERSHIP_INACTIVE",
      "The partner relationship is not authorized at this time.",
    );
  }
}

/**
 * Facility writes do not require a staffing-policy period.
 * Organization writes require a current policy and a current ORG_ADMIN membership
 * in the partnership Organization. Both are evaluated after the partnership lock.
 */
async function assertAssignmentAuthority(
  db: DbClient,
  input: ActorContext,
  partnership: Awaited<ReturnType<typeof loadPartnership>>,
  instant: Date,
) {
  if (input.authority?.kind !== "partner_org_admin") {
    await assertFacilityAdministrator(db, input);
    return;
  }
  if (input.authority.organizationId !== partnership.organizationId) {
    throw new PartnerUserAccessError(
      "NOT_ORGANIZATION_ADMINISTRATOR",
      "Staffing authority is limited to the partnership Organization.",
    );
  }
  const actor = await db.user.findUnique({
    where: { id: input.actorUserId },
    select: { isActive: true },
  });
  const membership = await membershipRoleAt(db, {
    userId: input.actorUserId,
    organizationId: partnership.organizationId,
    instant,
  });
  if (!actor?.isActive || membership?.role !== "ORG_ADMIN") {
    throw new PartnerUserAccessError(
      "NOT_ORGANIZATION_ADMINISTRATOR",
      "Only a current Organization Administrator of this partner Organization may manage assignments.",
    );
  }
  const delegated = findPeriodContainingInstant(await policyPeriods(db, partnership.id), instant);
  if (!delegated) {
    throw new PartnerUserAccessError(
      "PARTNER_STAFFING_NOT_ENABLED",
      "This Facility has not delegated partner staffing to the Organization.",
    );
  }
}

async function assertAssignable(
  db: DbClient,
  input: {
    partnership: Awaited<ReturnType<typeof loadPartnership>>;
    userId: string;
    partnerRole: OrganizationPartnerRole;
    instant: Date;
  },
): Promise<RoleCeilingPeriodView> {
  if (input.partnership.endedAt && input.partnership.endedAt.getTime() <= input.instant.getTime()) {
    throw new PartnerUserAccessError("PARTNERSHIP_ENDED", "This partner relationship has ended.");
  }
  if (!input.partnership.organization.isActive) {
    throw new PartnerUserAccessError("ORGANIZATION_INACTIVE", "The partner Organization is inactive.");
  }
  const access = await db.facilityPartnerAccessPeriod.findMany({
    where: { facilityPartnerOrganizationId: input.partnership.id },
  });
  if (!findPeriodContainingInstant(access, input.instant)) {
    throw new PartnerUserAccessError(
      "PARTNERSHIP_INACTIVE",
      "The partner relationship is not authorized at this time.",
    );
  }
  const departments = await scopedDepartmentIds(db, {
    partnershipId: input.partnership.id,
    facilityId: input.partnership.facilityId,
    instant: input.instant,
  });
  if (departments.length === 0) {
    throw new PartnerUserAccessError(
      "SCOPE_EMPTY",
      "Personal partner access requires at least one current Department in the partnership scope.",
    );
  }
  const ceiling = currentCeilingAt(await ceilingPeriods(db, input.partnership.id), input.instant);
  if (!ceiling) {
    throw new PartnerUserAccessError(
      "CEILING_ABSENT",
      "Personal partner access is disabled until the Facility sets a maximum partner role.",
    );
  }
  if (!isPartnerRoleAtOrBelow(input.partnerRole, ceiling.maxPartnerRole)) {
    throw new PartnerUserAccessError(
      "ROLE_ABOVE_CEILING",
      "The partner role is above the Facility's current maximum.",
    );
  }
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isActive: true },
  });
  if (!user) {
    throw new PartnerUserAccessError("USER_NOT_FOUND", "User not found.");
  }
  if (!user.isActive) {
    throw new PartnerUserAccessError("USER_INACTIVE", "User is inactive.");
  }
  const membership = await membershipRoleAt(db, {
    userId: input.userId,
    organizationId: input.partnership.organizationId,
    instant: input.instant,
  });
  if (!membership) {
    throw new PartnerUserAccessError(
      "NOT_CURRENT_MEMBER",
      "Only a current member of the partner Organization can be assigned.",
    );
  }
  return ceiling;
}

export async function setFacilityPartnerRoleCeiling(
  db: DbClient,
  input: ActorContext & {
    maxPartnerRole: OrganizationPartnerRole | null;
    at?: Date;
  },
): Promise<RoleCeilingPeriodView | null> {
  const at = input.at ?? new Date();
  const result = await runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
    if (partnership.endedAt && partnership.endedAt.getTime() <= at.getTime()) {
      throw new PartnerUserAccessError("PARTNERSHIP_ENDED", "This partner relationship has ended.");
    }
    const periods = await ceilingPeriods(tx, partnership.id);
    const current = findPeriodContainingInstant(periods, at);
    if ((current?.maxPartnerRole ?? null) === input.maxPartnerRole) {
      return current ? toCeilingView(current) : null;
    }
    if (current) {
      await tx.facilityPartnerRoleCeilingPeriod.update({
        where: { id: current.id },
        data: { endsAt: at, endedByUserId: input.actorUserId },
      });
    }
    let opened: RoleCeilingPeriodView | null = null;
    if (input.maxPartnerRole) {
      const created = await tx.facilityPartnerRoleCeilingPeriod.create({
        data: {
          facilityPartnerOrganizationId: partnership.id,
          maxPartnerRole: input.maxPartnerRole,
          startsAt: at,
          createdByUserId: input.actorUserId,
        },
      });
      opened = toCeilingView(created);
    }
    const next = await ceilingPeriods(tx, partnership.id);
    assertNoOverlap(next, "Partner role ceiling periods must not overlap.");
    return opened;
  });
  await trackEvent(
    input.maxPartnerRole ? "partner_role_ceiling.changed" : "partner_role_ceiling.cleared",
    {
      actorUserId: input.actorUserId,
      partnershipId: input.partnershipId,
      facilityId: input.facilityId,
      maxPartnerRole: input.maxPartnerRole,
    },
  );
  return result;
}

async function loadAssignment(
  db: DbClient,
  input: { userId: string; partnershipId: string },
) {
  return db.partnerUserFacilityAccess.findUnique({
    where: {
      userId_facilityPartnerOrganizationId: {
        userId: input.userId,
        facilityPartnerOrganizationId: input.partnershipId,
      },
    },
    include: { rolePeriods: { orderBy: { startsAt: "asc" } } },
  });
}

async function restrictionPeriods(
  db: DbClient,
  input: { partnershipId: string; userId: string },
) {
  return db.facilityPartnerUserRestrictionPeriod.findMany({
    where: {
      facilityPartnerOrganizationId: input.partnershipId,
      userId: input.userId,
    },
    orderBy: { startsAt: "asc" },
  });
}

async function assertNotRestricted(
  db: DbClient,
  partnershipId: string,
  userId: string,
  instant: Date,
) {
  const current = findPeriodContainingInstant(
    await restrictionPeriods(db, { partnershipId, userId }),
    instant,
  );
  if (current) {
    throw new PartnerUserAccessError(
      "USER_RESTRICTED",
      "This Facility has restricted this user from partner access.",
    );
  }
}

async function policyPeriods(db: DbClient, partnershipId: string) {
  return db.facilityPartnerStaffingPolicyPeriod.findMany({
    where: { facilityPartnerOrganizationId: partnershipId },
    orderBy: { startsAt: "asc" },
  });
}

export async function assignPartnerUser(
  db: DbClient,
  input: ActorContext & {
    userId: string;
    partnerRole: OrganizationPartnerRole;
    at?: Date;
  },
): Promise<{ assignmentId: string; rolePeriod: PartnerRolePeriodView }> {
  const at = input.at ?? new Date();
  const assigned = await runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    const partnership = await loadPartnership(tx, input);
    await assertAssignmentAuthority(tx, input, partnership, at);
    await assertAssignable(tx, {
      partnership,
      userId: input.userId,
      partnerRole: input.partnerRole,
      instant: at,
    });
    let assignment = await loadAssignment(tx, {
      userId: input.userId,
      partnershipId: partnership.id,
    });
    const open = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, at)
      : null;
    if (open) {
      throw new PartnerUserAccessError(
        "ALREADY_ASSIGNED",
        "This user already has a current partner assignment. Change the role or end it first.",
      );
    }
    await assertNotRestricted(tx, partnership.id, input.userId, at);
    if (!assignment) {
      assignment = await tx.partnerUserFacilityAccess.create({
        data: {
          userId: input.userId,
          facilityPartnerOrganizationId: partnership.id,
          createdByUserId: input.actorUserId,
        },
        include: { rolePeriods: { orderBy: { startsAt: "asc" } } },
      });
    }
    const created = await tx.partnerUserRolePeriod.create({
      data: {
        partnerUserFacilityAccessId: assignment.id,
        partnerRole: input.partnerRole,
        startsAt: at,
        createdByUserId: input.actorUserId,
        ...creationProvenance(input, partnership.organizationId),
      },
    });
    const periods = [
      ...assignment.rolePeriods.map((period) => ({
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      })),
      { startsAt: created.startsAt, endsAt: created.endsAt },
    ];
    assertNoOverlap(periods, "Partner role periods must not overlap.");
    return { assignmentId: assignment.id, rolePeriod: toRolePeriodView(created), reactivated: assignment.rolePeriods.length > 0 };
  });
  await trackEvent(assigned.reactivated ? "partner_user.reactivated" : "partner_user.assigned", {
    actorUserId: input.actorUserId,
    partnershipId: input.partnershipId,
    facilityId: input.facilityId,
    userId: input.userId,
    partnerRole: input.partnerRole,
  });
  return { assignmentId: assigned.assignmentId, rolePeriod: assigned.rolePeriod };
}

export async function changePartnerUserRole(
  db: DbClient,
  input: ActorContext & {
    userId: string;
    partnerRole: OrganizationPartnerRole;
    at?: Date;
  },
): Promise<PartnerRolePeriodView> {
  const at = input.at ?? new Date();
  const next = await runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    const partnership = await loadPartnership(tx, input);
    await assertAssignmentAuthority(tx, input, partnership, at);
    await assertNotRestricted(tx, partnership.id, input.userId, at);
    await assertAssignable(tx, {
      partnership,
      userId: input.userId,
      partnerRole: input.partnerRole,
      instant: at,
    });
    const assignment = await loadAssignment(tx, {
      userId: input.userId,
      partnershipId: partnership.id,
    });
    const current = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, at)
      : null;
    if (!assignment || !current) {
      throw new PartnerUserAccessError(
        "ASSIGNMENT_NOT_CURRENT",
        "This user does not have a current partner assignment.",
      );
    }
    if (current.partnerRole === input.partnerRole) {
      return toRolePeriodView(current);
    }
    await closeCurrentPartnerUserRolePeriod(tx, {
      rolePeriodId: current.id,
      endsAt: at,
      ...endingProvenance(input, partnership.organizationId),
      endReason: "ROLE_CHANGED",
    });
    const created = await tx.partnerUserRolePeriod.create({
      data: {
        partnerUserFacilityAccessId: assignment.id,
        partnerRole: input.partnerRole,
        startsAt: at,
        createdByUserId: input.actorUserId,
        ...creationProvenance(input, partnership.organizationId),
      },
    });
    const periods = assignment.rolePeriods.map((period) =>
      period.id === current.id
        ? { startsAt: period.startsAt, endsAt: at }
        : { startsAt: period.startsAt, endsAt: period.endsAt },
    );
    periods.push({ startsAt: created.startsAt, endsAt: created.endsAt });
    assertNoOverlap(periods, "Partner role periods must not overlap.");
    return toRolePeriodView(created);
  });
  await trackEvent("partner_user.role_changed", {
    actorUserId: input.actorUserId,
    partnershipId: input.partnershipId,
    facilityId: input.facilityId,
    userId: input.userId,
    partnerRole: input.partnerRole,
  });
  return next;
}

export async function endPartnerUserAssignment(
  db: DbClient,
  input: ActorContext & { userId: string; at?: Date },
): Promise<PartnerRolePeriodView> {
  const at = input.at ?? new Date();
  const closed = await runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    const partnership = await loadPartnership(tx, input);
    await assertAssignmentAuthority(tx, input, partnership, at);
    if (input.authority?.kind === "partner_org_admin") {
      await assertPartnershipAvailable(tx, partnership, at);
      await assertNotRestricted(tx, partnership.id, input.userId, at);
      const membership = await membershipRoleAt(tx, {
        userId: input.userId,
        organizationId: partnership.organizationId,
        instant: at,
      });
      if (!membership) {
        throw new PartnerUserAccessError(
          "NOT_CURRENT_MEMBER",
          "Only a current member of the partner Organization can have an assignment ended by the Organization.",
        );
      }
    }
    const assignment = await loadAssignment(tx, {
      userId: input.userId,
      partnershipId: partnership.id,
    });
    const current = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, at)
      : null;
    if (!assignment || !current) {
      throw new PartnerUserAccessError(
        "ASSIGNMENT_NOT_CURRENT",
        "This user does not have a current partner assignment.",
      );
    }
    const updated = await closeCurrentPartnerUserRolePeriod(tx, {
      rolePeriodId: current.id,
      endsAt: at,
      ...endingProvenance(input, partnership.organizationId),
      endReason: "ASSIGNMENT_ENDED",
    });
    return toRolePeriodView(updated);
  });
  await trackEvent("partner_user.ended", {
    actorUserId: input.actorUserId,
    partnershipId: input.partnershipId,
    facilityId: input.facilityId,
    userId: input.userId,
  });
  return closed;
}

export async function isPartnerStaffingDelegated(
  db: DbClient,
  input: { partnershipId: string; instant?: Date },
): Promise<boolean> {
  const instant = input.instant ?? new Date();
  const current = findPeriodContainingInstant(await policyPeriods(db, input.partnershipId), instant);
  return current !== null;
}

export async function enablePartnerStaffingDelegation(
  db: DbClient,
  input: ActorContext & { at?: Date },
) {
  const at = input.at ?? new Date();
  assertFacilityOnlyWriter(input.authority);
  return runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
    const periods = await policyPeriods(tx, partnership.id);
    if (findPeriodContainingInstant(periods, at)) {
      throw new PartnerUserAccessError(
        "POLICY_ALREADY_ENABLED",
        "Organization staffing delegation is already enabled.",
      );
    }
    const created = await tx.facilityPartnerStaffingPolicyPeriod.create({
      data: {
        facilityPartnerOrganizationId: partnership.id,
        startsAt: at,
        createdByUserId: input.actorUserId,
        ...FACILITY_CREATED_AUTHORITY,
      },
    });
    assertNoOverlap(
      [...periods, created].map((period) => ({ startsAt: period.startsAt, endsAt: period.endsAt })),
      "Staffing policy periods must not overlap.",
    );
    return created;
  });
}

export async function disablePartnerStaffingDelegation(
  db: DbClient,
  input: ActorContext & { at?: Date },
) {
  const at = input.at ?? new Date();
  assertFacilityOnlyWriter(input.authority);
  return runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
    const periods = await policyPeriods(tx, partnership.id);
    const current = findPeriodContainingInstant(periods, at);
    if (!current) {
      throw new PartnerUserAccessError(
        "POLICY_NOT_ENABLED",
        "Organization staffing delegation is not enabled.",
      );
    }
    const closed = await tx.facilityPartnerStaffingPolicyPeriod.update({
      where: { id: current.id },
      data: { endsAt: at, ...facilityEndedAuthority(input.actorUserId) },
    });
    assertNoOverlap(
      periods.map((period) =>
        period.id === current.id
          ? { startsAt: period.startsAt, endsAt: at }
          : { startsAt: period.startsAt, endsAt: period.endsAt },
      ),
      "Staffing policy periods must not overlap.",
    );
    return closed;
  });
}

export async function blockPartnerUser(
  db: DbClient,
  input: ActorContext & { userId: string; note?: string | null; at?: Date },
) {
  const at = input.at ?? new Date();
  assertFacilityOnlyWriter(input.authority);
  const note = input.note?.trim() ? input.note.trim() : null;
  return runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
    const assignment = await loadAssignment(tx, {
      userId: input.userId,
      partnershipId: partnership.id,
    });
    const membership = await membershipRoleAt(tx, {
      userId: input.userId,
      organizationId: partnership.organizationId,
      instant: at,
    });
    if (!membership && !assignment) {
      throw new PartnerUserAccessError(
        "NOT_CURRENT_MEMBER",
        "Only a current Organization member, or a user with assignment history under this partnership, can be restricted.",
      );
    }
    const restrictions = await restrictionPeriods(tx, {
      partnershipId: partnership.id,
      userId: input.userId,
    });
    const currentRole = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, at)
      : null;
    if (currentRole) {
      await closeCurrentPartnerUserRolePeriod(tx, {
        rolePeriodId: currentRole.id,
        endsAt: at,
        ...facilityEndedAuthority(input.actorUserId),
        endReason: "FACILITY_BLOCKED",
      });
    }
    const already = findPeriodContainingInstant(restrictions, at);
    if (already) {
      if (!currentRole) {
        throw new PartnerUserAccessError(
          "ALREADY_RESTRICTED",
          "This user is already restricted by the Facility.",
        );
      }
      return already;
    }
    const created = await tx.facilityPartnerUserRestrictionPeriod.create({
      data: {
        userId: input.userId,
        facilityPartnerOrganizationId: partnership.id,
        startsAt: at,
        note,
        createdByUserId: input.actorUserId,
        ...FACILITY_CREATED_AUTHORITY,
      },
    });
    assertNoOverlap(
      [...restrictions, created].map((period) => ({
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      })),
      "User restriction periods must not overlap.",
    );
    return created;
  });
}

export async function unblockPartnerUser(
  db: DbClient,
  input: ActorContext & { userId: string; at?: Date },
) {
  const at = input.at ?? new Date();
  assertFacilityOnlyWriter(input.authority);
  return runInTransaction(db, async (tx) => {
    await lockPartnership(tx, input.partnershipId);
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
    const restrictions = await restrictionPeriods(tx, {
      partnershipId: partnership.id,
      userId: input.userId,
    });
    const current = findPeriodContainingInstant(restrictions, at);
    if (!current) {
      throw new PartnerUserAccessError(
        "RESTRICTION_NOT_CURRENT",
        "This user is not currently restricted.",
      );
    }
    const closed = await tx.facilityPartnerUserRestrictionPeriod.update({
      where: { id: current.id },
      data: { endsAt: at, ...facilityEndedAuthority(input.actorUserId) },
    });
    const assignment = await loadAssignment(tx, {
      userId: input.userId,
      partnershipId: partnership.id,
    });
    const stillAssigned = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, at)
      : null;
    if (stillAssigned) {
      throw new PartnerUserAccessError(
        "INVALID_INPUT",
        "Unblock must not leave or create a partner assignment.",
      );
    }
    return closed;
  });
}

export async function getPartnerUserAccessAdminView(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; now?: Date },
): Promise<PartnerUserAccessAdminView> {
  const now = input.now ?? new Date();
  const partnership = await loadPartnership(db, input);
  const ceilings = (await ceilingPeriods(db, partnership.id)).map(toCeilingView);
  const currentCeiling = ceilings.find((period) => periodContainsInstant(period, now)) ?? null;
  const memberships = await db.userOrganizationMembership.findMany({
    where: { organizationId: partnership.organizationId },
    include: {
      organization: { select: { isActive: true } },
      rolePeriods: { orderBy: { startsAt: "asc" } },
      user: { select: { id: true, email: true, displayName: true, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const assignments = await db.partnerUserFacilityAccess.findMany({
    where: { facilityPartnerOrganizationId: partnership.id },
    include: {
      rolePeriods: { orderBy: { startsAt: "asc" } },
      user: { select: { id: true, email: true, displayName: true, isActive: true } },
    },
  });
  const assignmentByUser = new Map(assignments.map((row) => [row.userId, row]));
  const restrictions = await db.facilityPartnerUserRestrictionPeriod.findMany({
    where: { facilityPartnerOrganizationId: partnership.id },
    orderBy: { startsAt: "asc" },
  });
  const policies = await policyPeriods(db, partnership.id);
  const facility = await db.facility.findUnique({
    where: { id: partnership.facilityId },
    select: { displayName: true },
  });
  const members: PartnerAssignmentMemberView[] = [];
  for (const membership of memberships) {
    if (!membership.user.isActive || !membership.organization.isActive) continue;
    const role = findPeriodContainingInstant(membership.rolePeriods, now);
    if (!role) continue;
    const assignment = assignmentByUser.get(membership.userId);
    const assigned = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, now)
      : null;
    const restriction = findPeriodContainingInstant(
      restrictions.filter((period) => period.userId === membership.userId),
      now,
    );
    members.push({
      userId: membership.user.id,
      email: membership.user.email,
      displayName: membership.user.displayName,
      organizationRole: role.role,
      assignmentId: assignment?.id ?? null,
      assignedRole: assigned?.partnerRole ?? null,
      effectiveRole:
        assigned && currentCeiling
          ? minPartnerRole(assigned.partnerRole, currentCeiling.maxPartnerRole)
          : null,
      restricted: restriction !== null,
      restrictionNote: restriction?.note ?? null,
      createdByAuthorityKind: assigned?.createdByAuthorityKind ?? null,
    });
  }
  const rolePeriods: PartnerRoleHistoryRow[] = assignments.flatMap((assignment) =>
    assignment.rolePeriods.map((period) => ({
      ...toRolePeriodView(period),
      displayName: assignment.user.displayName,
    })),
  );
  return {
    partnershipId: partnership.id,
    facilityId: partnership.facilityId,
    organizationId: partnership.organizationId,
    facilityDisplayName: facility?.displayName ?? "Facility",
    staffingDelegationEnabled: findPeriodContainingInstant(policies, now) !== null,
    currentCeiling,
    ceilingPeriods: ceilings,
    members,
    rolePeriods,
  };
}

async function resolveInternal(
  db: DbClient,
  input: { userId: string; facilityId: string },
): Promise<InternalFacilityAuthorization | null> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      isActive: true,
      facilityId: true,
      email: true,
      role: { select: { key: true, isActive: true } },
      facilityAccesses: {
        where: { facilityId: input.facilityId, isActive: true, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user?.isActive || !user.role?.isActive || !user.role.key) return null;
  const home = user.facilityId === input.facilityId;
  const grant = user.facilityAccesses.length > 0;
  if (!home && !grant) return null;

  let allowedDepartmentIds: string[] = [];
  if (user.role.key === "FACILITY_ADMINISTRATOR") {
    const departments = await db.department.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    allowedDepartmentIds = departments.map((department) => department.id);
  } else {
    const employee = await db.employee.findFirst({
      where: {
        facilityId: input.facilityId,
        email: { equals: user.email, mode: "insensitive" },
      },
      select: {
        employeeDepartments: {
          select: { departmentId: true, department: { select: { isActive: true, facilityId: true } } },
        },
      },
    });
    const ids = new Set<string>();
    for (const membership of employee?.employeeDepartments ?? []) {
      if (!membership.department.isActive) continue;
      if (membership.department.facilityId !== input.facilityId) continue;
      ids.add(membership.departmentId);
    }
    allowedDepartmentIds = [...ids].sort();
  }

  return {
    path: "internal",
    facilityId: input.facilityId,
    facilityRole: user.role.key as RoleKey,
    allowedDepartmentIds,
  };
}

async function resolvePartner(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    instant: Date;
    facilityPartnerOrganizationId?: string;
  },
): Promise<PartnerFacilityAuthorization | null> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isActive: true },
  });
  if (!user?.isActive) return null;

  const assignments = await db.partnerUserFacilityAccess.findMany({
    where: {
      userId: input.userId,
      facilityPartnerOrganization: { facilityId: input.facilityId },
    },
    include: {
      rolePeriods: { orderBy: { startsAt: "asc" } },
      facilityPartnerOrganization: {
        select: {
          id: true,
          facilityId: true,
          organizationId: true,
          endedAt: true,
          organization: { select: { isActive: true } },
        },
      },
    },
  });

  const matches: PartnerFacilityAuthorization[] = [];
  for (const assignment of assignments) {
    const partnership = assignment.facilityPartnerOrganization;
    if (
      input.facilityPartnerOrganizationId &&
      partnership.id !== input.facilityPartnerOrganizationId
    ) {
      continue;
    }
    if (partnership.endedAt && partnership.endedAt.getTime() <= input.instant.getTime()) continue;
    if (!partnership.organization.isActive) continue;
    const rolePeriod = findPeriodContainingInstant(assignment.rolePeriods, input.instant);
    if (!rolePeriod) continue;
    const restricted = findPeriodContainingInstant(
      await restrictionPeriods(db, {
        partnershipId: partnership.id,
        userId: input.userId,
      }),
      input.instant,
    );
    if (restricted) continue;
    const membership = await membershipRoleAt(db, {
      userId: input.userId,
      organizationId: partnership.organizationId,
      instant: input.instant,
    });
    if (!membership) continue;
    const access = await db.facilityPartnerAccessPeriod.findMany({
      where: { facilityPartnerOrganizationId: partnership.id },
    });
    if (!findPeriodContainingInstant(access, input.instant)) continue;
    const ceiling = currentCeilingAt(await ceilingPeriods(db, partnership.id), input.instant);
    if (!ceiling) continue;
    const allowedDepartmentIds = await scopedDepartmentIds(db, {
      partnershipId: partnership.id,
      facilityId: input.facilityId,
      instant: input.instant,
    });
    if (allowedDepartmentIds.length === 0) continue;
    matches.push({
      path: "partner",
      facilityId: input.facilityId,
      partnerOrganizationId: partnership.organizationId,
      facilityPartnerOrganizationId: partnership.id,
      assignedRole: rolePeriod.partnerRole,
      facilityRoleCeiling: ceiling.maxPartnerRole,
      effectiveRole: minPartnerRole(rolePeriod.partnerRole, ceiling.maxPartnerRole),
      allowedDepartmentIds,
    });
  }
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

/**
 * Answers Path A and Path B independently.
 *
 * `accessKind` defaults to internal. A valid partner assignment is not returned
 * unless the caller deliberately asks for the partner path. This function does
 * not mint a session, switch context, or write UserFacilityAccess.
 *
 * User.isActive, Organization.isActive, and Department.isActive are current
 * snapshots. Past instants are not a perfect replay of those three facts.
 */
export async function resolveFacilityAuthorization(
  db: DbClient,
  input: {
    userId: string;
    facilityId: string;
    instant?: Date;
    accessKind?: "internal" | "partner";
    /** When set, Path B considers only this partnership. Required when more than one could match. */
    facilityPartnerOrganizationId?: string;
  },
): Promise<FacilityAuthorizationResult> {
  const instant = input.instant ?? new Date();
  const [internal, partner] = await Promise.all([
    resolveInternal(db, input),
    resolvePartner(db, {
      userId: input.userId,
      facilityId: input.facilityId,
      instant,
      facilityPartnerOrganizationId: input.facilityPartnerOrganizationId,
    }),
  ]);
  const accessKind = input.accessKind ?? "internal";
  const selected = accessKind === "partner" ? partner : internal;
  return {
    authorization: selected ?? { path: "none" },
    paths: { internal, partner },
    unversionedFacts: UNVERSIONED_AUTHORIZATION_FACTS,
  };
}

export async function listAuthorizedPartnerFacilities(
  db: DbClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<import("./types").AuthorizedPartnerFacility[]> {
  const now = input.now ?? new Date();
  const assignments = await db.partnerUserFacilityAccess.findMany({
    where: {
      userId: input.userId,
      facilityPartnerOrganization: { organizationId: input.organizationId },
    },
    include: {
      facilityPartnerOrganization: {
        select: {
          id: true,
          facilityId: true,
          organizationId: true,
          facility: { select: { displayName: true } },
        },
      },
    },
  });
  const rows: import("./types").AuthorizedPartnerFacility[] = [];
  for (const assignment of assignments) {
    const partnership = assignment.facilityPartnerOrganization;
    const resolved = await resolveFacilityAuthorization(db, {
      userId: input.userId,
      facilityId: partnership.facilityId,
      accessKind: "partner",
      facilityPartnerOrganizationId: partnership.id,
      instant: now,
    });
    if (resolved.authorization.path !== "partner") continue;
    if (resolved.authorization.partnerOrganizationId !== input.organizationId) continue;
    const departments = await db.department.findMany({
      where: {
        id: { in: resolved.authorization.allowedDepartmentIds },
        facilityId: partnership.facilityId,
        isActive: true,
      },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    rows.push({
      facilityId: partnership.facilityId,
      facilityDisplayName: partnership.facility.displayName,
      facilityPartnerOrganizationId: partnership.id,
      partnerOrganizationId: partnership.organizationId,
      effectiveRole: resolved.authorization.effectiveRole,
      departmentNames: departments.map((department) => department.name),
    });
  }
  rows.sort((left, right) => left.facilityDisplayName.localeCompare(right.facilityDisplayName));
  return rows;
}
