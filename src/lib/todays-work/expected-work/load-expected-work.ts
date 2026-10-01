/**
 * Load expected Work for Today's Work from the canonical WorkRequirement projection.
 * Does not require Job Flow, Operational Assignments, evidence, or canonical logs.
 */

import type { AppJwtPayload } from "@/lib/auth";
import { resolveWorkAuthority } from "@/lib/department-work/authority";
import { resolveUnitWorkRequirements } from "@/lib/department-work/load-runtime-work";
import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import type { RunDepartmentOperationPresentation } from "@/lib/operational-cycles/present-run-operation";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";

import { presentExpectedWorkFromRequirements } from "./present-expected-work";
import type { TodaysExpectedWorkView } from "./types";

function employeeDisplayName(employee: { firstName: string; lastName: string }): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export async function loadTodaysExpectedWork(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  runPresentation: RunDepartmentOperationPresentation | null;
  now?: Date;
}): Promise<TodaysExpectedWorkView> {
  const authority = await resolveWorkAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );

  if (!authority.canViewRuntime) {
    return presentExpectedWorkFromRequirements({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      requirements: [],
      runPresentation: input.runPresentation,
      workCapabilityEnabled: false,
      hasPublishedWorkPlans: false,
      canConfirmWork: false,
      canManageWorkPlans: false,
    });
  }

  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const now = input.now ?? new Date();
  const operationalDate = getFacilityServiceDate(timezone, now);
  const operationalDateKey = toServiceDateKey(operationalDate);
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const oaEnabled = isOperationalAssignmentsEnabled();

  const [requirements, publishedCount, units, assignmentRows] = await Promise.all([
    resolveUnitWorkRequirements({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDate,
      operationalDateKey,
      now,
      facilityTimezone: timezone,
    }),
    prisma.departmentWorkPlan.count({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: "PUBLISHED",
      },
    }),
    prisma.unit.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        departmentResponsibilities: { some: { departmentId: input.departmentId } },
      },
      select: { id: true, displayOrder: true },
    }),
    oaEnabled
      ? prisma.operationalAssignment.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            serviceDate,
            status: { in: ["PLANNED", "ACTIVE", "COMPLETED"] },
          },
          select: {
            unitId: true,
            employee: { select: { firstName: true, lastName: true } },
            plan: { select: { status: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const locationOrder = new Map(units.map((unit) => [unit.id, unit.displayOrder]));
  const assignments = assignmentRows
    .filter((row) => isPlanFrontlineVisible(row.plan?.status ?? null) && row.unitId)
    .map((row) => ({
      unitId: row.unitId as string,
      employeeDisplayName: employeeDisplayName(row.employee),
    }));

  return presentExpectedWorkFromRequirements({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    requirements,
    runPresentation: input.runPresentation,
    locationOrder,
    assignments,
    workCapabilityEnabled: true,
    hasPublishedWorkPlans: publishedCount > 0,
    canConfirmWork: authority.canComplete,
    canManageWorkPlans: authority.canManage,
    workPlansHref: "/staffing/work-plans",
  });
}
