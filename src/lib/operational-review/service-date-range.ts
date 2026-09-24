/**
 * Facility service-date range helpers. Civil YYYY-MM-DD keys only.
 * Does not use browser/UTC calendar shortcuts as operational authority.
 */

import { toServiceDateKey } from "@/lib/operational-time";

import { isReviewServiceDateKey } from "./present-operational-review-day";

export const MAX_REVIEW_RANGE_DAYS = 31;

export type ReviewRangeValidationCode =
  | "invalid_dates"
  | "start_after_end"
  | "exceeds_limit"
  | "future_range";

export type ReviewRangeValidation =
  | { ok: true; start: string; end: string; keys: string[] }
  | { ok: false; code: ReviewRangeValidationCode; message: string };

export function addServiceDateKey(serviceDate: string, days: number): string {
  const [year, month, day] = serviceDate.split("-").map(Number);
  return toServiceDateKey(new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + days)));
}

export function enumerateServiceDateKeys(start: string, end: string): string[] {
  if (!isReviewServiceDateKey(start) || !isReviewServiceDateKey(end) || start > end) {
    return [];
  }
  const keys: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    keys.push(cursor);
    cursor = addServiceDateKey(cursor, 1);
    if (keys.length > MAX_REVIEW_RANGE_DAYS + 1) break;
  }
  return keys;
}

export function validateReviewRange(input: {
  start?: string | null;
  end?: string | null;
  todayKey: string;
}): ReviewRangeValidation {
  const start = input.start?.trim() ?? "";
  const end = input.end?.trim() ?? "";
  if (!isReviewServiceDateKey(start) || !isReviewServiceDateKey(end)) {
    return {
      ok: false,
      code: "invalid_dates",
      message: "Enter a start and end facility service date.",
    };
  }
  if (start > end) {
    return {
      ok: false,
      code: "start_after_end",
      message: "Start service date must be on or before the end service date.",
    };
  }
  if (start > input.todayKey || end > input.todayKey) {
    return {
      ok: false,
      code: "future_range",
      message: "Canonical Review includes only service dates through the current facility service day.",
    };
  }
  const keys = enumerateServiceDateKeys(start, end);
  if (keys.length === 0 || keys.length > MAX_REVIEW_RANGE_DAYS) {
    return {
      ok: false,
      code: "exceeds_limit",
      message: `Choose a range of ${MAX_REVIEW_RANGE_DAYS} service days or fewer.`,
    };
  }
  return { ok: true, start, end, keys };
}

export function reviewRangeValidationLabel(code: ReviewRangeValidationCode): string {
  switch (code) {
    case "invalid_dates":
      return "Enter a start and end facility service date.";
    case "start_after_end":
      return "Start service date must be on or before the end service date.";
    case "exceeds_limit":
      return `Choose a range of ${MAX_REVIEW_RANGE_DAYS} service days or fewer.`;
    case "future_range":
      return "Canonical Review includes only service dates through the current facility service day.";
  }
}
