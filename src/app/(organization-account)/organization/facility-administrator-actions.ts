"use server";

import { revalidatePath } from "next/cache";

import { resolveRequestOrigin } from "@/lib/billing/request-origin";
import {
  appointFacilityAdministratorByOrganization,
  cancelFacilityAdministratorInvitation,
  FacilityAdministratorInvitationError,
} from "@/lib/facility-administrator";
import {
  facilityAdministratorActionError,
  type FacilityAdministratorActionResult,
} from "@/lib/facility-administrator/action-result";
import { deliverFacilityAdministratorInvitation } from "@/lib/facility-administrator/delivery";
import { requireOrganizationSession } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

async function requireOrganizationAdmin(organizationId: string) {
  const { session, membership } = await requireOrganizationSession();
  if (session.organizationId !== organizationId || membership.currentRole !== "ORG_ADMIN") {
    throw new FacilityAdministratorInvitationError(
      "NOT_ORGANIZATION_ADMIN",
      "Only a current Organization Administrator can appoint a Facility Administrator.",
    );
  }
  return session;
}

async function assertFacilityInOrganization(facilityId: string, organizationId: string): Promise<void> {
  const facility = await prisma.facility.findFirst({
    where: { id: facilityId, organizationId },
    select: { id: true },
  });
  if (!facility) {
    throw new FacilityAdministratorInvitationError("NOT_FOUND", "That facility is not in this organization.");
  }
}

export async function appointFacilityAdministratorAction(
  organizationId: string,
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireOrganizationAdmin(organizationId);
    const facilityId = String(formData.get("facilityId") ?? "");
    const invitedEmail = String(formData.get("invitedEmail") ?? "").trim();
    if (!invitedEmail) return { ok: false, message: "Enter the email of the person to appoint." };
    await assertFacilityInOrganization(facilityId, organizationId);
    const invitation = await appointFacilityAdministratorByOrganization(prisma, {
      actorUserId: session.uid,
      facilityId,
      invitedEmail,
    });
    const message = await deliverFacilityAdministratorInvitation(invitation, await resolveRequestOrigin());
    revalidatePath(`/organization/${organizationId}/facilities`);
    return { ok: true, message };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not send the invitation.");
  }
}

export async function cancelFacilityAdministratorRecoveryAction(
  organizationId: string,
  _prev: FacilityAdministratorActionResult | null,
  formData: FormData,
): Promise<FacilityAdministratorActionResult> {
  try {
    const session = await requireOrganizationAdmin(organizationId);
    const invitationId = String(formData.get("invitationId") ?? "");
    const invitation = await prisma.facilityAdministratorInvitation.findUnique({
      where: { id: invitationId },
      select: { facilityId: true },
    });
    if (!invitation) return { ok: false, message: "Invitation not found." };
    await assertFacilityInOrganization(invitation.facilityId, organizationId);
    await cancelFacilityAdministratorInvitation(prisma, { actorUserId: session.uid, invitationId });
    revalidatePath(`/organization/${organizationId}/facilities`);
    return { ok: true, message: "Invitation cancelled." };
  } catch (error) {
    return facilityAdministratorActionError(error, "Could not cancel the invitation.");
  }
}
