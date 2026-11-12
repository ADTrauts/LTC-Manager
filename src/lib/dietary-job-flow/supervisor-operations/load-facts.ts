/**
 * Phase 6O — Supervisor Operations fact loader.
 * Fetches canonical domain facts. Does not interpret Board exceptions.
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  isDepartmentOperationalEvidenceEnabled,
} from "@/lib/department-operations";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";
import { evaluateWorkOrderDueState } from "@/lib/asset-operations/work-order-due-state";
import {
  presentRequesterStatus,
  requesterProjectedStatusLabel,
} from "@/lib/operational-requests/request-semantics";
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
import { calledOffShiftExcludesAssignment } from "@/lib/scheduling/call-off-window";
import { buildDietaryCoverageSummary } from "@/lib/scheduling/operational-assignments/build-coverage-summary";
import { loadAssignmentPlanView } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { loadDailyAssignmentBoard } from "@/lib/scheduling/operational-assignments/load-daily-assignment-board";

import type { SupervisorHistoricalEvidenceRecord } from "../supervisor-evidence-attention";
import type { SupervisorOperationsBoard } from "../types";
import type { SupervisorOperationsFacts } from "./facts";
import type { SupervisorAssignmentFact, SupervisorCoverageGap, SupervisorSyncItem } from "./types";

export type LoadSupervisorOperationsFactsInput = {
  session?: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  departmentName: string;
  now?: Date;
};

export async function loadSupervisorOperationsFacts(
  input: LoadSupervisorOperationsFactsInput,
): Promise<SupervisorOperationsFacts> {
  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const oaEnabled = true;
  const harborLogsEnabled = isCanonicalLogsEnabled();
  const evidenceCompatEnabled = isDepartmentOperationalEvidenceEnabled(input.departmentKey);
  const isPlant =
    input.departmentKey === "PLANT" &&
    (await isPlantRuntimeEnabled(input.facilityId, input.session));

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
  const countingAssignments = board.assignments.filter((row) => {
    if (row.status !== "PLANNED" && row.status !== "ACTIVE") return false;
    return !board.callOffs.some((shift) =>
      calledOffShiftExcludesAssignment({
        shift: {
          employeeId: shift.employeeId,
          departmentId: shift.departmentId,
          serviceDateKey: operationalDateKey,
          plannedStart: shift.plannedStart,
          plannedEnd: shift.plannedEnd,
        },
        assignment: {
          employeeId: row.employeeId,
          departmentId: input.departmentId,
          startsAt: row.startsAt ? new Date(row.startsAt) : null,
          endsAt: row.endsAt ? new Date(row.endsAt) : null,
          serviceDateKey: operationalDateKey,
        },
        timeZone: timezone,
      }),
    );
  });
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

  if (oaEnabled) {
    const assignedEmployeeIds = [
      ...new Set(assignments.map((row) => row.employeeId).filter((id): id is string => Boolean(id))),
    ];
    const coverage = await buildDietaryCoverageSummary(prisma, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDateKey: operationalDateKey,
      planStatus: plan?.status ?? null,
      assignments: countingAssignments.map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        coveredSpaceIds: row.spaceIds ?? [],
        unitId: row.unitId,
        unitName: row.unitName,
        roleKey: row.roleKey,
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        hasCallDown: false,
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
    sync: {
      retryRequired: pendingOfflineReceipts.length,
      pendingConflicts: pendingConflictRows.length,
      items: syncItems,
      unscopableExcluded: false,
    },
    plantOverlay,
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
        space: { select: { name: true } },
        asset: { select: { name: true } },
        relatedAssetIssue: {
          select: {
            id: true,
            issueCode: true,
            workOrders: { select: { status: true } },
          },
        },
        workOrder: { select: { repairCode: true, status: true } },
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
    waitingParts: workOrders.filter(
      (row) => row.status === "ON_HOLD" && row.holdReason === "WAITING_FOR_PART",
    ).length,
    overdueWorkOrders: workOrders.filter(
      (row) => evaluateWorkOrderDueState({ status: row.status, dueAt: row.dueAt, now }) === "OVERDUE",
    ).length,
    unassignedWorkOrders: workOrders.filter((row) => !row.assignedEmployeeId).length,
    requests: requests.map((row) => {
      const projectedStatus = presentRequesterStatus({
        status: row.status,
        workOrderId: row.workOrderId,
        workOrderStatus: row.workOrder?.status ?? null,
        linkedWorkOrderStatuses: row.relatedAssetIssue?.workOrders.map((wo) => wo.status) ?? [],
      });
      return {
        id: row.id,
        requestCode: row.requestCode,
        summary: row.summary,
        description: row.description,
        status: row.status,
        priority: row.priority,
        requestingDepartmentName: row.requestingDepartment.name,
        requesterLabel: row.reportedByLabel,
        unitName: row.unit.name,
        spaceName: row.space?.name ?? null,
        assetName: row.asset?.name ?? null,
        reportedAt: row.reportedAt.toISOString(),
        workOrderCode: row.workOrder?.repairCode ?? null,
        workOrderStatus: row.workOrder?.status ?? null,
        projectedStatus,
        projectedStatusLabel: requesterProjectedStatusLabel(projectedStatus),
        issueCode: row.relatedAssetIssue?.issueCode ?? null,
        issueId: row.relatedAssetIssue?.id ?? null,
      };
    }),
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
      overdue: evaluateWorkOrderDueState({ status: row.status, dueAt: row.dueAt, now }) === "OVERDUE",
    })),
    requestingDepartments: requestingDepts,
    technicians: technicians.map((row) => ({
      id: row.id,
      name: `${row.firstName} ${row.lastName}`.trim(),
    })),
  };
}
