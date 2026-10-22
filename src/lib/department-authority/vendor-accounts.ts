import type { OrganizationPartnerRole, Prisma, PrismaClient, RoleKey } from "@prisma/client";

import {
  closeCurrentInternalFacilityRole,
  resolveCurrentInternalFacilityRole,
} from "@/lib/facility-access/internal-facility-role";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { createOrganizationMembership, OrganizationMembershipError } from "@/lib/organization-membership";

import { resolveDepartmentMembershipIds } from "@/lib/employee-membership/department";
import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";

import { workforceOperatorKey } from "./workforce-records";
import { ensureVendorPartnerAccess } from "./vendor-entry";
import { VendorHeadError } from "./vendor-heads";

type Db = PrismaClient | Prisma.TransactionClient;

function partnerRoleForEmployee(role: RoleKey): OrganizationPartnerRole {
  if (role === "GM" || role === "MANAGER" || role === "SUPERVISOR") return "PARTNER_MANAGER";
  return "PARTNER_OPERATOR";
}

/**
 * Internal accounts of people who work only in this vendor's Department become vendor accounts.
 * Their workforce record stays. Their facility role ends. The Facility Administrator is left in place.
 */
export async function moveInternalVendorStaffToVendorAccounts(
  db: Db,
  input: { actorUserId: string; organizationId: string; departmentId: string },
): Promise<{ moved: number; skipped: number }> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    throw new VendorHeadError("NOT_ENABLED", "Vendor head assignment is not in effect.");
  }
  const department = await db.department.findFirst({
    where: { id: input.departmentId, isActive: true },
    select: { id: true, facilityId: true },
  });
  if (!department) throw new VendorHeadError("NOT_FOUND", "Department not found.");

  const operators = await loadCurrentOperatorsForFacilityDepartments(db, {
    facilityId: department.facilityId,
    departmentIds: [department.id],
  });
  const current = operators.get(department.id);
  if (!current || current.operatingModel !== "CONTRACTED" || current.relationship.organizationId !== input.organizationId) {
    throw new VendorHeadError("NOT_VENDOR_DEPARTMENT", "This organization does not run that Department.");
  }
  const vendorKey = workforceOperatorKey(
    { operatingModel: "CONTRACTED", operatorOrganizationId: current.relationship.organizationId },
    current.facilityOrganizationId,
  );

  const employees = await db.employee.findMany({
    where: {
      facilityId: department.facilityId,
      userId: { not: null },
      status: { in: ["ACTIVE", "OFF"] },
      OR: [
        { primaryDepartmentId: department.id },
        { employeeDepartments: { some: { departmentId: department.id } } },
      ],
    },
    select: {
      id: true,
      userId: true,
      roleType: true,
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });

  const facility = await db.facility.findUnique({
    where: { id: department.facilityId },
    select: { organizationId: true },
  });
  if (!facility) throw new VendorHeadError("NOT_FOUND", "Facility not found.");

  let moved = 0;
  let skipped = 0;
  for (const employee of employees) {
    if (!employee.userId) {
      skipped += 1;
      continue;
    }
    const role = await resolveCurrentInternalFacilityRole(db, {
      userId: employee.userId,
      facilityId: department.facilityId,
    });
    if (role?.roleKey === "FACILITY_ADMINISTRATOR") {
      skipped += 1;
      continue;
    }
    const departmentIds = resolveDepartmentMembershipIds(employee);
    const allOperators = await loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId: department.facilityId,
      departmentIds,
    });
    const keys = departmentIds.map((departmentId) => {
      const operator = allOperators.get(departmentId);
      return workforceOperatorKey(
        operator
          ? { operatingModel: operator.operatingModel, operatorOrganizationId: operator.relationship.organizationId }
          : undefined,
        facility.organizationId,
      );
    });
    if (new Set(keys).size !== 1 || keys[0] !== vendorKey) {
      skipped += 1;
      continue;
    }

    try {
      await createOrganizationMembership(db, {
        userId: employee.userId,
        organizationId: input.organizationId,
        role: "ORG_MEMBER",
        createdByUserId: input.actorUserId,
      });
    } catch (error) {
      if (!(error instanceof OrganizationMembershipError) || error.code !== "ALREADY_ACTIVE_MEMBER") throw error;
    }

    const entry = await ensureVendorPartnerAccess(db, {
      facilityId: department.facilityId,
      organizationId: input.organizationId,
      departmentId: department.id,
      userId: employee.userId,
      partnerRole: partnerRoleForEmployee(employee.roleType),
      actorOrgAdminUserId: input.actorUserId,
    });
    if (!entry.opened) {
      skipped += 1;
      continue;
    }
    await closeCurrentInternalFacilityRole(db, {
      userId: employee.userId,
      facilityId: department.facilityId,
      actorUserId: input.actorUserId,
    });
    moved += 1;
  }
  return { moved, skipped };
}
