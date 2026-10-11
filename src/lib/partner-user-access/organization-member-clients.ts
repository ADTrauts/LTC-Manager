import type { OrganizationMembershipRole, OrganizationPartnerRole, Prisma, PrismaClient } from "@prisma/client";

import {
  deriveFacilityPartnerLifecycleState,
  findPeriodContainingInstant,
  type FacilityPartnerLifecycleState,
} from "@/lib/partner-access";

import type { PartnerAssignmentAuthorityKind } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type OrganizationMemberClientAssignment = {
  facilityPartnerOrganizationId: string;
  facilityId: string;
  facilityDisplayName: string;
  lifecycle: Exclude<FacilityPartnerLifecycleState, "ENDED">;
  staffingDelegated: boolean;
  roleCeiling: OrganizationPartnerRole | null;
  departmentNames: string[];
  currentAssignment: {
    partnerRole: OrganizationPartnerRole;
    createdByAuthorityKind: PartnerAssignmentAuthorityKind;
  } | null;
  restricted: boolean;
  /** Current assignment mutations may run (assign, or change/end when already assigned). */
  canManageAssignment: boolean;
  /** Assign is offered only when management is allowed and no current assignment exists. */
  assignable: boolean;
  unavailableReason: string | null;
};

export type OrganizationMemberClientAssignments = {
  member: {
    userId: string;
    displayName: string;
    email: string;
    organizationRole: OrganizationMembershipRole;
  } | null;
  clients: OrganizationMemberClientAssignment[];
};

/**
 * Person-first presentation of current client relationships for one Organization
 * member. Classification uses the same current facts as Clients staffing.
 * Writes still go through assign/change/end partner services.
 */
