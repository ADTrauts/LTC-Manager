/**
 * Deterministic PM calendar schedule.
 *
 * Canonical primitive: intervalMonths + facility-local anchorDate.
 * Completion is not an input. Late work never shifts the next date.
 *
 * Projected scheduled dates are not PreventiveMaintenanceOccurrence rows.
 * An occurrence is persisted only when the generation-lead window is entered,
 * freezing that date's governing Plan Version.
 */

import {
  type CivilDate,
  civilDateParts,
  compareCivilDates,
  fromCivilParts,
  lastCivilDayOfMonth,
  parseCivilDate,
} from "./civil-date";

export type PmVersionScheduleAuthority = {
  id: string;
  status: string;
  effectiveDate: CivilDate | Date | null;
  intervalMonths: number;
  anchorDate: CivilDate | Date;
};

export type PmVersionMaterializationAuthority = PmVersionScheduleAuthority & {
  generationLeadDays: number;
};

export type ProjectedPmScheduledDate = {
  scheduledDate: CivilDate;
  planVersionId: string;
};

export function addMonthsClamped(anchorDate: CivilDate | Date, months: number): CivilDate {
  if (!Number.isInteger(months)) {
    throw new Error("months must be an integer.");
  }
  const { year, month, day } = civilDateParts(parseCivilDate(anchorDate));
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const dim = lastCivilDayOfMonth(targetYear, targetMonth);
  return fromCivilParts(targetYear, targetMonth, Math.min(day, dim));
}

