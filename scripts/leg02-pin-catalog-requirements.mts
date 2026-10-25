/**
 * Name the published Catalog form on maintenance requirements that still
 * only name a template, when that template already matches a form the
 * running Department can use.
 *
 * Requires LEG02_APPLY=1 to write. Does not remove the template columns.
 */
import { PrismaClient, type CatalogFormOwnerKind } from "@prisma/client";

import { loadCurrentOperatorsForFacilityDepartments } from "../src/lib/department-operators/service";
import {
  catalogFormServesRunningDepartment,
  catalogStableKeyForTemplate,
} from "../src/lib/preventive-maintenance/catalog-pin";
import { redactDatabaseUrl } from "./verify/lib/database-target.mjs";

const url = process.env.DATABASE_URL ?? "";
const target = redactDatabaseUrl(url);
if (!url) {
  console.error("leg02 catalog pins: DATABASE_URL is unset.");
  process.exit(1);
}

type OperatorMap = Awaited<ReturnType<typeof loadCurrentOperatorsForFacilityDepartments>>;
type PublishedCatalog = {
  id: string;
  stableKey: string;
  version: number;
  ownerKind: CatalogFormOwnerKind;
  ownerFacilityId: string | null;
  ownerOrganizationId: string | null;
};

const prisma = new PrismaClient();
const operatorsByFacility = new Map<string, OperatorMap>();
const catalogByKey = new Map<string, PublishedCatalog | null>();

async function contractedOrganizationId(facilityId: string, departmentId: string | null) {
  if (!departmentId) return null;
  let operators = operatorsByFacility.get(facilityId);
  if (!operators) {
    const departments = await prisma.department.findMany({
      where: { facilityId, isActive: true },
      select: { id: true },
    });
    operators = await loadCurrentOperatorsForFacilityDepartments(prisma, {
      facilityId,
      departmentIds: departments.map((department) => department.id),
    });
    operatorsByFacility.set(facilityId, operators);
  }
  const current = operators.get(departmentId);
  return current?.operatingModel === "CONTRACTED" ? current.relationship.organizationId : null;
}

async function publishedCatalog(stableKey: string) {
  if (catalogByKey.has(stableKey)) return catalogByKey.get(stableKey) ?? null;
  const row = await prisma.catalogLogDefinition.findFirst({
    where: { stableKey, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: {
      id: true,
      stableKey: true,
      version: true,
      ownerKind: true,
      ownerFacilityId: true,
      ownerOrganizationId: true,
    },
  });
  catalogByKey.set(stableKey, row);
  return row;
}

type Pin = {
  id: string;
  catalogDefinitionId: string;
  catalogStableKey: string;
  catalogVersion: number;
};

const planPins: Pin[] = [];
const repairPins: Pin[] = [];

const plans = await prisma.preventiveMaintenancePlanRecordRequirement.findMany({
  where: { catalogDefinitionId: null },
  select: {
    id: true,
    templateStableKey: true,
    templateName: true,
    planVersion: { select: { plan: { select: { facilityId: true, departmentId: true } } } },
  },
});

for (const row of plans) {
  const key = catalogStableKeyForTemplate({
    stableKey: row.templateStableKey ?? "",
    name: row.templateName ?? "",
  });
  const catalog = await publishedCatalog(key);
  if (!catalog) continue;
  const facilityId = row.planVersion.plan.facilityId;
  const contracted = await contractedOrganizationId(facilityId, row.planVersion.plan.departmentId);
  if (
    !catalogFormServesRunningDepartment({
      ownerKind: catalog.ownerKind,
      ownerFacilityId: catalog.ownerFacilityId,
      ownerOrganizationId: catalog.ownerOrganizationId,
      facilityId,
      contractedOrganizationId: contracted,
    })
  ) {
    continue;
  }
  planPins.push({
    id: row.id,
    catalogDefinitionId: catalog.id,
    catalogStableKey: catalog.stableKey,
    catalogVersion: catalog.version,
  });
}

const repairs = await prisma.repairRecordRequirement.findMany({
  where: { catalogDefinitionId: null },
  select: {
    id: true,
    templateStableKey: true,
    templateName: true,
    repair: {
      select: {
        responsibleDepartmentId: true,
        requestingDepartmentId: true,
        unit: { select: { facilityId: true } },
      },
    },
  },
});

for (const row of repairs) {
  const key = catalogStableKeyForTemplate({
    stableKey: row.templateStableKey ?? "",
    name: row.templateName ?? "",
  });
  const catalog = await publishedCatalog(key);
  if (!catalog) continue;
  const facilityId = row.repair.unit.facilityId;
  const departmentId = row.repair.responsibleDepartmentId ?? row.repair.requestingDepartmentId;
  const contracted = await contractedOrganizationId(facilityId, departmentId);
  if (
    !catalogFormServesRunningDepartment({
      ownerKind: catalog.ownerKind,
      ownerFacilityId: catalog.ownerFacilityId,
      ownerOrganizationId: catalog.ownerOrganizationId,
      facilityId,
      contractedOrganizationId: contracted,
    })
  ) {
    continue;
  }
  repairPins.push({
    id: row.id,
    catalogDefinitionId: catalog.id,
    catalogStableKey: catalog.stableKey,
    catalogVersion: catalog.version,
  });
}

if (process.env.LEG02_APPLY !== "1") {
  console.log(
    `leg02 catalog pins: dry run at ${target}. ${planPins.length} plan requirements and ${repairPins.length} work-order requirements would name a Catalog form. Set LEG02_APPLY=1 to write.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  for (const pin of planPins) {
    await tx.preventiveMaintenancePlanRecordRequirement.update({
      where: { id: pin.id },
      data: {
        catalogDefinitionId: pin.catalogDefinitionId,
        catalogStableKey: pin.catalogStableKey,
        catalogVersion: pin.catalogVersion,
      },
    });
  }
  for (const pin of repairPins) {
    await tx.repairRecordRequirement.update({
      where: { id: pin.id },
      data: {
        catalogDefinitionId: pin.catalogDefinitionId,
        catalogStableKey: pin.catalogStableKey,
        catalogVersion: pin.catalogVersion,
      },
    });
  }
});

console.log(
  `leg02 catalog pins: named Catalog forms on ${planPins.length} plan requirements and ${repairPins.length} work-order requirements at ${target}.`,
);
await prisma.$disconnect();
