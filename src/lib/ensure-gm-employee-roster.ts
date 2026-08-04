import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import type { AppRole } from "@/lib/access";
import { EmployeeStatus, EmploymentType, RoleKey } from "@prisma/client";

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
 * FACILITY_ADMINISTRATOR and GM hub accounts (`User`) should always have a matching `Employee` row for the roster,
 * staffing, and HR flows.
 * Self-serve signup creates both; this covers legacy accounts and any missed backfills.
 */
function rosterRoleTypeForEmailUser(role: AppRole): RoleKey | null {
  if (role === "FACILITY_ADMINISTRATOR") return RoleKey.FACILITY_ADMINISTRATOR;
  if (role === "GM") return RoleKey.GM;
  return null;
}

/** Ensures FACILITY_ADMINISTRATOR and GM hub accounts appear on the employee roster when missing (legacy installs). */
export async function ensureGmEmployeeRosterRow(session: AppJwtPayload): Promise<void> {
  const rosterRoleType = rosterRoleTypeForEmailUser(session.role);
  if (session.authKind !== "user" || !rosterRoleType || !session.facilityId) {
    return;
  }
  const userId = sessionUserIdForFk(session);
  if (!userId) return;

  const email = session.email.trim().toLowerCase();
  if (!email) return;

  const existing = await prisma.employee.findFirst({
    where: {
      facilityId: session.facilityId,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true, facilityId: true, email: true },
  });
  if (!user || user.facilityId !== session.facilityId) return;

  const source = displayNameSourceForRoster(user.displayName, user.email);
  const { firstName, lastName } = rosterNameFromSignupDisplayName(source);

  await prisma.employee.create({
    data: {
      facilityId: session.facilityId,
      firstName,
      lastName,
      email: user.email.trim().toLowerCase(),
      roleType: rosterRoleType,
      status: EmployeeStatus.ACTIVE,
      employmentType: EmploymentType.FULL_TIME,
    },
  });
}
