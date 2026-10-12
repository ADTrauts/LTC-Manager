"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { OrganizationType } from "@prisma/client";

import { issueAndSendAccountInvite } from "@/lib/account-invite/send";
import { FacilityProvisioningError } from "@/lib/facility-provisioning";
import { previewHarborAdministrator, provisionFacilityForHarbor } from "@/lib/facility-provisioning/harbor";
import { isOrganizationType } from "@/lib/organization";
import { isHarborOwnerSession, requireHarborOwner, requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

export type HarborProvisionState = {
  ok: boolean;
  code?: string;
  message: string;
  facilityId?: string;
  existingUser?: { displayName: string; email: string } | null;
} | null;

function requestOrigin(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export async function previewHarborProvisionAdministratorAction(
  email: string,
): Promise<{ exists: boolean; displayName: string; email: string } | { error: string }> {
  const session = await requireHarborStaff();
  if (!isHarborOwnerSession(session)) {
    return { error: "Only Harbor owners can provision facilities." };
  }
  try {
    const preview = await previewHarborAdministrator(prisma, email);
    return {
      exists: preview.exists,
      displayName: preview.displayName,
      email: preview.email,
    };
  } catch (error) {
    if (error instanceof FacilityProvisioningError) {
      return { error: error.message };
    }
    return { error: "Unable to look up that account." };
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
  const confirmOwnership = String(formData.get("confirmOwnership") ?? "") === "1";
  const confirmExistingUser = String(formData.get("confirmExistingUser") ?? "") === "1";
  const confirmDuplicateName = String(formData.get("confirmDuplicateName") ?? "") === "1";

  if (organizationMode !== "create" && organizationMode !== "existing") {
    return { ok: false, code: "INVALID_INPUT", message: "Choose a parent Organization." };
  }
  if (!confirmOwnership) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Confirm that Facility ownership cannot be reassigned.",
    };
  }

  const organizationType = isOrganizationType(organizationTypeRaw) ? organizationTypeRaw : null;

  let preview;
  try {
    preview = await previewHarborAdministrator(prisma, administratorEmail);
  } catch (error) {
    if (error instanceof FacilityProvisioningError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INVALID_INPUT", message: "Unable to resolve the administrator." };
  }

  if (preview.exists && !confirmExistingUser) {
    return {
      ok: false,
      code: "EXISTING_USER",
      message: "This existing Vssyl user will receive Facility Administrator access.",
      existingUser: { displayName: preview.displayName, email: preview.email },
    };
  }

  let result;
  try {
    result = await prisma.$transaction((tx) =>
      provisionFacilityForHarbor(tx, {
        organizationMode,
        organizationId,
        organizationName,
        organizationType: organizationType as OrganizationType | null,
        facilityDisplayName,
        timezone,
        billingEmail,
        administratorName,
        administratorEmail,
        confirmDuplicateName,
      }),
    );
  } catch (error) {
    if (error instanceof FacilityProvisioningError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "INVALID_INPUT", message: "Unable to provision this Facility." };
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
    await prisma.harborAuditEvent.create({
      data: {
        staffId: session.uid,
        action: "PROVISION_FACILITY",
        facilityId: result.facility.id,
      },
    });
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
    console.info("harbor_provision_audit_failed", {
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
  redirect(`/console/customers/${result.facility.id}?${params.toString()}`);
}

export async function resendHarborProvisionInviteAction(formData: FormData): Promise<HarborProvisionState> {
  await requireHarborOwner();
  const facilityId = String(formData.get("facilityId") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!facilityId || !userId) {
    return { ok: false, message: "Unable to resend the invite." };
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      passwordHash: null,
      facilityAccesses: { some: { facilityId, isActive: true, revokedAt: null } },
    },
    select: { id: true },
  });
  if (!user) {
    return { ok: false, message: "That administrator is not waiting on an invite." };
  }

  const origin = requestOrigin(await headers());
  const delivery = await issueAndSendAccountInvite({ userId: user.id, origin });
  revalidatePath(`/console/customers/${facilityId}`);
  const params = new URLSearchParams({
    provisioned: "1",
    user: "new",
    invite: delivery.sent ? "sent" : "failed",
  });
  redirect(`/console/customers/${facilityId}?${params.toString()}`);
}
