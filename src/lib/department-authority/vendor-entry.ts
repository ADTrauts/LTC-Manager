import type { OrganizationPartnerRole, Prisma, PrismaClient } from "@prisma/client";

import { loadFacilityAdministratorSeat } from "@/lib/facility-administrator/service";
import {
  activateFacilityPartner,
  addPartnerDepartmentScope,
  createFacilityPartner,
  FacilityPartnerError,
  findPeriodContainingInstant,
} from "@/lib/partner-access";
import {
  assignPartnerUser,
  changePartnerUserRole,
  enablePartnerStaffingDelegation,
  isPartnerStaffingDelegated,
  PartnerUserAccessError,
  setFacilityPartnerRoleCeiling,
} from "@/lib/partner-user-access";

type Db = PrismaClient | Prisma.TransactionClient;

export type VendorEntryResult = { opened: boolean; reason: string | null };

/**
 * Gives a vendor account partner access to the Department it runs, so that person can open it.
 * Uses the facility's administrator for the facility-side records and the vendor administrator
 * for the personal assignment. Does nothing when the facility has no administrator.
 */
export async function ensureVendorPartnerAccess(
  db: Db,
  input: {
    facilityId: string;
    organizationId: string;
    departmentId: string;
    userId: string;
    partnerRole: OrganizationPartnerRole;
    actorOrgAdminUserId: string;
  },
): Promise<VendorEntryResult> {
  const seat = await loadFacilityAdministratorSeat(db, input.facilityId);
  if (seat.kind !== "HELD") {
    return { opened: false, reason: "This facility has no Facility Administrator to open vendor access." };
  }
  const faUserId = seat.holder.userId;

  let partnership = await db.facilityPartnerOrganization.findUnique({
    where: {
      facilityId_organizationId: { facilityId: input.facilityId, organizationId: input.organizationId },
    },
    select: { id: true, endedAt: true },
  });
  if (partnership?.endedAt) {
    return { opened: false, reason: "The partnership with this vendor has ended." };
  }
  if (!partnership) {
    const created = await createFacilityPartner(db, {
      facilityId: input.facilityId,
      organizationId: input.organizationId,
      createdByUserId: faUserId,
      notes: "Opened when the vendor's head was named.",
    });
    partnership = { id: created.id, endedAt: null };
  }

  const accessPeriods = await db.facilityPartnerAccessPeriod.findMany({
    where: { facilityPartnerOrganizationId: partnership.id },
    select: { startsAt: true, endsAt: true },
  });
  if (!findPeriodContainingInstant(accessPeriods, new Date())) {
    await activateFacilityPartner(db, {
      partnershipId: partnership.id,
      facilityId: input.facilityId,
      actorUserId: faUserId,
    });
  }

  try {
    await addPartnerDepartmentScope(db, {
      partnershipId: partnership.id,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      actorUserId: faUserId,
    });
  } catch (error) {
    if (!(error instanceof FacilityPartnerError) || error.code !== "SCOPE_ALREADY_ACTIVE") {
      if (error instanceof FacilityPartnerError && error.code === "DEPARTMENT_NOT_FOUND") {
        return { opened: false, reason: "This Department is not open for partner access yet." };
      }
      throw error;
    }
  }

  await setFacilityPartnerRoleCeiling(db, {
    actorUserId: faUserId,
    partnershipId: partnership.id,
    facilityId: input.facilityId,
    maxPartnerRole: "PARTNER_MANAGER",
  });

  if (!(await isPartnerStaffingDelegated(db, { partnershipId: partnership.id }))) {
    try {
      await enablePartnerStaffingDelegation(db, {
        actorUserId: faUserId,
        partnershipId: partnership.id,
        facilityId: input.facilityId,
      });
    } catch (error) {
      if (!(error instanceof PartnerUserAccessError) || error.code !== "POLICY_ALREADY_ENABLED") throw error;
    }
  }

  const authority = { kind: "partner_org_admin" as const, organizationId: input.organizationId };
  try {
    await assignPartnerUser(db, {
      actorUserId: input.actorOrgAdminUserId,
      partnershipId: partnership.id,
      facilityId: input.facilityId,
      userId: input.userId,
      partnerRole: input.partnerRole,
      authority,
    });
  } catch (error) {
    if (!(error instanceof PartnerUserAccessError) || error.code !== "ALREADY_ASSIGNED") throw error;
    await changePartnerUserRole(db, {
      actorUserId: input.actorOrgAdminUserId,
      partnershipId: partnership.id,
      facilityId: input.facilityId,
      userId: input.userId,
      partnerRole: input.partnerRole,
      authority,
    });
  }

  return { opened: true, reason: null };
}
