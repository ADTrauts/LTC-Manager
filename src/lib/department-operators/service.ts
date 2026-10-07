import type { Prisma, PrismaClient } from "@prisma/client";

import {
  getFacilityServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";
import { trackEvent } from "@/lib/telemetry";

import {
  assertNoOverlaps,
  dayBefore,
  findPeriodForDate,
  parseEffectiveDateKey,
  periodCoversDate,
} from "./periods";
import {
  DepartmentOperatorError,
  deriveOperatingModel,
  organizationDisplayLabel,
  type DepartmentOperatorCurrentView,
  type DepartmentOperatorOrganizationSummary,
  type DepartmentOperatorRelationshipView,
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

function toOrganizationSummary(
  row: {
    id: string;
    name: string;
    displayName: string | null;
    legalName: string | null;
    organizationType: string | null;
    isActive: boolean;
  },
): DepartmentOperatorOrganizationSummary {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    legalName: row.legalName,
    organizationType: row.organizationType,
    isActive: row.isActive,
  };
}

function toRelationshipView(row: {
  id: string;
  departmentId: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    displayName: string | null;
    legalName: string | null;
    organizationType: string | null;
    isActive: boolean;
  };
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
  externalAccountCode: string | null;
  contractReference: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DepartmentOperatorRelationshipView {
  return {
    id: row.id,
    departmentId: row.departmentId,
    organizationId: row.organizationId,
    organization: toOrganizationSummary(row.organization),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    notes: row.notes,
    externalAccountCode: row.externalAccountCode,
    contractReference: row.contractReference,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadDepartmentFacilityScope(
  db: DbClient,
  input: { departmentId: string; facilityId: string },
): Promise<{
  departmentId: string;
  facilityId: string;
  facilityOrganizationId: string;
  facilityTimezone: string;
}> {
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      facility: {
        select: {
          organizationId: true,
          timezone: true,
        },
      },
    },
  });
  if (!department) {
    throw new DepartmentOperatorError(
      "DEPARTMENT_NOT_FOUND",
      "Department not found for this facility.",
    );
  }
  return {
    departmentId: department.id,
    facilityId: department.facilityId,
    facilityOrganizationId: department.facility.organizationId,
    facilityTimezone: department.facility.timezone,
  };
}

async function loadRelationshipsForDepartment(
  db: DbClient,
  departmentId: string,
): Promise<DepartmentOperatorRelationshipView[]> {
  const rows = await db.departmentOperatorRelationship.findMany({
    where: { departmentId },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    include: { organization: { select: organizationSelect } },
  });
  return rows.map(toRelationshipView);
}

export async function loadDepartmentOperatorHistory(
  db: DbClient,
  input: { departmentId: string; facilityId: string },
): Promise<DepartmentOperatorRelationshipView[]> {
  await loadDepartmentFacilityScope(db, input);
  return loadRelationshipsForDepartment(db, input.departmentId);
}

export async function loadDepartmentOperatorOnDate(
  db: DbClient,
  input: {
    departmentId: string;
    facilityId: string;
    onDate: Date;
  },
): Promise<DepartmentOperatorCurrentView | null> {
  const scope = await loadDepartmentFacilityScope(db, input);
  const history = await loadRelationshipsForDepartment(db, input.departmentId);
  const match = findPeriodForDate(history, input.onDate);
  if (!match) return null;
  return {
    relationship: match,
    facilityOrganizationId: scope.facilityOrganizationId,
    operatingModel: deriveOperatingModel({
      operatorOrganizationId: match.organizationId,
      facilityOrganizationId: scope.facilityOrganizationId,
    }),
  };
}

export async function loadCurrentDepartmentOperator(
  db: DbClient,
  input: {
    departmentId: string;
    facilityId: string;
    now?: Date;
  },
): Promise<DepartmentOperatorCurrentView | null> {
  const scope = await loadDepartmentFacilityScope(db, input);
  const onDate = getFacilityServiceDate(scope.facilityTimezone, input.now ?? new Date());
  return loadDepartmentOperatorOnDate(db, {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
    onDate,
  });
}

/**
 * Ensure a Department has at least one operator relationship.
 * Uses Facility parent Organization and the facility-local current service date.
 * Does not invent historical contract dates.
 */
export async function ensureInitialDepartmentOperator(
  db: DbClient,
  input: {
    departmentId: string;
    facilityId: string;
    createdByUserId?: string | null;
    effectiveFrom?: Date;
  },
): Promise<{ created: boolean; relationshipId: string }> {
  const scope = await loadDepartmentFacilityScope(db, {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
  });

  const existing = await db.departmentOperatorRelationship.findFirst({
    where: { departmentId: input.departmentId },
    select: { id: true },
    orderBy: { effectiveFrom: "asc" },
  });
  if (existing) {
    return { created: false, relationshipId: existing.id };
  }

  const effectiveFrom =
    input.effectiveFrom ??
    getFacilityServiceDate(scope.facilityTimezone, new Date());

  const created = await db.departmentOperatorRelationship.create({
    data: {
      departmentId: input.departmentId,
      organizationId: scope.facilityOrganizationId,
      effectiveFrom,
      effectiveTo: null,
      createdByUserId: input.createdByUserId ?? null,
      notes: "Initial facility-operated relationship.",
    },
    select: { id: true },
  });

  return { created: true, relationshipId: created.id };
}

export async function searchOrganizationsForOperator(
  db: DbClient,
  input: { query: string; limit?: number },
): Promise<DepartmentOperatorOrganizationSummary[]> {
  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  if (query.length < 1) return [];

  const rows = await db.organization.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
        { legalName: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ name: "asc" }],
    take: limit,
    select: organizationSelect,
  });
  return rows.map(toOrganizationSummary);
}

