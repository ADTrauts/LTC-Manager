"use server";

import { revalidatePath } from "next/cache";
import {
  OperationalAssignmentSource,
  OperationalAssignmentStatus,
} from "@prisma/client";
import { z } from "zod";

import { sessionUserIdForFk } from "@/lib/auth";
import { requireFacilitySession } from "@/lib/facility-context";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  facilityLocalDateToServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import {
  describeAssignmentReferenceRejection,
  resolveAssignmentReferences,
} from "@/lib/staffing/assignment-references";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import { recordAssignmentEvent } from "@/lib/scheduling/operational-assignments/assignment-events";
import {
  requireAssignmentManage,
  resolveAssignmentAuthority,
} from "@/lib/scheduling/operational-assignments/assignment-authority";
import {
  ensureAssignmentPlan,
} from "@/lib/scheduling/operational-assignments/assignment-plan";
import {
  assertNoOverlappingActiveAssignments,
  lockEmployeeAssignmentDay,
} from "@/lib/scheduling/operational-assignments/enforce-overlap";
import {
  assertValidResponsibilityWindow,
  parseAssignmentWindowInstant,
} from "@/lib/scheduling/operational-assignments/responsibility-window";
import {
  assertNoLocationResponsibilityOverlaps,
  replaceAssignmentLocations,
  resolveAssignmentLocationWrites,
} from "@/lib/scheduling/operational-assignments/location-scope";
import { loadZoneSpaceIds } from "@/lib/department-zones";

function parseUnitSpaceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

const sourceValues = [
  OperationalAssignmentSource.MANUAL,
  OperationalAssignmentSource.TEMPLATE,
  OperationalAssignmentSource.COVERAGE,
  OperationalAssignmentSource.REASSIGNMENT,
  OperationalAssignmentSource.SCHEDULED_EMPLOYEE,
  OperationalAssignmentSource.UNSCHEDULED_COVERAGE,
  OperationalAssignmentSource.SUPERVISOR_OVERRIDE,
  OperationalAssignmentSource.CALL_OFF_REPLACEMENT,
  OperationalAssignmentSource.MANUAL_ADDITION,
] as const;

const createSchema = z.object({
  employeeId: z.string().min(1),
  departmentId: z.string().min(1),
  roleKey: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitId: z.string().min(1).optional(),
  operationInstanceId: z.string().min(1).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  source: z.enum(sourceValues).optional(),
  notes: z.string().max(500).optional(),
  changeReason: z.string().max(500).optional(),
  clientCommandId: z.string().max(120).optional(),
  /** Comma-separated UnitSpace ids for EVS Room/Space scope. Empty = unit-wide. */
  unitSpaceIds: z.string().optional(),
  sourceZoneId: z.string().min(1).optional(),
});

const editSchema = z.object({
  assignmentId: z.string().min(1),
  roleKey: z.string().min(1).optional(),
  unitId: z.string().optional(),
  operationInstanceId: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  changeReason: z.string().min(1).max(500).optional(),
  unitSpaceIds: z.string().optional(),
  sourceZoneId: z.string().optional(),
});

const lifecycleSchema = z.object({
  assignmentId: z.string().min(1),
  action: z.enum(["activate", "complete", "cancel"]),
  changeReason: z.string().max(500).optional(),
});

const planSchema = z.object({
  departmentId: z.string().min(1),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acknowledgeCoverageGaps: z.enum(["true", "false"]).optional(),
  reopenReason: z.string().max(500).optional(),
});

