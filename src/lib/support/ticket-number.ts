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
