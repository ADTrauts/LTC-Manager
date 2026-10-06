/**
 * PM Plan Version semantics.
 *
 * Knowledge-style successor drafts. SUPERSEDED remains historically
 * authoritative inside its effective window. DRAFT is never schedule authority.
 * Occurrence.planVersionId is frozen at materialization and is not rewritten.
 */

import type { PreventiveMaintenancePlanVersionStatus } from "@prisma/client";

import type { CivilDate } from "./civil-date";
import { compareCivilDates, parseCivilDate } from "./civil-date";

export const PM_PLAN_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "SUPERSEDED"] as const;

export const PM_OCCURRENCE_STATUSES = ["OPEN", "COMPLETED", "SKIPPED"] as const;

export type PmOccurrenceCalendarState = "UPCOMING" | "DUE" | "OVERDUE";

export type PmOccurrencePresentation =
  | "UPCOMING"
  | "DUE"
  | "OVERDUE"
  | "COMPLETED"
  | "SKIPPED";

export function assertPmPublishedVersionImmutable(
  status: PreventiveMaintenancePlanVersionStatus | string,
) {
  if (status === "PUBLISHED" || status === "SUPERSEDED") {
    throw new Error(
      "Published Preventive Maintenance versions are immutable. Create a successor draft instead.",
    );
  }
}

export function nextPmPlanVersionNumber(existingMax: number | null | undefined): number {
  return (existingMax ?? 0) + 1;
}

export function isHistoricallyPublishedPmVersion(
  status: PreventiveMaintenancePlanVersionStatus | string,
): boolean {
  return status === "PUBLISHED" || status === "SUPERSEDED";
}

export function getOccurrenceCalendarState(input: {
  scheduledDate: CivilDate | Date;
  facilityToday: CivilDate | Date;
}): PmOccurrenceCalendarState {
  const cmp = compareCivilDates(
    parseCivilDate(input.facilityToday),
    parseCivilDate(input.scheduledDate),
  );
  if (cmp < 0) return "UPCOMING";
  if (cmp === 0) return "DUE";
  return "OVERDUE";
}

export function presentPmOccurrence(input: {
  status: string;
  scheduledDate: CivilDate | Date;
  facilityToday: CivilDate | Date;
}): PmOccurrencePresentation {
  if (input.status === "COMPLETED") return "COMPLETED";
  if (input.status === "SKIPPED") return "SKIPPED";
  return getOccurrenceCalendarState(input);
}

export function isPmPriorityPublishable(priority: string): boolean {
  return priority === "LOW" || priority === "MEDIUM" || priority === "HIGH" || priority === "URGENT";
}