function opt(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function requireFlag() {
  if (!isOperationalAssignmentsEnabled()) {
    throw new Error("Operational assignments are not enabled.");
  }
}

function revalidateAssignmentViews() {
  revalidatePath("/staffing/assignments");
  revalidatePath("/staffing");
  revalidatePath("/today");
  revalidatePath("/today/coverage");
  revalidatePath("/unit/[unitId]", "page");
  revalidatePath("/dashboard");
}

async function requireManageForDepartment(session: Awaited<ReturnType<typeof requireFacilitySession>>, departmentId: string) {
  const decision = await resolveAssignmentAuthority({
    session,
    departmentId,
    facilityId: session.facilityId,
  });
  requireAssignmentManage(decision);
  return decision;
}

export async function createAssignmentAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const parsed = createSchema.parse({
    employeeId: formData.get("employeeId"),
    departmentId: formData.get("departmentId"),
    roleKey: formData.get("roleKey"),
    serviceDate: formData.get("serviceDate"),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    source: opt(formData.get("source")) as OperationalAssignmentSource | undefined,
    notes: opt(formData.get("notes")),
    changeReason: opt(formData.get("changeReason")),
    clientCommandId: opt(formData.get("clientCommandId")),
    unitSpaceIds: opt(formData.get("unitSpaceIds")),
    sourceZoneId: opt(formData.get("sourceZoneId")),
  });

  await requireManageForDepartment(session, parsed.departmentId);

  const source = parsed.source ?? OperationalAssignmentSource.MANUAL_ADDITION;
  if (
    (source === "UNSCHEDULED_COVERAGE" || source === "CALL_OFF_REPLACEMENT" || source === "SUPERVISOR_OVERRIDE") &&
    !parsed.changeReason &&
    !parsed.notes
  ) {
    throw new Error("Unscheduled coverage and overrides require a reason.");
  }

  const [employee, department, timezone] = await Promise.all([
    prisma.employee.findFirst({
      where: {
        id: parsed.employeeId,
        facilityId: session.facilityId,
        status: { not: "TERMINATED" },
      },
      select: { id: true, status: true },
    }),
    prisma.department.findFirst({
      where: { id: parsed.departmentId, facilityId: session.facilityId },
      select: { id: true, key: true },
    }),
    loadFacilityTimezone(prisma, session.facilityId),
  ]);

  if (!employee) throw new Error("Employee not found or inactive.");
  if (!department) throw new Error("Department not found.");

  const roleDef = getRoleDefinition(parsed.roleKey);
  if (!roleDef || !isRoleValidForDepartment(parsed.roleKey, department.key)) {
    throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
  }

  const references = await resolveAssignmentReferences(prisma, {
    facilityId: session.facilityId,
    departmentId: parsed.departmentId,
    serviceDateKey: parsed.serviceDate,
    unitId: parsed.unitId,
    operationInstanceId: parsed.operationInstanceId,
  });
  if (!references.ok) {
    throw new Error(describeAssignmentReferenceRejection(references.reason));
  }

  let unitSpaceIds = parseUnitSpaceIds(parsed.unitSpaceIds);
  if (unitSpaceIds.length === 0 && parsed.sourceZoneId) {
    unitSpaceIds = await loadZoneSpaceIds(prisma, {
      facilityId: session.facilityId,
      zoneId: parsed.sourceZoneId,
    });
  }
  // Dietary and unit-wide EVS keep zero location rows.
  if (department.key !== "EVS") {
    unitSpaceIds = [];
  }

  const locationWrites = await resolveAssignmentLocationWrites(prisma, {
    facilityId: session.facilityId,
    unitId: parsed.unitId,
    unitSpaceIds,
  });

  const serviceDate = facilityLocalDateToServiceDate(parsed.serviceDate);
  const startsAt = parseAssignmentWindowInstant(parsed.serviceDate, parsed.startsAt, timezone);
  const endsAt = parseAssignmentWindowInstant(parsed.serviceDate, parsed.endsAt, timezone);
  assertValidResponsibilityWindow(startsAt, endsAt);
  const actorUserId = sessionUserIdForFk(session);

  if (parsed.clientCommandId) {
    const existing = await prisma.operationalAssignment.findFirst({
      where: { facilityId: session.facilityId, clientCommandId: parsed.clientCommandId },
      select: { id: true },
    });
    if (existing) {
      revalidateAssignmentViews();
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    await lockEmployeeAssignmentDay(tx, parsed.employeeId, parsed.serviceDate);
    const plan = await ensureAssignmentPlan(tx, {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      serviceDateKey: parsed.serviceDate,
      actorUserId,
    });

    await assertNoOverlappingActiveAssignments(tx, {
      facilityId: session.facilityId,
      employeeId: parsed.employeeId,
      serviceDate,
      startsAt,
      endsAt,
    });

    if (department.key === "EVS" && (locationWrites.length > 0 || parsed.unitId)) {
      await assertNoLocationResponsibilityOverlaps(tx, {
        facilityId: session.facilityId,
        departmentId: parsed.departmentId,
        serviceDate,
        employeeId: parsed.employeeId,
        unitId: parsed.unitId ?? null,
        unitSpaceIds: locationWrites.map((l) => l.unitSpaceId),
        startsAt,
        endsAt,
      });
    }

    const created = await tx.operationalAssignment.create({
      data: {
        facilityId: session.facilityId,
        departmentId: parsed.departmentId,
        planId: plan.id,
        employeeId: parsed.employeeId,
        serviceDate,
        roleKey: parsed.roleKey,
        roleLabel: roleDef.label,
        unitId: parsed.unitId ?? null,
        sourceZoneId: department.key === "EVS" ? parsed.sourceZoneId ?? null : null,
        operationInstanceId: parsed.operationInstanceId ?? null,
        startsAt,
        endsAt,
        source,
        notes: parsed.notes ?? null,
        changeReason: parsed.changeReason ?? null,
        clientCommandId: parsed.clientCommandId ?? null,
        createdByUserId: actorUserId,
        lastChangedByUserId: actorUserId,
        lastChangedAt: new Date(),
      },
    });

    if (locationWrites.length > 0) {
      await replaceAssignmentLocations(tx, created.id, locationWrites);
    }

    await tx.operationalAssignmentPlan.update({
      where: { id: plan.id },
      data: { lastChangedByUserId: actorUserId, lastChangedAt: new Date() },
    });

    await recordAssignmentEvent({
      assignmentId: created.id,
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      employeeId: parsed.employeeId,
      unitId: parsed.unitId ?? null,
      serviceDate,
      eventType: "CREATED",
      actorUserId,
      actorRole: session.role,
      authMethod: session.authMethod,
      toStatus: "PLANNED",
      summary:
        locationWrites.length > 0
          ? `Assignment created: ${roleDef.label} · ${locationWrites.length} Rooms/Spaces`
          : `Assignment created: ${roleDef.label}`,
      reason: parsed.changeReason ?? null,
      newValuesJson: JSON.stringify({
        unitId: parsed.unitId ?? null,
        sourceZoneId: parsed.sourceZoneId ?? null,
        unitSpaceIds: locationWrites.map((l) => l.unitSpaceId),
        locationCount: locationWrites.length,
      }),
      client: tx,
    });
  });

  revalidateAssignmentViews();
}

