/**
 * Pure historical Review composer.
 * historical expectations + historical actuals → OperationalReviewDayViewModel
 * No Prisma. No RLS. No dashboard / readiness / Work scoring.
 */

import {
  projectLogExpectationHistory,
  type LogExpectationHistorySlot,
} from "@/lib/canonical-logs/expectation-history";
import { expandOperationalTypeSpaces } from "@/lib/canonical-logs/log-operational-type-applicability";
import type { LogAttachmentForResolve } from "@/lib/canonical-logs/resolve-log-requirements";
import {
  evaluateCoverageSlots,
  flattenCoverageTemplateItems,
  planLifecycleFromStatus,
  resolveCoverageExpectationsForLocation,
  selectHistoricalCoverageTemplates,
  type CanonicalCoverageState,
  type CoverageCycleRef,
} from "@/lib/scheduling/coverage-expectations";

import {
  attachmentHistoryReliability,
  catalogDefinitionForHistory,
  groupAttachmentLineages,
} from "./historical-attachment";
import {
  historicalOtAssignmentsFromBindings,
  selectHistoricalProfileForServiceDate,
} from "./historical-operational-type";
import type {
  OperationalReviewDayFacts,
  OperationalReviewDayViewModel,
  ReviewAssignmentActual,
  ReviewCoverageSlot,
  ReviewCoverageState,
  ReviewDomainAvailability,
  ReviewEvidenceOccurrence,
  ReviewEvidenceState,
  ReviewLocationEntry,
  ReviewMilestoneItem,
  ReviewPresenceException,
  ReviewUnavailableReason,
} from "./types";

function evaluated(): ReviewDomainAvailability {
  return { status: "evaluated", reason: null };
}

function unavailable(reason: ReviewUnavailableReason): ReviewDomainAvailability {
  return { status: "unavailable", reason };
}

function mapEvidenceState(state: LogExpectationHistorySlot["state"]): ReviewEvidenceState {
  switch (state) {
    case "COMPLETE":
      return "completed";
    case "COMPLETE_WITH_CORRECTIVE_ACTION":
      return "completed_with_corrective_action";
    case "NOT_REQUIRED":
      return "not_required";
    case "NEEDS_SETUP":
      return "unavailable";
    default:
      return "not_complete";
  }
}

function mapCoverageState(state: CanonicalCoverageState): ReviewCoverageState {
  switch (state) {
    case "COVERED":
      return "covered";
    case "AT_RISK":
    case "NOT_CONFIRMED":
      return "at_risk";
    case "UNCOVERED":
    case "NOT_YET_ASSIGNED":
      return "uncovered";
    default:
      return "uncovered";
  }
}

function overrideKind(reason: string, oldUnitId: string | null, newUnitId: string): ReviewPresenceException["kind"] {
  if (/call(?:ed)?[\s-]*off/i.test(reason)) return "called_off";
  if (oldUnitId && oldUnitId !== newUnitId) return "reassigned";
  return "presence_exception";
}

function spaceIdsForAttachment(
  segment: LogAttachmentForResolve,
  otBySpace: Map<string, { key: string; name: string }>,
  spaces: OperationalReviewDayFacts["spaces"],
): string[] {
  if (segment.targetKind === "SPACE" && segment.spaceId) return [segment.spaceId];
  if (segment.targetKind === "OPERATIONAL_TYPE") {
    return expandOperationalTypeSpaces(otBySpace, segment.operationalTypeKey);
  }
  if (segment.targetKind === "UNIT" && segment.unitId) {
    return spaces.filter((space) => space.parentUnitId === segment.unitId).map((space) => space.spaceId);
  }
  return [];
}

