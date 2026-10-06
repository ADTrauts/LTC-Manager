"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  IssueType,
  RepairPriority,
  RepairStatus,
  RepairTrade,
  RepairAssetConditionReview,
  WorkOrderHoldReason,
  WorkOrderKind,
} from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import {
  defaultRepairTradeForIssueType,
  suggestRepairDepartmentIds,
} from "@/lib/repair-routing";
import {
  addWorkOrderLabor,
  addWorkOrderNote,
  addWorkOrderPart,
  addWorkOrderRecordRequirement,
  assignWorkOrder,
  completeAssignedWorkOrder,
  holdAssignedWorkOrder,
  linkEvidenceToWorkOrder,
  removeWorkOrderLabor,
  removeWorkOrderPart,
  removeWorkOrderRecordRequirement,
  resolvePreferredRepairProviderForAsset,
  resumeWorkOrder,
  satisfyWorkOrderRecordRequirement,
  setWorkOrderExternalCost,
  startWorkOrder,
  waiveWorkOrderRecordRequirement,
} from "@/lib/asset-operations";
import { listAttachmentsForRepair } from "@/lib/attachments";
import { syncRepairRecordToTask } from "@/lib/work/adapters/repair-task";
import {
  deleteFacilityPhotoAttachment,
  MAX_REPAIR_PHOTOS_PER_SUBMIT,
  savePhotosFromFormData,
} from "@/lib/photo-attachments";

const priorityValues = [
  RepairPriority.LOW,
  RepairPriority.MEDIUM,
  RepairPriority.HIGH,
  RepairPriority.URGENT,
] as const;

const statusValues = [
  RepairStatus.OPEN,
  RepairStatus.IN_PROGRESS,
  RepairStatus.WAITING_PARTS,
  RepairStatus.CLOSED,
] as const;

const createRepairSchema = z.object({
  unitId: z.string().cuid(),
  assetId: z.string().cuid().optional(),
  vendorId: z.string().cuid().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1000),
  priority: z.enum(priorityValues),
  issueType: z.nativeEnum(IssueType).default(IssueType.EQUIPMENT),
  repairTrade: z.nativeEnum(RepairTrade).optional(),
});