export async function editAssignmentAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();

  const parsed = editSchema.parse({
    assignmentId: formData.get("assignmentId"),
    roleKey: opt(formData.get("roleKey")),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    notes: opt(formData.get("notes")),
    changeReason: opt(formData.get("changeReason")),
    unitSpaceIds: opt(formData.get("unitSpaceIds")),
    sourceZoneId: opt(formData.get("sourceZoneId")),
  });

  const assignment = await prisma.operationalAssignment.findFirst({
    where: { id: parsed.assignmentId, facilityId: session.facilityId },
    select: {
      id: true,
      status: true,
      departmentId: true,
      serviceDate: true,
      unitId: true,
      employeeId: true,
      startsAt: true,
      endsAt: true,
      sourceZoneId: true,
      plan: { select: { status: true } },
      department: { select: { key: true } },
      locations: { select: { unitSpaceId: true } },
    },
  });
  if (!assignment) throw new Error("Assignment not found.");
  await requireManageForDepartment(session, assignment.departmentId);

  if (assignment.status === "COMPLETED" || assignment.status === "CANCELLED") {
    throw new Error("Cannot edit a completed or cancelled assignment.");
  }
  if (
    assignment.plan &&
    (assignment.plan.status === "CONFIRMED" || assignment.plan.status === "CLOSED") &&
    !parsed.changeReason
  ) {
    throw new Error("Post-confirmation Assignment changes require a reason.");
  }

  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const serviceDateKey = toServiceDateKey(assignment.serviceDate);
  const data: Record<string, unknown> = {};
  const prior = {
    unitId: assignment.unitId,
    startsAt: assignment.startsAt?.toISOString() ?? null,
    endsAt: assignment.endsAt?.toISOString() ?? null,
    unitSpaceIds: assignment.locations.map((l) => l.unitSpaceId),
    sourceZoneId: assignment.sourceZoneId,
  };

  if (parsed.roleKey) {
    if (!isRoleValidForDepartment(parsed.roleKey, assignment.department.key)) {
      throw new Error(`Role "${parsed.roleKey}" is not valid for this department.`);
    }
    const roleDef = getRoleDefinition(parsed.roleKey);
    data.roleKey = parsed.roleKey;
    data.roleLabel = roleDef?.label ?? parsed.roleKey;
  }

  const nextUnitId = parsed.unitId !== undefined ? parsed.unitId || null : assignment.unitId;
  const references = await resolveAssignmentReferences(prisma, {
    facilityId: session.facilityId,
    departmentId: assignment.departmentId,
    serviceDateKey,
    unitId: nextUnitId,
    operationInstanceId: parsed.operationInstanceId,
  });
  if (!references.ok) {
    throw new Error(describeAssignmentReferenceRejection(references.reason));
  }

  if (parsed.unitId !== undefined) data.unitId = parsed.unitId || null;
  if (parsed.operationInstanceId !== undefined) {
    data.operationInstanceId = parsed.operationInstanceId || null;
  }
  if (parsed.sourceZoneId !== undefined && assignment.department.key === "EVS") {
    data.sourceZoneId = parsed.sourceZoneId || null;
  }

  const nextStarts =
    parsed.startsAt !== undefined
      ? parseAssignmentWindowInstant(serviceDateKey, parsed.startsAt, timezone)
      : assignment.startsAt;
  const nextEnds =
    parsed.endsAt !== undefined
      ? parseAssignmentWindowInstant(serviceDateKey, parsed.endsAt, timezone)
      : assignment.endsAt;
  assertValidResponsibilityWindow(nextStarts, nextEnds);
  if (parsed.startsAt !== undefined) data.startsAt = nextStarts;
  if (parsed.endsAt !== undefined) data.endsAt = nextEnds;
  if (parsed.notes !== undefined) data.notes = parsed.notes || null;
  if (parsed.changeReason) data.changeReason = parsed.changeReason;

  let locationWrites: Awaited<ReturnType<typeof resolveAssignmentLocationWrites>> | null = null;
  if (parsed.unitSpaceIds !== undefined && assignment.department.key === "EVS") {
    locationWrites = await resolveAssignmentLocationWrites(prisma, {
      facilityId: session.facilityId,
      unitId: nextUnitId,
      unitSpaceIds: parseUnitSpaceIds(parsed.unitSpaceIds),
    });
  }

  const actorUserId = sessionUserIdForFk(session);
  data.lastChangedByUserId = actorUserId;
  data.lastChangedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await lockEmployeeAssignmentDay(tx, assignment.employeeId, serviceDateKey);
    await assertNoOverlappingActiveAssignments(tx, {
      facilityId: session.facilityId,
      employeeId: assignment.employeeId,
      serviceDate: assignment.serviceDate,
      startsAt: nextStarts,
      endsAt: nextEnds,
      excludeAssignmentId: assignment.id,
    });

    const spaceIdsForOverlap =
      locationWrites?.map((l) => l.unitSpaceId) ??
      assignment.locations.map((l) => l.unitSpaceId);
    if (assignment.department.key === "EVS" && (spaceIdsForOverlap.length > 0 || nextUnitId)) {
      await assertNoLocationResponsibilityOverlaps(tx, {
        facilityId: session.facilityId,
        departmentId: assignment.departmentId,
        serviceDate: assignment.serviceDate,
        employeeId: assignment.employeeId,
        unitId: nextUnitId,
        unitSpaceIds: spaceIdsForOverlap,
        startsAt: nextStarts,
        endsAt: nextEnds,
        excludeAssignmentId: assignment.id,
      });
    }

    await tx.operationalAssignment.update({ where: { id: assignment.id }, data });
    if (locationWrites) {
      await replaceAssignmentLocations(tx, assignment.id, locationWrites);
    }
    await recordAssignmentEvent({
      assignmentId: assignment.id,
      facilityId: session.facilityId,
      departmentId: assignment.departmentId,
      employeeId: assignment.employeeId,
      unitId: (data.unitId as string | null | undefined) ?? assignment.unitId,
      serviceDate: assignment.serviceDate,
      eventType: "UPDATED",
      actorUserId,
      actorRole: session.role,
      authMethod: session.authMethod,
      summary: `Assignment updated: ${Object.keys(data).filter((k) => k !== "roleLabel").join(", ")}`,
      reason: parsed.changeReason ?? null,
      priorValuesJson: JSON.stringify(prior),
      newValuesJson: JSON.stringify({
        unitId: data.unitId ?? assignment.unitId,
        startsAt: nextStarts?.toISOString() ?? null,
        endsAt: nextEnds?.toISOString() ?? null,
        unitSpaceIds: locationWrites?.map((l) => l.unitSpaceId) ?? prior.unitSpaceIds,
        locationCount: locationWrites?.length ?? prior.unitSpaceIds.length,
      }),
      client: tx,
    });
  });

  revalidateAssignmentViews();
}

