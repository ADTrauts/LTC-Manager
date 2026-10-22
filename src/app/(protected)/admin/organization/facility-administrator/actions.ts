"use server";

import { revalidatePath } from "next/cache";

import { requireAtLeastRole } from "@/lib/access";
import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import { requirePasswordSession } from "@/lib/credential-policy";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  cancelFacilityAdministratorInvitation,
  inviteFacilityAdministratorSuccessor,
} from "@/lib/facility-administrator";
import {
  facilityAdministratorActionError,
  type FacilityAdministratorActionResult,
} from "@/lib/facility-administrator/action-result";
import { deliverFacilityAdministratorInvitation } from "@/lib/facility-administrator/delivery";
import { prisma } from "@/lib/prisma";

const PAGE_PATH = "/admin/organization/facility-administrator";

async function requireAdministratorSession() {
  const session = await requireFacilitySession();
  requirePasswordSession(session);
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  if (session.authKind !== "user") {
    throw new Error("Only a signed-in Facility Administrator can transfer the role.");
  }
  return session;
}

export async function inviteFacilityAdministratorSuccessorAction(
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireAdministratorSession();
    const invitedUserId = String(formData.get("invitedUserId") ?? "").trim();
    if (!invitedUserId) {
      return { ok: false, message: "Choose who should take over." };
    }
    const invitation = await inviteFacilityAdministratorSuccessor(prisma, {
      actorUserId: session.uid,
      facilityId: session.facilityId,
      invitedUserId,
      outgoingRoleKey: formData.get("outgoingRoleKey"),
    });
    const message = await deliverFacilityAdministratorInvitation(invitation, await resolveRequestOrigin());
    revalidatePath(PAGE_PATH);
    return { ok: true, message };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not send the invitation.");
  }
}

export async function cancelFacilityAdministratorTransferAction(
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireAdministratorSession();
    await cancelFacilityAdministratorInvitation(prisma, {
      actorUserId: session.uid,
      invitationId: String(formData.get("invitationId") ?? ""),
    });
    revalidatePath(PAGE_PATH);
    return { ok: true, message: "Invitation cancelled." };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not cancel the invitation.");
  }
}
