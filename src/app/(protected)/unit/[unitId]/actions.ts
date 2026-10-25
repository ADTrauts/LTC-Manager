"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MealType, RepairPriority, RepairStatus, RepairTrade, WorkOrderKind } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { resolveMilestoneActor } from "@/lib/offline/resolve-milestone-actor";
import { prisma } from "@/lib/prisma";
import { suggestRepairDepartmentIds } from "@/lib/repair-routing";
import { sessionUserIdForFk } from "@/lib/auth";
import { routeDietaryMealTiming } from "@/lib/dietary/route-meal-timing";
const recordServeryServiceTimeSchema = z.object({
  unitId: z.string().cuid(),
  mealType: z.nativeEnum(MealType),
  eventType: z.enum(["READY", "STARTED"]),
  /**
   * Idempotency key minted by the client for this press. A replay of the same press returns the
   * original result instead of overwriting the recorded time.
   */
  clientActionId: z.string().trim().min(8).max(120),
  returnTab: z.enum(["overview", "logs"]).optional(),
  returnLogTab: z.string().trim().optional(),
});

const correctServeryServiceTimeSchema = recordServeryServiceTimeSchema.extend({
  occurredAt: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
});

const MILESTONE_BY_EVENT_TYPE = {
  READY: "READY",
  STARTED: "STARTED",
} as const;

function milestoneOutcomeParam(
  result: { ok: true; deduplicated: boolean } | { ok: false; reason: string },
  eventType: "READY" | "STARTED",
) {
  if (!result.ok) return `denied-${result.reason.toLowerCase().replace(/_/g, "-")}`;
  if (result.deduplicated) return "already-recorded";
  return eventType === "READY" ? "ready-recorded" : "started-recorded";
}

async function dietaryTimingActor(session: Awaited<ReturnType<typeof requireFacilitySession>>) {
  const actor = await resolveMilestoneActor(session);
  return {
    userId: actor.userId ?? sessionUserIdForFk(session),
    employeeId: actor.employeeId,
    role: session.role,
    authKind: session.authKind,
    authMethod: actor.authMethod,
  };
}

export async function recordServeryServiceTimeAction(formData: FormData) {
  const session = await requireFacilitySession();
  const parsed = recordServeryServiceTimeSchema.parse({
    unitId: formData.get("unitId"),
    mealType: formData.get("mealType"),
    eventType: formData.get("eventType"),
    clientActionId: formData.get("clientActionId"),
    returnTab: formData.get("returnTab") ?? undefined,
    returnLogTab: formData.get("returnLogTab") ?? undefined,
  });

  const eventType = MILESTONE_BY_EVENT_TYPE[parsed.eventType];
  const result = await routeDietaryMealTiming({
    facilityId: session.facilityId,
    unitId: parsed.unitId,
    mealType: parsed.mealType,
    eventType,
    action: "RECORD",
    clientActionId: parsed.clientActionId,
    actor: await dietaryTimingActor(session),
  });

  if (result.ok) {
    revalidatePath("/unit/[unitId]", "page");
    revalidatePath(`/unit/${parsed.unitId}`);
    revalidatePath("/dashboard");
    revalidatePath("/logs");
  }

  const redirectParams = new URLSearchParams();
  redirectParams.set("mealServiceEvent", milestoneOutcomeParam(result, eventType));
  if (parsed.returnTab) {
    redirectParams.set("unitTab", parsed.returnTab);
  }
  if (parsed.returnLogTab) {
    redirectParams.set("logTab", parsed.returnLogTab);
  }
  redirect(`/unit/${parsed.unitId}?${redirectParams.toString()}`);
}

/**
 * Correct a Key Point actual. The original actual row stays.
 */
export async function correctServeryServiceTimeAction(formData: FormData) {
  const session = await requireFacilitySession();
  const parsed = correctServeryServiceTimeSchema.parse({
    unitId: formData.get("unitId"),
    mealType: formData.get("mealType"),
    eventType: formData.get("eventType"),
    clientActionId: formData.get("clientActionId"),
    occurredAt: formData.get("occurredAt"),
    reason: formData.get("reason"),
    returnTab: formData.get("returnTab") ?? undefined,
    returnLogTab: formData.get("returnLogTab") ?? undefined,
  });

  const occurredAt = new Date(parsed.occurredAt);
  const eventType = MILESTONE_BY_EVENT_TYPE[parsed.eventType];
  const result = await routeDietaryMealTiming({
    facilityId: session.facilityId,
    unitId: parsed.unitId,
    mealType: parsed.mealType,
    eventType,
    action: "CORRECT",
    clientActionId: parsed.clientActionId,
    occurredAt,
    reason: parsed.reason,
    actor: await dietaryTimingActor(session),
  });

  if (result.ok) {
    revalidatePath("/unit/[unitId]", "page");
    revalidatePath(`/unit/${parsed.unitId}`);
    revalidatePath("/dashboard");
    revalidatePath("/logs");
  }

  const redirectParams = new URLSearchParams();
  redirectParams.set(
    "mealServiceEvent",
    result.ok ? "correction-recorded" : milestoneOutcomeParam(result, eventType),
  );
  if (parsed.returnTab) {
    redirectParams.set("unitTab", parsed.returnTab);
  }
  redirect(`/unit/${parsed.unitId}?${redirectParams.toString()}`);
}

export type SubmitUnitInspectionActionResult =
  | { ok: true; result: "PASSED" | "PASSED_WITH_FINDINGS" | "FAILED"; deduplicated: boolean }
  | { ok: false; message: string };

export async function submitUnitInspectionAction(
  _formData: FormData,
): Promise<SubmitUnitInspectionActionResult> {
  return { ok: false, message: "Record this inspection as a Catalog Record." };
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

  updateFollowUpSchema.parse({
    unitId: formData.get("unitId"),
    taskId: formData.get("taskId"),
    status: formData.get("status"),
  });

  return { ok: false, message: "Follow-up work is recorded on the Record." };
}

const createUnitIssueSchema = z.object({
  unitId: z.string().cuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(1000),
  priority: z.nativeEnum(RepairPriority).default(RepairPriority.MEDIUM),
  repairTrade: z.nativeEnum(RepairTrade).default(RepairTrade.GENERAL),
  assetId: z.string().cuid().optional(),
  quantityNote: z.string().trim().max(80).optional(),
});

export type CreateUnitIssueResult =
  | { ok: true; issueId: string; repairCode: string; title: string }
  | { ok: false; message: string };

/**
 * Legacy Unit Workspace quick action. Persists as Repair (Work Order), not AssetIssue.
 * Repair remains the compatibility source of truth for this path (ADL-008).
 * Naming this an "issue" in the action is leftover UI language, not canonical Issue.
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
      title: formData.get("title"),
      description: formData.get("description"),
      priority: formData.get("priority") || RepairPriority.MEDIUM,
      repairTrade: formData.get("repairTrade") || RepairTrade.GENERAL,
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

  const repairTrade = parsed.repairTrade;
  const suggested = await suggestRepairDepartmentIds(prisma, {
    facilityId: session.facilityId,
    unitId: unit.id,
    assetId: parsed.assetId,
    repairTrade,
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
  if (parsed.quantityNote) {
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

  revalidatePath("/unit/[unitId]", "page");
  revalidatePath(`/unit/${unit.id}`);
  revalidatePath("/repairs");
  revalidatePath(`/repairs/${repair.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/today/handoffs");

  return {
    ok: true,
    issueId: repair.id,
    repairCode: repair.repairCode,
    title: repair.title,
  };
}

