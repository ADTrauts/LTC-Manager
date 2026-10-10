import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import type { AppRole } from "@/lib/access";
import { EmployeeStatus, EmploymentType, RoleKey } from "@prisma/client";

import { findEmployeeForUserFacility } from "@/lib/employee-identity";
import { prisma } from "@/lib/prisma";
import { rosterNameFromSignupDisplayName } from "@/lib/roster-name";

function displayNameSourceForRoster(displayName: string, email: string): string {
  const d = displayName.trim();
  if (d) return d;
  const local = email.split("@")[0]?.trim() ?? "";
  if (local) return local.replace(/[._]+/g, " ");
  return "Facility leader";
}

/**
 * FACILITY_ADMINISTRATOR and GM hub accounts should have a matching Employee row
 * for roster/staffing/HR. Link is explicit via Employee.userId.
 */
function rosterRoleTypeForEmailUser(role: AppRole): RoleKey | null {
  if (role === "FACILITY_ADMINISTRATOR") return RoleKey.FACILITY_ADMINISTRATOR;
  if (role === "GM") return RoleKey.GM;
  return null;
}

export async function ensureGmEmployeeRosterRow(session: FacilitySession): Promise<void> {
  const rosterRoleType = rosterRoleTypeForEmailUser(session.role);
  if (session.authKind !== "user" || !rosterRoleType || !session.facilityId) {
    return;
  }
  const userId = sessionUserIdForFk(session);
  if (!userId) return;

  const existing = await findEmployeeForUserFacility(prisma, {
    userId,
    facilityId: session.facilityId,
  });
  if (existing) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      email: true,
      isActive: true,
      facility: { select: { organizationId: true } },
      facilityAccesses: {
        where: { facilityId: session.facilityId, isActive: true, revokedAt: null },
        select: { id: true },
      },
    },
  });
  if (!user?.isActive) return;

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { organizationId: true },
  });
  if (!facility) return;
  const sameOrg = user.facility?.organizationId === facility.organizationId;
  if (!sameOrg && user.facilityAccesses.length === 0) return;

  const source = displayNameSourceForRoster(user.displayName, user.email);
  const { firstName, lastName } = rosterNameFromSignupDisplayName(source);

  await prisma.employee.create({
    data: {
      facilityId: session.facilityId,
      userId,
      firstName,
      lastName,
      email: user.email.trim().toLowerCase(),
      roleType: rosterRoleType,
      status: EmployeeStatus.ACTIVE,
      employmentType: EmploymentType.FULL_TIME,
    },
  });
}
