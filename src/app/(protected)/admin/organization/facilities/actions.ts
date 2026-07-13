"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import {
  createSessionToken,
  getCookieOptions,
  SESSION_COOKIE,
  sessionUserIdForFk,
} from "@/lib/auth";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  canManageFacilityAccess,
  grantUserFacilityAccess,
  revokeUserFacilityAccess,
  switchActiveFacility,
} from "@/lib/facility-access";
import { prisma } from "@/lib/prisma";

const grantSchema = z.object({
  targetUserId: z.string().min(1),
  targetFacilityId: z.string().min(1),
});

async function requireAccessManager() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  if (!canManageFacilityAccess(session.role)) {
    throw new Error("Insufficient permissions.");
  }
  const actorUserId = sessionUserIdForFk(session);
  if (!actorUserId || session.authKind !== "user") {
    throw new Error("Only email administrators can manage facility access.");
  }
  return { session, actorUserId };
}

export async function grantFacilityAccessAction(formData: FormData) {
  const { session, actorUserId } = await requireAccessManager();
  const parsed = grantSchema.parse({
    targetUserId: formData.get("targetUserId"),
    targetFacilityId: formData.get("targetFacilityId"),
  });

  await grantUserFacilityAccess(prisma, {
    actorUserId,
    actorFacilityId: session.facilityId,
    targetUserId: parsed.targetUserId,
    targetFacilityId: parsed.targetFacilityId,
  });

  revalidatePath("/admin/organization/facilities");
  revalidatePath("/admin/organization");
}

export async function revokeFacilityAccessAction(formData: FormData) {
  const { session, actorUserId } = await requireAccessManager();
  const parsed = grantSchema.parse({
    targetUserId: formData.get("targetUserId"),
    targetFacilityId: formData.get("targetFacilityId"),
  });

  await revokeUserFacilityAccess(prisma, {
    actorUserId,
    actorFacilityId: session.facilityId,
    targetUserId: parsed.targetUserId,
    targetFacilityId: parsed.targetFacilityId,
  });

  revalidatePath("/admin/organization/facilities");
  revalidatePath("/admin/organization");
}

/** Administratively set another user's active facility (same org + explicit grant). */
export async function setUserActiveFacilityAction(formData: FormData) {
  const { session, actorUserId } = await requireAccessManager();
  const parsed = grantSchema.parse({
    targetUserId: formData.get("targetUserId"),
    targetFacilityId: formData.get("targetFacilityId"),
  });

  const target = await prisma.user.findUnique({
    where: { id: parsed.targetUserId },
    select: {
      id: true,
      facilityId: true,
      primaryDepartmentId: true,
      role: { select: { key: true } },
    },
  });
  if (!target) throw new Error("Target user not found.");

  await switchActiveFacility({
    userId: parsed.targetUserId,
    authKind: "user",
    role: target.role.key,
    sourceFacilityId: target.facilityId,
    destinationFacilityId: parsed.targetFacilityId,
    sourceDepartmentId: target.primaryDepartmentId,
  });

  // If the actor switched themselves, refresh their session cookies.
  if (parsed.targetUserId === actorUserId) {
    const jar = await cookies();
    const resultFacility = parsed.targetFacilityId;
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        displayName: true,
        email: true,
        facilityId: true,
        primaryDepartmentId: true,
        role: { select: { key: true } },
      },
    });
    if (user) {
      const token = await createSessionToken({
        uid: actorUserId,
        authKind: "user",
        role: user.role.key,
        name: user.displayName,
        email: user.email,
        facilityId: user.facilityId,
        primaryDepartmentId: user.primaryDepartmentId,
      });
      jar.set(SESSION_COOKIE, token, getCookieOptions());
      jar.set(DEVICE_FACILITY_COOKIE, resultFacility, getDeviceCookieOptions());
      jar.delete(ACTIVE_DEPARTMENT_COOKIE);
    }
  }

  void session;
  revalidatePath("/admin/organization/facilities");
  revalidatePath("/dashboard");
}
