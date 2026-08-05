import type { PrismaClient } from "@prisma/client";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

export type CoverageState =
  | "COVERED"
  | "AT_RISK"
  | "UNCOVERED"
  | "NOT_YET_ASSIGNED"
  | "NOT_APPLICABLE"
  | "NOT_CONFIRMED";

export type UnitCoverageRow = {
  unitId: string | null;
  unitName: string;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  state: CoverageState;
  templateItemId: string | null;
};

export type CoverageSummary = {
  planStatus: string | null;
  covered: number;
  atRisk: number;
  uncovered: number;
  notYetAssigned: number;
  notConfirmed: number;
  notApplicable: number;
  rows: UnitCoverageRow[];
  unassignedScheduledCount: number;
  callOffAffectedCount: number;
};

/**
 * Coverage from active Assignment templates (requirement source) vs confirmed-eligible Assignments.
 * A coverage gap is operational risk, not proof that service failed.
 */
export async function buildDietaryCoverageSummary(
  client: PrismaClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDateKey: string;
    planStatus: string | null;
    assignments: Array<{
      unitId: string | null;
      unitName: string | null;
      roleKey: string;
      status: string;
      hasCallDown?: boolean;
    }>;
    scheduledEmployeeIds: string[];
    assignedEmployeeIds: string[];
    callOffEmployeeIds: string[];
  },
): Promise<CoverageSummary> {
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDateKey);
  const templates = await client.operationalAssignmentTemplate.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      isActive: true,
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: serviceDate } }],
      AND: [
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }] },
      ],
    },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { unit: { select: { id: true, name: true } } },
      },
    },
  });

  const activeAssignments = input.assignments.filter(
    (a) => a.status === "PLANNED" || a.status === "ACTIVE",
  );

  const rows: UnitCoverageRow[] = [];
  let covered = 0;
  let atRisk = 0;
  let uncovered = 0;
  let notYetAssigned = 0;
  let notConfirmed = 0;
  let notApplicable = 0;

  if (templates.length === 0) {
    notApplicable = 1;
  }

  for (const template of templates) {
    for (const item of template.items) {
      const filled = activeAssignments.filter(
        (a) =>
          a.roleKey === item.roleKey &&
          (item.unitId == null || a.unitId === item.unitId),
      );
      const filledCount = filled.length;
      const callOffRisk = filled.some((a) => a.hasCallDown);

      let state: CoverageState;
      if (input.planStatus == null || input.planStatus === "DRAFT") {
        state = filledCount === 0 ? "NOT_YET_ASSIGNED" : "NOT_CONFIRMED";
        if (state === "NOT_YET_ASSIGNED") notYetAssigned++;
        else notConfirmed++;
      } else if (filledCount >= item.requiredCount && !callOffRisk) {
        state = "COVERED";
        covered++;
      } else if (filledCount >= item.requiredCount && callOffRisk) {
        state = "AT_RISK";
        atRisk++;
      } else if (filledCount > 0 && filledCount < item.requiredCount) {
        state = "AT_RISK";
        atRisk++;
      } else {
        state = "UNCOVERED";
        uncovered++;
      }

      rows.push({
        unitId: item.unitId,
        unitName: item.unit?.name ?? (item.unitId ? "Unit" : "Any unit"),
        roleKey: item.roleKey,
        roleLabel: item.roleLabel,
        requiredCount: item.requiredCount,
        filledCount,
        state,
        templateItemId: item.id,
      });
    }
  }

  const assigned = new Set(input.assignedEmployeeIds);
  const unassignedScheduledCount = input.scheduledEmployeeIds.filter((id) => !assigned.has(id)).length;
  const callOffAffectedCount = input.callOffEmployeeIds.length;

  return {
    planStatus: input.planStatus,
    covered,
    atRisk,
    uncovered,
    notYetAssigned,
    notConfirmed,
    notApplicable,
    rows,
    unassignedScheduledCount,
    callOffAffectedCount,
  };
}
