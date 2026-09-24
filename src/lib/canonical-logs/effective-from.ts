/**
 * Prospective effective-from for new Log Attachments.
 * Prefer next operational day so midday attach does not create today's overdue work.
 */

import { nextOperationalDayKey } from "@/lib/operational-cycles/cycle-lifecycle";
import {
  getFacilityServiceDate,
  toServiceDateKey,
} from "@/lib/operational-time";

/**
 * Default effective date for a new Attachment.
 * Always starts next facility operational day when attaching during an active operation
 * (prospective BUILD). Callers may pass an explicit future key.
 */
export function resolveDefaultAttachmentEffectiveFromKey(input: {
  facilityTimezone?: string | null;
  now?: Date;
  /** Explicit override (YYYY-MM-DD). Must not be before tomorrow when prospective. */
  explicitKey?: string | null;
}): { effectiveFromKey: string; startsTomorrow: boolean; label: string } {
  const todayKey = toServiceDateKey(
    getFacilityServiceDate(input.facilityTimezone ?? "UTC", input.now ?? new Date()),
  );
  const tomorrowKey = nextOperationalDayKey(todayKey);
  const effectiveFromKey =
    input.explicitKey && input.explicitKey.trim() >= tomorrowKey
      ? input.explicitKey.trim()
      : tomorrowKey;

  const startsTomorrow = effectiveFromKey === tomorrowKey;
  const label = startsTomorrow
    ? "Starts tomorrow"
    : `Effective ${formatShortServiceDate(effectiveFromKey)}`;

  return { effectiveFromKey, startsTomorrow, label };
}

/** Product copy for an Attachment that is live, or not yet in force. */
export function describeAttachmentStart(input: {
  effectiveFromKey: string;
  todayKey: string;
}): { isUpcoming: boolean; startsOnLabel: string | null; effectiveLabel: string } {
  if (input.effectiveFromKey > input.todayKey) {
    const tomorrowKey = nextOperationalDayKey(input.todayKey);
    const startsOnLabel =
      input.effectiveFromKey === tomorrowKey
        ? "Starts tomorrow"
        : `Starts ${formatShortServiceDate(input.effectiveFromKey)}`;
    return { isUpcoming: true, startsOnLabel, effectiveLabel: startsOnLabel };
  }
  return {
    isUpcoming: false,
    startsOnLabel: null,
    effectiveLabel: `Effective ${formatShortServiceDate(input.effectiveFromKey)}`,
  };
}

export function formatShortServiceDate(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(match[2]) - 1] ?? match[2];
  return `${month} ${Number(match[3])}`;
}
