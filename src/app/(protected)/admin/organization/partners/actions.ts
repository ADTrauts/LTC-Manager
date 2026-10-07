"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createOrganizationForDepartmentOperator,
  searchOrganizationsForOperator,
} from "@/lib/department-operators";
import { assertFacilityAdministratorAction } from "@/lib/facility-admin-guard";
import { requireFacilitySession } from "@/lib/facility-context";
import { normalizeOrganizationKey } from "@/lib/organization";
import {
  activateFacilityPartner,
  addPartnerDepartmentScope,
  createFacilityPartner,
  endFacilityPartner,
  FacilityPartnerError,
  removePartnerDepartmentScope,
  resumeFacilityPartner,
  suspendFacilityPartner,
} from "@/lib/partner-access";
import { prisma } from "@/lib/prisma";

function revalidatePartners(partnerId?: string) {
  revalidatePath("/admin/organization");
  revalidatePath("/admin/organization/partners");
  if (partnerId) {
    revalidatePath(`/admin/organization/partners/${partnerId}`);
  }
}

export type PartnerActionResult =
  | { ok: true; message?: string; partnershipId?: string }
  | { ok: false; message: string };

function fail(error: unknown): PartnerActionResult {
  return {
    ok: false,
    message:
      error instanceof FacilityPartnerError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not update partner relationship.",
  };
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export async function createFacilityPartnerAction(
  formData: FormData,
): Promise<PartnerActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = z
    .object({
      organizationId: z.string().cuid(),
      notes: z.string().trim().max(500).optional(),
      activateNow: z.enum(["on", "off"]).optional(),
    })
    .safeParse({
      organizationId: formData.get("organizationId"),
      notes: optionalString(formData.get("notes")),
      activateNow: formData.get("activateNow") === "on" ? "on" : "off",
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const partner = await createFacilityPartner(prisma, {
      facilityId: session.facilityId,
      organizationId: parsed.data.organizationId,
      notes: parsed.data.notes ?? null,
      createdByUserId: session.uid,
    });
    if (parsed.data.activateNow === "on") {
      await activateFacilityPartner(prisma, {
        partnershipId: partner.id,
        facilityId: session.facilityId,
        actorUserId: session.uid,
      });
    }
    revalidatePartners(partner.id);
    return {
      ok: true,
      partnershipId: partner.id,
      message: "External partner relationship saved.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createOrganizationAndPartnerAction(
  formData: FormData,
): Promise<PartnerActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);

  const parsed = z
    .object({
      organizationName: z.string().trim().min(2).max(200),
      notes: z.string().trim().max(500).optional(),
      activateNow: z.enum(["on", "off"]).optional(),
    })
    .safeParse({
      organizationName: formData.get("organizationName"),
      notes: optionalString(formData.get("notes")),
      activateNow: formData.get("activateNow") === "on" ? "on" : "off",
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const normalized = normalizeOrganizationKey(parsed.data.organizationName);
    const existing = await prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true, displayName: true },
      take: 200,
    });
    const match = existing.find(
      (row) =>
        normalizeOrganizationKey(row.name) === normalized ||
        (row.displayName != null &&
          normalizeOrganizationKey(row.displayName) === normalized),
    );
    const organization =
      match ??
      (await createOrganizationForDepartmentOperator(prisma, {
        name: parsed.data.organizationName,
        organizationType: "MANAGEMENT_COMPANY",
      }));

    const partner = await createFacilityPartner(prisma, {
      facilityId: session.facilityId,
      organizationId: organization.id,
      notes: parsed.data.notes ?? null,
      createdByUserId: session.uid,
    });
    if (parsed.data.activateNow === "on") {
      await activateFacilityPartner(prisma, {
        partnershipId: partner.id,
        facilityId: session.facilityId,
        actorUserId: session.uid,
      });
    }
    revalidatePartners(partner.id);
    return {
      ok: true,
      partnershipId: partner.id,
      message: match
        ? `Using existing organization “${match.displayName ?? match.name}”.`
        : "Organization created and partner relationship saved.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function searchPartnerOrganizationsAction(query: string): Promise<
  | { ok: true; results: Array<{ id: string; label: string; detail: string }> }
  | { ok: false; message: string }
> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);
  if (!query.trim()) return { ok: false, message: "Enter a search term." };

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { organizationId: true },
  });
  const results = await searchOrganizationsForOperator(prisma, { query, limit: 25 });
  return {
    ok: true,
    results: results
      .filter((row) => row.id !== facility?.organizationId)
      .map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.name,
        detail: [row.organizationType ?? "Organization", row.legalName]
          .filter(Boolean)
          .join(" · "),
      })),
  };
}

async function partnershipMutation(
  formData: FormData,
  run: (input: {
    partnershipId: string;
    facilityId: string;
    actorUserId: string;
  }) => Promise<unknown>,
): Promise<PartnerActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);
  const partnershipId = String(formData.get("partnershipId") ?? "");
  if (!z.string().cuid().safeParse(partnershipId).success) {
    return { ok: false, message: "Invalid partnership." };
  }
  try {
    await run({
      partnershipId,
      facilityId: session.facilityId,
      actorUserId: session.uid,
    });
    revalidatePartners(partnershipId);
    return { ok: true, message: "Partner relationship updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function activateFacilityPartnerAction(formData: FormData) {
  return partnershipMutation(formData, (input) => activateFacilityPartner(prisma, input));
}

export async function suspendFacilityPartnerAction(formData: FormData) {
  return partnershipMutation(formData, (input) => suspendFacilityPartner(prisma, input));
}

export async function resumeFacilityPartnerAction(formData: FormData) {
  return partnershipMutation(formData, (input) => resumeFacilityPartner(prisma, input));
}

export async function endFacilityPartnerAction(formData: FormData) {
  return partnershipMutation(formData, (input) => endFacilityPartner(prisma, input));
}

export async function addPartnerDepartmentScopeAction(
  formData: FormData,
): Promise<PartnerActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      departmentId: z.string().cuid(),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      departmentId: formData.get("departmentId"),
    });
  if (!parsed.success) {
    return { ok: false, message: "Invalid Department scope request." };
  }
  try {
    await addPartnerDepartmentScope(prisma, {
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      departmentId: parsed.data.departmentId,
      actorUserId: session.uid,
    });
    revalidatePartners(parsed.data.partnershipId);
    return { ok: true, message: "Department authorized for this partnership." };
  } catch (error) {
    return fail(error);
  }
}

export async function removePartnerDepartmentScopeAction(
  formData: FormData,
): Promise<PartnerActionResult> {
  const session = await requireFacilitySession();
  assertFacilityAdministratorAction(session.role);
  const parsed = z
    .object({
      partnershipId: z.string().cuid(),
      departmentId: z.string().cuid(),
    })
    .safeParse({
      partnershipId: formData.get("partnershipId"),
      departmentId: formData.get("departmentId"),
    });
  if (!parsed.success) {
    return { ok: false, message: "Invalid Department scope request." };
  }
  try {
    await removePartnerDepartmentScope(prisma, {
      partnershipId: parsed.data.partnershipId,
      facilityId: session.facilityId,
      departmentId: parsed.data.departmentId,
      actorUserId: session.uid,
    });
    revalidatePartners(parsed.data.partnershipId);
    return { ok: true, message: "Department removed from partner authorization scope." };
  } catch (error) {
    return fail(error);
  }
}