export async function assignmentLifecycleAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();

  const parsed = lifecycleSchema.parse({
    assignmentId: formData.get("assignmentId"),
    action: formData.get("action"),
    changeReason: opt(formData.get("changeReason")),
  });

  const assignment = await prisma.operationalAssignment.findFirst({
    where: { id: parsed.assignmentId, facilityId: session.facilityId },
    select: { id: true, status: true, departmentId: true, employeeId: true, unitId: true, serviceDate: true },
  });
  if (!assignment) throw new Error("Assignment not found.");
  await requireManageForDepartment(session, assignment.departmentId);

  const transitions: Record<string, { from: OperationalAssignmentStatus[]; to: OperationalAssignmentStatus }> = {
    activate: { from: ["PLANNED"], to: "ACTIVE" },
    complete: { from: ["ACTIVE"], to: "COMPLETED" },
    cancel: { from: ["PLANNED", "ACTIVE"], to: "CANCELLED" },
  };

  const rule = transitions[parsed.action];
  if (!rule) throw new Error("Invalid lifecycle action.");
  if (!rule.from.includes(assignment.status)) {
    throw new Error(`Cannot ${parsed.action} an assignment with status "${assignment.status}".`);
  }

  const actorUserId = sessionUserIdForFk(session);
  await prisma.operationalAssignment.update({
    where: { id: assignment.id },
    data: {
      status: rule.to,
      lastChangedByUserId: actorUserId,
      lastChangedAt: new Date(),
      changeReason: parsed.changeReason ?? null,
    },
  });

  const eventTypeMap: Record<string, "ACTIVATED" | "COMPLETED" | "CANCELLED"> = {
    activate: "ACTIVATED",
    complete: "COMPLETED",
    cancel: "CANCELLED",
  };

  await recordAssignmentEvent({
    assignmentId: assignment.id,
    facilityId: session.facilityId,
    departmentId: assignment.departmentId,
    employeeId: assignment.employeeId,
    unitId: assignment.unitId,
    serviceDate: assignment.serviceDate,
    eventType: eventTypeMap[parsed.action] ?? "UPDATED",
    actorUserId,
    actorRole: session.role,
    authMethod: session.authMethod,
    fromStatus: assignment.status,
    toStatus: rule.to,
    summary: `Assignment ${parsed.action}d`,
    reason: parsed.changeReason ?? null,
  });

  revalidateAssignmentViews();
}

