import { prisma } from "@/lib/prisma";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";

import { recordAssignmentEvent } from "./assignment-events";
import type { ApplyTemplateResult, TemplatePreviewPosition } from "./template-types";

export type ApplyTemplateInput = {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  serviceDate: string;
  operationInstanceId: string | null;
  positions: TemplatePreviewPosition[];
  createdByUserId: string | null;
};

/**
 * Batch-create OperationalAssignment rows from confirmed template positions.
 * Skips positions that are already filled or have no employee assigned.
 * Idempotent: existing assignments matching role+unit+employee are not duplicated.
 * Sets templateItemId for traceability back to the originating template position.
 */
export async function applyAssignmentTemplate(
  input: ApplyTemplateInput,
): Promise<ApplyTemplateResult> {
  const serviceDate = new Date(`${input.serviceDate}T00:00:00`);
  let created = 0;
  let skipped = 0;
  const warnings: string[] = [];

  const existingAssignments = await prisma.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    select: { id: true, employeeId: true, roleKey: true, unitId: true },
  });

  const existingKey = (a: { employeeId: string; roleKey: string; unitId: string | null }) =>
    `${a.employeeId}:${a.roleKey}:${a.unitId ?? ""}`;
  const existingKeys = new Set(existingAssignments.map(existingKey));

  for (const pos of input.positions) {
    const employeeId = pos.suggestedEmployeeId ?? pos.assignedEmployeeId;
    if (!employeeId) {
      skipped++;
      continue;
    }

    if (pos.existingAssignmentId) {
      skipped++;
      continue;
    }

    const key = `${employeeId}:${pos.roleKey}:${pos.unitId ?? ""}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const roleDef = getRoleDefinition(pos.roleKey);
    if (!roleDef || !isRoleValidForDepartment(pos.roleKey, input.departmentKey)) {
      warnings.push(`Skipped invalid role "${pos.roleKey}" for department.`);
      skipped++;
      continue;
    }

    const assignment = await prisma.operationalAssignment.create({
      data: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        employeeId,
        serviceDate,
        roleKey: pos.roleKey,
        roleLabel: roleDef.label,
        unitId: pos.unitId ?? null,
        operationInstanceId: input.operationInstanceId,
        templateItemId: pos.itemId ?? null,
        startsAt: pos.startsAtLocal ? parseLocalTime(input.serviceDate, pos.startsAtLocal) : null,
        endsAt: pos.endsAtLocal ? parseLocalTime(input.serviceDate, pos.endsAtLocal) : null,
        source: "TEMPLATE",
        notes: pos.notes ?? null,
        createdByUserId: input.createdByUserId,
      },
    });

    await recordAssignmentEvent({
      assignmentId: assignment.id,
      facilityId: input.facilityId,
      eventType: "CREATED",
      actorUserId: input.createdByUserId,
      toStatus: "PLANNED",
      summary: `Template assignment created: ${roleDef.label}`,
    });

    existingKeys.add(key);
    created++;
  }

  return { created, skipped, warnings };
}

function parseLocalTime(dateIso: string, timeLocal: string): Date | null {
  const match = timeLocal.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, h, m] = match;
  return new Date(`${dateIso}T${h!.padStart(2, "0")}:${m}:00`);
}
