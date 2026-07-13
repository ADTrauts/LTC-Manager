"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { removeFileIfExists, saveUnionHandbookPdf } from "@/lib/facility-uploads";
import {
  canEditOrganizationSettings,
  isOrganizationType,
  loadOrganizationContext,
  type OrganizationTypeValue,
} from "@/lib/organization";
import { isValidIanaTimezone, resolveFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

const updateFacilitySchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  managementCompanyName: z.string().trim().max(200).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => isValidIanaTimezone(value), { message: "Invalid IANA timezone" }),
});

const updateOrganizationSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  legalName: z.string().trim().max(200).optional(),
  organizationType: z.string().trim().optional(),
});

export async function updateFacilitySettingsAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const managementRaw = formData.get("managementCompanyName");
  const brandColorRaw = formData.get("brandColor");
  const timezoneRaw = formData.get("timezone");
  const parsed = updateFacilitySchema.parse({
    displayName: formData.get("displayName"),
    managementCompanyName:
      typeof managementRaw === "string" && managementRaw.trim() !== ""
        ? managementRaw
        : undefined,
    brandColor:
      typeof brandColorRaw === "string" && brandColorRaw.trim() !== ""
        ? brandColorRaw.trim()
        : undefined,
    timezone:
      typeof timezoneRaw === "string" && timezoneRaw.trim() !== ""
        ? timezoneRaw.trim()
        : resolveFacilityTimezone(null),
  });

  await prisma.facility.update({
    where: { id: session.facilityId },
    data: {
      displayName: parsed.displayName,
      managementCompanyName: parsed.managementCompanyName ?? null,
      brandColor: parsed.brandColor ?? null,
      timezone: resolveFacilityTimezone(parsed.timezone),
    },
  });

  revalidatePath("/admin/organization");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/**
 * Update Organization metadata for the session facility's parent org.
 * Does not reassign Facility.organizationId (blocked in Wave 11 M1).
 * Does not dual-write managementCompanyName.
 */
export async function updateOrganizationSettingsAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");
  if (!canEditOrganizationSettings(session.role)) {
    throw new Error("Insufficient permissions.");
  }

  const legalRaw = formData.get("legalName");
  const typeRaw = formData.get("organizationType");
  const parsed = updateOrganizationSchema.parse({
    displayName: formData.get("displayName"),
    legalName:
      typeof legalRaw === "string" && legalRaw.trim() !== "" ? legalRaw.trim() : undefined,
    organizationType:
      typeof typeRaw === "string" && typeRaw.trim() !== "" ? typeRaw.trim() : undefined,
  });

  let organizationType: OrganizationTypeValue | null = null;
  if (parsed.organizationType) {
    if (!isOrganizationType(parsed.organizationType)) {
      throw new Error("Invalid organization type.");
    }
    organizationType = parsed.organizationType;
  }

  const context = await loadOrganizationContext(session.facilityId);

  await prisma.organization.update({
    where: { id: context.organizationId },
    data: {
      name: parsed.displayName,
      displayName: parsed.displayName,
      legalName: parsed.legalName ?? null,
      organizationType,
    },
  });

  revalidatePath("/admin/organization");
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

const MAX_HANDBOOK_BYTES = 12 * 1024 * 1024;

function parseOptionalDateOnly(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  return new Date(`${raw.trim()}T12:00:00.000Z`);
}

export async function uploadUnionHandbookAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const effectiveRaw = formData.get("effectiveDate");
  const effectiveDate =
    typeof effectiveRaw === "string" && effectiveRaw.trim() !== ""
      ? parseOptionalDateOnly(effectiveRaw.trim())
      : null;

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { unionHandbookPdfPath: true },
  });

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    if (facility?.unionHandbookPdfPath) {
      await prisma.facility.update({
        where: { id: session.facilityId },
        data: { unionHandbookEffectiveDate: effectiveDate },
      });
      revalidatePath("/admin/organization");
      revalidatePath("/admin");
      return;
    }
    throw new Error("Choose a PDF file.");
  }

  if (file.size > MAX_HANDBOOK_BYTES) {
    throw new Error("PDF must be 12 MB or smaller.");
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const { relativePath } = await saveUnionHandbookPdf(session.facilityId, buf, file.name);

  await removeFileIfExists(facility?.unionHandbookPdfPath ?? null);

  await prisma.facility.update({
    where: { id: session.facilityId },
    data: {
      unionHandbookPdfPath: relativePath,
      unionHandbookOriginalFilename: file.name,
      unionHandbookUploadedAt: new Date(),
      unionHandbookEffectiveDate: effectiveDate,
    },
  });

  revalidatePath("/admin/organization");
  revalidatePath("/admin");
}

export async function clearUnionHandbookAction() {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "FACILITY_ADMINISTRATOR");

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { unionHandbookPdfPath: true },
  });

  await removeFileIfExists(facility?.unionHandbookPdfPath ?? null);

  await prisma.facility.update({
    where: { id: session.facilityId },
    data: {
      unionHandbookPdfPath: null,
      unionHandbookOriginalFilename: null,
      unionHandbookUploadedAt: null,
      unionHandbookEffectiveDate: null,
    },
  });

  revalidatePath("/admin/organization");
  revalidatePath("/admin");
}