export function composeOperationalReviewDay(
  facts: OperationalReviewDayFacts,
): OperationalReviewDayViewModel {
  const otByDepartment = new Map<string, Map<string, { key: string; name: string }>>();
  let otUnavailable = false;
  for (const departmentId of facts.departmentIds) {
    const selected = selectHistoricalProfileForServiceDate(facts.profiles, {
      departmentId,
      serviceDateKey: facts.serviceDate,
      timezone: facts.timezone,
    });
    if (selected.status === "unavailable") {
      otUnavailable = true;
      otByDepartment.set(departmentId, new Map());
      continue;
    }
    otByDepartment.set(
      departmentId,
      historicalOtAssignmentsFromBindings(facts.otBindings, selected.profile.id),
    );
  }

  const locations: ReviewLocationEntry[] = facts.spaces.map((space) => {
    let ot: { key: string; name: string } | null = null;
    for (const departmentId of facts.departmentIds) {
      const found = otByDepartment.get(departmentId)?.get(space.spaceId);
      if (found) {
        ot = found;
        break;
      }
    }
    return {
      spaceId: space.spaceId,
      parentUnitId: space.parentUnitId,
      parentUnitLabel: space.parentUnitLabel,
      displayLabel: space.displayLabel,
      displayLabelIsHistorical: false,
      operationalTypeKey: ot?.key ?? null,
      operationalTypeName: ot?.name ?? null,
    };
  });

  const lineages = groupAttachmentLineages(facts.attachmentSegments);
  const occurrences: ReviewEvidenceOccurrence[] = [];
  let anyReliableEvidence = false;
  let anyUnreliableEvidence = false;
  let anyHarborSegment = facts.attachmentSegments.length > 0;

  for (const lineageSegments of lineages.values()) {
    const reliability = attachmentHistoryReliability({
      segments: lineageSegments,
      lineageSegments,
      serviceDateKey: facts.serviceDate,
      timezone: facts.timezone,
    });
    if (reliability.status === "none") continue;
    if (reliability.status === "unavailable") {
      anyUnreliableEvidence = true;
      const covering = lineageSegments[0]!;
      occurrences.push({
        spaceId: covering.spaceId,
        parentUnitId: covering.unitId,
        requirementKey: `${covering.stableKey}:unavailable`,
        attachmentId: covering.id,
        attachmentStableKey: covering.stableKey,
        catalogStableKey: covering.catalogStableKey,
        catalogVersion: covering.catalogVersion,
        slotLabel: covering.localDisplayLabel ?? covering.catalogDefinition.name,
        cycleStableKey: null,
        windowStartLocal: null,
        windowEndLocal: null,
        expected: true,
        state: "unavailable",
        recordId: null,
        occurredAt: null,
        recordedAt: null,
        operationalDateKey: facts.serviceDate,
      });
      continue;
    }

    anyReliableEvidence = true;
    const historical = catalogDefinitionForHistory(reliability.covering);
    const otBySpace = otByDepartment.get(historical.departmentId) ?? new Map();
    const targetSpaceIds = spaceIdsForAttachment(historical, otBySpace, facts.spaces);
    const spacesToProject = targetSpaceIds.length > 0 ? targetSpaceIds : [null];

    for (const spaceId of spacesToProject) {
      const segment: LogAttachmentForResolve = {
        ...historical,
        status: "ACTIVE",
        resolvedSpaceId: spaceId,
      };
      const submissions = facts.evidenceRecords.filter(
        (row) =>
          row.logAttachmentId === historical.id ||
          row.attachmentStableKey === historical.stableKey ||
          (spaceId && row.spaceId === spaceId && row.catalogStableKey === historical.catalogStableKey),
      );
      const [day] = projectLogExpectationHistory({
        segments: [segment],
        fromDateKey: facts.serviceDate,
        toDateKey: facts.serviceDate,
        todayKey: facts.todayKey,
        now: facts.now,
        facilityTimezone: facts.timezone,
        publishedCycles: facts.publishedCyclesForLogs,
        submissions,
      });
      if (!day) continue;
      for (const slot of day.slots) {
        const record = facts.evidenceRecords.find((row) => row.id === slot.recordId) ?? null;
        occurrences.push({
          spaceId,
          parentUnitId: historical.unitId,
          requirementKey: slot.requirementKey,
          attachmentId: slot.attachmentId,
          attachmentStableKey: slot.attachmentStableKey,
          catalogStableKey: slot.catalogStableKey,
          catalogVersion: slot.catalogVersion,
          slotLabel: slot.slotLabel,
          cycleStableKey: slot.cycleStableKey,
          windowStartLocal: slot.windowStartLocal,
          windowEndLocal: slot.windowEndLocal,
          expected: true,
          state: mapEvidenceState(slot.state),
          recordId: slot.recordId,
          occurredAt: record?.occurredAt.toISOString() ?? null,
          recordedAt: record?.recordedAt.toISOString() ?? null,
          operationalDateKey: slot.operationalDateKey,
        });
      }
    }
  }

  let evidenceAvailability: ReviewDomainAvailability = evaluated();
  if (!anyHarborSegment && facts.legacySubmissionPresent) {
    evidenceAvailability = unavailable("legacy_only_date");
  } else if (!anyReliableEvidence && anyUnreliableEvidence) {
    evidenceAvailability = unavailable("attachment_history_not_reliable");
  } else if (otUnavailable && facts.attachmentSegments.some((row) => row.targetKind === "OPERATIONAL_TYPE")) {
    evidenceAvailability = unavailable("no_historical_ot_version");
  }

  const cycleVersions = facts.cycles.map((cycle) => ({
    id: cycle.id,
    stableKey: cycle.stableKey,
    version: cycle.version,
    label: cycle.label,
    startLocal: cycle.startLocal,
    endLocal: cycle.endLocal,
    expectedMilestones: [...cycle.expectedMilestones],
    spaceIds: [...cycle.spaceIds],
  }));
  const cyclesAvailability =
    facts.cycles.length === 0 && facts.departmentIds.length > 0
      ? evaluated()
      : evaluated();

  const coverageSelection = selectHistoricalCoverageTemplates(
    facts.coverageTemplates,
    facts.serviceDate,
  );
  let coverageAvailability: ReviewDomainAvailability = evaluated();
  const coverageSlots: ReviewCoverageSlot[] = [];
  if (coverageSelection.status === "unavailable") {
    coverageAvailability = unavailable("coverage_interval_ambiguous");
  } else if (otUnavailable && coverageSelection.templates.some((row) =>
    row.items.some((item) => item.applicableOperationalTypeKeys.length > 0),
  )) {
    coverageAvailability = unavailable("no_historical_ot_version");
  } else {
    const items = flattenCoverageTemplateItems(coverageSelection.templates);
    const cycleRefs: CoverageCycleRef[] = facts.cycles
      .filter((cycle) => cycle.nodeKind === "PERIOD")
      .map((cycle) => ({ stableKey: cycle.stableKey, label: cycle.label }));
    const cycleWindows = new Map(
      facts.publishedCyclesForLogs.map((cycle) => [
        cycle.stableKey,
        { startsAt: cycle.startsAt, endsAt: cycle.endsAt },
      ]),
    );
    const assignments = facts.assignments.map((row) => ({
      id: row.id,
      roleKey: row.roleKey,
      status: row.status,
      unitId: row.unitId,
      coveredSpaceIds: row.coveredSpaceIds,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      hasCallDown: row.hasCallDown,
    }));

    for (const location of locations) {
      const contextDepartmentId = facts.departmentId ?? facts.departmentIds[0] ?? "";
      const plan = facts.plans.find((row) => row.departmentId === contextDepartmentId);
      const evaluatedSlots = evaluateCoverageSlots({
        expectations: resolveCoverageExpectationsForLocation({
          items,
          context: {
            departmentId: contextDepartmentId,
            spaceId: location.spaceId,
            unitId: location.parentUnitId,
            operationalTypeKey: location.operationalTypeKey,
            operationalTypeName: location.operationalTypeName,
          },
          cycles: cycleRefs,
        }),
        assignments,
        spaceId: location.spaceId,
        unitId: location.parentUnitId,
        plan: planLifecycleFromStatus(plan?.status),
        cycleWindows,
      });
      for (const slot of evaluatedSlots) {
        coverageSlots.push({
          spaceId: location.spaceId,
          roleKey: slot.expectation.roleKey,
          roleLabel: slot.expectation.roleLabel,
          requiredCount: slot.expectation.requiredCount,
          filledCount: slot.filledCount,
          state: mapCoverageState(slot.state),
          templateId: slot.expectation.templateId,
          templateStableKey: slot.expectation.templateStableKey,
          templateVersion: slot.expectation.templateVersion,
          cycleStableKey: slot.expectation.cycleStableKey,
          cycleLabel: slot.expectation.cycleLabel,
          operationalTypeKey: slot.expectation.operationalTypeKey,
          fillingAssignmentIds: slot.fillingAssignmentIds,
        });
      }
    }
  }

  const assignments: ReviewAssignmentActual[] = facts.assignments.map((row) => ({
    id: row.id,
    roleKey: row.roleKey,
    status: row.status,
    employeeId: row.employeeId ?? null,
    employeeDisplayName: row.employeeDisplayName ?? null,
    unitId: row.unitId,
    coveredSpaceIds: [...row.coveredSpaceIds],
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    hasCallDown: row.hasCallDown === true,
    locationChangedDuringEdits: row.locationChangedDuringEdits,
  }));

  const milestoneItems: ReviewMilestoneItem[] = [];
  for (const cycle of facts.cycles) {
    if (cycle.nodeKind === "PERIOD") {
      for (const milestone of cycle.expectedMilestones) {
        const kind = milestone === "SERVICE_STARTED" ? "MEAL_SERVICE_STARTED" : "SERVERY_READY";
        const configured = cycle.milestoneTimes.find((row) => row.milestone === milestone);
        const actual = facts.serveryMilestoneActuals.find(
          (row) =>
            row.milestone === milestone &&
            (configured ? row.unitId === configured.unitId : true) &&
            (!cycle.mealType || row.mealType === cycle.mealType),
        );
        milestoneItems.push({
          kind,
          cycleStableKey: cycle.stableKey,
          cycleVersion: cycle.version,
          cycleLabel: cycle.label,
          expectedTimeLocal: configured?.configuredTime ?? cycle.startLocal,
          spaceId: null,
          unitId: configured?.unitId ?? cycle.unitIds[0] ?? null,
          actualOccurredAt: actual?.occurredAt.toISOString() ?? null,
          actualRecordedAt: actual?.recordedAt?.toISOString() ?? null,
        });
      }
    }
    if (cycle.nodeKind === "KEY_TIME") {
      for (const group of cycle.keyTimeGroups) {
        for (const spaceId of group.spaceIds) {
          const actual = facts.keyTimeActuals.find(
            (row) => row.spaceId === spaceId && row.cycleStableKey === cycle.stableKey,
          );
          milestoneItems.push({
            kind: "KEY_TIME",
            cycleStableKey: cycle.stableKey,
            cycleVersion: cycle.version,
            cycleLabel: cycle.label,
            expectedTimeLocal: actual?.adjustedDueLocal ?? actual?.configuredDueLocal ?? group.dueLocal,
            spaceId,
            unitId: null,
            actualOccurredAt: actual?.completedAt?.toISOString() ?? null,
            actualRecordedAt: actual?.completedAt?.toISOString() ?? null,
          });
        }
      }
    }
  }

  return {
    facilityId: facts.facilityId,
    facilityLabel: facts.facilityLabel,
    departmentId: facts.departmentId,
    departmentIds: [...facts.departmentIds],
    serviceDate: facts.serviceDate,
    timezone: facts.timezone,
    locations,
    evidence: {
      availability: evidenceAvailability,
      occurrences,
    },
    coverage: {
      availability: coverageAvailability,
      slots: coverageSlots,
      assignments,
    },
    cycles: {
      availability: cyclesAvailability,
      versions: cycleVersions,
    },
    milestones: {
      availability: evaluated(),
      items: milestoneItems,
    },
    presence: {
      scheduled: facts.scheduledPresence.map((row) => ({
        scheduleEntryId: row.id,
        employeeId: row.employeeId,
        employeeDisplayName: row.employeeDisplayName,
        unitId: row.unitId,
        departmentId: row.departmentId,
        shift: row.shift,
      })),
      exceptions: facts.presenceExceptions.map((row) => ({
        overrideId: row.id,
        employeeId: row.employeeId,
        employeeDisplayName: row.employeeDisplayName,
        kind: overrideKind(row.reason, row.oldUnitId, row.newUnitId),
        reason: row.reason,
        oldUnitId: row.oldUnitId,
        newUnitId: row.newUnitId,
      })),
      attendanceClaimed: false,
    },
    work: {
      availability: unavailable("unsupported_work_history"),
    },
    assets: {
      availability: evaluated(),
      impacts: facts.assetImpacts.map((row) => ({
        issueId: row.issueId,
        spaceId: row.spaceId,
        operationalImpact: row.operationalImpact,
        observedAt: row.observedAt.toISOString(),
      })),
    },
  };
}