export async function listOrganizationMemberClientAssignments(
  db: DbClient,
  input: { organizationId: string; userId: string; now?: Date },
): Promise<OrganizationMemberClientAssignments> {
  const now = input.now ?? new Date();
  const [membership, partnerships] = await Promise.all([
    db.userOrganizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: input.userId,
          organizationId: input.organizationId,
        },
      },
      include: {
        organization: { select: { isActive: true } },
        rolePeriods: { orderBy: { startsAt: "asc" } },
        user: { select: { id: true, displayName: true, email: true, isActive: true } },
      },
    }),
    db.facilityPartnerOrganization.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        facilityId: true,
        organizationId: true,
        endedAt: true,
        createdAt: true,
        facility: { select: { displayName: true } },
        organization: { select: { name: true, displayName: true, isActive: true } },
      },
    }),
  ]);

  const organizationRole = membership
    ? findPeriodContainingInstant(membership.rolePeriods, now)?.role ?? null
    : null;
  const memberCurrent =
    Boolean(membership?.user.isActive) &&
    Boolean(membership?.organization.isActive) &&
    organizationRole !== null;
  const member =
    membership && organizationRole
      ? {
          userId: membership.user.id,
          displayName: membership.user.displayName,
          email: membership.user.email,
          organizationRole,
        }
      : null;

  const partnershipIds = partnerships.map((row) => row.id);
  if (partnershipIds.length === 0) {
    return { member, clients: [] };
  }

  const [accessPeriods, scopes, ceilings, policies, restrictions, assignments] = await Promise.all([
    db.facilityPartnerAccessPeriod.findMany({
      where: { facilityPartnerOrganizationId: { in: partnershipIds } },
      select: { facilityPartnerOrganizationId: true, startsAt: true, endsAt: true },
    }),
    db.facilityPartnerDepartmentScope.findMany({
      where: { facilityPartnerOrganizationId: { in: partnershipIds } },
      include: { department: { select: { id: true, name: true, facilityId: true, isActive: true } } },
    }),
    db.facilityPartnerRoleCeilingPeriod.findMany({
      where: { facilityPartnerOrganizationId: { in: partnershipIds } },
      orderBy: { startsAt: "asc" },
    }),
    db.facilityPartnerStaffingPolicyPeriod.findMany({
      where: { facilityPartnerOrganizationId: { in: partnershipIds } },
      orderBy: { startsAt: "asc" },
    }),
    db.facilityPartnerUserRestrictionPeriod.findMany({
      where: {
        facilityPartnerOrganizationId: { in: partnershipIds },
        userId: input.userId,
      },
      select: { facilityPartnerOrganizationId: true, userId: true, startsAt: true, endsAt: true },
    }),
    db.partnerUserFacilityAccess.findMany({
      where: {
        facilityPartnerOrganizationId: { in: partnershipIds },
        userId: input.userId,
      },
      include: { rolePeriods: { orderBy: { startsAt: "asc" } } },
    }),
  ]);

  const clients: OrganizationMemberClientAssignment[] = [];
  for (const partnership of partnerships) {
    const lifecycle = deriveFacilityPartnerLifecycleState({
      endedAt: partnership.endedAt,
      accessPeriods: accessPeriods.filter((row) => row.facilityPartnerOrganizationId === partnership.id),
      now,
    });
    if (lifecycle === "ENDED") continue;

    const ceiling = findPeriodContainingInstant(
      ceilings.filter((row) => row.facilityPartnerOrganizationId === partnership.id),
      now,
    );
    const staffingDelegated =
      findPeriodContainingInstant(
        policies.filter((row) => row.facilityPartnerOrganizationId === partnership.id),
        now,
      ) !== null;
    const departmentNames = scopes
      .filter(
        (scope) =>
          scope.facilityPartnerOrganizationId === partnership.id &&
          findPeriodContainingInstant([scope], now) &&
          scope.department.isActive &&
          scope.department.facilityId === partnership.facilityId,
      )
      .map((scope) => scope.department.name)
      .sort((left, right) => left.localeCompare(right));
    const assignment = assignments.find((row) => row.facilityPartnerOrganizationId === partnership.id);
    const role = assignment ? findPeriodContainingInstant(assignment.rolePeriods, now) : null;
    const currentAssignment = role
      ? {
          partnerRole: role.partnerRole,
          createdByAuthorityKind: role.createdByAuthorityKind,
        }
      : null;
    const restricted =
      findPeriodContainingInstant(
        restrictions.filter((row) => row.facilityPartnerOrganizationId === partnership.id),
        now,
      ) !== null;
    const canManageAssignment =
      memberCurrent &&
      lifecycle === "ACTIVE" &&
      staffingDelegated &&
      ceiling !== null &&
      departmentNames.length > 0 &&
      !restricted;
    const unavailableReason = classifyUnavailableReason({
      facilityDisplayName: partnership.facility.displayName,
      lifecycle,
      staffingDelegated,
      hasCeiling: ceiling !== null,
      hasScope: departmentNames.length > 0,
      restricted,
      memberCurrent,
    });

    clients.push({
      facilityPartnerOrganizationId: partnership.id,
      facilityId: partnership.facilityId,
      facilityDisplayName: partnership.facility.displayName,
      lifecycle,
      staffingDelegated,
      roleCeiling: ceiling?.maxPartnerRole ?? null,
      departmentNames,
      currentAssignment,
      restricted,
      canManageAssignment,
      assignable: canManageAssignment && currentAssignment === null,
      unavailableReason,
    });
  }

  clients.sort((left, right) => left.facilityDisplayName.localeCompare(right.facilityDisplayName));
  return { member, clients };
}

function classifyUnavailableReason(input: {
  facilityDisplayName: string;
  lifecycle: Exclude<FacilityPartnerLifecycleState, "ENDED">;
  staffingDelegated: boolean;
  hasCeiling: boolean;
  hasScope: boolean;
  restricted: boolean;
  memberCurrent: boolean;
}): string | null {
  if (input.lifecycle === "PENDING") {
    return "This client relationship is not active yet.";
  }
  if (input.lifecycle === "SUSPENDED") {
    return "This client relationship is suspended. Staffing changes are unavailable.";
  }
  if (!input.staffingDelegated) {
    return `Managed by ${input.facilityDisplayName}`;
  }
  if (!input.hasCeiling) {
    return "Personal facility access is not currently enabled by the facility.";
  }
  if (!input.hasScope) {
    return "This client relationship has no current department scope.";
  }
  if (input.restricted) {
    return "Restricted by facility";
  }
  if (!input.memberCurrent) {
    return "This person is no longer a current organization member.";
  }
  return null;
}