export function addCivilDays(date: CivilDate | Date, days: number): CivilDate {
  if (!Number.isInteger(days)) {
    throw new Error("days must be an integer.");
  }
  const { year, month, day } = civilDateParts(parseCivilDate(date));
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return fromCivilParts(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function getMaterializationDate(
  scheduledDate: CivilDate | Date,
  generationLeadDays: number,
): CivilDate {
  if (!Number.isInteger(generationLeadDays) || generationLeadDays < 0) {
    throw new Error("generationLeadDays must be an integer >= 0.");
  }
  return addCivilDays(scheduledDate, -generationLeadDays);
}

export function isOccurrenceEligibleForMaterialization(input: {
  scheduledDate: CivilDate | Date;
  generationLeadDays: number;
  facilityToday: CivilDate | Date;
}): boolean {
  return (
    compareCivilDates(
      getMaterializationDate(input.scheduledDate, input.generationLeadDays),
      parseCivilDate(input.facilityToday),
    ) <= 0
  );
}

export function firstScheduledDateOnOrAfter(input: {
  intervalMonths: number;
  anchorDate: CivilDate | Date;
  onOrAfter: CivilDate | Date;
}): CivilDate {
  const interval = assertIntervalMonths(input.intervalMonths);
  const origin = parseCivilDate(input.anchorDate);
  const onOrAfter = parseCivilDate(input.onOrAfter);
  const originParts = civilDateParts(origin);
  const afterParts = civilDateParts(onOrAfter);
  const monthDelta =
    (afterParts.year - originParts.year) * 12 + (afterParts.month - originParts.month);
  let steps = Math.max(0, Math.floor(monthDelta / interval));
  let candidate = addMonthsClamped(origin, steps * interval);
  while (compareCivilDates(candidate, onOrAfter) < 0) {
    steps += 1;
    candidate = addMonthsClamped(origin, steps * interval);
  }
  return candidate;
}

export function enumerateScheduledDates(input: {
  intervalMonths: number;
  anchorDate: CivilDate | Date;
  fromInclusive: CivilDate | Date;
  throughInclusive: CivilDate | Date;
}): CivilDate[] {
  const interval = assertIntervalMonths(input.intervalMonths);
  const origin = parseCivilDate(input.anchorDate);
  const from = parseCivilDate(input.fromInclusive);
  const through = parseCivilDate(input.throughInclusive);
  if (compareCivilDates(from, through) > 0) return [];

  const dates: CivilDate[] = [];
  let cursor = firstScheduledDateOnOrAfter({
    intervalMonths: interval,
    anchorDate: origin,
    onOrAfter: from,
  });
  const originParts = civilDateParts(origin);
  const cursorParts = civilDateParts(cursor);
  let steps =
    ((cursorParts.year - originParts.year) * 12 + (cursorParts.month - originParts.month)) /
    interval;
  steps = Math.round(steps);
  while (compareCivilDates(cursor, through) <= 0) {
    dates.push(cursor);
    steps += 1;
    cursor = addMonthsClamped(origin, steps * interval);
  }
  return dates;
}

function historicallyPublished(status: string): boolean {
  return status === "PUBLISHED" || status === "SUPERSEDED";
}

export function getVersionForScheduledDate<T extends PmVersionScheduleAuthority>(
  versions: readonly T[],
  scheduledDate: CivilDate | Date,
): T | null {
  const date = parseCivilDate(scheduledDate);
  const eligible = versions
    .filter((row) => historicallyPublished(row.status) && row.effectiveDate)
    .filter((row) => compareCivilDates(parseCivilDate(row.effectiveDate!), date) <= 0)
    .sort((a, b) => {
      const byEffective = compareCivilDates(
        parseCivilDate(a.effectiveDate!),
        parseCivilDate(b.effectiveDate!),
      );
      if (byEffective !== 0) return byEffective;
      return a.id.localeCompare(b.id);
    });
  return eligible[eligible.length - 1] ?? null;
}

/**
 * Projected cadence dates for a versioned Plan.
 * Does not persist PreventiveMaintenanceOccurrence rows.
 * After a successor effectiveDate, unmaterialized prior-cadence dates are dropped.
 */
export function projectPmSchedule(
  versions: readonly PmVersionScheduleAuthority[],
  input: {
    fromInclusive: CivilDate | Date;
    throughInclusive: CivilDate | Date;
  },
): ProjectedPmScheduledDate[] {
  const from = parseCivilDate(input.fromInclusive);
  const through = parseCivilDate(input.throughInclusive);
  const projected: ProjectedPmScheduledDate[] = [];
  const seen = new Set<CivilDate>();

  for (const version of versions) {
    if (!historicallyPublished(version.status) || !version.effectiveDate) continue;
    const windowStart =
      compareCivilDates(parseCivilDate(version.effectiveDate), from) > 0
        ? parseCivilDate(version.effectiveDate)
        : from;
    if (compareCivilDates(windowStart, through) > 0) continue;
    const dates = enumerateScheduledDates({
      intervalMonths: version.intervalMonths,
      anchorDate: version.anchorDate,
      fromInclusive: windowStart,
      throughInclusive: through,
    });
    for (const scheduledDate of dates) {
      const governing = getVersionForScheduledDate(versions, scheduledDate);
      if (governing?.id !== version.id) continue;
      if (seen.has(scheduledDate)) continue;
      seen.add(scheduledDate);
      projected.push({ scheduledDate, planVersionId: version.id });
    }
  }

  return projected.sort((a, b) => compareCivilDates(a.scheduledDate, b.scheduledDate));
}

/**
 * Scheduled dates whose materialization date is on or before Facility today.
 * Uses projectPmSchedule from the first effective date through today + max lead.
 * Does not persist rows. Does not invent dates before the first effective schedule.
 */
export function projectEligiblePmMaterializationDates(
  versions: readonly PmVersionMaterializationAuthority[],
  facilityToday: CivilDate | Date,
): ProjectedPmScheduledDate[] {
  const today = parseCivilDate(facilityToday);
  const authoritative = versions.filter(
    (row) => historicallyPublished(row.status) && row.effectiveDate,
  );
  if (authoritative.length === 0) return [];
  const maxLead = authoritative.reduce(
    (max, row) => Math.max(max, row.generationLeadDays),
    0,
  );
  const from = authoritative
    .map((row) => parseCivilDate(row.effectiveDate!))
    .reduce((earliest, date) => (compareCivilDates(date, earliest) < 0 ? date : earliest));
  const through = addCivilDays(today, maxLead);
  const projected = projectPmSchedule(authoritative, {
    fromInclusive: from,
    throughInclusive: through,
  });
  const byId = new Map(authoritative.map((row) => [row.id, row]));
  return projected.filter((row) => {
    const version = byId.get(row.planVersionId);
    if (!version) return false;
    return isOccurrenceEligibleForMaterialization({
      scheduledDate: row.scheduledDate,
      generationLeadDays: version.generationLeadDays,
      facilityToday: today,
    });
  });
}

export function governingPlanVersionId(input: {
  occurrence: { planVersionId: string } | null;
  versions: readonly PmVersionScheduleAuthority[];
  scheduledDate: CivilDate | Date;
}): string | null {
  if (input.occurrence) return input.occurrence.planVersionId;
  return getVersionForScheduledDate(input.versions, input.scheduledDate)?.id ?? null;
}

function assertIntervalMonths(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("intervalMonths must be an integer >= 1.");
  }
  return value;
}
