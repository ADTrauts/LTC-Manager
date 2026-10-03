import type {
  SupportAttachmentRejectionReason,
  SupportAttachmentScanStatus,
  SupportMessageDeliveryStatus,
  SupportTicketEventType,
  SupportTicketMessageKind,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";
import {
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
} from "./labels";

export type SupportTimelineMessage = {
  id: string;
  kind: SupportTicketMessageKind;
  bodyText: string;
  authorName: string | null;
  contactEmail: string | null;
  fromEmail: string | null;
  toEmails: string[];
  deliveryStatus: SupportMessageDeliveryStatus | null;
  deliveryError: string | null;
  sentAt: Date | null;
  deliveredAt?: Date | null;
  bounceType?: string | null;
  bounceDescription?: string | null;
  createdAt: Date;
  fromName?: string | null;
  receivedAt?: Date | null;
  /** False when an inbound email came from someone other than the ticket's requester. */
  fromRequester?: boolean;
  attachments?: SupportTimelineAttachment[];
  autoSubmitted?: boolean;
  possibleSpam?: boolean;
};

export type SupportTimelineAttachment = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  scanStatus: SupportAttachmentScanStatus;
  rejectionReason: SupportAttachmentRejectionReason | null;
};

export type SupportTimelineEvent = {
  id: string;
  type: SupportTicketEventType;
  actorName: string | null;
  causedByMessageId?: string | null;
  fromValue: string | null;
  toValue: string | null;
  metadata: unknown;
  createdAt: Date;
};

export type SupportTimelineItem =
  | { kind: "message"; at: Date; message: SupportTimelineMessage }
  | { kind: "event"; at: Date; event: SupportTimelineEvent };

function rank(item: SupportTimelineItem): number {
  if (item.kind === "event" && item.event.type === "CREATED") return 0;
  return item.kind === "message" ? 1 : 2;
}

/**
 * Messages and events written in one transaction share a timestamp, so ties put CREATED first,
 * then the message, then the state changes it carried.
 */
export function mergeSupportTimeline(
  messages: SupportTimelineMessage[],
  events: SupportTimelineEvent[],
): SupportTimelineItem[] {
  const items: SupportTimelineItem[] = [
    ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...events.map((event) => ({ kind: "event" as const, at: event.createdAt, event })),
  ];
  return items.sort((a, b) => a.at.getTime() - b.at.getTime() || rank(a) - rank(b));
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function statusLabel(value: string | null): string {
  return value ? (SUPPORT_TICKET_STATUS_LABEL[value as SupportTicketStatus] ?? value) : "None";
}

function typeLabel(value: string | null): string {
  return value ? (SUPPORT_TICKET_TYPE_LABEL[value as SupportTicketType] ?? value) : "Unclassified";
}

function priorityLabel(value: string | null): string {
  return value ? (SUPPORT_TICKET_PRIORITY_LABEL[value as SupportTicketPriority] ?? value) : "None";
}

export function describeSupportEvent(event: SupportTimelineEvent): string {
  switch (event.type) {
    case "CREATED": {
      if (metadataString(event.metadata, "migratedFrom")) {
        return "Ticket opened (moved from the earlier Console ticket list; status history before the move wasn't recorded)";
      }
      if (metadataString(event.metadata, "source") !== "EMAIL") return "Ticket opened";
      const previous = metadataString(event.metadata, "previousTicketNumber");
      return previous
        ? `Ticket opened from email (a reply to ${previous}, which is closed)`
        : "Ticket opened from email";
    }
    case "STATUS_CHANGED": {
      const change = `Status changed from ${statusLabel(event.fromValue)} to ${statusLabel(event.toValue)}`;
      return !event.actorName && event.causedByMessageId ? `${change} because the customer replied` : change;
    }
    case "PRIORITY_CHANGED":
      return `Priority changed from ${priorityLabel(event.fromValue)} to ${priorityLabel(event.toValue)}`;
    case "TYPE_CHANGED":
      return `Type changed from ${typeLabel(event.fromValue)} to ${typeLabel(event.toValue)}`;
    case "ASSIGNMENT_CHANGED": {
      const from = metadataString(event.metadata, "fromStaffName");
      const to = metadataString(event.metadata, "toStaffName");
      if (!event.toValue) return from ? `Unassigned from ${from}` : "Unassigned";
      return from ? `Reassigned from ${from} to ${to ?? "staff"}` : `Assigned to ${to ?? "staff"}`;
    }
    case "FACILITY_CHANGED": {
      const from = metadataString(event.metadata, "fromFacilityName");
      const to = metadataString(event.metadata, "toFacilityName");
      if (!event.toValue) return from ? `Facility ${from} removed` : "Facility removed";
      return from ? `Facility changed from ${from} to ${to ?? "a facility"}` : `Facility set to ${to ?? "a facility"}`;
    }
    case "CONTACT_CHANGED":
      return "Requester changed";
    case "SUBJECT_CHANGED":
      return `Subject changed to “${event.toValue ?? ""}”`;
    case "EMAIL_BOUNCED":
      return "Outbound email bounced";
    case "EMAIL_COMPLAINT":
      return "Customer marked a reply as spam";
  }
}
