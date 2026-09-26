/**
 * Pure Review presenter. Interprets OperationalReviewDayViewModel for UI.
 * No Prisma. No scores. No readiness.
 */

import { parseFacilityLocalScheduledStart } from "@/lib/operational-time";

import type {
  OperationalReviewDayViewModel,
  ReviewAssignmentActual,
  ReviewCoverageState,
  ReviewDomainAvailability,
  ReviewEvidenceOccurrence,
  ReviewEvidenceState,
  ReviewLocationEntry,
  ReviewMilestoneItem,
  ReviewUnavailableReason,
} from "./types";

export type ReviewSummaryItem = {
  id: string;
  label: string;
  name: string;
  count: number;
};

export type PresentedEvidenceRow = {
  requirementKey: string;
  spaceId: string | null;
  locationLabel: string;
  requirementLabel: string;
  windowLabel: string | null;
  state: ReviewEvidenceState;
  stateLabel: string;
  attention: boolean;
  recordId: string | null;
  recordHref: string | null;
  occurredAtLabel: string | null;
  recordedAtLabel: string | null;
  recordedLater: boolean;
};

export type PresentedCoverageRow = {
  spaceId: string;
  locationLabel: string;
  cycleLabel: string | null;
  roleLabel: string;
  requiredCount: number;
  assignedCount: number;
  state: ReviewCoverageState;
  stateLabel: string;
  attention: boolean;
};

export type PresentedMilestoneRow = {
  kindLabel: string;
  expectedTimeLabel: string | null;
  actualTimeLabel: string | null;
  varianceLabel: string | null;
  missing: boolean;
  spaceId: string | null;
};

export type PresentedServiceCycle = {
  stableKey: string;
  label: string;
  periodLabel: string | null;
  milestones: PresentedMilestoneRow[];
};

export type PresentedLocationRow = {
  spaceId: string;
  displayLabel: string;
  parentUnitId: string | null;
  parentUnitLabel: string | null;
  operationalTypeName: string | null;
  currentLocationHref: string | null;
  exceptionCount: number;
  exceptionSummary: string;
  availabilityNotes: string[];
  paceLabel?: string | null;
  happeningLabel?: string | null;
  plannedLabel?: string | null;
  assignedLabel?: string | null;
  actualLabel?: string | null;
  evidenceLabel?: string | null;
};

export type PresentedAssetRow = {
  issueId: string;
  spaceId: string | null;
  locationLabel: string;
  impactLabel: string;
  observedAtLabel: string;
  href: string;
};

export type LocationFilterOption = {
  spaceId: string;
  displayLabel: string;
};

export type OperationalReviewDayPresentation = {
  serviceDate: string;
  serviceDateLabel: string;
  isToday: boolean;
  facilityLabel: string;
  departmentId: string | null;
  locationOptions: LocationFilterOption[];
  empty: boolean;
  quiet: boolean;
  summaryItems: ReviewSummaryItem[];
  unavailableDomains: ReviewSummaryItem[];
  locations: PresentedLocationRow[];
  evidence: {
    availability: ReviewDomainAvailability;
    unavailableMessage: string | null;
    attention: PresentedEvidenceRow[];
    completed: PresentedEvidenceRow[];
  };
  coverage: {
    availability: ReviewDomainAvailability;
    unavailableMessage: string | null;
    slots: PresentedCoverageRow[];
    assignments: ReviewAssignmentActual[];
    assignmentEditLimitation: string | null;
  };
  presence: OperationalReviewDayViewModel["presence"];
  service: {
    availability: ReviewDomainAvailability;
    unavailableMessage: string | null;
    cycles: PresentedServiceCycle[];
  };
  assets: {
    rows: PresentedAssetRow[];
  };
};

const SERVICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isReviewServiceDateKey(value: string | null | undefined): value is string {
  return Boolean(value && SERVICE_DATE_RE.test(value.trim()));
}

