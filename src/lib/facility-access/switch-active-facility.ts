import type { PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import type { AuthKind } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

import { assertUserFacilityAccess } from "./assert-user-facility-access";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type SwitchActiveFacilityResult = {
  facilityId: string;
  facilityName: string;
  organizationId: string;
  primaryDepartmentId: string | null;
  /** Department cookie value to set, or null to clear. */
  departmentCookieValue: string | null;
  redirectPath: string;
};

/**
 * Preserve operational department lens across facilities only when the same
 * department key exists and is active/showInEmployeeApp at the destination.
 */
export async function resolveDepartmentCarryoverForFacilitySwitch(
  db: DbClient,
  input: {
    destinationFacilityId: string;
    sourceDepartmentId: string | null | undefined;
    sourceDepartmentKey: string | null | undefined;
  },
): Promise<{ primaryDepartmentId: string | null; departmentCookieValue: string | null }> {
  let key = input.sourceDepartmentKey?.trim() || null;

  if (!key && input.sourceDepartmentId) {
    const source = await db.department.findUnique({
      where: { id: input.sourceDepartmentId },
      select: { key: true },
    });
    key = source?.key ?? null;
  }

  if (!key) {
    return { primaryDepartmentId: null, departmentCookieValue: null };
  }

  const dest = await db.department.findFirst({
    where: {
      facilityId: input.destinationFacilityId,
      key,
      isActive: true,
      showInEmployeeApp: true,
    },
    select: { id: true },
  });

  if (!dest) {
    return { primaryDepartmentId: null, departmentCookieValue: null };
  }

  return { primaryDepartmentId: dest.id, departmentCookieValue: dest.id };
}

/**
 * Switch the authenticated email user's active facility.
 * Updates User.facilityId and returns values for JWT re-issue + cookie updates.
 * PIN/kiosk sessions must not call this.
 */
export async function switchActiveFacility(
  input: {
    userId: string;
    authKind: AuthKind;
    role: AppRole;
    sourceFacilityId: string;
    destinationFacilityId: string;
    sourceDepartmentId?: string | null;
    sourceDepartmentKey?: string | null;
  },
  db: DbClient = prisma,
): Promise<SwitchActiveFacilityResult> {
  if (input.authKind !== "user") {
    throw new Error("Facility switching is not available for PIN sessions.");
  }

  if (!input.destinationFacilityId?.trim()) {
    throw new Error("Destination facility is required.");
  }

  if (input.destinationFacilityId === input.sourceFacilityId) {
    const facility = await db.facility.findUnique({
      where: { id: input.sourceFacilityId },
      select: {
        id: true,
        displayName: true,
        organizationId: true,
      },
    });
    if (!facility) throw new Error("Facility not found.");
    return {
      facilityId: facility.id,
      facilityName: facility.displayName,
      organizationId: facility.organizationId,
      primaryDepartmentId: input.sourceDepartmentId ?? null,
      departmentCookieValue: input.sourceDepartmentId ?? null,
      redirectPath: resolveDefaultHomePath({
        authKind: "user",
        role: input.role,
      }),
    };
  }

  await assertUserFacilityAccess(db, input.userId, input.destinationFacilityId);

  const destination = await db.facility.findUnique({
    where: { id: input.destinationFacilityId },
    select: {
      id: true,
      displayName: true,
      organizationId: true,
      organization: { select: { id: true } },
    },
  });
  if (!destination) {
    throw new Error("Facility not found.");
  }

  const source = await db.facility.findUnique({
    where: { id: input.sourceFacilityId },
    select: { organizationId: true },
  });
  if (!source) {
    throw new Error("Source facility not found.");
  }
  if (source.organizationId !== destination.organizationId) {
    throw new Error("Cross-organization facility switch rejected.");
  }

  const carry = await resolveDepartmentCarryoverForFacilitySwitch(db, {
    destinationFacilityId: destination.id,
    sourceDepartmentId: input.sourceDepartmentId,
    sourceDepartmentKey: input.sourceDepartmentKey,
  });

  await db.user.update({
    where: { id: input.userId },
    data: {
      facilityId: destination.id,
      primaryDepartmentId: carry.primaryDepartmentId,
    },
  });

  await trackEvent("facility_access.switched", {
    actorUserId: input.userId,
    sourceFacilityId: input.sourceFacilityId,
    destinationFacilityId: destination.id,
    organizationId: destination.organizationId,
  });

  return {
    facilityId: destination.id,
    facilityName: destination.displayName,
    organizationId: destination.organizationId,
    primaryDepartmentId: carry.primaryDepartmentId,
    departmentCookieValue: carry.departmentCookieValue,
    redirectPath: resolveDefaultHomePath({
      authKind: "user",
      role: input.role,
    }),
  };
}
