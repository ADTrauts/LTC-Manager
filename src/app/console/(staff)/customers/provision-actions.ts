"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { issueAndSendAccountInvite } from "@/lib/account-invite/send";
import { FacilityProvisioningError } from "@/lib/facility-provisioning";
import {
  HarborOrganizationNameMatchError,
  previewHarborAdministrator,
  provisionFacilityForHarbor,
  recoverHarborProvisionResult,
  type HarborOrganizationMatch,
  type HarborProvisionPreviewUser,
} from "@/lib/facility-provisioning/harbor";
import { isOrganizationType } from "@/lib/organization";
import { replaceHarborAdministratorInvitation } from "@/lib/harbor-console/administrator-invite-recovery";
import { isHarborOwnerSession, requireHarborOwner, requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export type HarborProvisionState = {
  ok: boolean;
  code?: string;
  message: string;
  facilityId?: string;
  nextPath?: string;
  organizationConflict?: { proposedName: string; matches: HarborOrganizationMatch[] };
} | null;

function requestOrigin(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export async function previewHarborProvisionAdministratorAction(
  email: string,
): Promise<HarborProvisionPreviewUser | { error: string }> {
  const session = await requireHarborStaff();
  if (!isHarborOwnerSession(session)) {
    return { error: "Only Harbor owners can provision facilities." };
  }
  try {
    const preview = await previewHarborAdministrator(prisma, email);
    return preview;
  } catch (error) {
    if (error instanceof FacilityProvisioningError) {
      return { error: error.message };
    }
    return { error: "Unable to look up that account." };
  }
}

function recoveredProvisionPath(facilityId: string) {
  return `/console/customers/${encodeURIComponent(facilityId)}?provisioned=1&requestRecovered=1`;
}

export async function recoverHarborProvisionAction(requestKey: string): Promise<HarborProvisionState> {
  const session = await requireHarborOwner();
  try {
    const result = await recoverHarborProvisionResult(prisma, session, requestKey);
    return result
      ? { ok: true, message: "Facility recovered.", nextPath: recoveredProvisionPath(result.facility.id) }
      : { ok: false, message: "No completed submission was found. You can continue with the form." };
  } catch (error) {
    return { ok: false, message: error instanceof FacilityProvisioningError ? error.message : "Unable to recover this submission." };
  }
}

export async function provisionFacilityAction(
  _previous: HarborProvisionState,
  formData: FormData,
): Promise<HarborProvisionState> {
  const session = await requireHarborOwner();

  const organizationMode = String(formData.get("organizationMode") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const organizationTypeRaw = String(formData.get("organizationType") ?? "").trim();
  const facilityDisplayName = String(formData.get("facilityDisplayName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const billingEmail = String(formData.get("billingEmail") ?? "").trim();
  const administratorName = String(formData.get("administratorName") ?? "").trim();
  const administratorEmail = String(formData.get("administratorEmail") ?? "").trim();
  const requestKey = String(formData.get("requestKey") ?? "");
  const confirmOwnership = String(formData.get("confirmOwnership") ?? "") === "1";
  const confirmedAdministratorId = String(formData.get("confirmedAdministratorId") ?? "").trim() || null;
  const confirmDuplicateName = String(formData.get("confirmDuplicateName") ?? "") === "1";

  if (organizationMode !== "create" && organizationMode !== "existing") {
    return { ok: false, code: "INVALID_INPUT", message: "Choose a parent Organization." };
  }
  const organizationType = isOrganizationType(organizationTypeRaw) ? organizationTypeRaw : null;

  let result;
  try {
    result = await provisionFacilityForHarbor(prisma, session, {
      requestKey,
      confirmOwnership,
      organizationMode,
      organizationId,
      organizationName,
      organizationType,
      facilityDisplayName,
      timezone,
      billingEmail,
      administratorName,
      administratorEmail,
      confirmedAdministratorId,
      confirmDuplicateName,
      distinctOrganization: {
        attested: formData.get("attestDistinctOrganization") === "1",
        verificationBasis: String(formData.get("organizationVerificationBasis") ?? ""),
        reviewedMatchIds: formData.getAll("reviewedOrganizationMatchId").map(String),
      },
    });
  } catch (error) {
    if (error instanceof HarborOrganizationNameMatchError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        organizationConflict: { proposedName: error.proposedName, matches: error.matches },
      };
    }
    if (error instanceof FacilityProvisioningError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INVALID_INPUT", message: "Unable to provision this Facility." };
  }

  if (result.requestReplayed) {
    return { ok: true, message: "Facility recovered.", nextPath: recoveredProvisionPath(result.facility.id) };
  }

  let invite: "sent" | "failed" | "skipped" = "skipped";
  if (result.user.created) {
    const origin = requestOrigin(await headers());
    const delivery = await issueAndSendAccountInvite({
      userId: result.user.id,
      origin,
    });
    invite = delivery.sent ? "sent" : "failed";
  }

  try {
    if (!result.overrideRecorded) {
      await prisma.harborAuditEvent.create({
        data: { staffId: session.uid, action: "PROVISION_FACILITY", facilityId: result.facility.id },
        select: { id: true },
      });
    }
    await trackEvent("harbor.facility.provisioned", {
      facilityId: result.facility.id,
      organizationId: result.organization.id,
      adminUserId: result.user.id,
      staffId: session.uid,
      userCreated: result.user.created,
      replayed: result.replayed,
      invite,
    });
  } catch (error) {
    console.info("harbor_provision_audit_or_telemetry_failed", {
      facilityId: result.facility.id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  revalidatePath("/console/customers");
  revalidatePath(`/console/customers/${result.facility.id}`);

  const params = new URLSearchParams({
    provisioned: "1",
    user: result.user.created ? "new" : "existing",
    invite,
  });
  if (result.replayed) params.set("replayed", "1");
  return { ok: true, message: "Facility provisioned.", nextPath: `/console/customers/${result.facility.id}?${params.toString()}` };
}

export async function resendHarborProvisionInviteAction(_previous: HarborProvisionState, formData: FormData): Promise<HarborProvisionState> {
  const session = await requireHarborOwner();
  const facilityId = String(formData.get("facilityId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  const periodId = String(formData.get("periodId") ?? "").trim();
  const email = String(formData.get("email") ?? "");
  if (!facilityId || !userId || !periodId || !email || formData.get("confirmReplacement") !== "1") {
    return { ok: false, message: "Confirm the replacement invitation and its recipient." };
  }

  let outcome;
  try {
    outcome = await replaceHarborAdministratorInvitation(prisma, session, { facilityId, userId, periodId, email }, requestOrigin(await headers()));
  } catch {
    return { ok: false, message: "Unable to prepare a replacement invitation. Review activation status before trying again." };
  }
  if (outcome === "ineligible") {
    return { ok: false, message: "This account is no longer eligible for a replacement invitation. Reload to review the current Administrator." };
  }

  revalidatePath(`/console/customers/${facilityId}`);
  revalidatePath(`/console/customers/${facilityId}/lifecycle`);
  revalidatePath("/console/customers/invitation-follow-up");
  return {
    ok: true,
    message: outcome === "delivery_requested"
      ? "Replacement invitation issued and email submitted for delivery. This does not confirm receipt."
      : "Replacement invitation issued. Email delivery could not be confirmed.",
  };
}