/**
 * Create an Organization record for use as a Department operator.
 * Does not assign Facility.parent Organization and does not grant access.
 */
export async function createOrganizationForDepartmentOperator(
  db: DbClient,
  input: {
    name: string;
    organizationType?: "MANAGEMENT_COMPANY" | "OTHER" | null;
  },
): Promise<DepartmentOperatorOrganizationSummary> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 200) {
    throw new DepartmentOperatorError(
      "INVALID_INPUT",
      "Organization name must be 2–200 characters.",
    );
  }

  const created = await db.organization.create({
    data: {
      name,
      displayName: name,
      organizationType: input.organizationType ?? "MANAGEMENT_COMPANY",
      isActive: true,
    },
    select: organizationSelect,
  });
  return toOrganizationSummary(created);
}

export type AssignDepartmentOperatorInput = {
  departmentId: string;
  facilityId: string;
  organizationId: string;
  /** Facility-local YYYY-MM-DD. */
  effectiveFromKey: string;
  notes?: string | null;
  externalAccountCode?: string | null;
  contractReference?: string | null;
  createdByUserId?: string | null;
  /** When true, cancel future-scheduled rows that start on/after the new effective date. */
  replaceFutureScheduled?: boolean;
};

/**
 * Assign or schedule an operating Organization.
 * Closes any prior relationship that would still cover the new effective date.
 * Does not rewrite closed historical periods before the cutover day.
 */
export async function assignDepartmentOperator(
  db: DbClient,
  input: AssignDepartmentOperatorInput,
): Promise<DepartmentOperatorCurrentView> {
  const effectiveFrom = parseEffectiveDateKey(input.effectiveFromKey);
  const scope = await loadDepartmentFacilityScope(db, {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
  });

  const organization = await db.organization.findUnique({
    where: { id: input.organizationId },
    select: organizationSelect,
  });
  if (!organization) {
    throw new DepartmentOperatorError(
      "ORGANIZATION_NOT_FOUND",
      "Organization not found.",
    );
  }
  if (!organization.isActive) {
    throw new DepartmentOperatorError(
      "ORGANIZATION_INACTIVE",
      "Organization is inactive.",
    );
  }

  const run = async (tx: Prisma.TransactionClient) => {
    const history = await tx.departmentOperatorRelationship.findMany({
      where: { departmentId: input.departmentId },
      orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
    });

    const futureStartingOnOrAfter = history.filter(
      (row) => toServiceDateKey(row.effectiveFrom) >= toServiceDateKey(effectiveFrom),
    );
    if (futureStartingOnOrAfter.length > 0) {
      if (!input.replaceFutureScheduled) {
        throw new DepartmentOperatorError(
          "OVERLAPPING_PERIOD",
          "A scheduled or overlapping operator change already exists on or after this date. Cancel it first or confirm replacement.",
        );
      }
      await tx.departmentOperatorRelationship.deleteMany({
        where: {
          id: { in: futureStartingOnOrAfter.map((row) => row.id) },
          departmentId: input.departmentId,
        },
      });
    }

    const remaining = history.filter(
      (row) => !futureStartingOnOrAfter.some((future) => future.id === row.id),
    );

    for (const row of remaining) {
      if (!periodCoversDate(row, effectiveFrom)) continue;
      const closeTo = dayBefore(effectiveFrom);
      if (toServiceDateKey(closeTo) < toServiceDateKey(row.effectiveFrom)) {
        throw new DepartmentOperatorError(
          "OVERLAPPING_PERIOD",
          "Cannot replace an operator relationship that starts on the same day without canceling it.",
        );
      }
      await tx.departmentOperatorRelationship.update({
        where: { id: row.id },
        data: { effectiveTo: closeTo },
      });
    }

    const created = await tx.departmentOperatorRelationship.create({
      data: {
        departmentId: input.departmentId,
        organizationId: organization.id,
        effectiveFrom,
        effectiveTo: null,
        notes: input.notes?.trim() || null,
        externalAccountCode: input.externalAccountCode?.trim() || null,
        contractReference: input.contractReference?.trim() || null,
        createdByUserId: input.createdByUserId ?? null,
      },
      include: { organization: { select: organizationSelect } },
    });

    const after = await tx.departmentOperatorRelationship.findMany({
      where: { departmentId: input.departmentId },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });
    assertNoOverlaps(after);

    return toRelationshipView(created);
  };

  const relationship =
    "$transaction" in db
      ? await (db as PrismaClient).$transaction(run)
      : await run(db as Prisma.TransactionClient);

  await trackEvent("department_operator.assigned", {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
    organizationId: organization.id,
    organizationName: organizationDisplayLabel(organization),
    effectiveFrom: toServiceDateKey(effectiveFrom),
    createdByUserId: input.createdByUserId ?? null,
  });

  return {
    relationship,
    facilityOrganizationId: scope.facilityOrganizationId,
    operatingModel: deriveOperatingModel({
      operatorOrganizationId: relationship.organizationId,
      facilityOrganizationId: scope.facilityOrganizationId,
    }),
  };
}

