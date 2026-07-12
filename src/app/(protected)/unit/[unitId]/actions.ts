"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MealType, IssueType, RepairPriority, RepairStatus, UnitType, WorkOrderKind } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { sessionUserIdForFk } from "@/lib/auth";
import { resolveServeryEventOperationInstanceId } from "@/lib/operations/resolve-servery-event-operation-instance";
import { prisma } from "@/lib/prisma";
import {
  defaultRepairTradeForIssueType,
  suggestRepairDepartmentIds,
} from "@/lib/repair-routing";
import { syncRepairRecordToTask } from "@/lib/work/adapters/repair-task";
import { submitInspection } from "@/lib/work/inspections";
import type { InspectionItemAnswerInput } from "@/lib/work/inspections/types";

const recordServeryServiceTimeSchema = z.object({
  unitId: z.string().cuid(),
  mealType: z.nativeEnum(MealType),
  eventType: z.enum(["READY", "STARTED"]),
  returnTab: z.enum(["overview", "logs"]).optional(),
  returnLogTab: z.string().trim().optional(),
});

function startOfToday() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

export async function recordServeryServiceTimeAction(formData: FormData) {
  const session = await requireFacilitySession();
  const parsed = recordServeryServiceTimeSchema.parse({
    unitId: formData.get("unitId"),
    mealType: formData.get("mealType"),
    eventType: formData.get("eventType"),
    returnTab: formData.get("returnTab") ?? undefined,
    returnLogTab: formData.get("returnLogTab") ?? undefined,
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId, isActive: true },
    select: { id: true, unitType: true },
  });
  if (!unit || unit.unitType !== UnitType.SERVERY) {
    throw new Error("Only active servery units can record meal service times.");
  }

  const serviceDate = startOfToday();
  const now = new Date();
  const userId = sessionUserIdForFk(session);
  const operationInstanceId = await resolveServeryEventOperationInstanceId({
    facilityId: session.facilityId,
    serviceDate,
    mealType: parsed.mealType,
  });

  await prisma.serveryMealServiceEvent.upsert({
    where: {
      unitId_serviceDate_mealType: {
        unitId: unit.id,
        serviceDate,
        mealType: parsed.mealType,
      },
    },
    create: {
      unitId: unit.id,
      serviceDate,
      mealType: parsed.mealType,
      mealServiceReadyAt: parsed.eventType === "READY" ? now : null,
      mealServiceStartedAt: parsed.eventType === "STARTED" ? now : null,
      readyRecordedById: parsed.eventType === "READY" ? userId : null,
      startedRecordedById: parsed.eventType === "STARTED" ? userId : null,
      operationInstanceId,
    },
    update:
      parsed.eventType === "READY"
        ? {
            mealServiceReadyAt: now,
            readyRecordedById: userId,
            ...(operationInstanceId ? { operationInstanceId } : {}),
          }
        : {
            mealServiceStartedAt: now,
            startedRecordedById: userId,
            ...(operationInstanceId ? { operationInstanceId } : {}),
          },
  });

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${unit.id}`);
  revalidatePath("/dashboard");
  const redirectParams = new URLSearchParams();
  redirectParams.set("mealServiceEvent", parsed.eventType === "READY" ? "ready-recorded" : "started-recorded");
  if (parsed.returnTab) {
    redirectParams.set("unitTab", parsed.returnTab);
  }
  if (parsed.returnLogTab) {
    redirectParams.set("logTab", parsed.returnLogTab);
  }
  redirect(`/unit/${unit.id}?${redirectParams.toString()}`);
}

const submitUnitInspectionSchema = z.object({
  unitId: z.string().cuid(),
  definitionId: z.string().cuid(),
  occurrenceId: z.string().cuid().optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
  answersJson: z.string().min(2),
});

export type SubmitUnitInspectionActionResult =
  | { ok: true; result: "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED"; deduplicated: boolean }
  | { ok: false; message: string };

export async function submitUnitInspectionAction(
  formData: FormData,
): Promise<SubmitUnitInspectionActionResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = submitUnitInspectionSchema.parse({
    unitId: formData.get("unitId"),
    definitionId: formData.get("definitionId"),
    occurrenceId: formData.get("occurrenceId") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
    answersJson: formData.get("answersJson"),
  });

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!unit) {
    return { ok: false, message: "Unit not found." };
  }

  let answers: InspectionItemAnswerInput[];
  try {
    answers = z
      .array(
        z.object({
          definitionItemId: z.string().cuid(),
          passed: z.boolean().nullable().optional(),
          valueText: z.string().nullable().optional(),
          valueNumber: z.number().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      )
      .parse(JSON.parse(parsed.answersJson));
  } catch {
    return { ok: false, message: "Inspection answers are invalid." };
  }

  const submittedByEmployeeId = session.authKind === "employee" ? session.uid : null;

  const outcome = await submitInspection({
    facilityId: session.facilityId,
    definitionId: parsed.definitionId,
    unitId: unit.id,
    submittedByEmployeeId,
    occurrenceId: parsed.occurrenceId ?? null,
    idempotencyKey: parsed.idempotencyKey,
    answers,
  });

  if (!outcome.ok) {
    return { ok: false, message: outcome.validation.message };
  }

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${unit.id}`);
  revalidatePath("/admin/inspections");
  revalidatePath("/today/handoffs");

  return {
    ok: true,
    result: outcome.submission.result,
    deduplicated: outcome.deduplicated,
  };
}

