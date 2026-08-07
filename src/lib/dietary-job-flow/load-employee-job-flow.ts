/**
 * Compose existing loaders into a derived Employee Job Flow projection.
 * Returns null when flag is off or the session lacks Job Flow authority.
 */

import type { AppJwtPayload } from "@/lib/auth";
import {
  isDepartmentJobFlowEnabled,
  isDepartmentOperationalEvidenceEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { deriveSpaceWorkSummary, resolveUnitWorkRequirements } from "@/lib/department-work";
import type { WorkRequirement } from "@/lib/department-work/types";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
  facilityLocalDateToServiceDate,
} from "@/lib/operational-time";
import { loadEmployeeCycleContext } from "@/lib/operational-cycles/load-employee-cycle-context";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { resolveOperationalCycle } from "@/lib/operational-cycles/resolve-operational-cycle";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { resolveUnitEvidenceRequirements } from "@/lib/operational-evidence/load-runtime-evidence";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";
import {
  buildDeterministicLocationSequence,
  formatAssignedScopeSummary,
} from "@/lib/scheduling/operational-assignments/location-sequencing";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import { resolveCurrentEmployeeAssignment } from "@/lib/scheduling/operational-assignments/resolve-current-assignment";
import { prisma } from "@/lib/prisma";

import {
  detectAssignmentRevision,
  type AssignmentRevisionPrior,
} from "./assignment-revision";
import { resolveJobFlowAuthority } from "./job-flow-authority";
import {
  resolveJobFlow,
  type JobFlowOfflineQueueSummary,
} from "./resolve-job-flow";
import type {
  JobFlowAssignmentSnapshot,
  JobFlowAttentionItem,
  JobFlowContext,
  JobFlowLocationSequence,
  JobFlowScopeSummary,
} from "./types";

export type LoadEmployeeJobFlowInput = {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  employeeId: string;
  unitId?: string | null;
  now?: Date;
  /** Optional offline queue summary from the client/runtime. */
  offlineQueue?: JobFlowOfflineQueueSummary | null;
  reauthenticationRequired?: boolean;
  offlineStale?: boolean;
  /** Prior assignment revision from offline bundle or previous load. */
  priorAssignmentRevision?: AssignmentRevisionPrior | null;
};