/**
 * Cancel a future-scheduled operator change that has not yet become current.
 * Historical published periods are not deleted.
 */
export async function cancelFutureDepartmentOperatorChange(
  db: DbClient,
  input: {
    departmentId: string;
    facilityId: string;
    relationshipId: string;
    now?: Date;
  },
): Promise<void> {
  const scope = await loadDepartmentFacilityScope(db, {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
  });
  const today = getFacilityServiceDate(scope.facilityTimezone, input.now ?? new Date());

  const row = await db.departmentOperatorRelationship.findFirst({
    where: {
      id: input.relationshipId,
      departmentId: input.departmentId,
    },
  });
  if (!row) {
    throw new DepartmentOperatorError(
      "DEPARTMENT_NOT_FOUND",
      "Operator relationship not found.",
    );
  }
  if (toServiceDateKey(row.effectiveFrom) <= toServiceDateKey(today)) {
    throw new DepartmentOperatorError(
      "NOT_FUTURE_CHANGE",
      "Only future-scheduled operator changes can be canceled.",
    );
  }

  // Re-open the prior period that was closed the day before this future change.
  const priorClose = dayBefore(row.effectiveFrom);
  const run = async (tx: Prisma.TransactionClient) => {
    const prior = await tx.departmentOperatorRelationship.findFirst({
      where: {
        departmentId: input.departmentId,
        effectiveTo: priorClose,
        id: { not: row.id },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    await tx.departmentOperatorRelationship.delete({ where: { id: row.id } });

    if (prior) {
      await tx.departmentOperatorRelationship.update({
        where: { id: prior.id },
        data: { effectiveTo: null },
      });
    }

    const after = await tx.departmentOperatorRelationship.findMany({
      where: { departmentId: input.departmentId },
      select: { effectiveFrom: true, effectiveTo: true },
    });
    assertNoOverlaps(after);
  };

  if ("$transaction" in db) {
    await (db as PrismaClient).$transaction(run);
  } else {
    await run(db as Prisma.TransactionClient);
  }

  await trackEvent("department_operator.future_canceled", {
    departmentId: input.departmentId,
    facilityId: input.facilityId,
    relationshipId: input.relationshipId,
  });
}

export async function loadCurrentOperatorsForFacilityDepartments(
  db: DbClient,
  input: {
    facilityId: string;
    departmentIds: string[];
    now?: Date;
  },
): Promise<Map<string, DepartmentOperatorCurrentView>> {
  if (input.departmentIds.length === 0) return new Map();

  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { id: true, organizationId: true, timezone: true },
  });
  if (!facility) return new Map();

  const onDate = getFacilityServiceDate(facility.timezone, input.now ?? new Date());
  const rows = await db.departmentOperatorRelationship.findMany({
    where: {
      departmentId: { in: input.departmentIds },
      department: { facilityId: input.facilityId },
      effectiveFrom: { lte: onDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
    },
    include: { organization: { select: organizationSelect } },
    orderBy: [{ effectiveFrom: "desc" }],
  });

  const map = new Map<string, DepartmentOperatorCurrentView>();
  for (const row of rows) {
    if (map.has(row.departmentId)) continue;
    const view = toRelationshipView(row);
    map.set(row.departmentId, {
      relationship: view,
      facilityOrganizationId: facility.organizationId,
      operatingModel: deriveOperatingModel({
        operatorOrganizationId: view.organizationId,
        facilityOrganizationId: facility.organizationId,
      }),
    });
  }
  return map;
}
