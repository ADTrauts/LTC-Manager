"use server";

import { revalidatePath } from "next/cache";
import { AssetCriticality, AssetStatus } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import {
  ASSET_CRITICALITY_VALUES,
  isAssetCriticality,
  type AssetCriticalityValue,
} from "@/lib/asset-criticality";
import {
  changeAssetStatus,
  createAsset,
  retireAsset,
  updateAssetIdentity,
  type AssetOperationalStatus,
} from "@/lib/asset-operations";
import { requireFacilitySession } from "@/lib/facility-context";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

async function resolveDefaultResponsibleDepartmentForUnit(unitId: string, facilityId: string) {
  const rows = await prisma.unitDepartmentResponsibility.findMany({
    where: { unitId, unit: { facilityId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, departmentId: true, department: { select: { key: true } } },
  });
  const plantPrimary = rows.find((r) => r.kind === "PRIMARY" && r.department.key === "PLANT");
  if (plantPrimary) return plantPrimary.departmentId;
  const anyPrimary = rows.find((r) => r.kind === "PRIMARY");
  return anyPrimary?.departmentId ?? null;
}

const legacyAssetStatusValues = [
  AssetStatus.ACTIVE,
  AssetStatus.OUT_OF_SERVICE,
  AssetStatus.RETIRED,
] as const;

const operationalAssetStatusValues = [
  "OPERATIONAL",
  "DEGRADED",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const satisfies readonly AssetOperationalStatus[];

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
  departmentId: z.string().cuid().optional(),
  status: z.string(),
  criticality: z.enum(ASSET_CRITICALITY_VALUES).default("ROUTINE"),
  notes: z.string().trim().max(500).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  facilityAssetNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateAssetViews(assetId?: string) {
  revalidatePath("/assets");
  revalidatePath("/repairs");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
  if (assetId) {
    revalidatePath(`/assets/${assetId}`);
  }
}

function parseOperationalStatus(raw: string): AssetOperationalStatus {
  if (raw === "ACTIVE") return "OPERATIONAL";
  if ((operationalAssetStatusValues as readonly string[]).includes(raw)) {
    return raw as AssetOperationalStatus;
  }
  throw new Error("Invalid asset status.");
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

  const criticalityRaw = String(formData.get("criticality") ?? "ROUTINE");
  const parsed = createAssetSchema.parse({
    assetCode: formData.get("assetCode"),
    name: formData.get("name"),
    equipmentType: formData.get("equipmentType"),
    unitId: formData.get("unitId"),
    model: toOptional(formData.get("model")),
    serialNumber: toOptional(formData.get("serialNumber")),
    vendorId: toOptional(formData.get("vendorId")),
    departmentId: toOptional(formData.get("departmentId")),
    status: formData.get("status"),
    criticality: isAssetCriticality(criticalityRaw) ? criticalityRaw : "ROUTINE",
    notes: toOptional(formData.get("notes")),
    manufacturer: toOptional(formData.get("manufacturer")),
    facilityAssetNumber: toOptional(formData.get("facilityAssetNumber")),
    description: toOptional(formData.get("description")),
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

  const departmentId =
    parsed.departmentId ?? (await resolveDefaultResponsibleDepartmentForUnit(parsed.unitId, session.facilityId));
  if (!departmentId) {
    throw new Error("Select a responsible department for this asset.");
  }

  const dept = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!dept) {
    throw new Error("Department not found.");
  }

  if (isDietaryAssetOperationsEnabled()) {
    const status = parseOperationalStatus(parsed.status);
    const created = await createAsset(session, {
      facilityId: session.facilityId,
      departmentId,
      unitId: parsed.unitId,
      assetCode: parsed.assetCode,
      name: parsed.name,
      equipmentType: parsed.equipmentType,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      vendorId: parsed.vendorId,
      manufacturer: parsed.manufacturer,
      facilityAssetNumber: parsed.facilityAssetNumber,
      description: parsed.description,
      criticality: parsed.criticality as AssetCriticality,
      notes: parsed.notes,
      status,
    });
    revalidateAssetViews(created.id);
    return;
  }

  if (!(legacyAssetStatusValues as readonly string[]).includes(parsed.status)) {
    throw new Error("Invalid asset status.");
  }

  await prisma.asset.create({
    data: {
      assetCode: parsed.assetCode,
      name: parsed.name,
      equipmentType: parsed.equipmentType,
      unitId: parsed.unitId,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      vendorId: parsed.vendorId,
      departmentId,
      status: parsed.status as AssetStatus,
      criticality: parsed.criticality as AssetCriticality,
      notes: parsed.notes,
    },
  });

  revalidateAssetViews();
}

export async function updateAssetStatusAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const assetId = String(formData.get("assetId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const note = toOptional(formData.get("note"));
  const departmentIdRaw = toOptional(formData.get("departmentId"));

  if (!assetId) {
    throw new Error("Invalid asset status update.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: { id: true, departmentId: true },
  });
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (isDietaryAssetOperationsEnabled()) {
    const departmentId = departmentIdRaw ?? asset.departmentId;
    if (!departmentId) {
      throw new Error("Select a responsible department before changing Asset status.");
    }
    const toStatus = parseOperationalStatus(statusRaw);
    if (toStatus === "RETIRED") {
      await retireAsset(session, {
        facilityId: session.facilityId,
        departmentId,
        assetId,
        reason: note ?? "Asset retired",
      });
    } else {
      await changeAssetStatus(session, {
        facilityId: session.facilityId,
        departmentId,
        assetId,
        toStatus,
        reason: toStatus === "OPERATIONAL" ? "RETURN_TO_SERVICE" : "MANUAL",
        note: note ?? null,
      });
    }
    revalidateAssetViews(assetId);
    return;
  }

  if (!(legacyAssetStatusValues as readonly string[]).includes(statusRaw)) {
    throw new Error("Invalid asset status update.");
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { status: statusRaw as AssetStatus },
  });

  revalidateAssetViews(assetId);
}

export async function updateAssetIdentityAction(formData: FormData) {
  const session = await requireFacilitySession();
  if (!isDietaryAssetOperationsEnabled()) {
    throw new Error("Dietary Asset Operations is not enabled.");
  }

  const assetId = String(formData.get("assetId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!assetId || !departmentId) {
    throw new Error("Invalid asset identity update.");
  }

  const criticalityRaw = toOptional(formData.get("criticality"));
  const vendorIdRaw = formData.get("vendorId");
  const vendorId =
    vendorIdRaw === null || vendorIdRaw === undefined
      ? undefined
      : String(vendorIdRaw).trim() === ""
        ? null
        : String(vendorIdRaw).trim();

  await updateAssetIdentity(session, {
    facilityId: session.facilityId,
    departmentId,
    assetId,
    name: toOptional(formData.get("name")),
    equipmentType: toOptional(formData.get("equipmentType")),
    model: toOptional(formData.get("model")) ?? null,
    serialNumber: toOptional(formData.get("serialNumber")) ?? null,
    manufacturer: toOptional(formData.get("manufacturer")) ?? null,
    facilityAssetNumber: toOptional(formData.get("facilityAssetNumber")) ?? null,
    description: toOptional(formData.get("description")) ?? null,
    notes: toOptional(formData.get("notes")) ?? null,
    procedureInstructions: toOptional(formData.get("procedureInstructions")) ?? null,
    vendorId,
    unitId: toOptional(formData.get("unitId")),
    departmentIdNext: toOptional(formData.get("departmentIdNext")) ?? undefined,
    criticality:
      criticalityRaw && isAssetCriticality(criticalityRaw)
        ? (criticalityRaw as AssetCriticality)
        : undefined,
  });

  revalidateAssetViews(assetId);
}

export async function retireAssetAction(formData: FormData) {
  const session = await requireFacilitySession();
  if (!isDietaryAssetOperationsEnabled()) {
    throw new Error("Dietary Asset Operations is not enabled.");
  }

  const assetId = String(formData.get("assetId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const reason = toOptional(formData.get("reason"));
  if (!assetId || !departmentId) {
    throw new Error("Invalid retirement request.");
  }

  await retireAsset(session, {
    facilityId: session.facilityId,
    departmentId,
    assetId,
    reason: reason ?? "Asset retired",
  });

  revalidateAssetViews(assetId);
}

export async function updateAssetCriticalityAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const assetId = String(formData.get("assetId") ?? "");
  const criticalityRaw = String(formData.get("criticality") ?? "") as AssetCriticalityValue;
  if (!assetId || !isAssetCriticality(criticalityRaw)) {
    throw new Error("Invalid asset criticality update.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: { id: true, departmentId: true },
  });
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (isDietaryAssetOperationsEnabled() && asset.departmentId) {
    await updateAssetIdentity(session, {
      facilityId: session.facilityId,
      departmentId: asset.departmentId,
      assetId,
      criticality: criticalityRaw as AssetCriticality,
    });
    revalidateAssetViews(assetId);
    return;
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { criticality: criticalityRaw },
  });

  revalidateAssetViews(assetId);
}

export async function updateAssetDepartmentAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const assetId = String(formData.get("assetId") ?? "");
  const deptRaw = toOptional(formData.get("departmentId"));
  if (!assetId) {
    throw new Error("Invalid asset.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: { id: true, departmentId: true },
  });
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (isDietaryAssetOperationsEnabled()) {
    const authorityDept = asset.departmentId ?? deptRaw;
    if (!authorityDept) {
      throw new Error("Select a responsible department.");
    }
    if (!deptRaw) {
      await updateAssetIdentity(session, {
        facilityId: session.facilityId,
        departmentId: authorityDept,
        assetId,
        departmentIdNext: null,
      });
      revalidateAssetViews(assetId);
      return;
    }
    const dept = await prisma.department.findFirst({
      where: { id: deptRaw, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!dept) {
      throw new Error("Department not found.");
    }
    await updateAssetIdentity(session, {
      facilityId: session.facilityId,
      departmentId: authorityDept,
      assetId,
      departmentIdNext: deptRaw,
    });
    revalidateAssetViews(assetId);
    return;
  }

  if (!deptRaw) {
    await prisma.asset.update({
      where: { id: assetId },
      data: { departmentId: null },
    });
    revalidateAssetViews(assetId);
    return;
  }

  const dept = await prisma.department.findFirst({
    where: { id: deptRaw, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!dept) {
    throw new Error("Department not found.");
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { departmentId: deptRaw },
  });

  revalidateAssetViews(assetId);
}
