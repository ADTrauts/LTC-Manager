"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  assignPartnerUser,
  changePartnerUserRole,
  endPartnerUserAssignment,
  PartnerUserAccessError,
  setFacilityPartnerRoleCeiling,
} from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";

const partnerRoles = ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const;

export type PartnerUserAccessActionResult = { ok: true; message: string } | { ok: false; message: string };

function fail(error: unknown): PartnerUserAccessActionResult {
  return {
    ok: false,
    message:
      error instanceof PartnerUserAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not update partner user access.",
  };
}

function revalidate(partnershipId: string) {
  revalidatePath("/admin/organization/partners");
  revalidatePath(`/admin/organization/partners/${partnershipId}`);
}

async function actor() {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);
  return session;
}

export async function setPartnerRoleCeilingAction(
  formData: FormData,
): Promise<PartnerUserAccessActionResult> {
  const session = await actor();
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      maxPartnerRole: z.enum(["disabled", ...partnerRoles]),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      maxPartnerRole: formData.get("maxPartnerRole"),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await setFacilityPartnerRoleCeiling(prisma, {
      actorUserId: session.uid,
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      maxPartnerRole:
        parsed.data.maxPartnerRole === "disabled" ? null : parsed.data.maxPartnerRole,
    });
    revalidate(parsed.data.partnershipId);
    return {
      ok: true,
      message:
        parsed.data.maxPartnerRole === "disabled"
          ? "Personal partner access is disabled. Existing assignment history was kept."
          : "Maximum partner role updated. Assignment history was not rewritten.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function assignPartnerUserAction(
  formData: FormData,
): Promise<PartnerUserAccessActionResult> {
  const session = await actor();
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      userId: z.string().cuid(),
      partnerRole: z.enum(partnerRoles),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      userId: formData.get("userId"),
      partnerRole: formData.get("partnerRole"),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await assignPartnerUser(prisma, {
      actorUserId: session.uid,
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      userId: parsed.data.userId,
      partnerRole: parsed.data.partnerRole,
    });
    revalidate(parsed.data.partnershipId);
    return {
      ok: true,
      message: "Partner user assigned. This does not create a Facility session.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function changePartnerUserRoleAction(
  formData: FormData,
): Promise<PartnerUserAccessActionResult> {
  const session = await actor();
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      userId: z.string().cuid(),
      partnerRole: z.enum(partnerRoles),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      userId: formData.get("userId"),
      partnerRole: formData.get("partnerRole"),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await changePartnerUserRole(prisma, {
      actorUserId: session.uid,
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      userId: parsed.data.userId,
      partnerRole: parsed.data.partnerRole,
    });
    revalidate(parsed.data.partnershipId);
    return { ok: true, message: "Partner role updated. Earlier periods were kept." };
  } catch (error) {
    return fail(error);
  }
}

export async function endPartnerUserAssignmentAction(
  formData: FormData,
): Promise<PartnerUserAccessActionResult> {
  const session = await actor();
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      userId: z.string().cuid(),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      userId: formData.get("userId"),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await endPartnerUserAssignment(prisma, {
      actorUserId: session.uid,
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      userId: parsed.data.userId,
    });
    revalidate(parsed.data.partnershipId);
    return { ok: true, message: "Partner assignment ended. Organization membership was not changed." };
  } catch (error) {
    return fail(error);
  }
}