const updateFollowUpSchema = z.object({
  unitId: z.string().cuid(),
  taskId: z.string().cuid(),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

export type UpdateInspectionFollowUpTaskResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateInspectionFollowUpTaskAction(
  formData: FormData,
): Promise<UpdateInspectionFollowUpTaskResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = updateFollowUpSchema.parse({
    unitId: formData.get("unitId"),
    taskId: formData.get("taskId"),
    status: formData.get("status"),
  });

  const task = await prisma.task.findFirst({
    where: {
      id: parsed.taskId,
      facilityId: session.facilityId,
      unitId: parsed.unitId,
      sourceType: "INSPECTION_FINDING",
    },
    select: { id: true, status: true },
  });
  if (!task) {
    return { ok: false, message: "Follow-up work was not found for this unit." };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: parsed.status,
      completedAt: parsed.status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${parsed.unitId}`);
  revalidatePath("/today/handoffs");
  return { ok: true };
}

const createUnitIssueSchema = z.object({
  unitId: z.string().cuid(),
  issueType: z.nativeEnum(IssueType),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1000),
  priority: z.nativeEnum(RepairPriority).default(RepairPriority.MEDIUM),
  assetId: z.string().cuid().optional(),
  quantityNote: z.string().trim().max(80).optional(),
});

export type CreateUnitIssueResult =
  | { ok: true; issueId: string; repairCode: string; issueType: IssueType; title: string }
  | { ok: false; message: string };

/**
 * Quick operational issue report from Unit Workspace (Wave 8a).
 * Persists as Repair with issueType; Repair remains source of truth (ADL-008).
 */
export async function createUnitIssueAction(
  formData: FormData,
): Promise<CreateUnitIssueResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  let parsed: z.infer<typeof createUnitIssueSchema>;
  try {
    parsed = createUnitIssueSchema.parse({
      unitId: formData.get("unitId"),
      issueType: formData.get("issueType"),
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority") || RepairPriority.MEDIUM,
      assetId: (() => {
        const raw = formData.get("assetId");
        return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
      })(),
      quantityNote: (() => {
        const raw = formData.get("quantityNote");
        return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
      })(),
    });
  } catch {
    return { ok: false, message: "Check the issue details and try again." };
  }

  const unit = await prisma.unit.findFirst({
    where: { id: parsed.unitId, facilityId: session.facilityId, isActive: true },
    select: { id: true },
  });
  if (!unit) {
    return { ok: false, message: "This location was not found." };
  }

  if (parsed.assetId) {
    const asset = await prisma.asset.findFirst({
      where: {
        id: parsed.assetId,
        unitId: unit.id,
        unit: { facilityId: session.facilityId },
      },
      select: { id: true },
    });
    if (!asset) {
      return { ok: false, message: "That equipment is not on this unit." };
    }
  }

  const repairTrade = defaultRepairTradeForIssueType(parsed.issueType);
  const suggested = await suggestRepairDepartmentIds(prisma, {
    facilityId: session.facilityId,
    unitId: unit.id,
    assetId: parsed.assetId,
    repairTrade,
    issueType: parsed.issueType,
    sessionPrimaryDepartmentId: session.primaryDepartmentId,
  });

  const requestingDepartmentId = suggested.requestingDepartmentId;
  const responsibleDepartmentId = suggested.responsibleDepartmentId;
  if (!requestingDepartmentId || !responsibleDepartmentId) {
    return {
      ok: false,
      message: "Could not route this issue. Ask a supervisor to check department setup.",
    };
  }

  let description = parsed.description;
  if (parsed.issueType === IssueType.SUPPLY_SHORT && parsed.quantityNote) {
    description = `${description}\nQuantity / urgency: ${parsed.quantityNote}`;
  }

  const existingCount = await prisma.repair.count();
  const repairCode = `R-${String(existingCount + 1).padStart(5, "0")}`;

  const repair = await prisma.repair.create({
    data: {
      repairCode,
      unitId: unit.id,
      assetId: parsed.assetId,
      title: parsed.title,
      description,
      priority: parsed.priority,
      workOrderKind: WorkOrderKind.CORRECTIVE,
      repairTrade,
      issueType: parsed.issueType,
      requestingDepartmentId,
      responsibleDepartmentId,
      reportedById: session.authKind === "user" ? session.uid : undefined,
      status: RepairStatus.OPEN,
    },
    select: {
      id: true,
      repairCode: true,
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

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${unit.id}`);
  revalidatePath("/repairs");
  revalidatePath(`/issues/${repair.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/today/handoffs");

  return {
    ok: true,
    issueId: repair.id,
    repairCode: repair.repairCode,
    issueType: parsed.issueType,
    title: repair.title,
  };
}

