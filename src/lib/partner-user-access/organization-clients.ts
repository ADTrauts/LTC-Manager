import type { OrganizationMembershipRole, OrganizationPartnerRole, Prisma, PrismaClient } from "@prisma/client";

import {
  deriveFacilityPartnerLifecycleState,
  findPeriodContainingInstant,
  type FacilityPartnerLifecycleState,
} from "@/lib/partner-access";

import {
  assignPartnerUser,
  changePartnerUserRole,
  endPartnerUserAssignment,
} from "./service";
import { PartnerUserAccessError, type PartnerAssignmentAuthorityKind } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type OrganizationClientAssignment = {
  userId: string;
  displayName: string;
  organizationRole: OrganizationMembershipRole;
  partnerRole: OrganizationPartnerRole;
  createdByAuthorityKind: PartnerAssignmentAuthorityKind;
};

export type OrganizationClientMember = {
  userId: string;
  displayName: string;
  organizationRole: OrganizationMembershipRole;
};

export type OrganizationClientStaffing = {
  facilityPartnerOrganizationId: string;
  facilityId: string;
  facilityDisplayName: string;
  organizationDisplayName: string;
  lifecycle: FacilityPartnerLifecycleState;
  departmentNames: string[];
  maximumPartnerRole: OrganizationPartnerRole | null;
  staffingDelegated: boolean;
  /** Active relationship, current delegation, and a current role ceiling. */
  canManageStaffing: boolean;
  assignments: OrganizationClientAssignment[];
  eligibleMembers: OrganizationClientMember[];
  restrictedMembers: Array<{ userId: string; displayName: string }>;
};

const STAFFING_COPY: Partial<Record<PartnerUserAccessError["code"], string>> = {
  PARTNER_STAFFING_NOT_ENABLED: "Staffing is currently managed by the facility.",
  USER_RESTRICTED: "This member cannot currently be assigned to this facility.",
  ROLE_ABOVE_CEILING: "That role is above the maximum allowed by the facility.",
  NOT_CURRENT_MEMBER: "This person is no longer a current organization member.",
  NOT_ORGANIZATION_ADMINISTRATOR: "Only a current organization administrator can manage staffing.",
  PARTNERSHIP_NOT_FOUND: "That client facility is not connected to this organization.",
  PARTNERSHIP_INACTIVE: "This client relationship is not open for staffing.",
  PARTNERSHIP_ENDED: "This client relationship is not open for staffing.",
  CEILING_ABSENT: "Personal facility access is not currently enabled by the facility.",
  ASSIGNMENT_NOT_CURRENT: "This member does not have a current assignment at this facility.",
};

export function organizationClientStaffingErrorMessage(error: unknown): string {
  if (error instanceof PartnerUserAccessError) {
    return STAFFING_COPY[error.code] ?? "Staffing could not be updated.";
  }
  return "Staffing could not be updated.";
}

async function partnershipForSession(
  db: DbClient,
  input: { partnershipId: string; sessionOrganizationId: string },
) {
  const partnership = await db.facilityPartnerOrganization.findUnique({
    where: { id: input.partnershipId },
    select: { id: true, facilityId: true, organizationId: true },
  });
  if (!partnership || partnership.organizationId !== input.sessionOrganizationId) {
    throw new PartnerUserAccessError(
      "PARTNERSHIP_NOT_FOUND",
      "That client facility is not connected to this organization.",
    );
  }
  return partnership;
}

