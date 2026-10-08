import { isEmailConfigured, sendOrganizationClaimEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  ORGANIZATION_CLAIM_EXPIRES_DAYS,
  buildOrganizationClaimUrl,
} from "./tokens";
import type { OrganizationClaimDeliveryStatus } from "./types";

export type DeliverOrganizationClaimResult = {
  sent: boolean;
  reason?: string;
  deliveryStatus: OrganizationClaimDeliveryStatus;
  error?: string;
};

async function persistDeliveryStatus(input: {
  claimId: string;
  deliveryStatus: OrganizationClaimDeliveryStatus;
  error?: string | null;
}): Promise<void> {
  const now = new Date();
  await prisma.organizationClaimInvitation.update({
    where: { id: input.claimId },
    data: {
      lastInvitationDeliveredAt: now,
      lastInvitationDeliveryStatus: input.deliveryStatus,
      lastInvitationDeliveryError:
        input.deliveryStatus === "SENT" ? null : (input.error ?? null)?.slice(0, 500) ?? null,
    },
  });
}

/**
 * Deliver an approved claim invitation when Postmark is configured.
 * Never logs the plaintext token. DB approval already succeeded before this call.
 */
export async function deliverOrganizationClaimInvitation(input: {
  claimId: string;
  rawToken: string;
  origin: string;
}): Promise<DeliverOrganizationClaimResult> {
  const claim = await prisma.organizationClaimInvitation.findUnique({
    where: { id: input.claimId },
    select: {
      id: true,
      status: true,
      targetEmailNormalized: true,
      contactName: true,
      organization: { select: { name: true, displayName: true } },
    },
  });
  if (!claim || claim.status !== "APPROVED") {
    return { sent: false, reason: "not_eligible", deliveryStatus: "FAILED", error: "not_eligible" };
  }

  if (!isEmailConfigured()) {
    console.info("organization_claim_email_skipped_not_configured", { claimId: claim.id });
    await persistDeliveryStatus({
      claimId: claim.id,
      deliveryStatus: "NOT_CONFIGURED",
      error: "Email delivery is not configured in this environment.",
    });
    return {
      sent: false,
      reason: "not_configured",
      deliveryStatus: "NOT_CONFIGURED",
    };
  }

  const claimUrl = buildOrganizationClaimUrl(input.origin, input.rawToken);
  const organizationName =
    claim.organization.displayName?.trim() || claim.organization.name;
  const result = await sendOrganizationClaimEmail({
    to: claim.targetEmailNormalized,
    contactName: claim.contactName,
    organizationName,
    claimUrl,
    expiresInDays: ORGANIZATION_CLAIM_EXPIRES_DAYS,
  });
  if (result.sent) {
    console.info("organization_claim_email_sent", {
      claimId: claim.id,
      messageId: result.messageId,
    });
    await persistDeliveryStatus({
      claimId: claim.id,
      deliveryStatus: "SENT",
    });
    return { sent: true, deliveryStatus: "SENT" };
  }
  const error =
    result.reason === "send_failed"
      ? result.error ?? "send_failed"
      : result.reason ?? "send_failed";
  console.info("organization_claim_email_failed", {
    claimId: claim.id,
    error,
  });
  await persistDeliveryStatus({
    claimId: claim.id,
    deliveryStatus: "FAILED",
    error,
  });
  return {
    sent: false,
    reason: result.reason,
    deliveryStatus: "FAILED",
    error,
  };
}
