import { isEmailConfigured, sendOrganizationClaimEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  ORGANIZATION_CLAIM_EXPIRES_DAYS,
  buildOrganizationClaimUrl,
} from "./tokens";

/**
 * Deliver an approved claim invitation when Postmark is configured.
 * Never logs the plaintext token. DB approval already succeeded before this call.
 */
export async function deliverOrganizationClaimInvitation(input: {
  claimId: string;
  rawToken: string;
  origin: string;
}): Promise<{ sent: boolean; reason?: string }> {
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
    return { sent: false, reason: "not_eligible" };
  }

  if (!isEmailConfigured()) {
    console.info("organization_claim_email_skipped_not_configured", { claimId: claim.id });
    return { sent: false, reason: "not_configured" };
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
    return { sent: true };
  }
  if (result.reason === "send_failed") {
    console.info("organization_claim_email_failed", {
      claimId: claim.id,
      error: result.error,
    });
  }
  return { sent: false, reason: result.reason };
}