export async function reassignAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const existingId = opt(formData.get("existingAssignmentId"));
  const mode = opt(formData.get("mode")) ?? "coverage";

  const parsed = createSchema.parse({
    employeeId: formData.get("employeeId"),
    departmentId: formData.get("departmentId"),
    roleKey: formData.get("roleKey"),
    serviceDate: formData.get("serviceDate"),
    unitId: opt(formData.get("unitId")),
    operationInstanceId: opt(formData.get("operationInstanceId")),
    startsAt: opt(formData.get("startsAt")),
    endsAt: opt(formData.get("endsAt")),
    notes: opt(formData.get("notes")),
    changeReason: opt(formData.get("changeReason")) ?? opt(formData.get("notes")),
    unitSpaceIds: opt(formData.get("unitSpaceIds")),
    sourceZoneId: opt(formData.get("sourceZoneId")),
  });

  await requireManageForDepartment(session, parsed.departmentId);
  if (!parsed.changeReason && !parsed.notes) {
    throw new Error("Coverage and reassignment require a reason.");
  }

  formData.set("source", mode === "reassignment" ? "REASSIGNMENT" : "CALL_OFF_REPLACEMENT");
  formData.set("changeReason", parsed.changeReason ?? parsed.notes ?? "Coverage");
  if (parsed.unitSpaceIds) formData.set("unitSpaceIds", parsed.unitSpaceIds);
  if (parsed.sourceZoneId) formData.set("sourceZoneId", parsed.sourceZoneId);
  if (existingId && mode === "replace") {
    const existing = await prisma.operationalAssignment.findFirst({
      where: { id: existingId, facilityId: session.facilityId },
      select: { id: true, status: true, departmentId: true, employeeId: true, unitId: true, serviceDate: true },
    });
    if (existing && (existing.status === "PLANNED" || existing.status === "ACTIVE")) {
      await prisma.operationalAssignment.update({
        where: { id: existing.id },
        data: { status: "CANCELLED", changeReason: parsed.changeReason ?? "Replaced" },
      });
      await recordAssignmentEvent({
        assignmentId: existing.id,
        facilityId: session.facilityId,
        departmentId: existing.departmentId,
        employeeId: existing.employeeId,
        unitId: existing.unitId,
        serviceDate: existing.serviceDate,
        eventType: "CANCELLED",
        actorUserId: sessionUserIdForFk(session),
        actorRole: session.role,
        authMethod: session.authMethod,
        fromStatus: existing.status,
        toStatus: "CANCELLED",
        summary: "Replaced by reassignment",
        reason: parsed.changeReason ?? null,
      });
    }
  }

  await createAssignmentAction(formData);
}

