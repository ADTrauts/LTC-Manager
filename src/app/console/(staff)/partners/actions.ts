"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHarborOwner } from "@/lib/harbor-console/auth";
import {
  OrganizationClaimError,
  approveOrganizationClaim,
  createHarborOrganizationClaimRequest,
} from "@/lib/organization-claims";
import { deliverOrganizationClaimInvitation } from "@/lib/organization-claims/send";
import {
  OrganizationMemberInvitationError,
  inviteOrganizationMemberFromHarbor,
} from "@/lib/organization-member-invitations";
import { deliverOrganizationMemberInvitation } from "@/lib/organization-member-invitations/send";
import { createPartnerCompany, type PartnerCompanyRecord } from "@/lib/organization/partner-company";
import { prisma } from "@/lib/prisma";

export type CreatePartnerCompanyState = {
  ok: boolean;
  code?: "INVALID_INPUT" | "DUPLICATE";
  message: string;
  organization?: PartnerCompanyRecord;
  existing?: { id: string; name: string; displayName: string | null };
} | null;

export async function createPartnerCompanyAction(
  _previous: CreatePartnerCompanyState,
  formData: FormData,
): Promise<CreatePartnerCompanyState> {
  await requireHarborOwner();

  const result = await createPartnerCompany(prisma, {
    name: String(formData.get("name") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      message: result.message,
      existing: result.existing,
    };
  }

  revalidatePath("/console/partners");
  return {
    ok: true,
    message: `${result.organization.displayName} is created. It has no facility and no people yet.`,
    organization: result.organization,
  };
}

export type PartnerInviteState = { ok: boolean; message: string } | null;

function requestOrigin(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function deliverySentence(delivery: { sent: boolean; reason?: string; deliveryStatus: string }): string {
  if (delivery.sent) return "Invitation email sent.";
  if (delivery.reason === "not_configured" || delivery.deliveryStatus === "NOT_CONFIGURED") {
    return "The invitation is saved. Email delivery is not configured in this environment.";
  }
  return "The invitation is saved. The email could not be sent. Send it again after delivery is fixed.";
}

const inviteFields = z.object({
  organizationId: z.string().cuid(),
  email: z.string().trim().email().max(320),
  contactName: z.string().trim().max(200).optional(),
});

export async function invitePartnerAdministratorAction(
  _previous: PartnerInviteState,
  formData: FormData,
): Promise<PartnerInviteState> {
  const session = await requireHarborOwner();
  const parsed = inviteFields.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    contactName: String(formData.get("contactName") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "A valid email is required." };
  }

  try {
    const claim = await createHarborOrganizationClaimRequest(prisma, {
      organizationId: parsed.data.organizationId,
      targetEmail: parsed.data.email,
      contactName: parsed.data.contactName,
      platformStaffId: session.uid,
    });
    const approved = await approveOrganizationClaim(prisma, {
      claimId: claim.id,
      platformStaffId: session.uid,
    });
    const delivery = await deliverOrganizationClaimInvitation({
      claimId: approved.claim.id,
      rawToken: approved.rawToken,
      origin: requestOrigin(await headers()),
    });
    revalidatePath("/console/partners");
    return {
      ok: delivery.sent,
      message: `Organization Administrator invited. This does not grant facility access. ${deliverySentence(delivery)}`,
    };
  } catch (error) {
    if (error instanceof OrganizationClaimError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not invite the Organization Administrator." };
  }
}

export async function invitePartnerMemberAction(
  _previous: PartnerInviteState,
  formData: FormData,
): Promise<PartnerInviteState> {
  const session = await requireHarborOwner();
  const parsed = inviteFields.omit({ contactName: true }).safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "A valid email is required." };
  }

  try {
    const invited = await inviteOrganizationMemberFromHarbor(prisma, {
      organizationId: parsed.data.organizationId,
      platformStaffId: session.uid,
      targetEmail: parsed.data.email,
    });
    const delivery = await deliverOrganizationMemberInvitation({
      invitationId: invited.invitation.id,
      rawToken: invited.rawToken,
      origin: requestOrigin(await headers()),
      inviterName: session.name,
    });
    revalidatePath("/console/partners");
    return {
      ok: delivery.sent,
      message: `Member invited. This does not grant facility access. ${deliverySentence(delivery)}`,
    };
  } catch (error) {
    if (error instanceof OrganizationMemberInvitationError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not invite that member." };
  }
}
