/**
 * Server loader for EmployeeRuntimeFlow.
 * OA → assigned SPACE refs → one RLS batch → Work Plans → compose.
 * Returns null only when Job Flow is off or the session lacks authority.
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  isDepartmentJobFlowEnabled,
  isDepartmentOperationalEvidenceEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { resolveUnitWorkRequirements } from "@/lib/department-work";
import type { WorkRequirement } from "@/lib/department-work/types";
import { resolveJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";
import {
  detectAssignmentRevision,
  type AssignmentRevisionPrior,
} from "@/lib/dietary-job-flow/assignment-revision";
import type {
  JobFlowAssignmentSnapshot,
  JobFlowAttentionItem,
  JobFlowLocationSequence,
  JobFlowScopeSummary,
} from "@/lib/dietary-job-flow/types";
import { isCanonicalLogsEnabled, isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { resolveUnitEvidenceRequirements } from "@/lib/operational-evidence/load-runtime-evidence";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { loadRuntimeLocationStates, type RuntimeLocationState } from "@/lib/runtime-location-state";
import {
  buildDeterministicLocationSequence,
  formatAssignedScopeSummary,
} from "@/lib/scheduling/operational-assignments/location-sequencing";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import { prisma } from "@/lib/prisma";

import { composeEmployeeRuntimeFlow } from "./compose";
import { loadAssignedEmployeeSpaceRefs } from "./load-assigned-space-refs";
import { loadFrontlineEmployeeAssignments } from "./load-assignments";
import type { EmployeeRuntimeFlow } from "./types";

export type LoadEmployeeRuntimeFlowInput = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  employeeId: string;
  unitId?: string | null;
  deviceBoundUnitId?: string | null;
  now?: Date;
  offlineStale?: boolean;
  priorAssignmentRevision?: AssignmentRevisionPrior | null;
};

export type LoadedEmployeeRuntimeFlow = {
  flow: EmployeeRuntimeFlow;
  department: { id: string; name: string; key: string };
  assignmentLocations: ResolvedAssignmentLocation[];
  states: readonly RuntimeLocationState[];
  locationSequence: JobFlowLocationSequence | null;
  scopeSummary: JobFlowScopeSummary | null;
  plantAttention: JobFlowAttentionItem[];
  timezone: string;
  now: Date;
  operationalDateKey: string;
  planStatus: string | null;
  assignmentUpdated: boolean;
};

function toJobFlowLocationSequence(
  locations: ResolvedAssignmentLocation[],
  workRequirements: WorkRequirement[],
): JobFlowLocationSequence {
  const seq = buildDeterministicLocationSequence({
    locations,
    workRequirements,
  });
  const mapItem = (item: (typeof seq.all)[number]) => ({
    unitSpaceId: item.unitSpaceId,
    label: item.label,
    hasCurrentWork: item.hasCurrentWork,
    allComplete: item.allComplete,
    hasUrgent: item.hasUrgent,
  });
  return {
    now: seq.now ? mapItem(seq.now) : null,
    next: seq.next ? mapItem(seq.next) : null,
    queue: seq.queue.map(mapItem),
    all: seq.all.map(mapItem),
    sequencingNote: seq.sequencingNote,
  };
}

function buildEvsScopeAttachment(input: {
  departmentKey: string;
  assignment: JobFlowAssignmentSnapshot | null;
  locations: ResolvedAssignmentLocation[];
  workRequirements: WorkRequirement[];
}): {
  scopeSummary: JobFlowScopeSummary | null;
  locationSequence: JobFlowLocationSequence | null;
} {
  if (input.departmentKey !== "EVS" || !input.assignment) {
    return { scopeSummary: null, locationSequence: null };
  }
  const scopeKind = input.assignment.scopeKind ?? "UNIT";
  const scopeSummary = formatAssignedScopeSummary({
    scopeKind,
    unitName: input.assignment.unitName,
    zoneName: input.assignment.sourceZoneName,
    locations: input.locations,
  });
  const locationSequence =
    scopeKind === "SPACES" && input.locations.length > 0
      ? toJobFlowLocationSequence(input.locations, input.workRequirements)
      : null;
  return { scopeSummary, locationSequence };
}

async function buildPlantWorkOrderAttention(input: {
  facilityId: string;
  departmentId: string;
  employeeId: string;
}): Promise<JobFlowAttentionItem[]> {
  const openAssigned = await prisma.repair.count({
    where: {
      responsibleDepartmentId: input.departmentId,
      assignedEmployeeId: input.employeeId,
      unit: { facilityId: input.facilityId },
      status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS", "WAITING_ON_VENDOR", "ON_HOLD"] },
    },
  });
  const urgentRequests = await prisma.operationalRequest.count({
    where: {
      facilityId: input.facilityId,
      responsibleDepartmentId: input.departmentId,
      priority: { in: ["URGENT", "HIGH"] },
      status: {
        in: ["REPORTED", "ACKNOWLEDGED", "UNDER_REVIEW", "WORK_ASSIGNED", "WORK_IN_PROGRESS", "REOPENED"],
      },
    },
  });
  const items: JobFlowAttentionItem[] = [];
  if (openAssigned > 0) {
    items.push({
      kind: "work_due",
      message: `${openAssigned} assigned Work Order${openAssigned === 1 ? "" : "s"} need attention.`,
    });
  }
  if (urgentRequests > 0) {
    items.push({
      kind: "work_past_due",
      message: `${urgentRequests} urgent operational request${urgentRequests === 1 ? "" : "s"} in Plant queue.`,
    });
  }
  return items;
}

export async function loadEmployeeRuntimeFlow(
  input: LoadEmployeeRuntimeFlowInput,
): Promise<LoadedEmployeeRuntimeFlow | null> {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, name: true, key: true },
  });
  if (!department || !isDepartmentJobFlowEnabled(department.key)) {
    return null;
  }

  const authority = await resolveJobFlowAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewOwnJobFlow) {
    return null;
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const oaEnabled = isOperationalAssignmentsEnabled();
  const canonicalLogsEnabled = isCanonicalLogsEnabled();

  const assignments = oaEnabled
    ? await loadFrontlineEmployeeAssignments({
        employeeId: input.employeeId,
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
        now,
      })
    : {
        current: null,
        upcoming: null,
        previous: null,
        day: [],
        locationsByAssignmentId: new Map<string, ResolvedAssignmentLocation[]>(),
      };

  const activeAssignment = assignments.current ?? assignments.upcoming;
  const assignmentLocations = activeAssignment
    ? (assignments.locationsByAssignmentId.get(activeAssignment.id) ?? [])
    : [];

  const revision = detectAssignmentRevision(input.priorAssignmentRevision, {
    assignmentId: assignments.current?.id ?? assignments.upcoming?.id ?? null,
    unitId: assignments.current?.unitId ?? assignments.upcoming?.unitId ?? null,
    startsAt: assignments.current?.startsAt ?? assignments.upcoming?.startsAt ?? null,
    endsAt: assignments.current?.endsAt ?? assignments.upcoming?.endsAt ?? null,
  });

  const spaceRefs =
    oaEnabled && activeAssignment
      ? await loadAssignedEmployeeSpaceRefs({
          session: input.session,
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          departmentLabel: department.name,
          assignment: activeAssignment,
          locations: assignmentLocations,
        })
      : [];

  const loadedStates =
    oaEnabled && spaceRefs.length > 0
      ? await loadRuntimeLocationStates({
          facilityId: input.facilityId,
          spaceRefs,
          now,
        })
      : { states: [], stats: { perSpaceDomainLoads: 0 } };

  const evidenceEnabled = isDepartmentOperationalEvidenceEnabled(department.key);
  const workEnabled = isDepartmentWorkPlansEnabled(department.key);

  let templateEvidence: EvidenceRequirement[] = [];
  if (oaEnabled && !canonicalLogsEnabled && evidenceEnabled && activeAssignment) {
    const cycles = await loadPublishedCyclesForDate(
      input.facilityId,
      input.departmentId,
      operationalDateKey,
    );
    const cycleWindows = cycles.flatMap((cycle) => {
      if (!cycle.startLocal || !cycle.endLocal) return [];
      const window = resolveCycleWindowInstants({
        startLocal: cycle.startLocal,
        endLocal: cycle.endLocal,
        overnight: cycle.overnight,
        operationalDateKey,
        facilityTimezone: timezone,
      });
      if (!window) return [];
      return [
        {
          stableKey: cycle.stableKey,
          label: cycle.label,
          startLocal: cycle.startLocal,
          endLocal: cycle.endLocal,
          overnight: cycle.overnight,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        },
      ];
    });
    templateEvidence = await resolveUnitEvidenceRequirements({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDateKey,
      operationalDate: serviceDate,
      now,
      facilityTimezone: timezone,
      unitId: activeAssignment.unitId ?? input.unitId ?? "",
      publishedCycles: cycleWindows,
    });
  }

  const workRequirementsRaw =
    oaEnabled && workEnabled && (activeAssignment?.unitId || input.unitId)
      ? await resolveUnitWorkRequirements({
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          operationalDateKey,
          operationalDate: serviceDate,
          now,
          facilityTimezone: timezone,
          unitId: activeAssignment?.unitId ?? input.unitId ?? "",
        })
      : [];

  const plan = await prisma.operationalAssignmentPlan.findUnique({
    where: {
      facilityId_departmentId_serviceDate: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate,
      },
    },
    select: { status: true },
  });

  const flow = composeEmployeeRuntimeFlow({
    operationalAssignmentsEnabled: oaEnabled,
    canonicalLogsEnabled,
    currentAssignment: assignments.current,
    upcomingAssignment: assignments.upcoming,
    previousAssignment: assignments.previous,
    dayAssignments: assignments.day,
    assignmentLocations,
    spaceRefs,
    states: loadedStates.states,
    templateEvidence,
    workRequirements: workRequirementsRaw,
    deviceBoundUnitId: input.deviceBoundUnitId ?? input.unitId ?? null,
    offline: { stale: input.offlineStale ?? false },
  });

  const scope = buildEvsScopeAttachment({
    departmentKey: department.key,
    assignment: flow.assignmentAvailability === "evaluated" ? activeAssignment : null,
    locations: assignmentLocations,
    workRequirements: flow.work,
  });

  const plantAttention =
    department.key === "PLANT" && flow.assignmentAvailability === "evaluated"
      ? await buildPlantWorkOrderAttention({
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          employeeId: input.employeeId,
        })
      : [];

  return {
    flow,
    department,
    assignmentLocations,
    states: loadedStates.states,
    locationSequence: scope.locationSequence,
    scopeSummary: scope.scopeSummary,
    plantAttention,
    timezone,
    now,
    operationalDateKey,
    planStatus: plan?.status ?? null,
    assignmentUpdated: revision.changed,
  };
}