export async function listOrganizationClientStaffing(
  db: DbClient,
  input: { organizationId: string; now?: Date },
): Promise<OrganizationClientStaffing[]> {
  const now = input.now ?? new Date();
  const partnerships = await db.facilityPartnerOrganization.findMany({
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
  });
  const memberships = await db.userOrganizationMembership.findMany({
    where: { organizationId: input.organizationId },
    include: {
      organization: { select: { isActive: true } },
      rolePeriods: { orderBy: { startsAt: "asc" } },
      user: { select: { id: true, displayName: true, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const clients: OrganizationClientStaffing[] = [];
  for (const partnership of partnerships) {
    const [accessPeriods, scopes, ceilings, policies, restrictions, assignments] = await Promise.all([
      db.facilityPartnerAccessPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        select: { startsAt: true, endsAt: true },
      }),
      db.facilityPartnerDepartmentScope.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        include: { department: { select: { id: true, name: true, facilityId: true, isActive: true } } },
      }),
      db.facilityPartnerRoleCeilingPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        orderBy: { startsAt: "asc" },
      }),
      db.facilityPartnerStaffingPolicyPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        orderBy: { startsAt: "asc" },
      }),
      db.facilityPartnerUserRestrictionPeriod.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        select: { userId: true, startsAt: true, endsAt: true },
      }),
      db.partnerUserFacilityAccess.findMany({
        where: { facilityPartnerOrganizationId: partnership.id },
        include: { rolePeriods: { orderBy: { startsAt: "asc" } } },
      }),
    ]);
    const lifecycle = deriveFacilityPartnerLifecycleState({
      endedAt: partnership.endedAt,
      accessPeriods,
      now,
    });
    const ceiling = findPeriodContainingInstant(ceilings, now);
    const staffingDelegated = findPeriodContainingInstant(policies, now) !== null;
    const departmentNames = scopes
      .filter(
        (scope) =>
          findPeriodContainingInstant([scope], now) &&
          scope.department.isActive &&
          scope.department.facilityId === partnership.facilityId,
      )
      .map((scope) => scope.department.name)
      .sort((left, right) => left.localeCompare(right));
    const currentAssignments: OrganizationClientAssignment[] = [];
    const assignedUserIds = new Set<string>();
    for (const assignment of assignments) {
      const role = findPeriodContainingInstant(assignment.rolePeriods, now);
      if (!role) continue;
      const membership = memberships.find((row) => row.userId === assignment.userId);
      const organizationRole = membership
        ? findPeriodContainingInstant(membership.rolePeriods, now)?.role
        : null;
      if (!organizationRole) continue;
      assignedUserIds.add(assignment.userId);
      currentAssignments.push({
        userId: assignment.userId,
        displayName: membership?.user.displayName ?? assignment.userId,
        organizationRole,
        partnerRole: role.partnerRole,
        createdByAuthorityKind: role.createdByAuthorityKind,
      });
    }
    const eligibleMembers: OrganizationClientMember[] = [];
    const restrictedMembers: Array<{ userId: string; displayName: string }> = [];
    for (const membership of memberships) {
      if (!membership.user.isActive || !membership.organization.isActive) continue;
      const role = findPeriodContainingInstant(membership.rolePeriods, now);
      if (!role) continue;
      const restricted = findPeriodContainingInstant(
        restrictions.filter((period) => period.userId === membership.userId),
        now,
      );
      if (restricted) {
        restrictedMembers.push({
          userId: membership.user.id,
          displayName: membership.user.displayName,
        });
        continue;
      }
      if (assignedUserIds.has(membership.userId)) continue;
      eligibleMembers.push({
        userId: membership.user.id,
        displayName: membership.user.displayName,
        organizationRole: role.role,
      });
    }
    const organizationDisplayName =
      partnership.organization.displayName?.trim() || partnership.organization.name;
    clients.push({
      facilityPartnerOrganizationId: partnership.id,
      facilityId: partnership.facilityId,
      facilityDisplayName: partnership.facility.displayName,
      organizationDisplayName,
      lifecycle,
      departmentNames,
      maximumPartnerRole: ceiling?.maxPartnerRole ?? null,
      staffingDelegated,
      canManageStaffing: lifecycle === "ACTIVE" && staffingDelegated && ceiling !== null,
      assignments: currentAssignments.sort((left, right) => left.displayName.localeCompare(right.displayName)),
      eligibleMembers: eligibleMembers.sort((left, right) => left.displayName.localeCompare(right.displayName)),
      restrictedMembers: restrictedMembers.sort((left, right) => left.displayName.localeCompare(right.displayName)),
    });
  }
  return clients.sort((left, right) => left.facilityDisplayName.localeCompare(right.facilityDisplayName));
}

export async function assignOrganizationClientMember(
  db: DbClient,
  input: {
    actorUserId: string;
    sessionOrganizationId: string;
    partnershipId: string;
    targetUserId: string;
    partnerRole: OrganizationPartnerRole;
    at?: Date;
  },
) {
  const partnership = await partnershipForSession(db, input);
  return assignPartnerUser(db, {
    actorUserId: input.actorUserId,
    partnershipId: partnership.id,
    facilityId: partnership.facilityId,
    userId: input.targetUserId,
    partnerRole: input.partnerRole,
    at: input.at,
    authority: { kind: "partner_org_admin", organizationId: input.sessionOrganizationId },
  });
}

export async function changeOrganizationClientMemberRole(
  db: DbClient,
  input: {
    actorUserId: string;
    sessionOrganizationId: string;
    partnershipId: string;
    targetUserId: string;
    partnerRole: OrganizationPartnerRole;
    at?: Date;
  },
) {
  const partnership = await partnershipForSession(db, input);
  return changePartnerUserRole(db, {
    actorUserId: input.actorUserId,
    partnershipId: partnership.id,
    facilityId: partnership.facilityId,
    userId: input.targetUserId,
    partnerRole: input.partnerRole,
    at: input.at,
    authority: { kind: "partner_org_admin", organizationId: input.sessionOrganizationId },
  });
}

export async function endOrganizationClientMemberAccess(
  db: DbClient,
  input: {
    actorUserId: string;
    sessionOrganizationId: string;
    partnershipId: string;
    targetUserId: string;
    at?: Date;
  },
) {
  const partnership = await partnershipForSession(db, input);
  return endPartnerUserAssignment(db, {
    actorUserId: input.actorUserId,
    partnershipId: partnership.id,
    facilityId: partnership.facilityId,
    userId: input.targetUserId,
    at: input.at,
    authority: { kind: "partner_org_admin", organizationId: input.sessionOrganizationId },
  });
}
