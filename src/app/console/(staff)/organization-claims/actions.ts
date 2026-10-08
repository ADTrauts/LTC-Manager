"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import {
  OrganizationClaimError,
  approveOrganizationClaim,
  createHarborOrganizationClaimRequest,
  rejectOrganizationClaim,
  revokeOrganizationClaim,
  rotateOrganizationClaimInvitationToken,
} from "@/lib/organization-claims";
import { deliverOrganizationClaimInvitation } from "@/lib/organization-claims/send";
import { prisma } from "@/lib/prisma";

export type HarborClaimActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function requestOrigin(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function deliveryMessage(delivery: {
  sent: boolean;
  reason?: string;
  deliveryStatus: string;
}): string {
  if (delivery.sent) return "Invitation email sent.";
  if (delivery.reason === "not_configured" || delivery.deliveryStatus === "NOT_CONFIGURED") {
    return "Email delivery is not configured in this environment.";
  }
  return "Invitation email could not be sent. Use Resend after fixing delivery.";
}

export async function approveOrganizationClaimAction(
  formData: FormData,
): Promise<HarborClaimActionResult> {
  const session = await requireHarborStaff();
  const claimId = String(formData.get("claimId") ?? "");
  if (!z.string().cuid().safeParse(claimId).success) {
    return { ok: false, message: "Invalid claim." };
  }

  try {
    const { claim, rawToken } = await approveOrganizationClaim(prisma, {
      claimId,
      platformStaffId: session.uid,
    });
    const headerStore = await headers();
    const delivery = await deliverOrganizationClaimInvitation({
      claimId: claim.id,
      rawToken,
      origin: requestOrigin(headerStore),
    });

    revalidatePath("/console/organization-claims");
    if (delivery.sent) {
      return { ok: true, message: "Claim approved and invitation email sent." };
    }
    return {
      ok: true,
      message: `Claim approved. ${deliveryMessage(delivery)}`,
    };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not approve claim." };
  }
}

export async function resendOrganizationClaimAction(
  formData: FormData,
): Promise<HarborClaimActionResult> {
  const session = await requireHarborStaff();
  const claimId = String(formData.get("claimId") ?? "");
  if (!z.string().cuid().safeParse(claimId).success) {
    return { ok: false, message: "Invalid claim." };
  }

  try {
    const { claim, rawToken } = await rotateOrganizationClaimInvitationToken(prisma, {
      claimId,
      platformStaffId: session.uid,
    });
    const headerStore = await headers();
    const delivery = await deliverOrganizationClaimInvitation({
      claimId: claim.id,
      rawToken,
      origin: requestOrigin(headerStore),
    });

    revalidatePath("/console/organization-claims");
    if (delivery.sent) {
      return { ok: true, message: "Invitation resent with a new secure link." };
    }
    return {
      ok: false,
      message: `Token rotated, but delivery failed. ${deliveryMessage(delivery)}`,
    };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not resend claim invitation." };
  }
}

export async function rejectOrganizationClaimAction(
  formData: FormData,
): Promise<HarborClaimActionResult> {
  const session = await requireHarborStaff();
  const claimId = String(formData.get("claimId") ?? "");
  if (!z.string().cuid().safeParse(claimId).success) {
    return { ok: false, message: "Invalid claim." };
  }
  try {
    await rejectOrganizationClaim(prisma, {
      claimId,
      platformStaffId: session.uid,
    });
    revalidatePath("/console/organization-claims");
    return { ok: true, message: "Claim rejected." };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not reject claim." };
  }
}

export async function revokeOrganizationClaimAction(
  formData: FormData,
): Promise<HarborClaimActionResult> {
  const session = await requireHarborStaff();
  const claimId = String(formData.get("claimId") ?? "");
  if (!z.string().cuid().safeParse(claimId).success) {
    return { ok: false, message: "Invalid claim." };
  }
  try {
    await revokeOrganizationClaim(prisma, {
      claimId,
      platformStaffId: session.uid,
    });
    revalidatePath("/console/organization-claims");
    return { ok: true, message: "Approved invitation revoked." };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not revoke claim." };
  }
}

export async function createHarborClaimRequestAction(
  _prev: HarborClaimActionResult | null,
  formData: FormData,
): Promise<HarborClaimActionResult> {
  const session = await requireHarborStaff();
  const parsed = z
    .object({
      organizationId: z.string().cuid(),
      targetEmail: z.string().trim().email().max(320),
      contactName: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse({
      organizationId: formData.get("organizationId"),
      targetEmail: formData.get("targetEmail"),
      contactName:
        typeof formData.get("contactName") === "string" &&
        String(formData.get("contactName")).trim()
          ? String(formData.get("contactName")).trim()
          : undefined,
      notes:
        typeof formData.get("notes") === "string" && String(formData.get("notes")).trim()
          ? String(formData.get("notes")).trim()
          : undefined,
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const claim = await createHarborOrganizationClaimRequest(prisma, {
      organizationId: parsed.data.organizationId,
      targetEmail: parsed.data.targetEmail,
      contactName: parsed.data.contactName ?? null,
      notes: parsed.data.notes ?? null,
      platformStaffId: session.uid,
    });
    revalidatePath("/console/organization-claims");
    return {
      ok: true,
      message: `Harbor claim request created (${claim.id.slice(0, 8)}…). Approve to issue a secure invitation.`,
    };
  } catch (error) {
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not create claim request." };
  }
}
