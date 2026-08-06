"use server";

import { revalidatePath } from "next/cache";
import type { AssetOperationalImpact, RepairPriority } from "@prisma/client";
import { z } from "zod";

import {
  acknowledgeIssue,
  closeIssue,
  createWorkOrderFromIssue,
  linkEvidenceToIssue,
  markMonitoring,
  reopenIssue,
  reportAssetIssue,
  resolveIssue,
  triageIssue,
} from "@/lib/asset-operations";
import { requireFacilitySession } from "@/lib/facility-context";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function revalidateIssueViews(issueId?: string, assetId?: string, unitId?: string) {
  revalidatePath("/assets");
  revalidatePath("/staffing/operations");
  revalidatePath("/unit/[unitId]", "page");
  if (issueId) revalidatePath(`/asset-issues/${issueId}`);
  if (assetId) revalidatePath(`/assets/${assetId}`);
  if (unitId) revalidatePath(`/unit/${unitId}`);
}

function requireFlag() {
  if (!isDietaryAssetOperationsEnabled()) {
    throw new Error("Dietary Asset Operations is not enabled.");
  }
}

const reportSchema = z.object({
  facilityId: z.string().cuid(),
  departmentId: z.string().cuid(),
  assetId: z.string().cuid(),
  unitId: z.string().cuid(),
  spaceId: z.string().cuid().optional(),
  summary: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
  observedAt: z.string().min(1),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  operationalImpact: z
    .enum([
      "NO_IMMEDIATE_IMPACT",
      "WORKAROUND_AVAILABLE",
      "SERVICE_AT_RISK",
      "EQUIPMENT_UNAVAILABLE",
    ])
    .optional(),
  equipmentRemainsUsable: z.boolean().optional(),
  workaroundInstruction: z.string().trim().max(500).optional(),
  evidenceRecordId: z.string().cuid().optional(),
  comment: z.string().trim().max(500).optional(),
  allowDuplicateOpen: z.boolean().optional(),
  clientCommandId: z.string().trim().max(120).optional(),
});

export type ReportAssetIssueActionInput = z.infer<typeof reportSchema>;

export async function reportAssetIssueAction(input: ReportAssetIssueActionInput) {
  requireFlag();
  const session = await requireFacilitySession();
  const parsed = reportSchema.parse(input);
  if (parsed.facilityId !== session.facilityId) {
    throw new Error("Cross-facility Asset Issue reporting denied.");
  }

  const observedAt = new Date(parsed.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error("Observed time is invalid.");
  }

  const result = await reportAssetIssue(session, {
    facilityId: parsed.facilityId,
    departmentId: parsed.departmentId,
    assetId: parsed.assetId,
    unitId: parsed.unitId,
    spaceId: parsed.spaceId,
    summary: parsed.summary,
    description: parsed.description,
    observedAt,
    priority: parsed.priority as RepairPriority | undefined,
    operationalImpact: parsed.operationalImpact as AssetOperationalImpact | undefined,
    equipmentRemainsUsable: parsed.equipmentRemainsUsable,
    workaroundInstruction: parsed.workaroundInstruction,
    evidenceRecordId: parsed.evidenceRecordId,
    comment: parsed.comment,
    allowDuplicateOpen: parsed.allowDuplicateOpen,
    clientCommandId: parsed.clientCommandId,
    recordedOnline: true,
  });

  revalidateIssueViews(result.issue.id, parsed.assetId, parsed.unitId);
  return {
    issueId: result.issue.id,
    issueCode: result.issue.issueCode,
    duplicateOf: result.duplicateOf,
    idempotent: result.idempotent,
  };
}

export async function acknowledgeAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid acknowledge request.");

  await acknowledgeIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function triageAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const triageNote = toOptional(formData.get("triageNote"));
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid triage request.");

  await triageIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    triageNote,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function markAssetIssueMonitoringAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid monitoring request.");

  await markMonitoring(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function resolveAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const resolutionReason = toOptional(formData.get("resolutionReason"));
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid resolve request.");

  await resolveIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    resolutionReason,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function closeAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const resolutionReason = toOptional(formData.get("resolutionReason"));
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid close request.");

  await closeIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    resolutionReason,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function reopenAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const comment = toOptional(formData.get("comment"));
  if (!issueId || !departmentId) throw new Error("Invalid reopen request.");

  await reopenIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    comment,
  });
  revalidateIssueViews(issueId);
}

export async function linkEvidenceToAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const evidenceRecordId = String(formData.get("evidenceRecordId") ?? "");
  const note = toOptional(formData.get("note"));
  if (!issueId || !departmentId || !evidenceRecordId) {
    throw new Error("Invalid evidence link request.");
  }

  await linkEvidenceToIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    evidenceRecordId,
    note,
  });
  revalidateIssueViews(issueId);
}

export async function createWorkOrderFromAssetIssueAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const issueId = String(formData.get("issueId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const vendorId = toOptional(formData.get("vendorId"));
  const title = toOptional(formData.get("title"));
  const description = toOptional(formData.get("description"));
  if (!issueId || !departmentId) throw new Error("Invalid Work Order create request.");

  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!vendor) throw new Error("Vendor not found.");
  }

  const wo = await createWorkOrderFromIssue(session, {
    facilityId: session.facilityId,
    departmentId,
    issueId,
    vendorId: vendorId ?? null,
    title,
    description,
  });

  revalidateIssueViews(issueId);
  revalidatePath(`/issues/${wo.id}`);
}

export async function updateWorkOrderStatusAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const { updateWorkOrderStatus, completeWorkOrder, assignVendor } = await import(
    "@/lib/asset-operations"
  );
  const repairId = String(formData.get("repairId") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const toStatus = String(formData.get("toStatus") ?? "");
  const vendorId = toOptional(formData.get("vendorId"));
  const workPerformed = toOptional(formData.get("workPerformed"));
  const resolution = toOptional(formData.get("resolution"));
  if (!repairId || !departmentId) throw new Error("Invalid Work Order update.");

  if (vendorId !== undefined) {
    await assignVendor(session, {
      facilityId: session.facilityId,
      departmentId,
      repairId,
      vendorId: vendorId ?? null,
    });
  }

  if (toStatus === "COMPLETED") {
    await completeWorkOrder(session, {
      facilityId: session.facilityId,
      departmentId,
      repairId,
      workPerformed,
      resolution,
    });
  } else if (toStatus) {
    await updateWorkOrderStatus(session, {
      facilityId: session.facilityId,
      departmentId,
      repairId,
      toStatus: toStatus as
        | "OPEN"
        | "ASSIGNED"
        | "IN_PROGRESS"
        | "WAITING_PARTS"
        | "WAITING_ON_VENDOR"
        | "ON_HOLD"
        | "COMPLETED"
        | "CANCELLED"
        | "CLOSED",
    });
  }

  revalidatePath(`/issues/${repairId}`);
  revalidatePath("/staffing/operations");
}
