import type { Prisma, PrismaClient } from "@prisma/client";

import type { DepartmentAccessSession } from "@/lib/department-authority/resolve";
import { hasPlantDomainCapabilities } from "@/lib/department-admission";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

import { resolveDepartmentAccess, resolveDepartmentAccessMap } from "./resolve";

type Db = PrismaClient | Prisma.TransactionClient;

/** Another party's organization must accept before it becomes the maintainer. */
export function maintainerChangeNeedsAcceptance(input: {
  proposerOrganizationId: string | null;
  proposedOrganizationId: string | null;
}): boolean {
  if (!input.proposedOrganizationId) return false;
  return input.proposedOrganizationId !== input.proposerOrganizationId;
}

export type RepairCompanyAudience =
  | { kind: "all" }
  | { kind: "facility"; facilityOrganizationId: string }
  | { kind: "vendor"; organizationIds: string[] };

/** Facility staff see the facility's companies. A vendor team sees only its own. */
export function repairCompanyAudience(input: {
  enforcementEnabled: boolean;
  seesFacilityCompanies: boolean;
  facilityOrganizationId: string;
  vendorOrganizationIds: readonly string[];
}): RepairCompanyAudience {
  if (!input.enforcementEnabled) return { kind: "all" };
  if (input.seesFacilityCompanies || input.vendorOrganizationIds.length === 0) {
    return { kind: "facility", facilityOrganizationId: input.facilityOrganizationId };
  }
  return { kind: "vendor", organizationIds: [...input.vendorOrganizationIds] };
}

export function repairCompanyWhereForAudience(audience: RepairCompanyAudience): Prisma.VendorWhereInput {
  if (audience.kind === "all") return {};
  if (audience.kind === "facility") {
    return {
      OR: [
        { ownerOrganizationId: null },
        { ownerOrganization: { organizationId: audience.facilityOrganizationId } },
        { ownerOrganization: { organizationId: null } },
      ],
    };
  }
  return { ownerOrganization: { organizationId: { in: audience.organizationIds } } };
}

/** Vendor-paid cost and the repair company stay with the vendor's team. */
export function vendorRepairCostIsPrivate(input: {
  enforcementEnabled: boolean;
  payerIsVendor: boolean;
  viewerIsVendorTeam: boolean;
}): boolean {
  return input.enforcementEnabled && input.payerIsVendor && !input.viewerIsVendorTeam;
}

async function proposerOrganizationId(
  db: Db,
  input: { facilityId: string; departmentId: string | null },
): Promise<string | null> {
  if (!input.departmentId) return null;
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true },
  });
  if (!facility) return null;
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: [input.departmentId],
  });
  const current = operators.get(input.departmentId);
  if (!current || current.operatingModel !== "CONTRACTED") return facility.organizationId;
  return current.relationship.organizationId;
}

/**
 * Applies a maintainer the proposer's own organization already is.
 * A different organization waits for that party to accept, and the current maintainer stays.
 */
