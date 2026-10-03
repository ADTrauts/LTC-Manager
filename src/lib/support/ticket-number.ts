export const SUPPORT_TICKET_NUMBER_PREFIX = "VSS";

export function formatSupportTicketNumber(number: number): string {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Invalid support ticket number: ${number}`);
  }
  return `${SUPPORT_TICKET_NUMBER_PREFIX}-${number}`;
}

/** Customer-visible email subject: `[VSS-1001] Cooler logs not saving`. */
export function formatSupportEmailSubject(number: number, subject: string): string {
  const tag = `[${formatSupportTicketNumber(number)}]`;
  const trimmed = subject.trim();
  return trimmed ? `${tag} ${trimmed}` : tag;
}

const TICKET_NUMBER_MIN = 1001;

/**
 * Exact ticket-number lookup. Accepts `VSS-1002`, `vss-1002`, `[VSS-1002]`, or `1002`.
 * Bare digits must be at least four characters and at least 1001 so "7" or "42" stay text search.
 */
export function parseSupportTicketNumberQuery(raw: string): number | null {
  const trimmed = raw.trim();
  const prefixed = trimmed.match(/^\[?(?:vss)[-–—](\d+)\]?$/i);
  const digits = prefixed?.[1] ?? (/^\d{4,}$/.test(trimmed) ? trimmed : null);
  if (!digits) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) && number >= TICKET_NUMBER_MIN ? number : null;
}
