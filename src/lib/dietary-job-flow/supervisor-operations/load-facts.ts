/**
 * Phase 6O — Supervisor Operations fact loader.
 * Fetches canonical domain facts. Does not interpret Board exceptions.
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  isDepartmentOperationalEvidenceEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { loadSupervisorWorkExceptions } from "@/lib/department-work";
import { loadZonesForDepartment } from "@/lib/department-zones";
import {
  isCanonicalLogsEnabled,
  isEvsOperationsEnabled,
  isOperationalAssignmentsEnabled,
  isPlantOperationsEnabled,
} from "@/lib/feature-flags";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";
import { OPEN_OPERATIONAL_REQUEST_STATUSES } from "@/lib/operational-requests/types";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  loadRuntimeLocationStates,
  type RuntimeLocationSpaceRef,
} from "@/lib/runtime-location-state";
import { buildDietaryCoverageSummary } from "@/lib/scheduling/operational-assignments/build-coverage-summary";
import { loadAssignmentPlanView } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { buildLocationCoverageSummary } from "@/lib/scheduling/operational-assignments/location-coverage";
import { loadDailyAssignmentBoard } from "@/lib/scheduling/operational-assignments/load-daily-assignment-board";

import type { SupervisorHistoricalEvidenceRecord } from "../supervisor-evidence-attention";
import type { SupervisorOperationsBoard, SupervisorOperationsFilters } from "../types";
import type { SupervisorOperationsFacts } from "./facts";
import type { SupervisorAssignmentFact, SupervisorCoverageGap, SupervisorSyncItem } from "./types";

export type LoadSupervisorOperationsFactsInput = {
  session?: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  departmentName: string;
  now?: Date;
  filters?: {
    floor?: string | null;
    unit?: string | null;
    zone?: string | null;
    employee?: string | null;
  };
};

export async function loadSupervisorOperationsFacts(
  input: LoadSupervisorOperationsFactsInput,
): Promise<SupervisorOperationsFacts> {
  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const oaEnabled = isOperationalAssignmentsEnabled();
  const harborLogsEnabled = isCanonicalLogsEnabled();
  const evidenceCompatEnabled = isDepartmentOperationalEvidenceEnabled(input.departmentKey);
  const workPlansEnabled = isDepartmentWorkPlansEnabled(input.departmentKey);
  const isEvs = input.departmentKey === "EVS" && isEvsOperationsEnabled();
  const isPlant = input.departmentKey === "PLANT" && isPlantOperationsEnabled();
  const isDietary = input.departmentKey === "DIETARY";

  const [facility, spaces, departmentUnits] = await Promise.all([
    prisma.facility.findFirst({
      where: { id: input.facilityId },
      select: { id: true, displayName: true },
    }),
    prisma.unitSpace.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        responsibilities: { some: { departmentId: input.departmentId } },
      },
      select: { id: true, name: true, unitId: true },
    }),
    prisma.unit.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        departmentResponsibilities: { some: { departmentId: input.departmentId } },
      },
      select: { id: true, name: true },
    }),
  ]);

  if (!facility) {
    throw new Error("Facility or department not found.");
  }

  const spaceRefs: RuntimeLocationSpaceRef[] = spaces.map((space) => ({
    spaceId: space.id,
    departmentId: input.departmentId,
    unitId: space.unitId,
    displayName: space.name,
  }));
  const departmentUnitIds = departmentUnits.map((unit) => unit.id);
  const departmentUnitNameById = new Map(departmentUnits.map((unit) => [unit.id, unit.name]));

  const loadHistorical = harborLogsEnabled || evidenceCompatEnabled;

  const [
    loadedStates,
    plan,
    board,
    historicalRecords,
    workExceptions,
    pendingConflictRows,
    pendingOfflineReceipts,
    plantOverlay,
  ] = await Promise.all([
    spaceRefs.length > 0
      ? loadRuntimeLocationStates({
          facilityId: input.facilityId,
          spaceRefs,
          now,
          operationalAssignmentsEnabled: oaEnabled,
          canonicalLogsEnabled: harborLogsEnabled,
        })
          .then((loaded) => loaded.states)
          .catch(() => [])
      : Promise.resolve([]),
    oaEnabled
      ? loadAssignmentPlanView(prisma, {
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          serviceDateKey: operationalDateKey,
        })
      : Promise.resolve(null),
    loadDailyAssignmentBoard({
      facilityId: input.facilityId,
      serviceDate: operationalDateKey,
      departmentId: input.departmentId,
    }),
    loadHistorical
      ? prisma.operationalEvidenceRecord.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            operationalDate: serviceDate,
            OR: [
              { outOfStandard: true },
              { status: { in: ["COMPLETED_WITH_CORRECTIVE_ACTION", "NEEDS_REVIEW"] } },
            ],
          },
          select: {
            id: true,
            unitId: true,
            spaceId: true,
            templateName: true,
            status: true,
            outOfStandard: true,
            correctiveActionText: true,
            logAttachmentId: true,
            logRequirementKey: true,
            requirementKey: true,
          },
          take: 50,
        })
      : Promise.resolve([] as SupervisorHistoricalEvidenceRecord[]),
    workPlansEnabled
      ? loadSupervisorWorkExceptions({
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          operationalDate: serviceDate,
          operationalDateKey,
          now,
          facilityTimezone: timezone,
        })
      : Promise.resolve([]),
    // Sync models have no departmentId. Scope is unit responsibility.
    // A shared unit conflict may surface for every responsible department.
    departmentUnitIds.length > 0
      ? prisma.offlineConflict.findMany({
          where: {
            facilityId: input.facilityId,
            resolution: "PENDING",
            unitId: { in: departmentUnitIds },
          },
          select: { id: true, unitId: true },
          take: 50,
        })
      : Promise.resolve([]),
    departmentUnitIds.length > 0
      ? prisma.offlineSyncReceipt.findMany({
          where: {
            facilityId: input.facilityId,
            resultCategory: "RETRY_REQUIRED",
            unitId: { in: departmentUnitIds },
          },
          select: { id: true, unitId: true },
          take: 50,
        })
      : Promise.resolve([]),
    isPlant ? loadPlantOverlay(input.facilityId, input.departmentId, now) : Promise.resolve(null),
  ]);

  const presenceEmployees = board.employees.map((employee) => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    hasCallOff: employee.hasCallDown,
  }));
  const callOffEmployeeIds = presenceEmployees.filter((row) => row.hasCallOff).map((row) => row.id);

  const employeeNameById = new Map(
    board.employees.map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`.trim(),
    ]),
  );
  const assignments: SupervisorAssignmentFact[] = oaEnabled
    ? board.assignments
        .filter((row) => row.status === "PLANNED" || row.status === "ACTIVE")
        .map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          employeeName: employeeNameById.get(row.employeeId) ?? null,
          unitId: row.unitId,
          unitName: row.unitName,
          roleKey: row.roleKey,
          roleLabel: row.roleLabel,
          status: row.status,
        }))
    : [];

  let coverageCounts = { covered: 0, atRisk: 0, uncovered: 0 };
  let coverageGaps: SupervisorCoverageGap[] = [];
  let evsOverlay: SupervisorOperationsFacts["evsOverlay"] = null;

  if (oaEnabled && isDietary) {
    const assignedEmployeeIds = [
      ...new Set(assignments.map((row) => row.employeeId).filter((id): id is string => Boolean(id))),
    ];
    const coverage = await buildDietaryCoverageSummary(prisma, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDateKey: operationalDateKey,
      planStatus: plan?.status ?? null,
      assignments: assignments.map((row) => ({
        unitId: row.unitId,
        unitName: row.unitName,
        roleKey: row.roleKey,
        status: row.status,
        hasCallDown: callOffEmployeeIds.includes(row.employeeId ?? ""),
      })),
      scheduledEmployeeIds: presenceEmployees.map((row) => row.id),
      assignedEmployeeIds,
      callOffEmployeeIds,
    });
    coverageCounts = {
      covered: coverage.covered,
      atRisk: coverage.atRisk,
      uncovered: coverage.uncovered,
    };
    coverageGaps = coverage.rows
      .filter((row) => row.state === "UNCOVERED" || row.state === "AT_RISK")
      .map((row) => ({
        unitId: row.unitId,
        unitName: row.unitName,
        locationLabel: row.spaceName ?? null,
        roleKey: row.roleKey,
        roleLabel: row.roleLabel,
        state: row.state === "AT_RISK" ? "AT_RISK" : "UNCOVERED",
        requiredCount: row.requiredCount,
        filledCount: row.filledCount,
      }));
  }

  if (oaEnabled && isEvs) {
    const [locSummary, zones] = await Promise.all([
      buildLocationCoverageSummary(prisma, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
        now,
        callOffEmployeeIds,
      }),
      loadZonesForDepartment(prisma, {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      }),
    ]);
    coverageCounts = {
      covered: locSummary.covered,
      atRisk: locSummary.atRisk,
      uncovered: locSummary.uncovered,
    };
    evsOverlay = presentEvsOverlay(locSummary, zones, board.employees, input.filters ?? {});
  }

  const syncItems: SupervisorSyncItem[] = [
    ...pendingOfflineReceipts.map((row) => ({
      kind: "retry_required" as const,
      unitId: row.unitId,
      unitName: departmentUnitNameById.get(row.unitId) ?? null,
    })),
    ...pendingConflictRows.map((row) => ({
      kind: "pending_conflict" as const,
      unitId: row.unitId,
      unitName: departmentUnitNameById.get(row.unitId) ?? null,
    })),
  ];

  return {
    now,
    timezone,
    operationalDateKey,
    oaEnabled,
    harborLogsEnabled,
    facility,
    department: {
      id: input.departmentId,
      name: input.departmentName,
      key: input.departmentKey,
    },
    states: loadedStates,
    planStatus: plan?.status ?? null,
    presenceEmployees,
    assignments,
    coverageCounts,
    coverageGaps,
    historicalRecords,
    workExceptions: workExceptions.map((row) => ({
      occurrenceKey: row.occurrenceKey,
      label: row.label,
      unitId: row.unitId,
      unitName: row.unitName,
      state: row.state,
      assignedEmployeeId: row.assignedEmployeeId,
    })),
    sync: {
      retryRequired: pendingOfflineReceipts.length,
      pendingConflicts: pendingConflictRows.length,
      items: syncItems,
      unscopableExcluded: false,
    },
    evsOverlay,
    plantOverlay,
  };
}

function presentEvsOverlay(
  locSummary: Awaited<ReturnType<typeof buildLocationCoverageSummary>>,
  zones: Awaited<ReturnType<typeof loadZonesForDepartment>>,
  employees: Array<{ id: string; firstName: string; lastName: string }>,
  filters: {
    floor?: string | null;
    unit?: string | null;
    zone?: string | null;
    employee?: string | null;
  },
): NonNullable<SupervisorOperationsFacts["evsOverlay"]> {
  const filterFloor = filters.floor?.trim() || null;
  const filterUnit = filters.unit?.trim() || null;
  const filterZone = filters.zone?.trim() || null;
  const filterEmployee = filters.employee?.trim() || null;

  const matchesFilters = (row: {
    unitId: string | null;
    floorUnitId: string | null;
    zoneIds: string[];
    employeeIds: string[];
  }) => {
    if (filterFloor && row.floorUnitId !== filterFloor) return false;
    if (filterUnit && row.unitId !== filterUnit) return false;
    if (filterZone && !row.zoneIds.includes(filterZone)) return false;
    if (filterEmployee && !row.employeeIds.includes(filterEmployee)) return false;
    return true;
  };

  const filteredRows = locSummary.rows.filter(matchesFilters);
  const toLocationRow = (row: (typeof locSummary.rows)[number]) => ({
    unitSpaceId: row.unitSpaceId,
    label: row.label,
    unitId: row.unitId,
    unitName: row.unitName,
    floorUnitId: row.floorUnitId,
    floorName: row.floorName,
    state: row.state,
    employeeLabels: row.employeeLabels,
    zoneIds: row.zoneIds,
  });

  const floorOptions = new Map<string, string>();
  const unitOptions = new Map<string, string>();
  for (const row of locSummary.rows) {
    if (row.floorUnitId && row.floorName) floorOptions.set(row.floorUnitId, row.floorName);
    if (row.unitId && row.unitName) unitOptions.set(row.unitId, row.unitName);
  }

  const filterModel: SupervisorOperationsFilters = {
    floor: filterFloor,
    unit: filterUnit,
    zone: filterZone,
    employee: filterEmployee,
    floors: [...floorOptions.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    units: [...unitOptions.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    zones: zones
      .filter((zone) => zone.status === "ACTIVE" || zone.status === "DRAFT")
      .map((zone) => ({ id: zone.id, name: zone.name })),
    employees: employees
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const visibleUnitIds =
    filterUnit || filterFloor
      ? [
          ...new Set(
            filteredRows.map((row) => row.unitId).filter((id): id is string => Boolean(id)),
          ),
        ]
      : null;

  return {
    locationCovered: locSummary.covered,
    locationAtRisk: locSummary.atRisk,
    locationUncovered: locSummary.uncovered,
    locationOverlapping: locSummary.overlapping,
    locationRequired: locSummary.totalRequired,
    visibleUnitIds,
    locationCoverage: {
      unassigned: filteredRows.filter((row) => row.state === "UNCOVERED").map(toLocationRow),
      overlapping: filteredRows.filter((row) => row.state === "OVERLAPPING").map(toLocationRow),
    },
    filters: filterModel,
  };
}

async function loadPlantOverlay(
  facilityId: string,
  departmentId: string,
  now: Date,
): Promise<NonNullable<SupervisorOperationsBoard["plantOperations"]>> {
  const [requests, workOrders, oosAssets, requestingDepts, technicians] = await Promise.all([
    prisma.operationalRequest.findMany({
      where: {
        facilityId,
        responsibleDepartmentId: departmentId,
        status: { in: OPEN_OPERATIONAL_REQUEST_STATUSES },
      },
      include: {
        requestingDepartment: { select: { id: true, name: true } },
        unit: { select: { name: true } },
        workOrder: { select: { repairCode: true } },
      },
      orderBy: [{ priority: "desc" }, { reportedAt: "asc" }],
      take: 80,
    }),
    prisma.repair.findMany({
      where: {
        responsibleDepartmentId: departmentId,
        unit: { facilityId },
        status: { in: OPEN_WORK_ORDER_STATUSES },
      },
      include: {
        unit: { select: { name: true } },
        assignedEmployee: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
      take: 80,
    }),
    prisma.asset.count({
      where: {
        unit: { facilityId },
        departmentId,
        status: "OUT_OF_SERVICE",
      },
    }),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: {
        facilityId,
        status: "ACTIVE",
        primaryDepartmentId: departmentId,
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 100,
    }),
  ]);

  const untriagedStatuses = new Set(["REPORTED", "ACKNOWLEDGED", "REOPENED"]);
  return {
    newRequests: requests.filter((row) => row.status === "REPORTED").length,
    untriaged: requests.filter((row) => untriagedStatuses.has(row.status)).length,
    urgent: requests.filter((row) => row.priority === "URGENT" || row.priority === "HIGH").length,
    outOfServiceAssets: oosAssets,
    openWorkOrders: workOrders.filter((row) => row.status === "OPEN" || row.status === "ASSIGNED")
      .length,
    inProgressWorkOrders: workOrders.filter((row) => row.status === "IN_PROGRESS").length,
    waitingVendor: workOrders.filter((row) => row.status === "WAITING_ON_VENDOR").length,
    waitingParts: workOrders.filter((row) => row.status === "WAITING_PARTS").length,
    overdueWorkOrders: workOrders.filter(
      (row) => row.dueAt != null && row.dueAt.getTime() < now.getTime(),
    ).length,
    unassignedWorkOrders: workOrders.filter((row) => !row.assignedEmployeeId).length,
    requests: requests.map((row) => ({
      id: row.id,
      requestCode: row.requestCode,
      summary: row.summary,
      status: row.status,
      priority: row.priority,
      requestingDepartmentName: row.requestingDepartment.name,
      unitName: row.unit.name,
      reportedAt: row.reportedAt.toISOString(),
      workOrderCode: row.workOrder?.repairCode ?? null,
    })),
    workOrders: workOrders.map((row) => ({
      id: row.id,
      repairCode: row.repairCode,
      title: row.title,
      status: row.status,
      priority: row.priority,
      assignedEmployeeName: row.assignedEmployee
        ? `${row.assignedEmployee.firstName} ${row.assignedEmployee.lastName}`.trim()
        : null,
      unitName: row.unit.name,
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue: Boolean(row.dueAt && row.dueAt.getTime() < now.getTime()),
    })),
    requestingDepartments: requestingDepts,
    technicians: technicians.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
    })),
  };
}
