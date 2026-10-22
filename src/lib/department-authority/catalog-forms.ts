import type { CatalogFormOwnerKind, Prisma, PrismaClient } from "@prisma/client";

import type { DepartmentAccessSession } from "@/lib/department-authority/resolve";
import { createCatalogDefinition, publishCatalogDefinition } from "@/lib/canonical-logs/catalog-service";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

import { operatorPeriodIdForCreate } from "./operator-period";
import { resolveDepartmentAccessMap } from "./resolve";
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
  if (!item?.isHead || item.mode !== "MANAGE" || item.operatingModel !== "CONTRACTED") {
    throw new VendorHeadError("NOT_HEAD", "Only the vendor's head can add a form for this Department.");
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

export async function publishVendorCatalogForm(
  db: Db,
  input: { session: DepartmentAccessSession; facilityId: string; departmentId: string; definitionId: string },
): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new VendorHeadError("NOT_ENABLED", "Vendor forms are not in effect.");
  }
  const access = await resolveDepartmentAccessMap(db, input.session, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const item = access.get(input.departmentId);
  if (!item?.isHead || item.mode !== "MANAGE") {
    throw new VendorHeadError("NOT_HEAD", "Only the vendor's head can publish this form.");
  }
  const row = await db.catalogLogDefinition.findFirst({
    where: { id: input.definitionId, ownerKind: "ORGANIZATION" },
    select: { id: true, ownerOrganizationId: true },
  });
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  if (!row || row.ownerOrganizationId !== operators.get(input.departmentId)?.relationship.organizationId) {
    throw new VendorHeadError("NOT_FOUND", "That form belongs to another organization.");
  }
  await publishCatalogDefinition(db, row.id, undefined, { requireFeatureFlag: false });
}
