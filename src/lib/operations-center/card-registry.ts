/**
 * Exception-first card order for Operations Center (SCR-01).
 * Secondary content (log board, birthdays) follows operational cards.
 */
export const OPERATIONS_CENTER_CARD_IDS = [
  "unit-exceptions",
  "open-repairs",
  "staffing-gaps",
  "call-downs",
  "compliance-summary",
  "meal-boards",
  "unit-log-board",
] as const;

export type OperationsCenterCardId = (typeof OPERATIONS_CENTER_CARD_IDS)[number];

export function getOperationsCenterCardOrder(): OperationsCenterCardId[] {
  return [...OPERATIONS_CENTER_CARD_IDS];
}