export async function confirmAssignmentPlanAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const parsed = planSchema.parse({
    departmentId: formData.get("departmentId"),
    serviceDate: formData.get("serviceDate"),
    acknowledgeCoverageGaps: opt(formData.get("acknowledgeCoverageGaps")),
  });
  await requireManageForDepartment(session, parsed.departmentId);

  const actorUserId = sessionUserIdForFk(session);
  const overlaps = await prisma.$transaction(async (tx) => {
    const plan = await ensureAssignmentPlan(tx, {
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      serviceDateKey: parsed.serviceDate,
      actorUserId,
    });

    const active = await tx.operationalAssignment.findMany({
      where: {
        facilityId: session.facilityId,
        departmentId: parsed.departmentId,
        serviceDate: facilityLocalDateToServiceDate(parsed.serviceDate),
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: { id: true, employeeId: true, startsAt: true, endsAt: true, roleLabel: true },
    });

    // Hard-block confirmation on overlaps.
    const byEmployee = new Map<string, typeof active>();
    for (const row of active) {
      const list = byEmployee.get(row.employeeId) ?? [];
      list.push(row);
      byEmployee.set(row.employeeId, list);
    }
    for (const [, list] of byEmployee) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          const aOpen = !a.startsAt || !a.endsAt;
          const bOpen = !b.startsAt || !b.endsAt;
          const overlap =
            aOpen || bOpen
              ? true
              : a.startsAt!.getTime() < b.endsAt!.getTime() && b.startsAt!.getTime() < a.endsAt!.getTime();
          if (overlap) {
            throw new Error(
              `Cannot confirm plan: overlapping Assignments "${a.roleLabel}" and "${b.roleLabel}".`,
            );
          }
        }
      }
    }

    const now = new Date();
    const priorStatus = plan.status;
    await tx.operationalAssignmentPlan.update({
      where: { id: plan.id },
      data: {
        status: "CONFIRMED",
        confirmedByUserId: actorUserId,
        confirmedAt: now,
        lastChangedByUserId: actorUserId,
        lastChangedAt: now,
        coverageAcknowledgedAt:
          parsed.acknowledgeCoverageGaps === "true" ? now : plan.coverageAcknowledgedAt,
        coverageAcknowledgedByUserId:
          parsed.acknowledgeCoverageGaps === "true"
            ? actorUserId
            : plan.coverageAcknowledgedByUserId,
      },
    });

    await recordAssignmentEvent({
      planId: plan.id,
      facilityId: session.facilityId,
      departmentId: parsed.departmentId,
      serviceDate: facilityLocalDateToServiceDate(parsed.serviceDate),
      eventType: "PLAN_CONFIRMED",
      actorUserId,
      actorRole: session.role,
      authMethod: session.authMethod,
      fromStatus: priorStatus,
      toStatus: "CONFIRMED",
      summary: "Assignment plan confirmed",
      reason:
        parsed.acknowledgeCoverageGaps === "true"
          ? "Coverage risks acknowledged at confirmation"
          : null,
      client: tx,
    });

    if (parsed.acknowledgeCoverageGaps === "true") {
      await recordAssignmentEvent({
        planId: plan.id,
        facilityId: session.facilityId,
        departmentId: parsed.departmentId,
        serviceDate: facilityLocalDateToServiceDate(parsed.serviceDate),
        eventType: "COVERAGE_ACKNOWLEDGED",
        actorUserId,
        actorRole: session.role,
        authMethod: session.authMethod,
        summary: "Coverage gaps acknowledged",
        client: tx,
      });
    }

    return true;
  });

  void overlaps;
  revalidateAssignmentViews();
}

