"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  OrganizationClaimError,
  requestOrganizationClaim,
} from "@/lib/organization-claims";
import { getFacilityPartner, FacilityPartnerError } from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";

export type OrganizationClaimActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export async function requestOrganizationClaimAction(
  formData: FormData,
): Promise<OrganizationClaimActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      organizationId: z.string().cuid(),
      targetEmail: z.string().trim().email().max(320),
      contactName: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      organizationId: formData.get("organizationId"),
      targetEmail: formData.get("targetEmail"),
      contactName: optionalString(formData.get("contactName")),
      notes: optionalString(formData.get("notes")),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const partner = await getFacilityPartner(prisma, {
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
    });
    if (partner.organizationId !== parsed.data.organizationId) {
      return { ok: false, message: "Partnership does not match this Organization." };
    }

    await requestOrganizationClaim(prisma, {
      organizationId: partner.organizationId,
      facilityId: session.facilityId,
      requestedByUserId: session.uid,
      targetEmail: parsed.data.targetEmail,
      contactName: parsed.data.contactName ?? null,
      notes: parsed.data.notes ?? null,
    });

    revalidatePath("/admin/organization/partners");
    revalidatePath(`/admin/organization/partners/${partner.id}`);
    return {
      ok: true,
      message: "Claim pending Harbor review. You cannot approve Organization Administrators.",
    };
  } catch (error) {
    if (error instanceof FacilityPartnerError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof OrganizationClaimError) {
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Could not submit Organization claim request." };
  }
}