const addUpdateSchema = z.object({
  repairId: z.string().cuid(),
  updateText: z.string().trim().min(2).max(1000),
  statusAfterUpdate: z.enum(statusValues),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateRepairViews(opts?: { issueId?: string; unitId?: string | null }) {
  revalidatePath("/repairs");
  revalidatePath("/issues");
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  revalidatePath("/today");
  revalidatePath("/today/handoffs");
  revalidatePath("/units");
  revalidatePath("/unit/[unitId]", "page");
  if (opts?.issueId) {
    revalidatePath(`/issues/${opts.issueId}`);
    revalidatePath(`/repairs/${opts.issueId}`);
  }
  if (opts?.unitId) {
    revalidatePath(`/unit/${opts.unitId}`);
  }
}

export async function createRepairAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const issueTypeRaw = toOptional(formData.get("issueType"));
  const issueType = issueTypeRaw
    ? z.nativeEnum(IssueType).parse(issueTypeRaw)
    : IssueType.EQUIPMENT;
  const repairTradeRaw = toOptional(formData.get("repairTrade"));

  const parsed = createRepairSchema.parse({
    unitId: formData.get("unitId"),
    assetId: toOptional(formData.get("assetId")),
    vendorId: toOptional(formData.get("vendorId")),
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    issueType,
    repairTrade: repairTradeRaw
      ? z.nativeEnum(RepairTrade).parse(repairTradeRaw)
      : defaultRepairTradeForIssueType(issueType),
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!unit) {
    throw new Error("Unit not found.");
  }

  let vendorId = parsed.vendorId ?? null;
  if (parsed.assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: parsed.assetId, unit: { facilityId: session.facilityId } },
      select: { id: true, vendorId: true },
    });
    if (!asset) {
      throw new Error("Asset not found.");
    }
    vendorId = resolvePreferredRepairProviderForAsset({
      existingRepairVendorId: vendorId,
      assetPreferredVendorId: asset.vendorId,
    });
  }

  // Vendor is facility-owned (`Vendor.facilityId`, unique per facility by name), so a submitted
  // vendor id must resolve inside this facility before it can be connected. Reported as "not
  // found" rather than "forbidden" so the action cannot confirm that another facility's vendor
  // exists.
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!vendor) {
      throw new Error("Vendor not found.");
    }
  }

  const repairTrade = parsed.repairTrade ?? defaultRepairTradeForIssueType(parsed.issueType);
  const suggested = await suggestRepairDepartmentIds(prisma, {
    facilityId: session.facilityId,
    unitId: parsed.unitId,
    assetId: parsed.assetId,
    repairTrade,
    issueType: parsed.issueType,
    sessionPrimaryDepartmentId: session.primaryDepartmentId,
  });

  const existingCount = await prisma.repair.count();
  const repairCode = `R-${String(existingCount + 1).padStart(5, "0")}`;

  const repair = await prisma.repair.create({
    data: {
      repairCode,
      unitId: parsed.unitId,
      assetId: parsed.assetId,
      vendorId,
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      workOrderKind: WorkOrderKind.CORRECTIVE,
      repairTrade,
      issueType: parsed.issueType,
      requestingDepartmentId: suggested.requestingDepartmentId,
      responsibleDepartmentId: suggested.responsibleDepartmentId,
      reportedById: session.authKind === "user" ? session.uid : undefined,
      status: RepairStatus.OPEN,
    },
    select: {
      id: true,
      title: true,
      description: true,
      priority: true,
      status: true,
      unitId: true,
      responsibleDepartmentId: true,
      assignedEmployeeId: true,
      dueAt: true,
      completedAt: true,
      unit: { select: { facilityId: true } },
    },
  });

  // Additive Work Engine projection — guarded; never fails repair create.
  await syncRepairRecordToTask({
    id: repair.id,
    title: repair.title,
    description: repair.description,
    priority: repair.priority,
    status: repair.status,
    unitId: repair.unitId,
    responsibleDepartmentId: repair.responsibleDepartmentId,
    assignedEmployeeId: repair.assignedEmployeeId,
    dueAt: repair.dueAt,
    completedAt: repair.completedAt,
    facilityId: repair.unit.facilityId,
  });

  await savePhotosFromFormData({
    formData,
    facilityId: session.facilityId,
    parentKind: "REPAIR",
    repairId: repair.id,
    session,
    maxCount: MAX_REPAIR_PHOTOS_PER_SUBMIT,
  });

  revalidateRepairViews({ issueId: repair.id, unitId: repair.unitId });
  redirect("/repairs");
}

function revalidateWorkOrder(repairId: string, issueId?: string | null) {
  revalidatePath("/repairs");
  revalidatePath(`/repairs/${repairId}`);
  revalidatePath("/staffing/operations");
  if (issueId) revalidatePath(`/asset-issues/${issueId}`);
}