export async function reopenAssignmentPlanAction(formData: FormData) {
  requireFlag();
  const session = await requireFacilitySession();
  const parsed = planSchema.parse({
    departmentId: formData.get("departmentId"),
    serviceDate: formData.get("serviceDate"),
    reopenReason: opt(formData.get("reopenReason")),
  });
  if (!parsed.reopenReason) throw new Error("Reopening a confirmed plan requires a reason.");
  await requireManageForDepartment(session, parsed.departmentId);

  const actorUserId = sessionUserIdForFk(session);
  const serviceDate = facilityLocalDateToServiceDate(parsed.serviceDate);
  const plan = await prisma.operationalAssignmentPlan.findUnique({
    where: {
      facilityId_departmentId_serviceDate: {
        facilityId: session.facilityId,
        departmentId: parsed.departmentId,
        serviceDate,
      },
    },
  });
  if (!plan) throw new Error("Assignment plan not found.");
  if (plan.status !== "CONFIRMED" && plan.status !== "CLOSED") {
    throw new Error("Only confirmed or closed plans can be reopened.");
  }

  await prisma.operationalAssignmentPlan.update({
    where: { id: plan.id },
    data: {
      status: "REOPENED",
      reopenedByUserId: actorUserId,
      reopenedAt: new Date(),
      reopenReason: parsed.reopenReason,
      lastChangedByUserId: actorUserId,
      lastChangedAt: new Date(),
    },
  });

  await recordAssignmentEvent({
    planId: plan.id,
    facilityId: session.facilityId,
    departmentId: parsed.departmentId,
    serviceDate,
    eventType: "PLAN_REOPENED",
    actorUserId,
    actorRole: session.role,
    authMethod: session.authMethod,
    fromStatus: plan.status,
    toStatus: "REOPENED",
    summary: "Assignment plan reopened",
    reason: parsed.reopenReason,
  });

  revalidateAssignmentViews();
}
