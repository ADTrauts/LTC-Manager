import type { CatalogFormOwnerKind, OrganizationPartnerRole, Prisma, PrismaClient } from "@prisma/client";

import type { DepartmentAccessSession } from "@/lib/department-authority/resolve";
import { createCatalogDefinition, publishCatalogDefinition } from "@/lib/canonical-logs/catalog-service";
import { ensureFacilityCatalogInstall } from "@/lib/canonical-logs/facility-catalog-install";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

import { operatorPeriodIdForCreate } from "./operator-period";
import { resolveDepartmentAccessMap } from "./resolve";
import { resolveDepartmentStaffManagerIds } from "./staff-managers";
import { partnerMaySetUpDepartment } from "./partner-setup";
import { VendorHeadError } from "./vendor-heads";

type Db = PrismaClient | Prisma.TransactionClient;

export function catalogFormIsVisible(input: {
  ownerKind: CatalogFormOwnerKind;
  ownerFacilityId: string | null;
  ownerOrganizationId: string | null;
  facilityId: string;
  allowedOrganizationIds: readonly string[];
}): boolean {
  if (input.ownerKind === "VSSYL") return true;
  if (input.ownerKind === "FACILITY") return input.ownerFacilityId === input.facilityId;
  return (
    input.ownerOrganizationId != null &&
    input.allowedOrganizationIds.includes(input.ownerOrganizationId)
  );
}

/** Published forms a facility, or one of its Departments, may link and require. */
export async function publishedCatalogFormsAtFacility(
  db: Db,
  input: { facilityId: string; departmentId?: string | null },
) {
  const departments = input.departmentId
    ? [{ id: input.departmentId }]
    : await db.department.findMany({
        where: { facilityId: input.facilityId, isActive: true },
        select: { id: true },
      });
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: departments.map((department) => department.id),
  });
  const current = input.departmentId ? operators.get(input.departmentId) : null;
  const contractedOrganizationId =
    current?.operatingModel === "CONTRACTED" ? current.relationship.organizationId : null;
  const allowedOrganizationIds = input.departmentId
    ? contractedOrganizationId
      ? [contractedOrganizationId]
      : []
    : [
        ...new Set(
          [...operators.values()]
            .filter((operator) => operator.operatingModel === "CONTRACTED")
            .map((operator) => operator.relationship.organizationId),
        ),
      ];
  const rows = await db.catalogLogDefinition.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ version: "desc" }],
    select: {
      id: true,
      name: true,
      stableKey: true,
      version: true,
      ownerKind: true,
      ownerFacilityId: true,
      ownerOrganizationId: true,
    },
  });
  const seen = new Set<string>();
  const latest = [];
  for (const row of rows) {
    if (seen.has(row.stableKey)) continue;
    const visible = input.departmentId && contractedOrganizationId
      ? row.ownerKind === "VSSYL" ||
        (row.ownerKind === "ORGANIZATION" && row.ownerOrganizationId === contractedOrganizationId)
      : catalogFormIsVisible({
          ownerKind: row.ownerKind,
          ownerFacilityId: row.ownerFacilityId,
          ownerOrganizationId: row.ownerOrganizationId,
          facilityId: input.facilityId,
          allowedOrganizationIds,
        });
    if (!visible) continue;
    seen.add(row.stableKey);
    latest.push(row);
  }
  latest.sort((a, b) => a.name.localeCompare(b.name));
  return latest;
}

/** Forms this person may use at a facility. Empty when enforcement is off. */
export async function catalogFormsWhereForViewer(
  db: Db,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<Prisma.CatalogLogDefinitionWhereInput> {
  if (!isContractedDepartmentAuthorityEnabled()) return {};
  const departments = await db.department.findMany({
    where: { facilityId, isActive: true },
    select: { id: true },
  });
  const [access, operators] = await Promise.all([
    resolveDepartmentAccessMap(db, session, {
      facilityId,
      departmentIds: departments.map((department) => department.id),
    }),
    loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId,
      departmentIds: departments.map((department) => department.id),
    }),
  ]);
  const organizationIds = new Set<string>();
  for (const department of departments) {
    const item = access.get(department.id);
    const current = operators.get(department.id);
    if (!item || item.mode !== "MANAGE" || (!item.isHead && !item.isMember)) continue;
    if (current?.operatingModel === "CONTRACTED") organizationIds.add(current.relationship.organizationId);
  }
  return {
    OR: [
      { ownerKind: "VSSYL" },
      { ownerKind: "FACILITY", ownerFacilityId: facilityId },
      ...(organizationIds.size > 0
        ? [{ ownerKind: "ORGANIZATION" as const, ownerOrganizationId: { in: [...organizationIds] } }]
        : []),
    ],
  };
}

