/**
 * Batched historical facts across a facility service-date interval.
 * Partitioned per day, then composed with the same daily composer.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { loadPublishedCyclesForLogsOnDate } from "@/lib/canonical-logs/load-published-cycles-for-logs";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import {
  REVIEW_ATTACHMENT_INCLUDE,
  detectLocationChangedAssignmentIds,
  employeeDisplayName,
  mapReviewAssignments,
  mapReviewAttachmentSegments,
  mapReviewCoverageTemplates,
  mapReviewEvidenceRecords,
  mapReviewServeryEvents,
} from "./review-fact-maps";
import { addServiceDateKey } from "./service-date-range";
import type { OperationalReviewDayFacts, ReviewOtBindingFact, ReviewProfileFact } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

function groupByDateKey<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export async function loadOperationalReviewRangeFacts(input: {
  client: Db;
  facilityId: string;
  startServiceDate: string;
  endServiceDate: string;
  keys: string[];
  departmentId?: string | null;
  now?: Date;
}): Promise<{
  todayKey: string;
  timezone: string;
  factsByDate: Map<string, OperationalReviewDayFacts>;
}> {
  const now = input.now ?? new Date();
  const timezone = resolveFacilityTimezone(
    await loadFacilityTimezone(input.client as PrismaClient, input.facilityId),
  );
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const startDate = facilityLocalDateToServiceDate(input.startServiceDate);
  const endExclusive = facilityLocalDateToServiceDate(addServiceDateKey(input.endServiceDate, 1));

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
  const spaceFacts = spaces.map((space) => ({
    spaceId: space.id,
    displayLabel: space.name,
    parentUnitId: space.unitId,
    parentUnitLabel: space.unit?.name ?? null,
  }));

  const [profiles, attachments, evidence, templates, plans, assignments, scheduleEntries, overrides, serveryEvents, keyTimes, assetIssues, legacyRows] =
    await Promise.all([
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
        include: REVIEW_ATTACHMENT_INCLUDE,
      }),
      input.client.operationalEvidenceRecord.findMany({
        where: {
          facilityId: input.facilityId,
          operationalDate: { gte: startDate, lt: endExclusive },
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
              serviceDate: { gte: startDate, lt: endExclusive },
            },
            select: { departmentId: true, status: true, serviceDate: true },
          }),
      input.client.operationalAssignment.findMany({
        where: {
          facilityId: input.facilityId,
          serviceDate: { gte: startDate, lt: endExclusive },
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
          serviceDate: true,
          employee: { select: { firstName: true, lastName: true } },
          locations: { select: { unitSpaceId: true } },
        },
      }),
      input.client.scheduleEntry.findMany({
        where: {
          date: { gte: startDate, lt: endExclusive },
          employee: { facilityId: input.facilityId },
          ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        },
        select: {
          id: true,
          date: true,
          employeeId: true,
          unitId: true,
          departmentId: true,
          shift: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      input.client.assignmentOverride.findMany({
        where: {
          date: { gte: startDate, lt: endExclusive },
          employee: { facilityId: input.facilityId },
        },
        select: {
          id: true,
          date: true,
          employeeId: true,
          reason: true,
          oldUnitId: true,
          newUnitId: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      input.client.serveryMealServiceEvent.findMany({
        where: {
          serviceDate: { gte: startDate, lt: endExclusive },
          unit: { facilityId: input.facilityId },
        },
        select: {
          serviceDate: true,
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
              serviceDate: { gte: startDate, lt: endExclusive },
            },
            select: {
              serviceDate: true,
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
          observedAt: { gte: startDate, lt: endExclusive },
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
      input.client.logSubmission.findMany({
        where: {
          submittedAt: { gte: startDate, lt: endExclusive },
          unit: { facilityId: input.facilityId },
        },
        select: { submittedAt: true },
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
  const changedAssignmentIds = detectLocationChangedAssignmentIds(locationEvents);

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

  const attachmentSegments = mapReviewAttachmentSegments(attachments);
  const coverageTemplates = mapReviewCoverageTemplates(templates);
  const evidenceByDate = groupByDateKey(mapReviewEvidenceRecords(evidence), (row) => row.operationalDateKey);
  const plansByDate = groupByDateKey(plans, (row) => toServiceDateKey(row.serviceDate));
  const assignmentsByDate = groupByDateKey(assignments, (row) => toServiceDateKey(row.serviceDate));
  const scheduleByDate = groupByDateKey(scheduleEntries, (row) => toServiceDateKey(row.date));
  const overridesByDate = groupByDateKey(overrides, (row) => toServiceDateKey(row.date));
  const serveryByDate = groupByDateKey(serveryEvents, (row) => toServiceDateKey(row.serviceDate));
  const keyTimesByDate = groupByDateKey(keyTimes, (row) => toServiceDateKey(row.serviceDate));
  const assetsByDate = groupByDateKey(assetIssues, (row) => toServiceDateKey(row.observedAt));
  const legacyByDate = groupByDateKey(legacyRows, (row) => toServiceDateKey(row.submittedAt));

  const cycleLoads = await Promise.all(
    input.keys.flatMap((serviceDate) =>
      departmentIds.map(async (departmentId) => ({
        serviceDate,
        cycles: await loadPublishedCyclesForDate(
          input.facilityId,
          departmentId,
          serviceDate,
          input.client,
          { includeKeyTimes: true },
        ),
        publishedCyclesForLogs: await loadPublishedCyclesForLogsOnDate({
          client: input.client as PrismaClient,
          facilityId: input.facilityId,
          departmentId,
          operationalDateKey: serviceDate,
          timezone,
        }),
      })),
    ),
  );
  const cyclesByDate = groupByDateKey(cycleLoads, (row) => row.serviceDate);

  const factsByDate = new Map<string, OperationalReviewDayFacts>();
  for (const serviceDate of input.keys) {
    const dayAssignments = assignmentsByDate.get(serviceDate) ?? [];
    const dayServery = serveryByDate.get(serviceDate) ?? [];
    const dayCycles = cyclesByDate.get(serviceDate) ?? [];
    factsByDate.set(serviceDate, {
      facilityId: facility.id,
      facilityLabel: facility.displayName,
      departmentId: input.departmentId ?? null,
      departmentIds,
      serviceDate,
      timezone,
      now,
      todayKey,
      spaces: spaceFacts,
      profiles: profileFacts,
      otBindings: bindings,
      attachmentSegments,
      evidenceRecords: evidenceByDate.get(serviceDate) ?? [],
      coverageTemplates,
      assignments: mapReviewAssignments(dayAssignments, changedAssignmentIds),
      plans: (plansByDate.get(serviceDate) ?? []).map((row) => ({
        departmentId: row.departmentId,
        status: row.status,
      })),
      cycles: dayCycles.flatMap((row) => row.cycles),
      publishedCyclesForLogs: dayCycles.flatMap((row) => row.publishedCyclesForLogs),
      serveryMilestoneActuals: mapReviewServeryEvents(dayServery),
      keyTimeActuals: (keyTimesByDate.get(serviceDate) ?? []).map((row) => ({
        spaceId: row.spaceId,
        cycleStableKey: row.cycleStableKey,
        cycleVersion: row.cycleVersion,
        cycleLabel: row.cycleLabel,
        configuredDueLocal: row.configuredDueLocal,
        adjustedDueLocal: row.adjustedDueLocal,
        completedAt: row.completedAt,
      })),
      scheduledPresence: (scheduleByDate.get(serviceDate) ?? []).map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeDisplayName: employeeDisplayName(row.employee),
        unitId: row.unitId,
        departmentId: row.departmentId,
        shift: row.shift,
      })),
      presenceExceptions: (overridesByDate.get(serviceDate) ?? []).map((row) => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeDisplayName: employeeDisplayName(row.employee),
        reason: row.reason,
        oldUnitId: row.oldUnitId,
        newUnitId: row.newUnitId,
      })),
      assetImpacts: (assetsByDate.get(serviceDate) ?? [])
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
      legacySubmissionPresent: (legacyByDate.get(serviceDate) ?? []).length > 0,
    });
  }

  return { todayKey, timezone, factsByDate };
}
