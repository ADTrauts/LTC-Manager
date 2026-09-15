import type { AppJwtPayload } from "@/lib/auth";
import { canManageDepartmentHeadSettings } from "@/lib/dept-settings-access";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import {
  partitionCyclesForLifecycle,
  reviewDraftChangesAgainstCurrent,
  type CycleLifecycleRow,
} from "@/lib/operational-cycles/cycle-lifecycle";
import { mapCycleRow } from "@/lib/operational-cycles/load-published-cycles";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { EmployeeStatus } from "@prisma/client";

export type DepartmentBuilderContextSummary = {
  showInEmployeeApp: boolean;
  headEmployeeId: string | null;
  headDisplayName: string | null;
  assignedEmployeeCount: number;
  canEditHead: boolean;
  canEditVisibility: boolean;
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    onRoster: boolean;
  }>;
  /** Currently effective published root operational cycles (today). */
  currentCycleCount: number;
  activeTeamCount: number;
  draftCount: number;
  scheduledCount: number;
  scheduledEffectiveFrom: string | null;
  /** null = no drafts; changes = drafts differ from current; no_changes = drafts match current. */
  draftState: null | "changes" | "no_changes";
};

export async function loadDepartmentBuilderContextSummary(
  session: NonNullable<AppJwtPayload>,
  departmentId: string,
): Promise<DepartmentBuilderContextSummary | null> {
  const facilityId = session.facilityId;
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: {
      id: true,
      showInEmployeeApp: true,
      headEmployeeId: true,
      headEmployee: { select: { firstName: true, lastName: true } },
    },
  });
  if (!department) return null;

  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));

  const [employees, cycleRows, canEditHead, activeTeamCount] = await Promise.all([
    prisma.employee.findMany({
      where: { facilityId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    }),
    prisma.departmentOperationalCycle.findMany({
      where: { facilityId, departmentId },
      include: {
        locations: { select: { unitId: true, spaceId: true } },
        milestoneTimes: { select: { unitId: true, milestone: true, configuredTime: true } },
        keyTimeGroups: {
          select: {
            dueLocal: true,
            rooms: { select: { spaceId: true } },
          },
          orderBy: { displaySequence: "asc" },
        },
      },
      orderBy: [{ displaySequence: "asc" }, { stableKey: "asc" }, { version: "desc" }],
    }),
    canManageDepartmentHeadSettings(session, departmentId),
    prisma.departmentTeam.count({
      where: { facilityId, departmentId, status: "ACTIVE" },
    }),
  ]);

  const mappedCycles: CycleLifecycleRow[] = cycleRows.map((row) => ({
    ...mapCycleRow(row),
    publishedAt: row.publishedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
  const { current, drafts, scheduled } = partitionCyclesForLifecycle(mappedCycles, todayKey);

  let draftCount = 0;
  let draftState: DepartmentBuilderContextSummary["draftState"] = null;
  for (const row of cycleRows) {
    if (row.status === "DRAFT") draftCount += 1;
  }
  if (drafts.length > 0) {
    const changes = reviewDraftChangesAgainstCurrent({ drafts, current });
    draftState = changes.length > 0 ? "changes" : "no_changes";
  }

  const scheduledCount = scheduled.length;
  const scheduledEffectiveFrom =
    scheduled.length > 0 ? toServiceDateKey(scheduled[0]!.effectiveFrom) : null;

  const activeEmployees = employees
    .filter((e) => e.status !== EmployeeStatus.TERMINATED)
    .sort((a, b) =>
      `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`),
    );

  const roster = activeEmployees.map((e) => ({
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    onRoster: employeeBelongsToDepartment(e, departmentId),
  }));

  const headDisplayName =
    department.headEmployee?.firstName && department.headEmployee?.lastName
      ? `${department.headEmployee.firstName} ${department.headEmployee.lastName}`
      : null;

  return {
    showInEmployeeApp: department.showInEmployeeApp,
    headEmployeeId: department.headEmployeeId,
    headDisplayName,
    assignedEmployeeCount: roster.filter((e) => e.onRoster).length,
    canEditHead: canEditHead && session.authMethod !== "QUICK_PIN",
    canEditVisibility:
      isFacilityAdministratorRole(session.role) && session.authMethod !== "QUICK_PIN",
    employees: roster,
    currentCycleCount: current.length,
    activeTeamCount,
    draftCount,
    scheduledCount,
    scheduledEffectiveFrom,
    draftState,
  };
}