export async function createVendorCatalogForm(
  db: Db,
  input: {
    session: DepartmentAccessSession;
    facilityId: string;
    departmentId: string;
    effectiveRole: OrganizationPartnerRole;
    name: string;
    fieldLabel: string;
  },
): Promise<{ definitionId: string }> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new VendorHeadError("NOT_ENABLED", "Vendor forms are not in effect.");
  }
  const access = await resolveDepartmentAccessMap(db, input.session, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const item = access.get(input.departmentId);
  if (
    !item ||
    item.mode !== "MANAGE" ||
    item.operatingModel !== "CONTRACTED" ||
    !partnerMaySetUpDepartment({
      mode: item.mode,
      isHead: item.isHead,
      effectiveRole: input.effectiveRole,
    })
  ) {
    throw new VendorHeadError(
      "NOT_HEAD",
      "Only the Department head or a Partner Manager can add a form for this Department.",
    );
  }
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const organizationId = operators.get(input.departmentId)?.relationship.organizationId;
  if (!organizationId) throw new VendorHeadError("NOT_VENDOR_DEPARTMENT", "This Department has no vendor operator.");
  const name = input.name.trim();
  const fieldLabel = input.fieldLabel.trim();
  if (!name || !fieldLabel) throw new VendorHeadError("NOT_FOUND", "Enter a form name and a field.");
  const created = await createCatalogDefinition(
    db,
    {
      name,
      purposeType: "CHECKLIST",
      category: "OTHER",
      fields: [{ label: fieldLabel, fieldType: "SHORT_TEXT", isRequired: true }],
    },
    { requireFeatureFlag: false },
  );
  await db.catalogLogDefinition.update({
    where: { id: created.id },
    data: {
      ownerKind: "ORGANIZATION",
      ownerOrganizationId: organizationId,
      operatorPeriodId: await operatorPeriodIdForCreate(db, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      }),
    },
  });
  return { definitionId: created.id };
}

/** The head, or a manager the head has allowed, may build a facility-owned form. */
export function mayAuthorFacilityCatalogForm(input: {
  mode: string | null | undefined;
  operatingModel: string | null | undefined;
  isHead: boolean;
  isAllowedManager: boolean;
}): boolean {
  if (input.mode !== "MANAGE") return false;
  if (input.operatingModel === "CONTRACTED") return false;
  return input.isHead || input.isAllowedManager;
}

