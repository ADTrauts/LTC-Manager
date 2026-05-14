"use server";

import { revalidatePath } from "next/cache";
import { AssetStatus } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

const assetStatusValues = [
  AssetStatus.ACTIVE,
  AssetStatus.OUT_OF_SERVICE,
  AssetStatus.RETIRED,
] as const;

const createVendorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  contactName: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

const createAssetSchema = z.object({
  assetCode: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  equipmentType: z.string().trim().min(2).max(80),
  unitId: z.string().cuid(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  vendorId: z.string().cuid().optional(),
  status: z.enum(assetStatusValues),
  notes: z.string().trim().max(500).optional(),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateAssetViews() {
  revalidatePath("/assets");
  revalidatePath("/repairs");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

export async function createVendorAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createVendorSchema.parse({
    name: formData.get("name"),
    phone: toOptional(formData.get("phone")),
    email: toOptional(formData.get("email")),
    contactName: toOptional(formData.get("contactName")),
    notes: toOptional(formData.get("notes")),
  });

  await prisma.vendor.create({
    data: {
      ...parsed,
      facilityId: session.facilityId,
    },
  });

  revalidateAssetViews();
}

export async function createAssetAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createAssetSchema.parse({
    assetCode: formData.get("assetCode"),
    name: formData.get("name"),
    equipmentType: formData.get("equipmentType"),
    unitId: formData.get("unitId"),
    model: toOptional(formData.get("model")),
    serialNumber: toOptional(formData.get("serialNumber")),
    vendorId: toOptional(formData.get("vendorId")),
    status: formData.get("status"),
    notes: toOptional(formData.get("notes")),
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!unit) {
    throw new Error("Unit not found.");
  }
  if (parsed.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: parsed.vendorId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!vendor) {
      throw new Error("Vendor not found.");
    }
  }

  await prisma.asset.create({
    data: parsed,
  });

  revalidateAssetViews();
}

export async function updateAssetStatusAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const assetId = String(formData.get("assetId") ?? "");
  const status = String(formData.get("status") ?? "") as AssetStatus;
  if (!assetId || !assetStatusValues.includes(status)) {
    throw new Error("Invalid asset status update.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!asset) {
    throw new Error("Asset not found.");
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { status },
  });

  revalidateAssetViews();
}
