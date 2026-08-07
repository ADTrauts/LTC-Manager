"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import {
  acknowledgeRequest,
  createRequest,
  createWorkOrderFromRequest,
  listActiveRoutesForRequestingDepartment,
  loadRequesterVisibleStatus,
  triageRequest,
  upsertRequestRoute,
} from "@/lib/operational-requests";
import { technicianUpdateWorkOrder } from "@/lib/asset-operations";
import { returnAssetToService } from "@/lib/asset-operations";
import type { AssetOperationalImpact, RepairPriority } from "@prisma/client";

function formString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createOperationalRequestAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  const observedRaw = formString(formData, "observedAt");
  const observedAt = observedRaw ? new Date(observedRaw) : new Date();
  if (Number.isNaN(observedAt.getTime())) throw new Error("Invalid observed time.");

  const equipmentRaw = formString(formData, "equipmentRemainsUsable");
  const assetId = formString(formData, "assetId") || null;

  const created = await createRequest(session, {
    facilityId: session.facilityId,
    requestingDepartmentId: formString(formData, "requestingDepartmentId"),
    responsibleDepartmentId: formString(formData, "responsibleDepartmentId"),
    affectedDepartmentId: formString(formData, "affectedDepartmentId") || null,
    unitId: formString(formData, "unitId"),
    spaceId: formString(formData, "spaceId") || null,
    assetId,
    summary: formString(formData, "summary"),
    description: formString(formData, "description") || formString(formData, "summary"),
    priority: (formString(formData, "priority") || "MEDIUM") as RepairPriority,
    operationalImpact: (formString(formData, "operationalImpact") ||
      "NO_IMMEDIATE_IMPACT") as AssetOperationalImpact,
    equipmentRemainsUsable:
      assetId == null ? null : equipmentRaw === "false" ? false : true,
    workaroundInstruction: formString(formData, "workaroundInstruction") || null,
    observedAt,
    allowObviousDuplicate: formString(formData, "allowObviousDuplicate") === "1",
  });

  revalidatePath("/staffing/operations");
  revalidatePath(`/unit/${created.unitId}`);
  return { ok: true as const, requestId: created.id, requestCode: created.requestCode };
}

export async function listRequestRoutesAction(requestingDepartmentId: string) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");
  return listActiveRoutesForRequestingDepartment(
    session.facilityId,
    requestingDepartmentId,
  );
}

export async function upsertRequestRouteAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  await upsertRequestRoute(session, {
    facilityId: session.facilityId,
    plantDepartmentId: formString(formData, "plantDepartmentId"),
    requestingDepartmentId: formString(formData, "requestingDepartmentId"),
    responsibleDepartmentId: formString(formData, "responsibleDepartmentId"),
    isActive: formString(formData, "isActive") !== "0",
    sortOrder: Number(formString(formData, "sortOrder") || "100"),
    note: formString(formData, "note") || null,
  });

  revalidatePath("/staffing/operations");
  return { ok: true as const };
}

export async function acknowledgeOperationalRequestAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  await acknowledgeRequest(session, {
    facilityId: session.facilityId,
    plantDepartmentId: formString(formData, "plantDepartmentId"),
    requestId: formString(formData, "requestId"),
    comment: formString(formData, "comment") || null,
  });

  revalidatePath("/staffing/operations");
  return { ok: true as const };
}

export async function triageOperationalRequestAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  await triageRequest(session, {
    facilityId: session.facilityId,
    plantDepartmentId: formString(formData, "plantDepartmentId"),
    requestId: formString(formData, "requestId"),
    priority: (formString(formData, "priority") || undefined) as RepairPriority | undefined,
    operationalImpact: (formString(formData, "operationalImpact") ||
      undefined) as AssetOperationalImpact | undefined,
    triageNote: formString(formData, "triageNote") || null,
    requesterVisibleStatusSummary:
      formString(formData, "requesterVisibleStatusSummary") || null,
  });

  revalidatePath("/staffing/operations");
  return { ok: true as const };
}

export async function createWorkOrderFromRequestAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  const result = await createWorkOrderFromRequest(session, {
    facilityId: session.facilityId,
    plantDepartmentId: formString(formData, "plantDepartmentId"),
    requestId: formString(formData, "requestId"),
    title: formString(formData, "title") || null,
    description: formString(formData, "description") || null,
    assignedEmployeeId: formString(formData, "assignedEmployeeId") || null,
    vendorId: formString(formData, "vendorId") || null,
  });

  revalidatePath("/staffing/operations");
  return {
    ok: true as const,
    repairId: result.workOrder.id,
    repairCode: result.workOrder.repairCode,
  };
}

export async function technicianWorkOrderAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  const action = formString(formData, "action") as
    | "START"
    | "NOTE"
    | "WAITING_PARTS"
    | "WAITING_ON_VENDOR"
    | "COMPLETE"
    | "FOLLOW_UP";

  await technicianUpdateWorkOrder(session, {
    facilityId: session.facilityId,
    departmentId: formString(formData, "departmentId"),
    repairId: formString(formData, "repairId"),
    action,
    note: formString(formData, "note") || null,
    requesterVisible: formString(formData, "requesterVisible") === "1",
    workPerformed: formString(formData, "workPerformed") || null,
    resolution: formString(formData, "resolution") || null,
    followUpRequired: formString(formData, "followUpRequired") === "1",
    followUpNote: formString(formData, "followUpNote") || null,
  });

  revalidatePath("/staffing/operations");
  return { ok: true as const };
}

export async function returnAssetToServiceFromPlantAction(formData: FormData) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");

  await returnAssetToService(session, {
    facilityId: session.facilityId,
    departmentId: formString(formData, "departmentId"),
    assetId: formString(formData, "assetId"),
    note: formString(formData, "comment") || null,
  });

  revalidatePath("/staffing/operations");
  revalidatePath("/assets");
  return { ok: true as const };
}

export async function loadRequesterStatusAction(input: {
  requestingDepartmentId: string;
  requestId: string;
}) {
  const session = await getSession();
  if (!session?.facilityId) throw new Error("Not signed in.");
  return loadRequesterVisibleStatus(session, {
    facilityId: session.facilityId,
    requestingDepartmentId: input.requestingDepartmentId,
    requestId: input.requestId,
  });
}