async function actorEmployeeId(
  db: Db,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<string | null> {
  if ("authKind" in session && session.authKind === "employee") return session.uid;
  const employee = await db.employee.findFirst({
    where: { userId: session.uid, facilityId },
    select: { id: true },
  });
  return employee?.id ?? null;
}

async function assertFacilityFormAuthor(
  db: Db,
  input: { session: DepartmentAccessSession; facilityId: string; departmentId: string },
) {
  const access = await resolveDepartmentAccessMap(db, input.session, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const item = access.get(input.departmentId);
  const employeeId = await actorEmployeeId(db, input.session, input.facilityId);
  const allowed = await resolveDepartmentStaffManagerIds(db, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  if (
    !mayAuthorFacilityCatalogForm({
      mode: item?.mode,
      operatingModel: item?.operatingModel,
      isHead: item?.isHead === true,
      isAllowedManager: employeeId != null && allowed.includes(employeeId),
    })
  ) {
    throw new VendorHeadError(
      "NOT_HEAD",
      "Only the Department head, or a manager the head allows, can add a form for this Department.",
    );
  }
  return item!;
}

/** A Department head, or a manager the head allows, builds a facility-owned form. */
export async function createFacilityCatalogForm(
  db: Db,
  input: {
    session: DepartmentAccessSession;
    facilityId: string;
    departmentId: string;
    name: string;
    fieldLabel: string;
  },
): Promise<{ definitionId: string }> {
  await assertFacilityFormAuthor(db, input);
  const name = input.name.trim();
  const fieldLabel = input.fieldLabel.trim();
  if (!name || !fieldLabel) throw new VendorHeadError("NOT_FOUND", "Enter a form name and a field.");
  const created = await createCatalogDefinition(
    db,
    {
      name,
      purposeType: "CHECKLIST",
      category: "OTHER",
      fields: [{ label: fieldLabel, fieldType: "SHORT_TEXT", isRequired: true }],
    },
    { requireFeatureFlag: false },
  );
  await db.catalogLogDefinition.update({
    where: { id: created.id },
    data: {
      ownerKind: "FACILITY",
      ownerFacilityId: input.facilityId,
      operatorPeriodId: await operatorPeriodIdForCreate(db, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      }),
    },
  });
  return { definitionId: created.id };
}

export async function publishFacilityCatalogForm(
  db: Db,
  input: { session: DepartmentAccessSession; facilityId: string; departmentId: string; definitionId: string },
): Promise<void> {
  const author = await assertFacilityFormAuthor(db, input);
  const row = await db.catalogLogDefinition.findFirst({
    where: {
      id: input.definitionId,
      ownerKind: "FACILITY",
      ownerFacilityId: input.facilityId,
      operatorPeriodId: author.operatorPeriodId,
    },
    select: { id: true, stableKey: true, version: true },
  });
  if (!row) throw new VendorHeadError("NOT_FOUND", "That form belongs to another facility.");
  const published = await publishCatalogDefinition(db, row.id, undefined, { requireFeatureFlag: false });
  await ensureFacilityCatalogInstall(db, {
    facilityId: input.facilityId,
    catalogDefinitionId: published.id,
    catalogStableKey: published.stableKey,
    catalogVersion: published.version,
  });
}

export async function publishVendorCatalogForm(
  db: Db,
  input: {
    session: DepartmentAccessSession;
    facilityId: string;
    departmentId: string;
    definitionId: string;
    effectiveRole: OrganizationPartnerRole;
  },
): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new VendorHeadError("NOT_ENABLED", "Vendor forms are not in effect.");
  }
  const access = await resolveDepartmentAccessMap(db, input.session, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const item = access.get(input.departmentId);
  if (
    !item ||
    item.mode !== "MANAGE" ||
    !partnerMaySetUpDepartment({
      mode: item.mode,
      isHead: item.isHead,
      effectiveRole: input.effectiveRole,
    })
  ) {
    throw new VendorHeadError(
      "NOT_HEAD",
      "Only the Department head or a Partner Manager can publish this form.",
    );
  }
  const row = await db.catalogLogDefinition.findFirst({
    where: { id: input.definitionId, ownerKind: "ORGANIZATION" },
    select: { id: true, ownerOrganizationId: true, stableKey: true, version: true },
  });
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  if (!row || row.ownerOrganizationId !== operators.get(input.departmentId)?.relationship.organizationId) {
    throw new VendorHeadError("NOT_FOUND", "That form belongs to another organization.");
  }
  const published = await publishCatalogDefinition(db, row.id, undefined, { requireFeatureFlag: false });
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const relationships = await db.departmentOperatorRelationship.findMany({
    where: {
      organizationId: row.ownerOrganizationId,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    select: { department: { select: { facilityId: true } } },
  });
  const facilityIds = [...new Set(relationships.map((relationship) => relationship.department.facilityId))];
  for (const facilityId of facilityIds) {
    await ensureFacilityCatalogInstall(db, {
      facilityId,
      catalogDefinitionId: published.id,
      catalogStableKey: published.stableKey,
      catalogVersion: published.version,
    });
  }
}
