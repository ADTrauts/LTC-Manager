/**
 * Batched date-effective reads for one facility service day.
 * Composer owns comparison. This module owns queries.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { LogAttachmentForResolve } from "@/lib/canonical-logs/resolve-log-requirements";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { loadPublishedCyclesForLogsOnDate } from "@/lib/canonical-logs/load-published-cycles-for-logs";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import type {
  OperationalReviewDayFacts,
  ReviewAttachmentSegmentFact,
  ReviewAssignmentFact,
  ReviewEvidenceRecordFact,
  ReviewOtBindingFact,
  ReviewProfileFact,
} from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

const ATTACHMENT_INCLUDE = {
  dailyWindows: { orderBy: { displaySequence: "asc" as const } },
  cycleSelections: { orderBy: { displaySequence: "asc" as const } },
  catalogDefinition: {
    include: { fields: { orderBy: { displaySequence: "asc" as const } } },
  },
} as const;

function asCatalogPurpose(
  purposeType: string,
): LogAttachmentForResolve["catalogDefinition"]["purposeType"] {
  if (purposeType === "CHECKLIST") {
    return purposeType;
  }
  return "LOG";
}

export async function loadOperationalReviewDayFacts(input: {
  client: Db;
  facilityId: string;
  serviceDate: string;
  departmentId?: string | null;
  now?: Date;
}): Promise<OperationalReviewDayFacts> {
  const now = input.now ?? new Date();
  const timezone = resolveFacilityTimezone(
    await loadFacilityTimezone(input.client as PrismaClient, input.facilityId),
  );
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDate);

  const [facility, departments, spaces] = await Promise.all([
    input.client.facility.findFirst({
      where: { id: input.facilityId },
      select: { id: true, displayName: true, timezone: true },
    }),
    input.client.department.findMany({
      where: {
        facilityId: input.facilityId,
        isActive: true,
        ...(input.departmentId ? { id: input.departmentId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    input.client.unitSpace.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      select: {
        id: true,
        name: true,
        unitId: true,
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!facility) {
    throw new Error("Facility not found.");
  }

  const departmentIds = departments.map((row) => row.id);

  const [
    profiles,
    attachments,
    evidence,
    templates,
    plans,
    assignments,
    scheduleEntries,
    overrides,
    serveryEvents,
    keyTimes,
    assetIssues,
    legacyCount,
  ] = await Promise.all([
    departmentIds.length === 0
      ? Promise.resolve([])
      : input.client.departmentOperationalProfile.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            status: { in: ["ACTIVE", "RETIRED", "CERTIFIED"] },
          },
          select: {
            id: true,
            departmentId: true,
            version: true,
            status: true,
            activatedAt: true,
            retiredAt: true,
          },
        }),
    input.client.logAttachment.findMany({
      where: {
        facilityId: input.facilityId,
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      include: ATTACHMENT_INCLUDE,
    }),
    input.client.operationalEvidenceRecord.findMany({
      where: {
        facilityId: input.facilityId,
        operationalDate: serviceDate,
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      select: {
        id: true,
        logAttachmentId: true,
        attachmentStableKey: true,
        requirementKey: true,
        logRequirementKey: true,
        status: true,
        operationalDate: true,
        templateVersion: true,
        catalogDefinition: { select: { stableKey: true } },
        spaceId: true,
        unitId: true,
        occurredAt: true,
        recordedAt: true,
        outOfStandard: true,
        values: {
          select: { valueNumber: true, fieldKey: true },
          orderBy: { fieldKey: "asc" },
        },
      },
    }),
    departmentIds.length === 0
      ? Promise.resolve([])
      : input.client.operationalAssignmentTemplate.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            status: { in: ["PUBLISHED", "RETIRED"] },
          },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                roleKey: true,
                roleLabel: true,
                requiredCount: true,
                unitId: true,
                applicableOperationalTypeKeys: true,
                applicableOperationalCycleStableKeys: true,
              },
            },
          },
        }),
    departmentIds.length === 0
      ? Promise.resolve([])
      : input.client.operationalAssignmentPlan.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            serviceDate,
          },
          select: { departmentId: true, status: true },
        }),
    input.client.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        serviceDate,
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      select: {
        id: true,
        departmentId: true,
        roleKey: true,
        status: true,
        unitId: true,
        startsAt: true,
        endsAt: true,
        employeeId: true,
        employee: { select: { firstName: true, lastName: true } },
        locations: { select: { unitSpaceId: true } },
      },
    }),
    input.client.scheduleEntry.findMany({
      where: {
        date: serviceDate,
        employee: { facilityId: input.facilityId },
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        unitId: true,
        departmentId: true,
        shift: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    input.client.assignmentOverride.findMany({
      where: {
        date: serviceDate,
        employee: { facilityId: input.facilityId },
      },
      select: {
        id: true,
        employeeId: true,
        reason: true,
        oldUnitId: true,
        newUnitId: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    input.client.serveryMealServiceEvent.findMany({
      where: {
        serviceDate,
        unit: { facilityId: input.facilityId },
      },
      select: {
        unitId: true,
        mealType: true,
        mealServiceReadyAt: true,
        readyRecordedAt: true,
        mealServiceStartedAt: true,
        startedRecordedAt: true,
        entries: {
          select: {
            milestone: true,
            occurredAt: true,
            recordedAt: true,
            kind: true,
          },
          orderBy: { recordedAt: "desc" },
        },
      },
    }),
    departmentIds.length === 0
      ? Promise.resolve([])
      : input.client.operationalCycleKeyTimeDayExpectation.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: { in: departmentIds },
            serviceDate,
          },
          select: {
            spaceId: true,
            cycleStableKey: true,
            cycleVersion: true,
            cycleLabel: true,
            configuredDueLocal: true,
            adjustedDueLocal: true,
            completedAt: true,
          },
        }),
    input.client.assetIssue.findMany({
      where: {
        facilityId: input.facilityId,
        observedAt: {
          gte: serviceDate,
          lt: new Date(serviceDate.getTime() + 24 * 60 * 60 * 1000),
        },
        operationalImpact: { in: ["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE"] },
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      },
      select: {
        id: true,
        spaceId: true,
        operationalImpact: true,
        observedAt: true,
      },
    }),
    input.client.logSubmission.count({
      where: {
        submittedAt: {
          gte: serviceDate,
          lt: new Date(serviceDate.getTime() + 24 * 60 * 60 * 1000),
        },
        unit: { facilityId: input.facilityId },
      },
    }),
  ]);

  const assignmentIds = assignments.map((row) => row.id);
  const locationEvents =
    assignmentIds.length === 0
      ? []
      : await input.client.operationalAssignmentEvent.findMany({
          where: {
            facilityId: input.facilityId,
            assignmentId: { in: assignmentIds },
            eventType: { in: ["UPDATED", "REASSIGNED"] },
          },
          select: { assignmentId: true, priorValuesJson: true, newValuesJson: true },
        });
  const changedAssignmentIds = new Set(
    locationEvents
      .filter((row) => {
        const prior = row.priorValuesJson ?? "";
        const next = row.newValuesJson ?? "";
        return /unitSpaceId|locations|spaceId/i.test(`${prior}${next}`);
      })
      .map((row) => row.assignmentId)
      .filter((id): id is string => Boolean(id)),
  );

  const profileFacts: ReviewProfileFact[] = profiles.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    version: row.version,
    status: row.status,
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
  }));

  const bindings: ReviewOtBindingFact[] =
    profileFacts.length === 0
      ? []
      : (
          await input.client.departmentRoomArchetypeBinding.findMany({
            where: { profileId: { in: profileFacts.map((row) => row.id) } },
            select: {
              profileId: true,
              unitSpaceId: true,
              archetype: { select: { key: true, name: true, isActive: true } },
            },
          })
        ).map((row) => ({
          profileId: row.profileId,
          spaceId: row.unitSpaceId,
          operationalTypeKey: row.archetype.key,
          operationalTypeName: row.archetype.name,
          archetypeIsActive: row.archetype.isActive,
        }));

  const attachmentSegments: ReviewAttachmentSegmentFact[] = attachments.map((row) => ({
    id: row.id,
    stableKey: row.stableKey,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    timingMode: row.timingMode,
    allowAdHoc: row.allowAdHoc,
    calendarCadence: row.calendarCadence,
    calendarDaysOfWeek: row.calendarDaysOfWeek,
    calendarDayOfMonth: row.calendarDayOfMonth,
    calendarDueTimeLocal: row.calendarDueTimeLocal,
    localDisplayLabel: row.localDisplayLabel,
    localInstructions: row.localInstructions,
    targetKind: row.targetKind,
    assetId: row.assetId,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
    dailyWindows: row.dailyWindows.map((window) => ({
      label: window.label,
      startLocal: window.startLocal,
      endLocal: window.endLocal,
      displaySequence: window.displaySequence,
    })),
    cycleSelections: row.cycleSelections.map((sel) => ({
      cycleStableKey: sel.cycleStableKey,
      displaySequence: sel.displaySequence,
    })),
    catalogDefinition: {
      id: row.catalogDefinition.id,
      name: row.catalogDefinition.name,
      purposeType: asCatalogPurpose(row.catalogDefinition.purposeType),
      instructions: row.catalogDefinition.instructions,
      status: row.catalogDefinition.status,
      fields: row.catalogDefinition.fields.map((field) => ({
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        displaySequence: field.displaySequence,
        helpText: field.helpText,
        unitLabel: field.unitLabel,
        minNumber: field.minNumber,
        maxNumber: field.maxNumber,
        allowedSelections: field.allowedSelections,
        correctiveActionTrigger: field.correctiveActionTrigger,
        correctiveActionRequired: field.correctiveActionRequired,
      })),
    },
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  }));

  const evidenceRecords: ReviewEvidenceRecordFact[] = evidence.map((row) => {
    const numeric = row.values.find((value) => value.valueNumber != null);
    return {
      id: row.id,
      requirementKey: row.requirementKey,
      logRequirementKey: row.logRequirementKey,
      status: row.status,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      catalogVersion: row.templateVersion,
      valueNumber: numeric?.valueNumber ?? null,
      unitLabel: null,
      outOfStandard: row.outOfStandard,
      logAttachmentId: row.logAttachmentId,
      attachmentStableKey: row.attachmentStableKey,
      catalogStableKey: row.catalogDefinition?.stableKey ?? null,
      spaceId: row.spaceId,
      unitId: row.unitId,
      occurredAt: row.occurredAt,
      recordedAt: row.recordedAt,
    };
  });

  const assignmentFacts: ReviewAssignmentFact[] = assignments.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    roleKey: row.roleKey,
    status: row.status,
    unitId: row.unitId,
    coveredSpaceIds: row.locations.map((loc) => loc.unitSpaceId),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    hasCallDown: false,
    employeeId: row.employeeId,
    employeeDisplayName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    locationChangedDuringEdits: changedAssignmentIds.has(row.id),
  }));

  const cycleRows = [];
  const publishedCyclesForLogs = [];
  for (const departmentId of departmentIds) {
    cycleRows.push(
      ...(await loadPublishedCyclesForDate(input.facilityId, departmentId, input.serviceDate, input.client, {
        includeKeyTimes: true,
      })),
    );
    publishedCyclesForLogs.push(
      ...(await loadPublishedCyclesForLogsOnDate({
        client: input.client as PrismaClient,
        facilityId: input.facilityId,
        departmentId,
        operationalDateKey: input.serviceDate,
        timezone,
      })),
    );
  }

  const serveryMilestoneActuals = serveryEvents.flatMap((event) => {
    const latestReady =
      event.entries.find((entry) => entry.milestone === "READY") ??
      (event.mealServiceReadyAt
        ? {
            milestone: "READY" as const,
            occurredAt: event.mealServiceReadyAt,
            recordedAt: event.readyRecordedAt,
          }
        : null);
    const latestStarted =
      event.entries.find((entry) => entry.milestone === "SERVICE_STARTED") ??
      (event.mealServiceStartedAt
        ? {
            milestone: "SERVICE_STARTED" as const,
            occurredAt: event.mealServiceStartedAt,
            recordedAt: event.startedRecordedAt,
          }
        : null);
    return [latestReady, latestStarted]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        unitId: event.unitId,
        mealType: event.mealType,
        milestone: row.milestone,
        occurredAt: row.occurredAt,
        recordedAt: row.recordedAt,
      }));
  });

  return {
    facilityId: facility.id,
    facilityLabel: facility.displayName,
    departmentId: input.departmentId ?? null,
    departmentIds,
    serviceDate: input.serviceDate,
    timezone,
    now,
    todayKey,
    spaces: spaces.map((space) => ({
      spaceId: space.id,
      displayLabel: space.name,
      parentUnitId: space.unitId,
      parentUnitLabel: space.unit?.name ?? null,
    })),
    profiles: profileFacts,
    otBindings: bindings,
    attachmentSegments,
    evidenceRecords,
    coverageTemplates: templates.map((row) => ({
      id: row.id,
      stableKey: row.stableKey,
      version: row.version,
      status: row.status,
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      items: row.items.map((item) => ({
        id: item.id,
        roleKey: item.roleKey,
        roleLabel: item.roleLabel,
        requiredCount: item.requiredCount,
        unitId: item.unitId,
        applicableOperationalTypeKeys: item.applicableOperationalTypeKeys,
        applicableOperationalCycleStableKeys: item.applicableOperationalCycleStableKeys,
      })),
    })),
    assignments: assignmentFacts,
    plans: plans.map((row) => ({ departmentId: row.departmentId, status: row.status })),
    cycles: cycleRows,
    publishedCyclesForLogs,
    serveryMilestoneActuals,
    keyTimeActuals: keyTimes,
    scheduledPresence: scheduleEntries.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeDisplayName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      unitId: row.unitId,
      departmentId: row.departmentId,
      shift: row.shift,
    })),
    presenceExceptions: overrides.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeDisplayName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      reason: row.reason,
      oldUnitId: row.oldUnitId,
      newUnitId: row.newUnitId,
    })),
    assetImpacts: assetIssues
      .filter(
        (row): row is typeof row & { operationalImpact: "SERVICE_AT_RISK" | "EQUIPMENT_UNAVAILABLE" } =>
          row.operationalImpact === "SERVICE_AT_RISK" ||
          row.operationalImpact === "EQUIPMENT_UNAVAILABLE",
      )
      .map((row) => ({
        issueId: row.id,
        spaceId: row.spaceId,
        operationalImpact: row.operationalImpact,
        observedAt: row.observedAt,
      })),
    legacySubmissionPresent: legacyCount > 0,
  };
}