export async function startWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid Work Order start.");
  await startWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    note: toOptional(formData.get("note")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function holdWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid Work Order hold.");
  await holdAssignedWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    holdReason: (toOptional(formData.get("holdReason")) || "OTHER") as WorkOrderHoldReason,
    note: toOptional(formData.get("note")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function resumeWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid Work Order resume.");
  await resumeWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    note: toOptional(formData.get("note")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function completeWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid Work Order complete.");
  await completeAssignedWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    workPerformed: toOptional(formData.get("workPerformed")),
    resolution: toOptional(formData.get("resolution")),
    note: toOptional(formData.get("note")),
    assetConditionReview: parseAssetConditionReview(formData.get("assetConditionReview")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

function parseAssetConditionReview(raw: FormDataEntryValue | null) {
  const value = toOptional(raw);
  if (!value) return null;
  if (
    value === RepairAssetConditionReview.NO_CHANGE ||
    value === RepairAssetConditionReview.OPERATIONAL ||
    value === RepairAssetConditionReview.DEGRADED ||
    value === RepairAssetConditionReview.OUT_OF_SERVICE
  ) {
    return value;
  }
  throw new Error("Select a valid Asset condition review.");
}

function closeoutIds(formData: FormData) {
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid Work Order.");
  return { repairId, departmentId };
}

export async function addWorkOrderLaborAction(formData: FormData) {
  const session = await requireFacilitySession();
  const { repairId, departmentId } = closeoutIds(formData);
  const minutes = Number.parseInt(String(formData.get("minutes") ?? ""), 10);
  await addWorkOrderLabor(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    minutes,
    employeeId: toOptional(formData.get("employeeId")),
    note: toOptional(formData.get("note")),
    upsertOwn: true,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function addWorkOrderPartAction(formData: FormData) {
  const session = await requireFacilitySession();
  const { repairId, departmentId } = closeoutIds(formData);
  await addWorkOrderPart(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    description: String(formData.get("description") ?? ""),
    partNumber: toOptional(formData.get("partNumber")),
    quantity: String(formData.get("quantity") ?? ""),
    lineCost: toOptional(formData.get("lineCost")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function removeWorkOrderPartAction(formData: FormData) {
  const session = await requireFacilitySession();
  const { repairId, departmentId } = closeoutIds(formData);
  const partId = String(formData.get("partId") ?? "");
  if (!partId) throw new Error("Part is required.");
  await removeWorkOrderPart(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    partId,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function removeWorkOrderLaborAction(formData: FormData) {
  const session = await requireFacilitySession();
  const { repairId, departmentId } = closeoutIds(formData);
  const laborEntryId = String(formData.get("laborEntryId") ?? "");
  if (!laborEntryId) throw new Error("Labor entry is required.");
  await removeWorkOrderLabor(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    laborEntryId,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function setWorkOrderExternalCostAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");
  const { repairId, departmentId } = closeoutIds(formData);
  await setWorkOrderExternalCost(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    vendorId: toOptional(formData.get("vendorId")) ?? null,
    externalCost: toOptional(formData.get("externalCost")),
    externalCostNote: toOptional(formData.get("externalCostNote")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function addWorkOrderRecordRequirementAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");
  const { repairId, departmentId } = closeoutIds(formData);
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) throw new Error("Select a published Record template.");
  await addWorkOrderRecordRequirement(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    templateId,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function removeWorkOrderRecordRequirementAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");
  const { repairId, departmentId } = closeoutIds(formData);
  const requirementId = String(formData.get("requirementId") ?? "");
  if (!requirementId) throw new Error("Required Record is required.");
  await removeWorkOrderRecordRequirement(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    requirementId,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function satisfyWorkOrderRecordRequirementAction(formData: FormData) {
  const session = await requireFacilitySession();
  const { repairId, departmentId } = closeoutIds(formData);
  const requirementId = String(formData.get("requirementId") ?? "");
  const evidenceRecordId = String(formData.get("evidenceRecordId") ?? "");
  if (!requirementId || !evidenceRecordId) {
    throw new Error("Record ID is required to satisfy this requirement.");
  }
  await satisfyWorkOrderRecordRequirement(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    requirementId,
    evidenceRecordId,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function waiveWorkOrderRecordRequirementAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");
  const { repairId, departmentId } = closeoutIds(formData);
  const requirementId = String(formData.get("requirementId") ?? "");
  if (!requirementId) throw new Error("Required Record is required.");
  await waiveWorkOrderRecordRequirement(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    requirementId,
    waiveReason: String(formData.get("waiveReason") ?? ""),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function addWorkOrderNoteAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const note = toOptional(formData.get("note"));
  if (!repairId || !departmentId || !note) throw new Error("A note is required.");
  await addWorkOrderNote(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    note,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function assignWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  if (!repairId || !departmentId) throw new Error("Invalid assignment.");
  await assignWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    assignedEmployeeId: toOptional(formData.get("assignedEmployeeId")) ?? null,
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function linkEvidenceToWorkOrderAction(formData: FormData) {
  const session = await requireFacilitySession();
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const evidenceRecordId = String(formData.get("evidenceRecordId") ?? "");
  if (!repairId || !departmentId || !evidenceRecordId) {
    throw new Error("Evidence record is required.");
  }
  await linkEvidenceToWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId,
    repairId,
    evidenceRecordId,
    note: toOptional(formData.get("note")),
  });
  revalidateWorkOrder(repairId, toOptional(formData.get("issueId")));
}

export async function addRepairUpdateAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = addUpdateSchema.parse({
    repairId: formData.get("repairId"),
    updateText: formData.get("updateText"),
    statusAfterUpdate: formData.get("statusAfterUpdate"),
  });

  const repair = await prisma.repair.findFirst({
    where: { id: parsed.repairId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!repair) {
    throw new Error("Repair not found.");
  }

  const [, updated] = await prisma.$transaction([
    prisma.repairUpdate.create({
      data: {
        repairId: parsed.repairId,
        updateText: parsed.updateText,
        updatedById: session.authKind === "user" ? session.uid : undefined,
        statusAfterUpdate: parsed.statusAfterUpdate,
      },
    }),
    prisma.repair.update({
      where: { id: parsed.repairId },
      data: {
        status: parsed.statusAfterUpdate,
        completedAt:
          parsed.statusAfterUpdate === RepairStatus.CLOSED ? new Date() : null,
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        unitId: true,
        responsibleDepartmentId: true,
        assignedEmployeeId: true,
        dueAt: true,
        completedAt: true,
        unit: { select: { facilityId: true } },
      },
    }),
  ]);

  // Additive Work Engine projection — guarded; never fails repair status update.
  await syncRepairRecordToTask({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    priority: updated.priority,
    status: updated.status,
    unitId: updated.unitId,
    responsibleDepartmentId: updated.responsibleDepartmentId,
    assignedEmployeeId: updated.assignedEmployeeId,
    dueAt: updated.dueAt,
    completedAt: updated.completedAt,
    facilityId: updated.unit.facilityId,
  });

  revalidateRepairViews({ issueId: updated.id, unitId: updated.unitId });
}

export async function addRepairPhotosAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const repairId = String(formData.get("repairId") ?? "");
  if (!repairId) {
    throw new Error("Repair not found.");
  }

  const repair = await prisma.repair.findFirst({
    where: { id: repairId, unit: { facilityId: session.facilityId } },
    select: { id: true, unitId: true },
  });
  if (!repair) {
    throw new Error("Repair not found.");
  }

  const existing = await listAttachmentsForRepair(session.facilityId, repairId);
  await savePhotosFromFormData({
    formData,
    facilityId: session.facilityId,
    parentKind: "REPAIR",
    repairId,
    session,
    maxCount: MAX_REPAIR_PHOTOS_PER_SUBMIT,
    existingCount: existing.length,
  });

  revalidateRepairViews({ issueId: repair.id, unitId: repair.unitId });
}

export async function removeRepairPhotoAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const repairId = String(formData.get("repairId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!repairId || !attachmentId) {
    throw new Error("Invalid photo removal.");
  }

  await deleteFacilityPhotoAttachment({
    facilityId: session.facilityId,
    attachmentId,
    expectedKind: "REPAIR",
    expectedParentId: repairId,
  });

  const repair = await prisma.repair.findFirst({
    where: { id: repairId, unit: { facilityId: session.facilityId } },
    select: { id: true, unitId: true },
  });
  revalidateRepairViews({ issueId: repairId, unitId: repair?.unitId ?? null });
}
