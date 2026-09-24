"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  requireAssetManage,
  resolveAssetOperationsAuthority,
  retireAsset,
  updateAssetIdentity,
  type AssetOperationalStatus,
} from "@/lib/asset-operations";
import { requireFacilitySession } from "@/lib/facility-context";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { listAttachmentsForAsset } from "@/lib/attachments";
import {
  deleteFacilityPhotoAttachment,
  MAX_ASSET_PHOTOS,
  savePhotosFromFormData,
} from "@/lib/photo-attachments";
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
  spaceId: z.string().cuid().optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  vendorId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  responsibleOrganizationId: z.string().cuid().optional(),
  /** BUILD lifecycle: ACTIVE → OPERATIONAL, RETIRED → RETIRED. Legacy paths may send raw status. */
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
  revalidatePath("/assets/builder");
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

  const assetOpsEnabled = isDietaryAssetOperationsEnabled();
  const criticalityRaw = String(formData.get("criticality") ?? "ROUTINE");
  const lifecycleOrStatus = String(formData.get("lifecycle") ?? formData.get("status") ?? "ACTIVE");
  const parsed = createAssetSchema.parse({
    assetCode: formData.get("assetCode"),
    name: formData.get("name"),
    equipmentType: formData.get("equipmentType"),
    unitId: formData.get("unitId"),
    spaceId: toOptional(formData.get("spaceId")),
    model: toOptional(formData.get("model")),
    serialNumber: toOptional(formData.get("serialNumber")),
    vendorId: toOptional(formData.get("vendorId")),
    departmentId: toOptional(formData.get("departmentId")),
    responsibleOrganizationId: toOptional(formData.get("responsibleOrganizationId")),
    status: assetOpsEnabled && lifecycleOrStatus === "ACTIVE" ? "OPERATIONAL" : lifecycleOrStatus,
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

  if (parsed.spaceId) {
    const space = await prisma.unitSpace.findFirst({
      where: {
        id: parsed.spaceId,
        facilityId: session.facilityId,
        unitId: parsed.unitId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!space) {
      throw new Error("Room not found for the selected location.");
    }
  }

  if (parsed.responsibleOrganizationId) {
    const org = await prisma.facilityOrganization.findFirst({
      where: {
        id: parsed.responsibleOrganizationId,
        facilityId: session.facilityId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!org) {
      throw new Error("Responsible organization not found.");
    }
  }

  if (assetOpsEnabled) {
    const status = parseOperationalStatus(parsed.status);
    const created = await createAsset(session, {
      facilityId: session.facilityId,
      departmentId,
      unitId: parsed.unitId,
      spaceId: parsed.spaceId ?? null,
      assetCode: parsed.assetCode,
      name: parsed.name,
      equipmentType: parsed.equipmentType,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      vendorId: parsed.vendorId,
      responsibleOrganizationId: parsed.responsibleOrganizationId ?? null,
      manufacturer: parsed.manufacturer,
      facilityAssetNumber: parsed.facilityAssetNumber,
      description: parsed.description,
      criticality: parsed.criticality as AssetCriticality,
      notes: parsed.notes,
      status,
    });
    await savePhotosFromFormData({
      formData,
      facilityId: session.facilityId,
      parentKind: "ASSET",
      assetId: created.id,
      session,
      maxCount: MAX_ASSET_PHOTOS,
    });
    revalidateAssetViews(created.id);
    redirect("/assets/builder");
  }

  if (!(legacyAssetStatusValues as readonly string[]).includes(parsed.status)) {
    throw new Error("Invalid asset status.");
  }

  const created = await prisma.asset.create({
    data: {
      assetCode: parsed.assetCode,
      name: parsed.name,
      equipmentType: parsed.equipmentType,
      unitId: parsed.unitId,
      spaceId: parsed.spaceId ?? null,
      model: parsed.model,
      serialNumber: parsed.serialNumber,
      vendorId: parsed.vendorId,
      departmentId,
      responsibleOrganizationId: parsed.responsibleOrganizationId ?? null,
      status: parsed.status as AssetStatus,
      criticality: parsed.criticality as AssetCriticality,
      notes: parsed.notes,
    },
    select: { id: true },
  });

  await savePhotosFromFormData({
    formData,
    facilityId: session.facilityId,
    parentKind: "ASSET",
    assetId: created.id,
    session,
    maxCount: MAX_ASSET_PHOTOS,
  });

  revalidateAssetViews(created.id);
  redirect("/assets/builder");
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

  let nextStatus: AssetStatus;
  try {
    nextStatus = parseOperationalStatus(statusRaw) as AssetStatus;
  } catch {
    throw new Error("Invalid asset status update.");
  }

  await prisma.asset.update({
    where: { id: assetId },
    data: { status: nextStatus },
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

  const spaceRaw = formData.get("spaceId");
  const spaceId =
    spaceRaw === null || spaceRaw === undefined
      ? undefined
      : String(spaceRaw).trim() === ""
        ? null
        : String(spaceRaw).trim();

  const orgRaw = formData.get("responsibleOrganizationId");
  const responsibleOrganizationId =
    orgRaw === null || orgRaw === undefined
      ? undefined
      : String(orgRaw).trim() === ""
        ? null
        : String(orgRaw).trim();

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
    responsibleOrganizationId,
    unitId: toOptional(formData.get("unitId")),
    spaceId,
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

export async function uploadAssetPhotosAction(formData: FormData) {
  const session = await requireFacilitySession();
  const assetId = String(formData.get("assetId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!assetId || !departmentId) {
    throw new Error("Invalid photo upload.");
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!asset) {
    throw new Error("Asset not found.");
  }

  if (isDietaryAssetOperationsEnabled()) {
    const authority = await resolveAssetOperationsAuthority(
      session,
      session.facilityId,
      departmentId,
    );
    requireAssetManage(authority);
  } else {
    requireAtLeastRole(session.role, "SUPERVISOR");
  }

  const existing = await listAttachmentsForAsset(session.facilityId, assetId);
  await savePhotosFromFormData({
    formData,
    facilityId: session.facilityId,
    parentKind: "ASSET",
    assetId,
    session,
    maxCount: MAX_ASSET_PHOTOS,
    existingCount: existing.length,
  });
  revalidateAssetViews(assetId);
}

export async function removeAssetPhotoAction(formData: FormData) {
  const session = await requireFacilitySession();
  const assetId = String(formData.get("assetId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!assetId || !departmentId || !attachmentId) {
    throw new Error("Invalid photo removal.");
  }

  if (isDietaryAssetOperationsEnabled()) {
    const authority = await resolveAssetOperationsAuthority(
      session,
      session.facilityId,
      departmentId,
    );
    requireAssetManage(authority);
  } else {
    requireAtLeastRole(session.role, "SUPERVISOR");
  }

  const removed = await deleteFacilityPhotoAttachment({
    facilityId: session.facilityId,
    attachmentId,
    expectedKind: "ASSET",
    expectedParentId: assetId,
  });
  revalidateAssetViews(removed.parentId);
}

const createFacilityOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional(),
});

/** Minimal BUILD registry for Responsible Organizations (not Vendors). */
export async function createFacilityOrganizationAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createFacilityOrganizationSchema.parse({
    name: formData.get("name"),
    notes: toOptional(formData.get("notes")),
  });

  await prisma.facilityOrganization.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      notes: parsed.notes ?? null,
      isActive: true,
    },
  });

  revalidateAssetViews();
}
