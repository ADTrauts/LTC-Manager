import { createHash } from "node:crypto";

import type { MealType, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  evaluateServeryMilestoneAccess,
  recordableMealForContext,
  resolveServeryMealServiceContext,
} from "@/lib/servery";

import { resolveJobFlow } from "@/lib/dietary-job-flow";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow";
import {
  isDepartmentAssetOperationsEnabled,
  isDepartmentJobFlowEnabled,
  isDepartmentOperationalCyclesEnabled,
  isDepartmentOperationalEvidenceEnabled,
  isDepartmentWorkPlansEnabled,
  resolveUnitOperationalDepartment,
} from "@/lib/department-operations";
import { isOperationalAssignmentsEnabled, isPlantOperationsEnabled } from "@/lib/feature-flags";
import { OPEN_WORK_ORDER_STATUSES } from "@/lib/asset-operations/types";
import { loadUnitRuntimeAssets } from "@/lib/asset-operations";
import { resolveUnitWorkRequirements } from "@/lib/department-work";
import { loadPublishedCyclesForDate, resolveOperationalCycle } from "@/lib/operational-cycles";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { resolveUnitEvidenceRequirements } from "@/lib/operational-evidence/load-runtime-evidence";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { loadEmployeeAssignmentOfflineContext } from "@/lib/scheduling/operational-assignments/load-employee-assignments";
import { resolveCurrentEmployeeAssignment } from "@/lib/scheduling/operational-assignments/resolve-current-assignment";
import { actorRefForSession, resolveMilestoneActor } from "./resolve-milestone-actor";
import {
  OFFLINE_BUNDLE_LEASE_HOURS,
  type OfflineMilestoneProjection,
  type OfflineRuntimeBundle,
} from "./types";

function milestoneProjection(input: {
  eventId: string | null;
  occurredAt: Date | null;
  recordedAt: Date | null;
  recordedByLabel: string | null;
  corrected: boolean;
}): OfflineMilestoneProjection {
  return {
    eventId: input.eventId,
    occurredAt: input.occurredAt?.toISOString() ?? null,
    recordedAt: input.recordedAt?.toISOString() ?? null,
    recordedByLabel: input.recordedByLabel,
    corrected: input.corrected,
  };
}

