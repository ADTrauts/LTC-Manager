import type { Prisma, PrismaClient } from "@prisma/client";

import {
  internalFacilityRoleLabel,
  listAvailableContexts,
  type AvailableContext,
} from "@/lib/available-contexts";
import { periodCoversDate } from "@/lib/department-operators";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { isPartnerRelationshipActive } from "@/lib/partner-access";
import { partnerRoleLabel } from "@/lib/partner-user-access";

import type {
  OrganizationPortfolio,
  OrganizationPortfolioClientFacility,
  OrganizationPortfolioOwnedFacility,
  PersonalAccess,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ListOrganizationPortfolioDeps = {
  listAvailableContexts?: typeof listAvailableContexts;
};

function notEnterable(): PersonalAccess {
  return { enterable: false };
}

function compareName(left: string, right: string): number {
  return left.localeCompare(right);
}

function ownedPersonalAccess(contexts: AvailableContext[], facilityId: string): PersonalAccess {
  const match = contexts.find(
    (context) => context.kind === "facility_internal" && context.facilityId === facilityId,
  );
  if (!match || match.kind !== "facility_internal") return notEnterable();
  return {
    enterable: true,
    contextKey: match.contextKey,
    roleLabel: internalFacilityRoleLabel(match.role),
  };
}

function clientPersonalAccess(
  contexts: AvailableContext[],
  facilityPartnerOrganizationId: string,
): PersonalAccess {
  const match = contexts.find(
    (context) =>
      context.kind === "facility_partner" &&
      context.facilityPartnerOrganizationId === facilityPartnerOrganizationId,
  );
  if (!match || match.kind !== "facility_partner") return notEnterable();
  return {
    enterable: true,
    contextKey: match.contextKey,
    roleLabel: partnerRoleLabel(match.effectivePartnerRole),
  };
}

/**
 * Organization-visible Facilities plus separately derived personal enterability.
 * Does not grant Facility authority and does not create Available Contexts.
 */
export async function listOrganizationPortfolio(
  db: DbClient,
  input: { organizationId: string; userId: string; now?: Date },
  deps: ListOrganizationPortfolioDeps = {},
): Promise<OrganizationPortfolio> {
  const now = input.now ?? new Date();
  const onDate = facilityLocalDateToServiceDate(toServiceDateKey(now));
  const listContexts = deps.listAvailableContexts ?? listAvailableContexts;

  const [ownedRows, partnershipRows, contexts] = await Promise.all([
    db.facility.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    db.facilityPartnerOrganization.findMany({
      where: { organizationId: input.organizationId, endedAt: null },
      select: {
        id: true,
        facilityId: true,
        endedAt: true,
        facility: { select: { displayName: true } },
        accessPeriods: { select: { startsAt: true, endsAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    listContexts(db, { userId: input.userId, now }),
  ]);

  const activePartnerships = partnershipRows.filter((row) =>
    isPartnerRelationshipActive({
      endedAt: row.endedAt,
      accessPeriods: row.accessPeriods,
      now,
    }),
  );

  const clientFacilityIds = [...new Set(activePartnerships.map((row) => row.facilityId))];
  const operatingByFacility = new Map<string, string[]>();
  if (clientFacilityIds.length > 0) {
    const operatorRows = await db.departmentOperatorRelationship.findMany({
      where: {
        organizationId: input.organizationId,
        department: {
          isActive: true,
          facilityId: { in: clientFacilityIds },
        },
        effectiveFrom: { lte: onDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
      },
      select: {
        effectiveFrom: true,
        effectiveTo: true,
        department: { select: { name: true, facilityId: true, isActive: true } },
      },
    });
    for (const row of operatorRows) {
      if (!row.department.isActive) continue;
      if (!periodCoversDate(row, onDate)) continue;
      const names = operatingByFacility.get(row.department.facilityId) ?? [];
      if (!names.includes(row.department.name)) names.push(row.department.name);
      operatingByFacility.set(row.department.facilityId, names);
    }
    for (const names of operatingByFacility.values()) {
      names.sort(compareName);
    }
  }

  const owned: OrganizationPortfolioOwnedFacility[] = ownedRows
    .map((row) => ({
      relationshipKind: "owned" as const,
      facilityId: row.id,
      facilityName: row.displayName,
      personal: ownedPersonalAccess(contexts, row.id),
    }))
    .sort((left, right) => compareName(left.facilityName, right.facilityName));

  const clients: OrganizationPortfolioClientFacility[] = activePartnerships
    .map((row) => ({
      relationshipKind: "client" as const,
      facilityPartnerOrganizationId: row.id,
      facilityId: row.facilityId,
      facilityName: row.facility.displayName,
      operatingDepartmentNames: operatingByFacility.get(row.facilityId) ?? [],
      personal: clientPersonalAccess(contexts, row.id),
    }))
    .sort((left, right) => compareName(left.facilityName, right.facilityName));

  return {
    organizationId: input.organizationId,
    owned,
    clients,
  };
}