export function unavailableExplanation(reason: ReviewUnavailableReason | null): string {
  switch (reason) {
    case "legacy_only_date":
      return "Historical expectation unavailable for this date.";
    case "unsupported_work_history":
      return "Historical Work data is not yet available.";
    default:
      return "The configuration effective for this date cannot be reconstructed reliably.";
  }
}

export function evidenceStateLabel(state: ReviewEvidenceState): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "not_complete":
      return "Missed";
    case "completed_with_corrective_action":
      return "Completed with corrective action";
    case "unavailable":
      return "Unavailable";
    case "not_required":
      return "Not required";
  }
}

export function coverageStateLabel(state: ReviewCoverageState): string {
  switch (state) {
    case "covered":
      return "Covered";
    case "at_risk":
      return "At risk";
    case "uncovered":
      return "Uncovered";
    case "unavailable":
      return "Unavailable";
  }
}

export function formatServiceDateLabel(serviceDate: string): string {
  const [year, month, day] = serviceDate.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatClock(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function formatInstant(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function facilityDateKeyOfInstant(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function locationLabelFor(
  spaceId: string | null,
  locations: readonly ReviewLocationEntry[],
): string {
  if (!spaceId) return "Unassigned location";
  return locations.find((row) => row.spaceId === spaceId)?.displayLabel ?? "Unassigned location";
}

function domainUnavailable(
  availability: ReviewDomainAvailability,
): string | null {
  if (availability.status !== "unavailable") return null;
  return unavailableExplanation(availability.reason);
}

function countBy<T>(rows: readonly T[], predicate: (row: T) => boolean): number {
  return rows.reduce((count, row) => (predicate(row) ? count + 1 : count), 0);
}

function evidenceAttention(state: ReviewEvidenceState): boolean {
  return (
    state === "not_complete" ||
    state === "completed_with_corrective_action" ||
    state === "unavailable"
  );
}

function coverageAttention(state: ReviewCoverageState): boolean {
  return state === "at_risk" || state === "uncovered" || state === "unavailable";
}

function milestoneKindLabel(kind: ReviewMilestoneItem["kind"]): string {
  switch (kind) {
    case "SERVERY_READY":
      return "Servery Ready";
    case "MEAL_SERVICE_STARTED":
      return "Meal Service Started";
    case "KEY_TIME":
      return "Key Time";
  }
}

export function milestoneVarianceLabel(input: {
  serviceDate: string;
  timezone: string;
  expectedTimeLocal: string | null;
  actualOccurredAt: string | null;
}): string | null {
  if (!input.expectedTimeLocal || !input.actualOccurredAt) return null;
  const probe = new Date(`${input.serviceDate}T17:00:00.000Z`);
  const expected = parseFacilityLocalScheduledStart(
    input.expectedTimeLocal,
    probe,
    input.timezone,
  );
  if (!expected) return null;
  const actual = new Date(input.actualOccurredAt);
  if (Number.isNaN(actual.getTime())) return null;
  const minutes = Math.round((actual.getTime() - expected.getTime()) / 60_000);
  if (minutes === 0) return "On time";
  if (minutes > 0) return `${minutes} min late`;
  return `${Math.abs(minutes)} min early`;
}

function presentEvidence(
  row: ReviewEvidenceOccurrence,
  locations: readonly ReviewLocationEntry[],
  timezone: string,
): PresentedEvidenceRow {
  const recordedLater =
    Boolean(row.recordedAt) &&
    facilityDateKeyOfInstant(row.recordedAt!, timezone) > row.operationalDateKey;
  return {
    requirementKey: row.requirementKey,
    spaceId: row.spaceId,
    locationLabel: locationLabelFor(row.spaceId, locations),
    requirementLabel: row.slotLabel.trim() || humanizeKey(row.catalogStableKey),
    windowLabel:
      row.windowStartLocal && row.windowEndLocal
        ? `${formatClock(row.windowStartLocal)}–${formatClock(row.windowEndLocal)}`
        : formatClock(row.windowStartLocal),
    state: row.state,
    stateLabel: evidenceStateLabel(row.state),
    attention: evidenceAttention(row.state),
    recordId: row.recordId,
    recordHref: row.recordId ? `/staffing/logs/records/${row.recordId}` : null,
    occurredAtLabel: formatInstant(row.occurredAt, timezone),
    recordedAtLabel: formatInstant(row.recordedAt, timezone),
    recordedLater,
  };
}

function compareLabel(a: string, b: string): number {
  return a.localeCompare(b);
}

export function presentOperationalReviewDay(
  model: OperationalReviewDayViewModel,
  options?: { spaceId?: string | null; todayKey?: string | null },
): OperationalReviewDayPresentation {
  const spaceId = options?.spaceId?.trim() || null;
  const locations = spaceId
    ? model.locations.filter((row) => row.spaceId === spaceId)
    : [...model.locations].sort((a, b) => compareLabel(a.displayLabel, b.displayLabel));

  const locationIds = new Set(locations.map((row) => row.spaceId));
  const matchesSpace = (id: string | null) => !spaceId || (id != null && locationIds.has(id));

  const evidenceRows = model.evidence.occurrences
    .filter((row) => matchesSpace(row.spaceId))
    .map((row) => presentEvidence(row, model.locations, model.timezone))
    .sort((a, b) => {
      if (a.attention !== b.attention) return a.attention ? -1 : 1;
      const location = compareLabel(a.locationLabel, b.locationLabel);
      if (location !== 0) return location;
      return compareLabel(a.requirementLabel, b.requirementLabel);
    });

  const coverageSlots = model.coverage.slots
    .filter((row) => matchesSpace(row.spaceId))
    .map((row): PresentedCoverageRow => ({
      spaceId: row.spaceId,
      locationLabel: locationLabelFor(row.spaceId, model.locations),
      cycleLabel: row.cycleLabel,
      roleLabel: row.roleLabel,
      requiredCount: row.requiredCount,
      assignedCount: row.filledCount,
      state: row.state,
      stateLabel: coverageStateLabel(row.state),
      attention: coverageAttention(row.state),
    }))
    .sort((a, b) => {
      if (a.attention !== b.attention) return a.attention ? -1 : 1;
      const location = compareLabel(a.locationLabel, b.locationLabel);
      if (location !== 0) return location;
      return compareLabel(a.roleLabel, b.roleLabel);
    });

  const assignments = model.coverage.assignments.filter((row) => {
    if (!spaceId) return true;
    return row.coveredSpaceIds.includes(spaceId) || locations.some((loc) => loc.parentUnitId === row.unitId);
  });

  const milestoneItems = model.milestones.items.filter((row) => matchesSpace(row.spaceId) || !row.spaceId);
  const cycles = [...model.cycles.versions]
    .filter((cycle) => !spaceId || cycle.spaceIds.length === 0 || cycle.spaceIds.includes(spaceId))
    .sort((a, b) => compareLabel(a.startLocal ?? "", b.startLocal ?? "") || compareLabel(a.label, b.label))
    .map((cycle): PresentedServiceCycle => {
      const items = milestoneItems
        .filter((row) => row.cycleStableKey === cycle.stableKey)
        .map((row): PresentedMilestoneRow => ({
          kindLabel: milestoneKindLabel(row.kind),
          expectedTimeLabel: formatClock(row.expectedTimeLocal),
          actualTimeLabel: formatInstant(row.actualOccurredAt, model.timezone),
          varianceLabel: milestoneVarianceLabel({
            serviceDate: model.serviceDate,
            timezone: model.timezone,
            expectedTimeLocal: row.expectedTimeLocal,
            actualOccurredAt: row.actualOccurredAt,
          }),
          missing: !row.actualOccurredAt,
          spaceId: row.spaceId,
        }));
      return {
        stableKey: cycle.stableKey,
        label: cycle.label,
        periodLabel:
          cycle.startLocal && cycle.endLocal
            ? `${formatClock(cycle.startLocal)}–${formatClock(cycle.endLocal)}`
            : formatClock(cycle.startLocal),
        milestones: items,
      };
    });

  const assets = model.assets.impacts
    .filter((row) => matchesSpace(row.spaceId))
    .map((row): PresentedAssetRow => ({
      issueId: row.issueId,
      spaceId: row.spaceId,
      locationLabel: locationLabelFor(row.spaceId, model.locations),
      impactLabel:
        row.operationalImpact === "EQUIPMENT_UNAVAILABLE" ? "Equipment unavailable" : "Service at risk",
      observedAtLabel: formatInstant(row.observedAt, model.timezone) ?? row.observedAt,
      href: `/asset-issues/${row.issueId}`,
    }));

  const missed = countBy(evidenceRows, (row) => row.state === "not_complete");
  const corrective = countBy(evidenceRows, (row) => row.state === "completed_with_corrective_action");
  const evidenceUnavailable = countBy(evidenceRows, (row) => row.state === "unavailable");
  const coverageGaps = countBy(coverageSlots, (row) => row.state === "uncovered" || row.state === "at_risk");
  const missingMilestones = countBy(
    cycles.flatMap((cycle) => cycle.milestones),
    (row) => row.missing,
  );
  const lateMilestones = countBy(
    cycles.flatMap((cycle) => cycle.milestones),
    (row) => Boolean(row.varianceLabel?.includes("late")),
  );

  const summaryItems: ReviewSummaryItem[] = [];
  if (missed > 0) {
    summaryItems.push({
      id: "evidence-missed",
      name: "Evidence missed",
      count: missed,
      label: `${missed} evidence item${missed === 1 ? "" : "s"} missed`,
    });
  }
  if (corrective > 0) {
    summaryItems.push({
      id: "evidence-corrective",
      name: "Corrective actions",
      count: corrective,
      label: `${corrective} completed with corrective action`,
    });
  }
  if (evidenceUnavailable > 0) {
    summaryItems.push({
      id: "evidence-unavailable",
      name: "Evidence unavailable",
      count: evidenceUnavailable,
      label: `${evidenceUnavailable} evidence expectation${evidenceUnavailable === 1 ? "" : "s"} unavailable`,
    });
  }
  if (coverageGaps > 0) {
    summaryItems.push({
      id: "coverage-gaps",
      name: "Coverage gaps",
      count: coverageGaps,
      label: `${coverageGaps} coverage gap${coverageGaps === 1 ? "" : "s"}`,
    });
  }
  if (lateMilestones > 0) {
    const firstLate = cycles
      .flatMap((cycle) => cycle.milestones.map((row) => ({ cycle: cycle.label, row })))
      .find((item) => item.row.varianceLabel?.includes("late"));
    summaryItems.push({
      id: "service-late",
      name: "Late service milestones",
      count: lateMilestones,
      label: firstLate
        ? `${firstLate.row.kindLabel} ${firstLate.row.varianceLabel}`
        : `${lateMilestones} service timing exception${lateMilestones === 1 ? "" : "s"}`,
    });
  } else if (missingMilestones > 0) {
    summaryItems.push({
      id: "service-missing",
      name: "Service not recorded",
      count: missingMilestones,
      label: `${missingMilestones} service milestone${missingMilestones === 1 ? "" : "s"} not recorded`,
    });
  }
  if (assets.length > 0) {
    summaryItems.push({
      id: "assets",
      name: "Asset impacts",
      count: assets.length,
      label: `${assets.length} asset operational impact${assets.length === 1 ? "" : "s"}`,
    });
  }

  const unavailableDomains: ReviewSummaryItem[] = [];
  const pushUnavailable = (id: string, domain: string, availability: ReviewDomainAvailability) => {
    if (availability.status !== "unavailable") return;
    unavailableDomains.push({
      id,
      name: `${domain} unavailable`,
      count: 1,
      label: `${domain}: ${unavailableExplanation(availability.reason)}`,
    });
  };
  pushUnavailable("evidence-domain", "Evidence", model.evidence.availability);
  pushUnavailable("coverage-domain", "Coverage", model.coverage.availability);
  pushUnavailable("service-domain", "Service", model.milestones.availability);

  const presentedLocations: PresentedLocationRow[] = locations.map((location) => {
    const locationEvidence = evidenceRows.filter((row) => row.spaceId === location.spaceId);
    const locationCoverage = coverageSlots.filter((row) => row.spaceId === location.spaceId);
    const locationAssets = assets.filter((row) => row.spaceId === location.spaceId);
    const exceptionCount =
      countBy(locationEvidence, (row) => row.attention) +
      countBy(locationCoverage, (row) => row.attention) +
      locationAssets.length;
    const notes: string[] = [];
    if (locationEvidence.some((row) => row.state === "unavailable")) {
      notes.push("Historical evidence expectation unavailable");
    }
    if (locationCoverage.some((row) => row.state === "unavailable")) {
      notes.push("Historical coverage expectation unavailable");
    }
    return {
      spaceId: location.spaceId,
      displayLabel: location.displayLabel,
      parentUnitId: location.parentUnitId,
      parentUnitLabel: location.parentUnitLabel,
      operationalTypeName: location.operationalTypeName,
      currentLocationHref: location.parentUnitId
        ? `/unit/${location.parentUnitId}?space=${location.spaceId}`
        : null,
      exceptionCount,
      exceptionSummary:
        exceptionCount === 0
          ? "No exceptions"
          : `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"}`,
      availabilityNotes: notes,
    };
  });

  const hasAnyItem =
    presentedLocations.length > 0 ||
    evidenceRows.length > 0 ||
    coverageSlots.length > 0 ||
    cycles.length > 0 ||
    model.presence.scheduled.length > 0 ||
    model.presence.exceptions.length > 0 ||
    assets.length > 0 ||
    unavailableDomains.length > 0;

  return {
    serviceDate: model.serviceDate,
    serviceDateLabel: formatServiceDateLabel(model.serviceDate),
    isToday: Boolean(options?.todayKey && options.todayKey === model.serviceDate),
    facilityLabel: model.facilityLabel,
    departmentId: model.departmentId,
    locationOptions: [...model.locations]
      .sort((a, b) => compareLabel(a.displayLabel, b.displayLabel))
      .map((row) => ({ spaceId: row.spaceId, displayLabel: row.displayLabel })),
    empty: !hasAnyItem,
    quiet: hasAnyItem && summaryItems.length === 0 && unavailableDomains.length === 0,
    summaryItems,
    unavailableDomains,
    locations: presentedLocations,
    evidence: {
      availability: model.evidence.availability,
      unavailableMessage: domainUnavailable(model.evidence.availability),
      attention: evidenceRows.filter((row) => row.attention),
      completed: evidenceRows.filter((row) => !row.attention),
    },
    coverage: {
      availability: model.coverage.availability,
      unavailableMessage: domainUnavailable(model.coverage.availability),
      slots: coverageSlots,
      assignments,
      assignmentEditLimitation: assignments.some((row) => row.locationChangedDuringEdits)
        ? "Some assignments were edited during this service day. Assigned locations shown are the latest recorded state, not a minute-by-minute history."
        : null,
    },
    presence: model.presence,
    service: {
      availability: model.milestones.availability,
      unavailableMessage: domainUnavailable(model.milestones.availability),
      cycles,
    },
    assets: { rows: assets },
  };
}

export function presenceExceptionLabel(kind: OperationalReviewDayViewModel["presence"]["exceptions"][number]["kind"]): string {
  switch (kind) {
    case "called_off":
      return "Call-off";
    case "reassigned":
      return "Reassigned";
    default:
      return "Presence exception";
  }
}