export async function applyMaintainerChoice(
  db: Db,
  input: {
    session: DepartmentAccessSession;
    facilityId: string;
    assetId: string;
    usingDepartmentId: string | null;
    currentOrganizationId: string | null;
    proposedFacilityOrganizationId: string | null;
  },
): Promise<{ apply: boolean; pending: boolean }> {
  if (!isContractedDepartmentAuthorityEnabled()) return { apply: true, pending: false };
  if (!input.proposedFacilityOrganizationId) return { apply: true, pending: false };
  if (input.proposedFacilityOrganizationId === input.currentOrganizationId) return { apply: true, pending: false };

  if (input.usingDepartmentId) {
    const access = await resolveDepartmentAccess(db, input.session, {
      facilityId: input.facilityId,
      departmentId: input.usingDepartmentId,
    });
    if (!access || access.mode !== "MANAGE" || !access.isHead) {
      throw new Error("Only this Department's head can set who maintains an asset.");
    }
  }

  const proposed = await db.facilityOrganization.findFirst({
    where: { id: input.proposedFacilityOrganizationId, facilityId: input.facilityId, isActive: true },
    select: { id: true, organizationId: true },
  });
  if (!proposed) throw new Error("Responsible organization not found.");

  const ownOrganizationId = await proposerOrganizationId(db, {
    facilityId: input.facilityId,
    departmentId: input.usingDepartmentId,
  });
  if (
    !maintainerChangeNeedsAcceptance({
      proposerOrganizationId: ownOrganizationId,
      proposedOrganizationId: proposed.organizationId,
    })
  ) {
    return { apply: true, pending: false };
  }

  await db.assetMaintainerProposal.updateMany({
    where: { assetId: input.assetId, status: "PENDING" },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  await db.assetMaintainerProposal.create({
    data: {
      assetId: input.assetId,
      facilityOrganizationId: proposed.id,
      proposedByUserId: input.session.authKind === "user" ? input.session.uid : null,
      status: "PENDING",
    },
  });
  return { apply: false, pending: true };
}

export async function acceptMaintainerProposal(
  db: Db,
  input: { session: DepartmentAccessSession; facilityId: string; proposalId: string },
): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new Error("Maintainer acceptance is not in effect.");
  }
  const proposal = await db.assetMaintainerProposal.findFirst({
    where: { id: input.proposalId, status: "PENDING", asset: { unit: { facilityId: input.facilityId } } },
    select: {
      id: true,
      assetId: true,
      facilityOrganization: { select: { id: true, organizationId: true } },
    },
  });
  if (!proposal) throw new Error("That maintainer change is not waiting for acceptance.");
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true },
  });
  if (!facility || !proposal.facilityOrganization.organizationId) {
    throw new Error("This maintainer is not linked to an organization.");
  }
  const targetOrganizationId = proposal.facilityOrganization.organizationId;
  const forFacility = targetOrganizationId === facility.organizationId;
  if (forFacility) {
    const plant = await db.department.findFirst({
      where: { facilityId: input.facilityId, isActive: true, key: "PLANT" },
      select: { id: true, key: true },
    });
    if (!plant || !hasPlantDomainCapabilities(plant.key)) {
      throw new Error("Plant accepts a maintainer for the facility.");
    }
    const access = await resolveDepartmentAccess(db, input.session, {
      facilityId: input.facilityId,
      departmentId: plant.id,
    });
    if (!access?.isHead) throw new Error("The Plant head accepts a maintainer for the facility.");
  } else {
    const operated = await db.department.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      select: { id: true },
    });
    const [access, operates] = await Promise.all([
      resolveDepartmentAccessMap(db, input.session, {
        facilityId: input.facilityId,
        departmentIds: operated.map((row) => row.id),
      }),
      loadCurrentOperatorsForFacilityDepartments(db, {
        facilityId: input.facilityId,
        departmentIds: operated.map((row) => row.id),
      }),
    ]);
    const headed = [...access.entries()].some(([departmentId, item]) => {
      const current = operates.get(departmentId);
      return (
        current?.relationship.organizationId === targetOrganizationId &&
        item.isHead &&
        item.mode === "MANAGE"
      );
    });
    if (!headed) throw new Error("That vendor's head accepts this maintainer.");
  }

  await db.asset.update({
    where: { id: proposal.assetId },
    data: { responsibleOrganizationId: proposal.facilityOrganization.id },
  });
  await db.assetMaintainerProposal.update({
    where: { id: proposal.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedByUserId: input.session.authKind === "user" ? input.session.uid : null,
    },
  });
}

/** Where a maintained asset's work order is run, and who pays. Null keeps today's routing. */
export async function routeMaintainedWorkOrder(
  db: Db,
  input: { facilityId: string; assetId: string },
): Promise<{ responsibleDepartmentId: string; payerOrganizationId: string } | null> {
  if (!isContractedDepartmentAuthorityEnabled()) return null;
  const asset = await db.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: {
      responsibleOrganization: { select: { id: true, organizationId: true } },
    },
  });
  const maintainer = asset?.responsibleOrganization;
  if (!maintainer?.organizationId) return null;
  const facility = await db.facility.findUnique({
    where: { id: input.facilityId },
    select: { organizationId: true },
  });
  if (!facility) return null;
  const departments = await db.department.findMany({
    where: { facilityId: input.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (maintainer.organizationId === facility.organizationId) {
    const plant = departments.find((department) => hasPlantDomainCapabilities(department.key));
    return plant ? { responsibleDepartmentId: plant.id, payerOrganizationId: maintainer.id } : null;
  }
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: departments.map((department) => department.id),
  });
  const vendorDepartment = [...operators.entries()].find(
    ([, current]) =>
      current.operatingModel === "CONTRACTED" &&
      current.relationship.organizationId === maintainer.organizationId,
  );
  if (!vendorDepartment) return null;
  return { responsibleDepartmentId: vendorDepartment[0], payerOrganizationId: maintainer.id };
}

