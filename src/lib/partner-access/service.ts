import type { Prisma, PrismaClient } from "@prisma/client";

import { loadCustomerOperableDepartments } from "@/lib/department-products";
import { loadCurrentDepartmentOperator } from "@/lib/department-operators";
import { trackEvent } from "@/lib/telemetry";

import {
  assertNoOverlappingPeriods,
  deriveFacilityPartnerLifecycleState,
  findPeriodContainingInstant,
  isPartnerRelationshipActive,
  periodContainsInstant,
} from "./periods";
import {
  FacilityPartnerError,
  partnerOrganizationLabel,
  type FacilityPartnerAccessPeriodView,
  type FacilityPartnerDepartmentScopeView,
  type FacilityPartnerView,
  type PartnerOrganizationSummary,
} from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

const organizationSelect = {
  id: true,
  name: true,
  displayName: true,
  legalName: true,
  organizationType: true,
  isActive: true,
} as const;

function toOrgSummary(row: {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
  organizationType: string | null;
  isActive: boolean;
}): PartnerOrganizationSummary {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    legalName: row.legalName,
    organizationType: row.organizationType,
    isActive: row.isActive,
  };
}

function toAccessPeriodView(row: {
  id: string;
  facilityPartnerOrganizationId: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FacilityPartnerAccessPeriodView {
  return {
    id: row.id,
    facilityPartnerOrganizationId: row.facilityPartnerOrganizationId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toScopeView(row: {
  id: string;
  facilityPartnerOrganizationId: string;
  departmentId: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  department: { id: string; name: string; key: string };
}): FacilityPartnerDepartmentScopeView {
  return {
    id: row.id,
    facilityPartnerOrganizationId: row.facilityPartnerOrganizationId,
    departmentId: row.departmentId,
    departmentName: row.department.name,
    departmentKey: row.department.key,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdByUserId: row.createdByUserId,
    endedByUserId: row.endedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function runInTransaction<T>(
  db: DbClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in db) {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

async function loadPartnershipRow(
  db: DbClient,
  input: { partnershipId: string; facilityId: string },
) {
  const row = await db.facilityPartnerOrganization.findFirst({
    where: { id: input.partnershipId, facilityId: input.facilityId },
    include: {
      organization: { select: organizationSelect },
      accessPeriods: { orderBy: { startsAt: "asc" } },
      departmentScopes: {
        orderBy: [{ departmentId: "asc" }, { startsAt: "asc" }],
        include: { department: { select: { id: true, name: true, key: true } } },
      },
    },
  });
  if (!row) {
    throw new FacilityPartnerError(
      "PARTNERSHIP_NOT_FOUND",
      "Partner relationship not found for this facility.",
    );
  }
  return row;
}

function toPartnerView(
  row: Awaited<ReturnType<typeof loadPartnershipRow>>,
  now: Date = new Date(),
): FacilityPartnerView {
  const accessPeriods = row.accessPeriods.map(toAccessPeriodView);
  const scopes = row.departmentScopes.map(toScopeView);
  const lifecycleState = deriveFacilityPartnerLifecycleState({
    endedAt: row.endedAt,
    accessPeriods,
    now,
  });
  const currentAccessPeriod = findPeriodContainingInstant(accessPeriods, now);
  const currentDepartmentScopes = scopes.filter((scope) =>
    periodContainsInstant(scope, now),
  );
  return {
    id: row.id,
    facilityId: row.facilityId,
    organizationId: row.organizationId,
    organization: toOrgSummary(row.organization),
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    approvedByUserId: row.approvedByUserId,
    approvedAt: row.approvedAt,
    endedByUserId: row.endedByUserId,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lifecycleState,
    currentAccessPeriod,
    currentDepartmentScopes,
    accessPeriods,
    departmentScopes: scopes,
  };
}

export async function getFacilityPartner(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; now?: Date },
): Promise<FacilityPartnerView> {
  const row = await loadPartnershipRow(db, input);
  return toPartnerView(row, input.now ?? new Date());
}

export async function getFacilityPartners(
  db: DbClient,
  input: { facilityId: string; now?: Date },
): Promise<FacilityPartnerView[]> {
  const rows = await db.facilityPartnerOrganization.findMany({
    where: { facilityId: input.facilityId },
    include: {
      organization: { select: organizationSelect },
      accessPeriods: { orderBy: { startsAt: "asc" } },
      departmentScopes: {
        orderBy: [{ departmentId: "asc" }, { startsAt: "asc" }],
        include: { department: { select: { id: true, name: true, key: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const now = input.now ?? new Date();
  return rows.map((row) => toPartnerView(row, now));
}

export async function createFacilityPartner(
  db: DbClient,
  input: {
    facilityId: string;
    organizationId: string;
    notes?: string | null;
    createdByUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { id: true, organizationId: true },
  });
  if (!facility) {
    throw new FacilityPartnerError("FACILITY_NOT_FOUND", "Facility not found.");
  }
  if (facility.organizationId === input.organizationId) {
    throw new FacilityPartnerError(
      "PARENT_ORGANIZATION_REJECTED",
      "The Facility parent Organization cannot be added as an external partner.",
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: organizationSelect,
  });
  if (!organization) {
    throw new FacilityPartnerError("ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  if (!organization.isActive) {
    throw new FacilityPartnerError("ORGANIZATION_INACTIVE", "Organization is inactive.");
  }

  const existing = await db.facilityPartnerOrganization.findUnique({
    where: {
      facilityId_organizationId: {
        facilityId: input.facilityId,
        organizationId: input.organizationId,
      },
    },
    select: { id: true, endedAt: true },
  });
  if (existing) {
    throw new FacilityPartnerError(
      "PARTNERSHIP_EXISTS",
      existing.endedAt
        ? "An ended partnership already exists for this Organization. Historical partnerships cannot be replaced in Phase 2A."
        : "A partnership with this Organization already exists.",
    );
  }

  const created = await db.facilityPartnerOrganization.create({
    data: {
      facilityId: input.facilityId,
      organizationId: organization.id,
      notes: input.notes?.trim() || null,
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true },
  });

  await trackEvent("facility_partner.created", {
    facilityId: input.facilityId,
    partnershipId: created.id,
    organizationId: organization.id,
    organizationName: partnerOrganizationLabel(organization),
    createdByUserId: input.createdByUserId ?? null,
  });

  return getFacilityPartner(db, {
    partnershipId: created.id,
    facilityId: input.facilityId,
  });
}

async function openPartnerAccessPeriod(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    startsAt: Date;
    actorUserId?: string | null;
  },
): Promise<void> {
  await runInTransaction(db, async (tx) => {
    const row = await loadPartnershipRow(tx, input);
    if (row.endedAt) {
      throw new FacilityPartnerError(
        "PARTNERSHIP_ENDED",
        "An ended partnership cannot receive a new authorization period.",
      );
    }
    if (!row.organization.isActive) {
      throw new FacilityPartnerError("ORGANIZATION_INACTIVE", "Organization is inactive.");
    }

    const periods = row.accessPeriods.map((p) => ({
      startsAt: p.startsAt,
      endsAt: p.endsAt,
    }));
    assertNoOverlappingPeriods([...periods, { startsAt: input.startsAt, endsAt: null }]);

    await tx.facilityPartnerAccessPeriod.create({
      data: {
        facilityPartnerOrganizationId: row.id,
        startsAt: input.startsAt,
        endsAt: null,
        createdByUserId: input.actorUserId ?? null,
      },
    });

    if (!row.approvedAt) {
      await tx.facilityPartnerOrganization.update({
        where: { id: row.id },
        data: {
          approvedAt: input.startsAt,
          approvedByUserId: input.actorUserId ?? null,
        },
      });
    }
  });
}

export async function activateFacilityPartner(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    startsAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const startsAt = input.startsAt ?? new Date();
  await openPartnerAccessPeriod(db, { ...input, startsAt });
  await trackEvent("facility_partner.activated", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    startsAt: startsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });
  return getFacilityPartner(db, input);
}

export async function suspendFacilityPartner(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    endsAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const endsAt = input.endsAt ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadPartnershipRow(tx, input);
    if (row.endedAt) {
      throw new FacilityPartnerError(
        "PARTNERSHIP_ENDED",
        "An ended partnership cannot be suspended.",
      );
    }
    const current = findPeriodContainingInstant(row.accessPeriods, endsAt);
    if (!current) {
      throw new FacilityPartnerError(
        "NO_ACTIVE_PERIOD",
        "There is no active authorization period to suspend.",
      );
    }
    await tx.facilityPartnerAccessPeriod.update({
      where: { id: current.id },
      data: {
        endsAt,
        endedByUserId: input.actorUserId ?? null,
      },
    });
    const after = await tx.facilityPartnerAccessPeriod.findMany({
      where: { facilityPartnerOrganizationId: row.id },
      select: { startsAt: true, endsAt: true },
    });
    assertNoOverlappingPeriods(after);
  });

  await trackEvent("facility_partner.suspended", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    endsAt: endsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  return getFacilityPartner(db, input);
}

export async function resumeFacilityPartner(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    startsAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const startsAt = input.startsAt ?? new Date();
  // Resume opens a new access period; prior periods remain immutable history.
  await openPartnerAccessPeriod(db, { ...input, startsAt });
  await trackEvent("facility_partner.resumed", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    startsAt: startsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });
  return getFacilityPartner(db, input);
}

export async function endFacilityPartner(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    endedAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const endedAt = input.endedAt ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadPartnershipRow(tx, input);
    if (row.endedAt) {
      throw new FacilityPartnerError("PARTNERSHIP_ENDED", "Partnership is already ended.");
    }

    const current = findPeriodContainingInstant(row.accessPeriods, endedAt);
    if (current) {
      await tx.facilityPartnerAccessPeriod.update({
        where: { id: current.id },
        data: {
          endsAt: endedAt,
          endedByUserId: input.actorUserId ?? null,
        },
      });
    }

    // Close any open department scopes at the same instant.
    const openScopes = row.departmentScopes.filter((scope) =>
      periodContainsInstant(scope, endedAt),
    );
    for (const scope of openScopes) {
      await tx.facilityPartnerDepartmentScope.update({
        where: { id: scope.id },
        data: {
          endsAt: endedAt,
          endedByUserId: input.actorUserId ?? null,
        },
      });
    }

    await tx.facilityPartnerOrganization.update({
      where: { id: row.id },
      data: {
        endedAt,
        endedByUserId: input.actorUserId ?? null,
      },
    });
  });

  await trackEvent("facility_partner.ended", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    endedAt: endedAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  return getFacilityPartner(db, input);
}

export async function addPartnerDepartmentScope(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    departmentId: string;
    startsAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const startsAt = input.startsAt ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadPartnershipRow(tx, input);
    if (row.endedAt) {
      throw new FacilityPartnerError(
        "PARTNERSHIP_ENDED",
        "Cannot add Department scope to an ended partnership.",
      );
    }

    const department = await tx.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId },
      select: { id: true, name: true, key: true, isActive: true },
    });
    if (!department) {
      throw new FacilityPartnerError(
        "DEPARTMENT_NOT_FOUND",
        "Department not found for this facility.",
      );
    }

    const operable = await loadCustomerOperableDepartments(tx, input.facilityId);
    if (!operable.some((d) => d.id === department.id)) {
      throw new FacilityPartnerError(
        "DEPARTMENT_NOT_FOUND",
        "Department is not customer-operable at this facility.",
      );
    }

    const existingForDept = row.departmentScopes.filter(
      (scope) => scope.departmentId === department.id,
    );
    if (existingForDept.some((scope) => periodContainsInstant(scope, startsAt))) {
      throw new FacilityPartnerError(
        "SCOPE_ALREADY_ACTIVE",
        "This Department is already in the current partner authorization scope.",
      );
    }

    const proposed = { startsAt, endsAt: null as Date | null };
    assertNoOverlappingPeriods(
      [
        ...existingForDept.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
        proposed,
      ],
      "Overlapping Department authorization scopes are not allowed.",
    );

    await tx.facilityPartnerDepartmentScope.create({
      data: {
        facilityPartnerOrganizationId: row.id,
        departmentId: department.id,
        startsAt,
        endsAt: null,
        createdByUserId: input.actorUserId ?? null,
      },
    });
  });

  await trackEvent("facility_partner.department_scope_added", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    departmentId: input.departmentId,
    startsAt: startsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  return getFacilityPartner(db, input);
}

export async function removePartnerDepartmentScope(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    departmentId: string;
    endsAt?: Date;
    actorUserId?: string | null;
  },
): Promise<FacilityPartnerView> {
  const endsAt = input.endsAt ?? new Date();

  await runInTransaction(db, async (tx) => {
    const row = await loadPartnershipRow(tx, input);
    if (row.endedAt) {
      throw new FacilityPartnerError(
        "PARTNERSHIP_ENDED",
        "Cannot remove Department scope from an ended partnership.",
      );
    }
    const current = row.departmentScopes.find(
      (scope) =>
        scope.departmentId === input.departmentId && periodContainsInstant(scope, endsAt),
    );
    if (!current) {
      throw new FacilityPartnerError(
        "SCOPE_NOT_ACTIVE",
        "This Department is not currently in the partner authorization scope.",
      );
    }
    await tx.facilityPartnerDepartmentScope.update({
      where: { id: current.id },
      data: {
        endsAt,
        endedByUserId: input.actorUserId ?? null,
      },
    });
  });

  await trackEvent("facility_partner.department_scope_removed", {
    facilityId: input.facilityId,
    partnershipId: input.partnershipId,
    departmentId: input.departmentId,
    endsAt: endsAt.toISOString(),
    actorUserId: input.actorUserId ?? null,
  });

  return getFacilityPartner(db, input);
}

export async function getCurrentPartnerAccessPeriod(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; now?: Date },
): Promise<FacilityPartnerAccessPeriodView | null> {
  const view = await getFacilityPartner(db, input);
  return view.currentAccessPeriod;
}

export async function getCurrentPartnerDepartmentScopes(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; now?: Date },
): Promise<FacilityPartnerDepartmentScopeView[]> {
  const view = await getFacilityPartner(db, input);
  return view.currentDepartmentScopes;
}

export async function getPartnerStateAt(
  db: DbClient,
  input: { partnershipId: string; facilityId: string; at: Date },
): Promise<FacilityPartnerView> {
  return getFacilityPartner(db, {
    partnershipId: input.partnershipId,
    facilityId: input.facilityId,
    now: input.at,
  });
}

export async function getPartnerScopeAt(
  db: DbClient,
  input: {
    partnershipId: string;
    facilityId: string;
    departmentId: string;
    at: Date;
  },
): Promise<FacilityPartnerDepartmentScopeView | null> {
  const view = await getFacilityPartner(db, {
    partnershipId: input.partnershipId,
    facilityId: input.facilityId,
    now: input.at,
  });
  return (
    view.currentDepartmentScopes.find((scope) => scope.departmentId === input.departmentId) ??
    null
  );
}

export { isPartnerRelationshipActive };

/**
 * Informational only: Departments currently operated by the partner Organization.
 * Never auto-creates partner scopes.
 */
export async function suggestDepartmentsFromCurrentOperators(
  db: DbClient,
  input: { facilityId: string; organizationId: string; now?: Date },
): Promise<Array<{ id: string; key: string; name: string }>> {
  const operable = await loadCustomerOperableDepartments(db, input.facilityId);
  const suggestions: Array<{ id: string; key: string; name: string }> = [];
  for (const department of operable) {
    const operator = await loadCurrentDepartmentOperator(db, {
      departmentId: department.id,
      facilityId: input.facilityId,
      now: input.now,
    });
    if (operator?.relationship.organizationId === input.organizationId) {
      suggestions.push({
        id: department.id,
        key: department.key,
        name: department.name,
      });
    }
  }
  return suggestions;
}

/**
 * Phase 2A intentionally does not authorize users.
 * Documented no-op guard for future Path B work.
 */
export function phase2aGrantsNoUserFacilityAccess(): true {
  return true;
}