function computeServerRevision(input: {
  unitUpdatedAt: Date;
  mealTimesUpdatedAt: Date;
  events: { id: string; updatedAt: Date; mealServiceReadyAt: Date | null; mealServiceStartedAt: Date | null }[];
}): string {
  const payload = JSON.stringify({
    unit: input.unitUpdatedAt.toISOString(),
    meals: input.mealTimesUpdatedAt.toISOString(),
    events: input.events.map((e) => ({
      id: e.id,
      u: e.updatedAt.toISOString(),
      r: e.mealServiceReadyAt?.toISOString() ?? null,
      s: e.mealServiceStartedAt?.toISOString() ?? null,
    })),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export type BuildRuntimeBundleInput = {
  session: AppJwtPayload;
  unitId: string;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  now?: Date;
};

export type BuildRuntimeBundleResult =
  | { ok: true; bundle: OfflineRuntimeBundle; issuanceId: string }
  | { ok: false; reason: string; status: 403 | 404 };

/**
 * Build a scoped Unit Workspace offline bundle for one servery unit.
 *
 * Facility Administrators without Dietary operational authority are denied — administrative role
 * alone does not grant a frontline offline bundle.
 */
export async function buildRuntimeBundle(
  input: BuildRuntimeBundleInput,
  client: PrismaClient = defaultPrisma,
): Promise<BuildRuntimeBundleResult> {
  const now = input.now ?? new Date();
  const actor = await resolveMilestoneActor(input.session);

  if (input.deviceFacilityId !== input.session.facilityId) {
    return { ok: false, reason: "DEVICE_FACILITY_MISMATCH", status: 403 };
  }
  if (input.deviceBoundUnitId && input.deviceBoundUnitId !== input.unitId) {
    return { ok: false, reason: "DEVICE_UNIT_CONFLICT", status: 403 };
  }

  const unit = await client.unit.findFirst({
    where: { id: input.unitId, facilityId: input.session.facilityId, isActive: true },
    select: {
      id: true,
      name: true,
      unitType: true,
      updatedAt: true,
      facility: { select: { id: true, displayName: true, timezone: true } },
      mealTimes: {
        where: { isActive: true },
        select: { mealType: true, scheduledTime: true, updatedAt: true },
        orderBy: { mealType: "asc" },
      },
    },
  });
  if (!unit) {
    return { ok: false, reason: "UNIT_NOT_FOUND", status: 404 };
  }

  // Prefer flagged Job Flow / Work Plans department (DIETARY or EVS). Classic SERVERY
  // milestone offline must still work when DIETARY_JOB_FLOW_ENABLED is off — fall back
  // to Dietary for SERVERY units (Phase 6/9 offline foundation).
  let operationalDepartment = await resolveUnitOperationalDepartment({
    facilityId: input.session.facilityId,
    activeDepartmentId: input.session.primaryDepartmentId ?? null,
    unitId: unit.id,
    feature: "jobFlow",
  });
  if (!operationalDepartment && unit.unitType === "SERVERY") {
    const dietaryFallback = await client.department.findFirst({
      where: { facilityId: input.session.facilityId, key: "DIETARY", isActive: true },
      select: { id: true, name: true, key: true },
    });
    if (dietaryFallback?.key === "DIETARY") {
      operationalDepartment = {
        id: dietaryFallback.id,
        name: dietaryFallback.name,
        key: "DIETARY",
      };
    }
  }
  if (!operationalDepartment) {
    return { ok: false, reason: "DEPARTMENT_UNAVAILABLE", status: 403 };
  }
  const dietary = operationalDepartment;
  const includeMealMilestones = dietary.key === "DIETARY";

  if (includeMealMilestones) {
    if (unit.unitType !== "SERVERY") {
      return { ok: false, reason: "UNIT_NOT_FOUND", status: 404 };
    }
    const access = await evaluateServeryMilestoneAccess(
      {
        facilityId: input.session.facilityId,
        unitId: input.unitId,
        action: "RECORD",
        actor,
        deviceBoundUnitId: input.deviceBoundUnitId,
      },
      client,
    );
    if (!access.ok) {
      return { ok: false, reason: access.reason, status: 403 };
    }
  } else if (
    !isDepartmentJobFlowEnabled(dietary.key) &&
    !isDepartmentWorkPlansEnabled(dietary.key)
  ) {
    return { ok: false, reason: "DEPARTMENT_UNAVAILABLE", status: 403 };
  }

  const facilityTimezone = await loadFacilityTimezone(client, input.session.facilityId);
  const serviceDate = getFacilityServiceDate(facilityTimezone, now);
  const serviceDateKey = toServiceDateKey(serviceDate);

  const events = includeMealMilestones
    ? await client.serveryMealServiceEvent.findMany({
        where: { unitId: unit.id, serviceDate },
        select: {
          id: true,
          mealType: true,
          updatedAt: true,
          mealServiceReadyAt: true,
          mealServiceStartedAt: true,
          readyRecordedAt: true,
          startedRecordedAt: true,
          readyRecordedBy: { select: { displayName: true } },
          startedRecordedBy: { select: { displayName: true } },
          readyRecordedByEmployee: { select: { firstName: true, lastName: true } },
          startedRecordedByEmployee: { select: { firstName: true, lastName: true } },
          entries: { select: { milestone: true, kind: true } },
        },
      })
    : [];

  const mealContext = includeMealMilestones
    ? resolveServeryMealServiceContext({
        unitType: "SERVERY",
        mealTimes: unit.mealTimes.map((m) => ({ mealType: m.mealType, scheduledTime: m.scheduledTime })),
        now,
        facilityTimezone,
      })
    : null;
  const recordable = mealContext ? recordableMealForContext(mealContext) : null;

  const employeeLabel = (e?: { firstName: string; lastName: string } | null) =>
    e ? `${e.firstName} ${e.lastName}`.trim() : null;

  const milestones = includeMealMilestones
    ? unit.mealTimes.map((slot) => {
    const ev = events.find((e) => e.mealType === slot.mealType);
    const corrected = new Set(ev?.entries?.filter((x) => x.kind === "CORRECTION").map((x) => x.milestone) ?? []);
    return {
      mealType: slot.mealType as MealType,
      ready: milestoneProjection({
        eventId: ev?.id ?? null,
        occurredAt: ev?.mealServiceReadyAt ?? null,
        recordedAt: ev?.readyRecordedAt ?? null,
        recordedByLabel: ev?.readyRecordedBy?.displayName ?? employeeLabel(ev?.readyRecordedByEmployee) ?? null,
        corrected: corrected.has("READY"),
      }),
      started: milestoneProjection({
        eventId: ev?.id ?? null,
        occurredAt: ev?.mealServiceStartedAt ?? null,
        recordedAt: ev?.startedRecordedAt ?? null,
        recordedByLabel:
          ev?.startedRecordedBy?.displayName ?? employeeLabel(ev?.startedRecordedByEmployee) ?? null,
        corrected: corrected.has("SERVICE_STARTED"),
      }),
    };
  })
    : [];

  const mealTimesUpdatedAt = unit.mealTimes.reduce(
    (max, m) => (m.updatedAt > max ? m.updatedAt : max),
    unit.mealTimes[0]?.updatedAt ?? unit.updatedAt,
  );

  const serverRevision = computeServerRevision({
    unitUpdatedAt: unit.updatedAt,
    mealTimesUpdatedAt,
    events: events.map((e) => ({
      id: e.id,
      updatedAt: e.updatedAt,
      mealServiceReadyAt: e.mealServiceReadyAt,
      mealServiceStartedAt: e.mealServiceStartedAt,
    })),
  });

  const issuedAt = now;
  const offlineAuthorizedUntil = new Date(
    issuedAt.getTime() + OFFLINE_BUNDLE_LEASE_HOURS * 60 * 60 * 1000,
  );
  const bundleVersion = `${serviceDateKey}:${serverRevision}`;

  const assignmentContext =
    isOperationalAssignmentsEnabled() && actor.employeeId
      ? await loadEmployeeAssignmentOfflineContext(actor.employeeId, input.session.facilityId, now)
      : null;

  let cycleContext: OfflineRuntimeBundle["cycleContext"] = null;
  let resolvedCycle =
    null as ReturnType<typeof resolveOperationalCycle> | null;

  if (isDepartmentOperationalCyclesEnabled(dietary.key) || isDepartmentJobFlowEnabled(dietary.key)) {
    const cycles = await loadPublishedCyclesForDate(
      input.session.facilityId,
      dietary.id,
      serviceDateKey,
    );
    resolvedCycle = resolveOperationalCycle({
      cycles,
      now,
      facilityTimezone,
      operationalDateKey: serviceDateKey,
      unit: { id: unit.id, unitType: unit.unitType },
      mealTargets: includeMealMilestones
        ? unit.mealTimes.map((m) => ({
            mealType: m.mealType,
            scheduledTime: m.scheduledTime,
          }))
        : [],
    });

    if (isDepartmentOperationalCyclesEnabled(dietary.key)) {
      const syncedAt = issuedAt.toISOString();
      if (resolvedCycle.state === "ACTIVE") {
        cycleContext = {
          cycleId: resolvedCycle.primary.id,
          label: resolvedCycle.primary.label,
          cycleType: resolvedCycle.primary.cycleType,
          startLocal: resolvedCycle.primary.startLocal,
          endLocal: resolvedCycle.primary.endLocal,
          operationalDate: serviceDateKey,
          mealType: resolvedCycle.primary.mealType,
          mealTargetTime: resolvedCycle.mealTargetTime,
          expectedMilestones: [...resolvedCycle.primary.expectedMilestones],
          nextCycleLabel: resolvedCycle.next?.label ?? null,
          bundleRevision: serverRevision,
          lastSyncedAt: syncedAt,
        };
      } else if (resolvedCycle.state === "UPCOMING" || resolvedCycle.state === "BETWEEN") {
        const next = resolvedCycle.next;
        cycleContext = {
          cycleId: next.id,
          label: next.label,
          cycleType: next.cycleType,
          startLocal: next.startLocal,
          endLocal: next.endLocal,
          operationalDate: serviceDateKey,
          mealType: next.mealType,
          mealTargetTime: resolvedCycle.mealTargetTime,
          expectedMilestones: [...next.expectedMilestones],
          nextCycleLabel: next.label,
          bundleRevision: serverRevision,
          lastSyncedAt: syncedAt,
        };
      } else if (resolvedCycle.state === "DAY_COMPLETE") {
        cycleContext = {
          cycleId: resolvedCycle.last.id,
          label: resolvedCycle.last.label,
          cycleType: resolvedCycle.last.cycleType,
          startLocal: resolvedCycle.last.startLocal,
          endLocal: resolvedCycle.last.endLocal,
          operationalDate: serviceDateKey,
          mealType: resolvedCycle.last.mealType,
          mealTargetTime: resolvedCycle.mealTargetTime,
          expectedMilestones: [...resolvedCycle.last.expectedMilestones],
          nextCycleLabel: null,
          bundleRevision: serverRevision,
          lastSyncedAt: syncedAt,
        };
      } else {
        cycleContext = {
          cycleId: null,
          label: null,
          cycleType: null,
          startLocal: null,
          endLocal: null,
          operationalDate: serviceDateKey,
          mealType: null,
          mealTargetTime: null,
          expectedMilestones: [],
          nextCycleLabel: null,
          bundleRevision: serverRevision,
          lastSyncedAt: syncedAt,
        };
      }
    }
  }

  let jobFlowContext: OfflineRuntimeBundle["jobFlowContext"] = null;
  if (isDepartmentJobFlowEnabled(dietary.key) && actor.employeeId && resolvedCycle) {
    const assignmentRows = await client.operationalAssignment.findMany({
      where: {
        employeeId: actor.employeeId,
        facilityId: input.session.facilityId,
        departmentId: dietary.id,
        serviceDate,
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
            labelSnapshot: true,
            unitSpace: { select: { name: true, roomNumber: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const visible = assignmentRows.filter((r) =>
      isPlanFrontlineVisible(r.plan?.status ?? null),
    );
    const snapshots: JobFlowAssignmentSnapshot[] = visible.map((r) => {
      const locationLabels = r.locations.map(
        (l) =>
          l.labelSnapshot?.trim() ||
          [l.unitSpace.roomNumber, l.unitSpace.name].filter(Boolean).join(" • ") ||
          l.unitSpace.name,
      );
      return {
        id: r.id,
        roleKey: r.roleKey,
        roleLabel: r.roleLabel,
        unitId: r.unitId,
        unitName: r.unit?.name ?? null,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        status: r.status,
        scopeKind: r.locations.length > 0 ? "SPACES" : "UNIT",
        locationCount: r.locations.length,
        locationLabels,
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
        source: "MANUAL" as const,
        notes: null,
      })),
      now,
    );
    const byId = new Map(snapshots.map((s) => [s.id, s]));
    const currentAssignment = resolved.current ? byId.get(resolved.current.id) ?? null : null;
    const upcomingAssignment = resolved.upcoming ? byId.get(resolved.upcoming.id) ?? null : null;
    const previousAssignment =
      snapshots
        .filter(
          (a) =>
            a.id !== currentAssignment?.id &&
            a.id !== upcomingAssignment?.id &&
            a.endsAt != null &&
            a.endsAt.getTime() <= now.getTime(),
        )
        .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))[0] ?? null;

    const mealTypeForEvent =
      resolvedCycle.state === "ACTIVE"
        ? resolvedCycle.primary.mealType
        : resolvedCycle.state === "UPCOMING" || resolvedCycle.state === "BETWEEN"
          ? resolvedCycle.next.mealType
          : resolvedCycle.state === "DAY_COMPLETE"
            ? resolvedCycle.last.mealType
            : null;

    const milestoneEventRow =
      includeMealMilestones && mealTypeForEvent
        ? events.find((e) => e.mealType === mealTypeForEvent)
        : null;
    const milestoneEvent = milestoneEventRow
      ? {
          mealType: milestoneEventRow.mealType,
          mealServiceReadyAt: milestoneEventRow.mealServiceReadyAt,
          mealServiceStartedAt: milestoneEventRow.mealServiceStartedAt,
          hasCorrection: milestoneEventRow.entries.some((x) => x.kind === "CORRECTION"),
        }
      : null;

    const mealTargetTime =
      resolvedCycle.state === "NOT_APPLICABLE" || resolvedCycle.state === "NOT_CONFIGURED"
        ? null
        : resolvedCycle.mealTargetTime;

    const plan = await client.operationalAssignmentPlan.findUnique({
      where: {
        facilityId_departmentId_serviceDate: {
          facilityId: input.session.facilityId,
          departmentId: dietary.id,
          serviceDate,
        },
      },
      select: { status: true },
    });

    const jobFlow = resolveJobFlow({
      now,
      facilityTimezone,
      operationalDateKey: serviceDateKey,
      currentAssignment,
      upcomingAssignment,
      previousAssignment,
      dayAssignments: snapshots,
      cycleContext: resolvedCycle,
      mealTargetTime,
      milestoneEvent,
      offlineQueue: null,
      planStatus: plan?.status ?? null,
      unit: { id: unit.id, name: unit.name },
    });

    const assignment =
      ("assignment" in jobFlow ? jobFlow.assignment : null) ??
      jobFlow.current.assignment ??
      null;
    const cycle =
      ("cycle" in jobFlow ? jobFlow.cycle : null) ?? jobFlow.current.cycle ?? null;
    const startsIso = assignment?.startsAt?.toISOString() ?? null;
    const syncedAt = issuedAt.toISOString();

    jobFlowContext = {
      state: jobFlow.state,
      assignmentId: assignment?.id ?? null,
      assignmentRevision:
        assignment?.id != null
          ? `${assignment.id}:${startsIso ?? ""}`
          : null,
      unitId: jobFlow.current.unit?.id ?? assignment?.unitId ?? unit.id,
      unitName: jobFlow.current.unit?.name ?? assignment?.unitName ?? unit.name,
      duty: assignment?.roleLabel ?? null,
      windowStart: startsIso,
      windowEnd: assignment?.endsAt?.toISOString() ?? null,
      cycleId: cycle?.id ?? null,
      cycleLabel: cycle?.label ?? null,
      cycleType: cycle?.cycleType ?? null,
      expectation: jobFlow.current.expectation,
      mealTargetTime: jobFlow.current.targetTime ?? mealTargetTime,
      nextCycleLabel: jobFlow.next.cycle?.label ?? null,
      expectedMilestones: cycle ? [...cycle.expectedMilestones] : [],
      milestoneStates: jobFlow.current.milestoneState
        ? [{ key: jobFlow.current.milestoneState.key, label: jobFlow.current.milestoneState.label }]
        : [],
      progressPhases: jobFlow.progress.phases.map((p) => ({
        key: p.id,
        label: p.label,
        status: p.status,
      })),
      attentionKinds: jobFlow.attention.map((a) => a.kind),
      evidenceRequirementKeys: [],
      bundleRevision: serverRevision,
      lastSyncedAt: syncedAt,
      stale: false,
    };
  }

  let evidenceContext: OfflineRuntimeBundle["evidenceContext"] = null;
  if (isDepartmentOperationalEvidenceEnabled(dietary.key)) {
    try {
      const publishedCycles = await loadPublishedCyclesForDate(
        input.session.facilityId,
        dietary.id,
        serviceDateKey,
        client,
      );
      const cycleWindows = publishedCycles.flatMap((c) => {
        const window = resolveCycleWindowInstants({
          startLocal: c.startLocal,
          endLocal: c.endLocal,
          overnight: c.overnight,
          operationalDateKey: serviceDateKey,
          facilityTimezone,
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
      const evidenceRequirements = await resolveUnitEvidenceRequirements({
        facilityId: input.session.facilityId,
        departmentId: dietary.id,
        operationalDateKey: serviceDateKey,
        operationalDate: serviceDate,
        now,
        facilityTimezone,
        unitId: unit.id,
        publishedCycles: cycleWindows,
      });
      const scoped = evidenceRequirements.filter(
        (r) =>
          r.state === "DUE" ||
          r.state === "UPCOMING" ||
          r.state === "NOT_CONFIRMED" ||
          r.state === "NEEDS_REVIEW",
      );
      evidenceContext = {
        requirements: scoped.map((r) => ({
          requirementKey: r.requirementKey,
          templateId: r.templateId,
          templateVersion: r.templateVersion,
          templateName: r.templateName,
          purposeType: r.purposeType,
          state: r.state,
          scheduleKind: r.scheduleKind,
          cycleStableKey: r.cycleStableKey,
          cycleLabel: r.cycleLabel,
          windowStartLocal: r.windowStartLocal,
          windowEndLocal: r.windowEndLocal,
          assetId: r.assetId,
          spaceId: r.spaceId,
          instructions: r.instructions,
          fields: r.fields.map((f) => ({
            fieldKey: f.fieldKey,
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired,
            displaySequence: f.displaySequence,
            helpText: f.helpText,
            unitLabel: f.unitLabel,
            minNumber: f.minNumber,
            maxNumber: f.maxNumber,
            allowedSelections: f.allowedSelections,
            correctiveActionTrigger: f.correctiveActionTrigger,
            correctiveActionRequired: f.correctiveActionRequired,
          })),
        })),
        lastSyncedAt: issuedAt.toISOString(),
      };
      if (jobFlowContext) {
        jobFlowContext = {
          ...jobFlowContext,
          evidenceRequirementKeys: evidenceRequirements.map((r) => r.requirementKey),
        };
      }
    } catch {
      // Evidence context is additive — never fail the Runtime bundle for servery offline use.
      evidenceContext = null;
    }
  }

  let assetContext: OfflineRuntimeBundle["assetContext"] = null;
  if (isDepartmentAssetOperationsEnabled(dietary.key)) {
    try {
      const runtimeAssets = await loadUnitRuntimeAssets(unit.id, input.session.facilityId, {
        departmentId: dietary.id,
        includeRetired: false,
      });
      assetContext = {
        assets: runtimeAssets.map((a) => ({
          id: a.assetId,
          name: a.name,
          assetCode: a.assetCode,
          status: a.status,
          statusLabel: a.statusLabel,
          openIssueSummary: a.openIssueAlreadyReported
            ? a.openImpactLabel ?? "Open issue already reported"
            : null,
        })),
        lastSyncedAt: issuedAt.toISOString(),
      };
    } catch {
      assetContext = null;
    }
  }

  let workContext: OfflineRuntimeBundle["workContext"] = null;
  if (isDepartmentWorkPlansEnabled(dietary.key)) {
    try {
      const workRequirements = await resolveUnitWorkRequirements({
        facilityId: input.session.facilityId,
        departmentId: dietary.id,
        operationalDate: serviceDate,
        operationalDateKey: serviceDateKey,
        now: issuedAt,
        facilityTimezone,
        unitId: unit.id,
      });
      const assignedSpaceIds =
        assignmentContext?.scopeKind === "SPACES"
          ? new Set(assignmentContext.assignedLocations?.map((l) => l.unitSpaceId) ?? [])
          : null;
      const scoped = workRequirements.filter((r) => {
        if (
          !["DUE", "CURRENT", "UPCOMING", "PAST_DUE_NOT_CONFIRMED", "SAVED_ON_THIS_TABLET"].includes(
            r.state,
          )
        ) {
          return false;
        }
        if (assignedSpaceIds == null) return true;
        // SPACES scope: only assigned rooms — never the full unit Work catalog.
        return r.spaceId != null && assignedSpaceIds.has(r.spaceId);
      });
      workContext = {
        requirements: scoped.map((r) => ({
          occurrenceKey: r.occurrenceKey,
          label: r.label,
          state: r.state,
          priority: r.priority,
          completionMode: r.completionMode,
          workPlanStableKey: r.workPlanStableKey,
          workPlanVersion: r.workPlanVersion,
          workItemKey: r.workItemKey,
          workPlanId: r.workPlanId,
          workItemId: r.workItemId,
          instructions: r.instructions,
          knowledgeArticleId: r.knowledgeArticleId,
          procedureTitle: r.procedureTitle,
          dueAt: r.dueAt?.toISOString() ?? null,
          cycleStableKey: r.cycleStableKey,
          windowStartLocal: r.windowStartLocal,
          windowEndLocal: r.windowEndLocal,
          assignedEmployeeId: r.assignedEmployeeId,
        })),
        lastSyncedAt: issuedAt.toISOString(),
      };
    } catch {
      workContext = null;
    }
  }

  let plantWorkOrderContext: OfflineRuntimeBundle["plantWorkOrderContext"] = null;
  if (
    isPlantOperationsEnabled() &&
    dietary.key === "PLANT" &&
    actor.employeeId
  ) {
    try {
      const assignedWos = await client.repair.findMany({
        where: {
          responsibleDepartmentId: dietary.id,
          assignedEmployeeId: actor.employeeId,
          unit: { facilityId: input.session.facilityId },
          status: { in: [...OPEN_WORK_ORDER_STATUSES] },
        },
        select: {
          id: true,
          repairCode: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          asset: { select: { name: true } },
          unit: { select: { name: true } },
        },
        take: 40,
        orderBy: [{ priority: "desc" }, { requestedAt: "asc" }],
      });
      plantWorkOrderContext = {
        readOnly: true,
        offlineMutationsSupported: false,
        workOrders: assignedWos.map((w) => ({
          id: w.id,
          repairCode: w.repairCode,
          title: w.title,
          summary: w.description,
          status: w.status,
          priority: w.priority,
          assetName: w.asset?.name ?? null,
          unitName: w.unit?.name ?? null,
        })),
        lastSyncedAt: issuedAt.toISOString(),
      };
    } catch {
      plantWorkOrderContext = null;
    }
  }

  const bundle: OfflineRuntimeBundle = {
    bundleVersion,
    serverRevision,
    issuedAt: issuedAt.toISOString(),
    offlineAuthorizedUntil: offlineAuthorizedUntil.toISOString(),
    lastSuccessfulSyncAt: issuedAt.toISOString(),
    facilityId: unit.facility.id,
    facilityTimezone,
    facilityName: unit.facility.displayName,
    departmentId: dietary.id,
    departmentName: dietary.name,
    unitId: unit.id,
    unitName: unit.name,
    deviceFacilityId: input.deviceFacilityId,
    deviceBoundUnitId: input.deviceBoundUnitId,
    actor: {
      displayName: input.session.name,
      role: input.session.role,
      authMethod: input.session.authMethod === "QUICK_PIN" ? "QUICK_PIN" : "PASSWORD",
      authKind: input.session.authKind ?? "user",
      actorRef: actorRefForSession(input.session),
      sessionVersion: input.session.sessionVersion ?? 0,
    },
    operationalDate: serviceDateKey,
    mealContext: includeMealMilestones
      ? {
          applicableMealType: recordable?.mealType ?? null,
          label: recordable ? `${recordable.mealType} · ${recordable.scheduledTime}` : null,
          expectedServiceTime: recordable?.scheduledTime ?? null,
        }
      : {
          applicableMealType: null,
          label: null,
          expectedServiceTime: null,
        },
    milestones,
    procedureLabels: [],
    assignmentContext,
    cycleContext,
    jobFlowContext,
    evidenceContext,
    assetContext,
    workContext,
    plantWorkOrderContext,
  };

  const issuance = await client.offlineBundleIssuance.create({
    data: {
      facilityId: input.session.facilityId,
      unitId: unit.id,
      actorUserId: actor.userId,
      actorEmployeeId: actor.employeeId,
      actorRole: input.session.role,
      authMethod: actor.authMethod,
      deviceFacilityId: input.deviceFacilityId,
      deviceBoundUnitId: input.deviceBoundUnitId,
      sessionVersion: input.session.sessionVersion ?? 0,
      bundleVersion,
      serverRevision,
      offlineAuthorizedUntil,
    },
    select: { id: true },
  });

  return { ok: true, bundle, issuanceId: issuance.id };
}