export async function repairVendorExpenseVisible(
  db: Db,
  session: DepartmentAccessSession,
  input: { facilityId: string; repairId: string },
): Promise<boolean> {
  if (!isContractedDepartmentAuthorityEnabled()) return true;
  const repair = await db.repair.findFirst({
    where: { id: input.repairId, unit: { facilityId: input.facilityId } },
    select: {
      payerOrganization: { select: { organizationId: true } },
      unit: { select: { facility: { select: { organizationId: true } } } },
    },
  });
  const payerOrganizationId = repair?.payerOrganization?.organizationId ?? null;
  const facilityOrganizationId = repair?.unit.facility.organizationId ?? null;
  if (!payerOrganizationId || payerOrganizationId === facilityOrganizationId) return true;

  const departments = await db.department.findMany({
    where: { facilityId: input.facilityId, isActive: true },
    select: { id: true },
  });
  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: input.facilityId,
    departmentIds: departments.map((department) => department.id),
  });
  const vendorDepartmentIds = [...operators.entries()]
    .filter(([, current]) => current.relationship.organizationId === payerOrganizationId)
    .map(([departmentId]) => departmentId);
  if (vendorDepartmentIds.length === 0) return false;
  const access = await resolveDepartmentAccessMap(db, session, {
    facilityId: input.facilityId,
    departmentIds: vendorDepartmentIds,
  });
  return [...access.values()].some((item) => item.mode === "MANAGE" && (item.isHead || item.isMember));
}

async function resolveRepairCompanyAudience(
  db: Db,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<RepairCompanyAudience> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    return { kind: "all" };
  }
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { organizationId: true },
  });
  if (!facility) return { kind: "all" };
  const departments = await db.department.findMany({
    where: { facilityId, isActive: true },
    select: { id: true, key: true },
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
  const role = "role" in session ? session.role : undefined;
  let seesFacilityCompanies = role ? isFacilityAdministratorRole(role) : false;
  if (session.authKind === "harbor_staff") seesFacilityCompanies = true;
  const vendorOrganizationIds: string[] = [];
  for (const department of departments) {
    const item = access.get(department.id);
    if (!item || item.mode === "NONE") continue;
    if (hasPlantDomainCapabilities(department.key) && (item.isHead || item.isMember)) {
      seesFacilityCompanies = true;
    }
    const current = operators.get(department.id);
    if (
      current?.operatingModel === "CONTRACTED" &&
      item.mode === "MANAGE" &&
      (item.isHead || item.isMember)
    ) {
      vendorOrganizationIds.push(current.relationship.organizationId);
    }
  }
  return repairCompanyAudience({
    enforcementEnabled: true,
    seesFacilityCompanies,
    facilityOrganizationId: facility.organizationId,
    vendorOrganizationIds,
  });
}

/** Extra vendor filter. Empty when enforcement is off, so today's list stays. */
export async function repairCompanyWhere(
  db: Db,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<Prisma.VendorWhereInput> {
  return repairCompanyWhereForAudience(await resolveRepairCompanyAudience(db, session, facilityId));
}

/** The FacilityOrganization row a new repair company belongs to. Null keeps it on the facility list. */
export async function repairCompanyOwnerIdForActor(
  db: Db,
  session: DepartmentAccessSession,
  facilityId: string,
): Promise<string | null> {
  const audience = await resolveRepairCompanyAudience(db, session, facilityId);
  if (audience.kind === "all") return null;
  if (audience.kind === "facility") {
    const row = await db.facilityOrganization.findFirst({
      where: { facilityId, organizationId: audience.facilityOrganizationId, isActive: true },
      select: { id: true },
    });
    return row?.id ?? null;
  }
  const row = await db.facilityOrganization.findFirst({
    where: { facilityId, organizationId: { in: audience.organizationIds }, isActive: true },
    select: { id: true },
  });
  if (!row) {
    throw new Error("Add your organization as a maintainer before adding a repair company.");
  }
  return row.id;
}

export async function assertRepairCompanyMatchesMaintainer(
  db: Db,
  input: { facilityId: string; vendorId: string; maintainerFacilityOrganizationId: string | null },
): Promise<void> {
  if (!isContractedDepartmentAuthorityEnabled()) return;
  const vendor = await db.vendor.findFirst({
    where: { id: input.vendorId, facilityId: input.facilityId },
    select: { ownerOrganization: { select: { organizationId: true } } },
  });
  if (!vendor) throw new Error("Vendor not found.");
  if (!input.maintainerFacilityOrganizationId || !vendor.ownerOrganization?.organizationId) return;
  const maintainer = await db.facilityOrganization.findFirst({
    where: { id: input.maintainerFacilityOrganizationId, facilityId: input.facilityId },
    select: { organizationId: true },
  });
  if (!maintainer?.organizationId) return;
  if (maintainer.organizationId !== vendor.ownerOrganization.organizationId) {
    throw new Error("This repair company belongs to a different maintainer.");
  }
}
