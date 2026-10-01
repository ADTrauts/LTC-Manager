export type SupportTicketErrorCode =
  | "invalid_input"
  | "not_found"
  | "invalid_transition"
  | "ticket_closed"
  | "conflict"
  | "invalid_reference"
  | "submission_mismatch";

export const SUPPORT_TICKET_ERROR_MESSAGE: Record<SupportTicketErrorCode, string> = {
  invalid_input: "Check the form fields and try again.",
  not_found: "That ticket no longer exists.",
  invalid_transition: "That status change isn't allowed from the ticket's current status.",
  ticket_closed: "Closed tickets are final and can't be changed or replied to.",
  conflict: "Someone else changed this ticket. Review the latest version and try again.",
  invalid_reference: "The selected facility or staff member isn't available.",
  submission_mismatch: "This form was already submitted for a different ticket.",
};

export class SupportTicketError extends Error {
  readonly code: SupportTicketErrorCode;

  constructor(code: SupportTicketErrorCode) {
    super(SUPPORT_TICKET_ERROR_MESSAGE[code]);
    this.name = "SupportTicketError";
    this.code = code;
  }
}

export function isSupportTicketErrorCode(value: unknown): value is SupportTicketErrorCode {
  return typeof value === "string" && value in SUPPORT_TICKET_ERROR_MESSAGE;
}