async function loadConfirmedAssignmentsForEmployee(input: {
  employeeId: string;
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  now: Date;
}): Promise<{
  current: JobFlowAssignmentSnapshot | null;
  upcoming: JobFlowAssignmentSnapshot | null;
  previous: JobFlowAssignmentSnapshot | null;
  day: JobFlowAssignmentSnapshot[];
  locationsByAssignmentId: Map<string, ResolvedAssignmentLocation[]>;
}> {
  const rows = await prisma.operationalAssignment.findMany({
    where: {
      employeeId: input.employeeId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      status: { in: ["PLANNED", "ACTIVE", "COMPLETED"] },
    },
    select: {
      id: true,
      roleKey: true,
      roleLabel: true,
      unitId: true,
      unit: { select: { name: true } },
      startsAt: true,
      endsAt: true,
      status: true,
      plan: { select: { status: true } },
      sourceZone: { select: { name: true } },
      locations: {
        select: {
          unitSpaceId: true,
          unitId: true,
          labelSnapshot: true,
          sortOrder: true,
          unitSpace: {
            select: {
              name: true,
              roomNumber: true,
              unit: { select: { name: true } },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Draft plans never appear for frontline Job Flow.
  const visible = rows.filter((r) => isPlanFrontlineVisible(r.plan?.status ?? null));

  const locationsByAssignmentId = new Map<string, ResolvedAssignmentLocation[]>();
  const snapshots: JobFlowAssignmentSnapshot[] = visible.map((r) => {
    const locations: ResolvedAssignmentLocation[] = r.locations.map((l) => ({
      unitSpaceId: l.unitSpaceId,
      unitId: l.unitId,
      label: l.labelSnapshot?.trim() || formatRoomDisplayName(l.unitSpace),
      sortOrder: l.sortOrder,
      roomNumber: l.unitSpace.roomNumber,
      spaceName: l.unitSpace.name,
      unitName: l.unitSpace.unit?.name ?? null,
    }));
    locationsByAssignmentId.set(r.id, locations);
    return {
      id: r.id,
      roleKey: r.roleKey,
      roleLabel: r.roleLabel,
      unitId: r.unitId,
      unitName: r.unit?.name ?? null,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      status: r.status,
      scopeKind: locations.length > 0 ? "SPACES" : "UNIT",
      locationCount: locations.length,
      locationLabels: locations.map((l) => l.label),
      sourceZoneName: r.sourceZone?.name ?? null,
    };
  });

  const activeOrPlanned = snapshots.filter(
    (a) => a.status === "ACTIVE" || a.status === "PLANNED",
  );

  const resolved = resolveCurrentEmployeeAssignment(
    activeOrPlanned.map((a) => ({
      id: a.id,
      roleKey: a.roleKey,
      roleLabel: a.roleLabel,
      unitName: a.unitName,
      operationLabel: null,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status as "PLANNED" | "ACTIVE",
      source: "MANUAL",
      notes: null,
    })),
    input.now,
  );

  const byId = new Map(snapshots.map((s) => [s.id, s]));
  const current = resolved.current ? byId.get(resolved.current.id) ?? null : null;
  const upcoming = resolved.upcoming ? byId.get(resolved.upcoming.id) ?? null : null;

  const previous =
    snapshots
      .filter(
        (a) =>
          a.id !== current?.id &&
          a.id !== upcoming?.id &&
          a.endsAt != null &&
          a.endsAt.getTime() <= input.now.getTime(),
      )
      .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))[0] ?? null;

  return { current, upcoming, previous, day: snapshots, locationsByAssignmentId };
}

function buildSpaceSummaries(
  requirements: WorkRequirement[],
  locationLabelById?: Map<string, string>,
) {
  const spaceIds = [
    ...new Set(requirements.map((r) => r.spaceId).filter((id): id is string => Boolean(id))),
  ];
  return spaceIds.map((spaceId) => {
    const summary = deriveSpaceWorkSummary({ spaceId, requirements });
    const friendly = locationLabelById?.get(spaceId);
    return friendly
      ? { ...summary, label: `${friendly} · ${summary.label}` }
      : summary;
  });
}

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

/**
 * Load derived Employee Job Flow for one employee.
 * Composes Job Flow authority, confirmed Assignments, cycle context, and milestones.
 * Soft-skips UnitMealTime / servery meal milestones when department is EVS.
 */
export async function loadEmployeeJobFlow(
  input: LoadEmployeeJobFlowInput,
): Promise<JobFlowContext | null> {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department || !isDepartmentJobFlowEnabled(department.key)) {
    return null;
  }

  const includeMealMilestones = department.key === "DIETARY";

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

  const assignments = await loadConfirmedAssignmentsForEmployee({
    employeeId: input.employeeId,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate,
    now,
  });

  const unitId =
    input.unitId ?? assignments.current?.unitId ?? assignments.upcoming?.unitId ?? null;

  const cycleCard = await loadEmployeeCycleContext({
    session: input.session,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId,
    now,
  });

  let cycleContext = cycleCard?.context;
  let mealTargets = includeMealMilestones ? (cycleCard?.mealTargets ?? []) : [];
  const cycleDescriptions: Record<string, string | null> = {};

  const cycles = await loadPublishedCyclesForDate(
    input.facilityId,
    input.departmentId,
    operationalDateKey,
  );
  for (const c of cycles) {
    cycleDescriptions[c.id] = c.description ?? null;
  }

  if (!cycleContext) {
    let unit: { id: string; unitType: import("@prisma/client").UnitType } | null = null;
    if (unitId) {
      const row = await prisma.unit.findFirst({
        where: { id: unitId, facilityId: input.facilityId, isActive: true },
        select: {
          id: true,
          unitType: true,
          mealTimes: includeMealMilestones
            ? {
                where: { isActive: true },
                select: { mealType: true, scheduledTime: true },
              }
            : false,
        },
      });
      if (row) {
        unit = { id: row.id, unitType: row.unitType };
        if (includeMealMilestones && Array.isArray(row.mealTimes)) {
          mealTargets = row.mealTimes;
        }
      }
    }
    cycleContext = resolveOperationalCycle({
      cycles,
      now,
      facilityTimezone: timezone,
      operationalDateKey,
      unit,
      mealTargets: includeMealMilestones ? mealTargets : [],
    });
  }

  let unitSnapshot: { id: string; name: string } | null = null;
  let milestoneEvent: {
    mealType: import("@prisma/client").MealType;
    mealServiceReadyAt: Date | null;
    mealServiceStartedAt: Date | null;
    hasCorrection: boolean;
  } | null = null;
  let mealTargetTime: string | null =
    !includeMealMilestones ||
    cycleContext.state === "NOT_APPLICABLE" ||
    cycleContext.state === "NOT_CONFIGURED"
      ? null
      : cycleContext.mealTargetTime;

  if (unitId) {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, facilityId: input.facilityId, isActive: true },
      select: {
        id: true,
        name: true,
        mealTimes: includeMealMilestones
          ? {
              where: { isActive: true },
              select: { mealType: true, scheduledTime: true },
            }
          : false,
      },
    });
    if (unit) {
      unitSnapshot = { id: unit.id, name: unit.name };
      if (includeMealMilestones && Array.isArray(unit.mealTimes) && !mealTargets.length) {
        mealTargets = unit.mealTimes;
      }
    }

    if (includeMealMilestones) {
      const mealType =
        cycleContext.state === "ACTIVE"
          ? cycleContext.primary.mealType
          : cycleContext.state === "UPCOMING" || cycleContext.state === "BETWEEN"
            ? cycleContext.next.mealType
            : cycleContext.state === "DAY_COMPLETE"
              ? cycleContext.last.mealType
              : null;

      if (mealType) {
        mealTargetTime =
          mealTargets.find((m) => m.mealType === mealType)?.scheduledTime ?? mealTargetTime;

        const event = await prisma.serveryMealServiceEvent.findFirst({
          where: { unitId, serviceDate, mealType },
          select: {
            mealType: true,
            mealServiceReadyAt: true,
            mealServiceStartedAt: true,
            entries: {
              where: { kind: "CORRECTION" },
              select: { id: true },
              take: 1,
            },
          },
        });
        if (event) {
          milestoneEvent = {
            mealType: event.mealType,
            mealServiceReadyAt: event.mealServiceReadyAt,
            mealServiceStartedAt: event.mealServiceStartedAt,
            hasCorrection: event.entries.length > 0,
          };
        }
      }
    }
  }

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

  const revision = detectAssignmentRevision(input.priorAssignmentRevision, {
    assignmentId: assignments.current?.id ?? assignments.upcoming?.id ?? null,
    unitId: assignments.current?.unitId ?? assignments.upcoming?.unitId ?? null,
    startsAt: assignments.current?.startsAt ?? assignments.upcoming?.startsAt ?? null,
    endsAt: assignments.current?.endsAt ?? assignments.upcoming?.endsAt ?? null,
  });

  const jobFlow = resolveJobFlow({
    now,
    facilityTimezone: timezone,
    operationalDateKey,
    currentAssignment: assignments.current,
    upcomingAssignment: assignments.upcoming,
    previousAssignment: assignments.previous,
    dayAssignments: assignments.day,
    cycleContext,
    cycleDescriptions,
    mealTargetTime,
    milestoneEvent,
    offlineQueue: input.offlineQueue ?? null,
    planStatus: plan?.status ?? null,
    reauthenticationRequired: input.reauthenticationRequired,
    offlineStale: input.offlineStale,
    assignmentUpdated: revision.changed,
    unit: unitSnapshot,
  });

  const activeAssignment = assignments.current ?? assignments.upcoming;
  const assignmentLocations = activeAssignment
    ? (assignments.locationsByAssignmentId.get(activeAssignment.id) ?? [])
    : [];

  const evidenceEnabled = isDepartmentOperationalEvidenceEnabled(department.key);
  const workEnabled = isDepartmentWorkPlansEnabled(department.key);

  if ((!evidenceEnabled && !workEnabled) || !unitId) {
    const scope = buildEvsScopeAttachment({
      departmentKey: department.key,
      assignment: activeAssignment,
      locations: assignmentLocations,
      workRequirements: [],
    });
    return {
      ...jobFlow,
      scopeSummary: scope.scopeSummary,
      locationSequence: scope.locationSequence,
    };
  }

  const cycleWindows = cycles.flatMap((c) => {
    const window = resolveCycleWindowInstants({
      startLocal: c.startLocal,
      endLocal: c.endLocal,
      overnight: c.overnight,
      operationalDateKey,
      facilityTimezone: timezone,
    });
    if (!window) return [];
    return [
      {
        stableKey: c.stableKey,
        label: c.label,
        startLocal: c.startLocal,
        endLocal: c.endLocal,
        overnight: c.overnight,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      },
    ];
  });

  const evidenceRequirements = evidenceEnabled
    ? await resolveUnitEvidenceRequirements({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDateKey,
        operationalDate: serviceDate,
        now,
        facilityTimezone: timezone,
        unitId,
        publishedCycles: cycleWindows,
      })
    : [];

  const workRequirementsRaw = workEnabled
    ? await resolveUnitWorkRequirements({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDateKey,
        operationalDate: serviceDate,
        now,
        facilityTimezone: timezone,
        unitId,
      })
    : [];

  const assignedSpaceIds =
    activeAssignment?.scopeKind === "SPACES"
      ? new Set(assignmentLocations.map((l) => l.unitSpaceId))
      : null;

  // SPACES scope: assigned rooms + unit-level (null space) items. UNIT scope: full unit Work.
  const workRequirements =
    assignedSpaceIds == null
      ? workRequirementsRaw
      : workRequirementsRaw.filter(
          (r) => r.spaceId == null || assignedSpaceIds.has(r.spaceId),
        );

  const evidenceRequirementsScoped =
    assignedSpaceIds == null
      ? evidenceRequirements
      : evidenceRequirements.filter((r) => r.spaceId == null || assignedSpaceIds.has(r.spaceId));

  const spaceWorkSummaries = buildSpaceSummaries(
    workRequirements,
    new Map(assignmentLocations.map((l) => [l.unitSpaceId, l.label])),
  );

  const scope = buildEvsScopeAttachment({
    departmentKey: department.key,
    assignment: activeAssignment,
    locations: assignmentLocations,
    workRequirements,
  });

  const evidenceAttention = buildEvidenceAttention(evidenceRequirementsScoped);
  const workAttention = buildWorkAttention(workRequirements);

  return {
    ...jobFlow,
    evidenceRequirements: evidenceRequirementsScoped,
    workRequirements,
    spaceWorkSummaries,
    scopeSummary: scope.scopeSummary,
    locationSequence: scope.locationSequence,
    attention: [...jobFlow.attention, ...evidenceAttention, ...workAttention].filter(
      (item, idx, arr) =>
        arr.findIndex((x) => x.kind === item.kind && x.message === item.message) === idx,
    ),
  };
}

function buildEvidenceAttention(
  requirements: EvidenceRequirement[],
): JobFlowAttentionItem[] {
  const items: JobFlowAttentionItem[] = [];
  if (requirements.some((r) => r.state === "DUE")) {
    items.push({ kind: "evidence_due", message: "Evidence requirement is due now." });
  }
  if (
    requirements.some(
      (r) =>
        r.state === "COMPLETED_WITH_CORRECTIVE_ACTION" || r.state === "NEEDS_REVIEW",
    )
  ) {
    items.push({
      kind: "evidence_corrective",
      message: "Evidence recorded with corrective action or needs review.",
    });
  }
  if (requirements.some((r) => r.state === "CONFLICT_REVIEW")) {
    items.push({ kind: "evidence_review", message: "Evidence requires conflict review." });
  }
  return items;
}

function buildWorkAttention(requirements: WorkRequirement[]): JobFlowAttentionItem[] {
  const items: JobFlowAttentionItem[] = [];
  if (requirements.some((r) => r.state === "DUE" || r.state === "CURRENT")) {
    items.push({ kind: "work_due", message: "Department Work is due now." });
  }
  if (requirements.some((r) => r.state === "PAST_DUE_NOT_CONFIRMED")) {
    items.push({
      kind: "work_past_due",
      message: "Work is past due and not confirmed.",
    });
  }
  if (requirements.some((r) => r.state === "CONFLICT_REVIEW")) {
    items.push({ kind: "work_conflict", message: "Work requires conflict review." });
  }
  return items;
}
