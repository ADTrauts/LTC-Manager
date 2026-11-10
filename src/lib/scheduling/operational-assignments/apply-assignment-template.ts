import { prisma } from "@/lib/prisma";
import { facilityLocalDateToServiceDate, loadFacilityTimezone } from "@/lib/operational-time";
import { getRoleDefinition, isRoleValidForDepartment } from "@/lib/scheduling/assignment-roles";
import { isCoverageTemplateEffectiveOnDate } from "@/lib/scheduling/coverage-expectations/publication";
import { requireAssignmentEligibility } from "@/lib/employee-operational-qualifications/assignment-eligibility";
import { recordAssignmentEvent } from "./assignment-events";
import { ensureAssignmentPlan } from "./assignment-plan";
import { lockEmployeeAssignmentDay, assertNoOverlappingActiveAssignments } from "./enforce-overlap";
import { resolveAssignmentLocationWrites, replaceAssignmentLocations, requireAssignmentLocationScope } from "./location-scope";
import { parseAssignmentWindowInstant, assertValidResponsibilityWindow } from "./responsibility-window";
import type { ApplyTemplateResult, TemplatePreviewPosition } from "./template-types";

export type ApplyTemplateInput = {
  facilityId: string; departmentId: string; departmentKey: string; serviceDate: string;
  positions: TemplatePreviewPosition[]; createdByUserId: string | null;
};

/** Apply effective published Coverage. Canonical persisted items supply the role and place. */
export async function applyAssignmentTemplate(input: ApplyTemplateInput): Promise<ApplyTemplateResult> {
  const result: ApplyTemplateResult = { created: 0, skipped: 0, warnings: [] };
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDate);
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  for (const position of input.positions) {
    const employeeId = position.suggestedEmployeeId ?? position.assignedEmployeeId;
    if (!employeeId || position.existingAssignmentId) { result.skipped++; continue; }
    try {
      const created = await prisma.$transaction(async tx => {
        await lockEmployeeAssignmentDay(tx, employeeId, input.serviceDate);
        const item = await tx.operationalAssignmentTemplateItem.findFirst({
          where: { id: position.itemId, template: { facilityId: input.facilityId, departmentId: input.departmentId } },
          include: { template: true, space: { select: { unitId: true } } },
        });
        if (!item || !isCoverageTemplateEffectiveOnDate(item.template, input.serviceDate)) {
          throw new Error("Only effective published Coverage requirements can be applied.");
        }
        if ((item.spaceId && item.unitId) || (!item.spaceId && !item.unitId)) throw new Error("Coverage requires exactly one Unit or Space.");
        const role = getRoleDefinition(item.roleKey);
        if (!role || !isRoleValidForDepartment(item.roleKey, input.departmentKey)) throw new Error("Coverage role does not belong to this Department.");
        await requireAssignmentEligibility(tx, { facilityId: input.facilityId, departmentId: input.departmentId,
          employeeId, roleKey: item.roleKey, canOverride: false });
        const existing = await tx.operationalAssignment.findMany({ where: { facilityId: input.facilityId,
          departmentId: input.departmentId, employeeId, serviceDate, roleKey: item.roleKey,
          status: { in: ["PLANNED", "ACTIVE"] } }, include: { locations: true } });
        if (existing.some(row => item.spaceId
          ? row.locations.some(location => location.unitSpaceId === item.spaceId) || (row.locations.length === 0 && item.space?.unitId != null && row.unitId === item.space.unitId)
          : row.locations.length === 0 && row.unitId === item.unitId)) return false;
        const locations = await resolveAssignmentLocationWrites(tx, { facilityId: input.facilityId,
          departmentId: input.departmentId, unitId: item.unitId, unitSpaceIds: item.spaceId ? [item.spaceId] : [] });
        await requireAssignmentLocationScope(tx, { facilityId: input.facilityId, departmentId: input.departmentId,
          unitId: item.unitId, spaceIds: locations.map(row => row.unitSpaceId) });
        const startsAt = parseAssignmentWindowInstant(input.serviceDate, item.startsAtLocal, timezone);
        const endsAt = parseAssignmentWindowInstant(input.serviceDate, item.endsAtLocal, timezone);
        assertValidResponsibilityWindow(startsAt, endsAt);
        await assertNoOverlappingActiveAssignments(tx, { facilityId: input.facilityId, employeeId, serviceDate, startsAt, endsAt });
        const plan = await ensureAssignmentPlan(tx, { facilityId: input.facilityId, departmentId: input.departmentId,
          serviceDateKey: input.serviceDate, actorUserId: input.createdByUserId });
        if (plan.status === "CLOSED") throw new Error("Reopen the closed Assignment plan before applying Coverage.");
        const assignment = await tx.operationalAssignment.create({ data: { facilityId: input.facilityId,
          departmentId: input.departmentId, employeeId, planId: plan.id, serviceDate, roleKey: item.roleKey,
          roleLabel: role.label, unitId: item.spaceId ? item.space?.unitId ?? null : item.unitId, templateItemId: item.id, startsAt, endsAt,
          source: "COVERAGE", notes: item.notes, createdByUserId: input.createdByUserId } });
        await replaceAssignmentLocations(tx, assignment.id, locations);
        await recordAssignmentEvent({ client: tx, assignmentId: assignment.id, planId: plan.id,
          facilityId: input.facilityId, departmentId: input.departmentId, employeeId,
          eventType: "CREATED", actorUserId: input.createdByUserId, toStatus: "PLANNED",
          summary: `Published Coverage applied: ${role.label}`, newValuesJson: JSON.stringify({ templateItemId: item.id,
            spaceId: item.spaceId, unitId: item.unitId, roleKey: item.roleKey }) });
        return true;
      });
      if (created) result.created++; else result.skipped++;
    } catch (error) {
      result.skipped++;
      result.warnings.push(error instanceof Error ? error.message : "Assignment could not be created.");
    }
  }
  return result;
}
