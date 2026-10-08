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
  type PartnerAssignmentMemberView,
  type PartnerFacilityAuthorization,
  type PartnerRoleHistoryRow,
  type PartnerRolePeriodView,
  type PartnerUserAccessAdminView,
  type RoleCeilingPeriodView,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

type ActorContext = {
  actorUserId: string;
  partnershipId: string;
  facilityId: string;
};

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
}): PartnerRolePeriodView {
  return {
    id: row.id,
    partnerUserFacilityAccessId: row.partnerUserFacilityAccessId,
    partnerRole: row.partnerRole,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
  };
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
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
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
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
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
    await tx.partnerUserRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: at, endedByUserId: input.actorUserId },
    });
    const created = await tx.partnerUserRolePeriod.create({
      data: {
        partnerUserFacilityAccessId: assignment.id,
        partnerRole: input.partnerRole,
        startsAt: at,
        createdByUserId: input.actorUserId,
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
    await assertFacilityAdministrator(tx, input);
    const partnership = await loadPartnership(tx, input);
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
    const updated = await tx.partnerUserRolePeriod.update({
      where: { id: current.id },
      data: { endsAt: at, endedByUserId: input.actorUserId },
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
  const members: PartnerAssignmentMemberView[] = [];
  for (const membership of memberships) {
    if (!membership.user.isActive || !membership.organization.isActive) continue;
    const role = findPeriodContainingInstant(membership.rolePeriods, now);
    if (!role) continue;
    const assignment = assignmentByUser.get(membership.userId);
    const assigned = assignment
      ? findPeriodContainingInstant(assignment.rolePeriods, now)
      : null;
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
  input: { userId: string; facilityId: string; instant: Date },
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
    if (partnership.endedAt && partnership.endedAt.getTime() <= input.instant.getTime()) continue;
    if (!partnership.organization.isActive) continue;
    const rolePeriod = findPeriodContainingInstant(assignment.rolePeriods, input.instant);
    if (!rolePeriod) continue;
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
  },
): Promise<FacilityAuthorizationResult> {
  const instant = input.instant ?? new Date();
  const [internal, partner] = await Promise.all([
    resolveInternal(db, input),
    resolvePartner(db, { ...input, instant }),
  ]);
  const accessKind = input.accessKind ?? "internal";
  const selected = accessKind === "partner" ? partner : internal;
  return {
    authorization: selected ?? { path: "none" },
    paths: { internal, partner },
    unversionedFacts: UNVERSIONED_AUTHORIZATION_FACTS,
  };
}
