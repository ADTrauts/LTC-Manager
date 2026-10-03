/**
 * Outbound Postmark webhook payloads, shaped like the documented JSON.
 * https://postmarkapp.com/developer/webhooks/delivery-webhook
 * https://postmarkapp.com/developer/webhooks/bounce-webhook
 * https://postmarkapp.com/developer/webhooks/spam-complaint-webhook
 */

export function postmarkDeliveryPayload(options: { messageId?: string; deliveredAt?: string } = {}) {
  return {
    RecordType: "Delivery",
    MessageStream: "outbound",
    ServerID: 23,
    MessageID: options.messageId ?? "883953f4-6105-42a2-a16a-77a8eac79483",
    Recipient: "customer@example.com",
    Tag: "console-ticket-reply",
    DeliveredAt: options.deliveredAt ?? "2026-10-03T14:42:00.0000000Z",
    Details: "250 2.0.0 OK",
    Metadata: { supportTicketNumber: "VSS-1001" },
  };
}

export function postmarkBouncePayload(
  options: {
    messageId?: string;
    type?: string;
    typeCode?: number;
    description?: string;
    inactive?: boolean;
    bouncedAt?: string;
  } = {},
) {
  return {
    RecordType: "Bounce",
    MessageStream: "outbound",
    ID: 692560173,
    Type: options.type ?? "HardBounce",
    TypeCode: options.typeCode ?? 1,
    Name: options.type === "SoftBounce" ? "Soft bounce" : "Hard bounce",
    Tag: "console-ticket-reply",
    MessageID: options.messageId ?? "883953f4-6105-42a2-a16a-77a8eac79483",
    Metadata: { supportTicketNumber: "VSS-1001" },
    ServerID: 23,
    Description:
      options.description ??
      "The server was unable to deliver your message (ex: unknown user, mailbox not found).",
    Details: "Test bounce details",
    Email: "customer@example.com",
    From: "support@vssyl.com",
    BouncedAt: options.bouncedAt ?? "2026-10-03T14:43:00.0000000Z",
    DumpAvailable: false,
    Inactive: options.inactive ?? true,
    CanActivate: true,
    Subject: "[VSS-1001] Test",
  };
}

export function postmarkSpamComplaintPayload(options: { messageId?: string; bouncedAt?: string } = {}) {
  return {
    RecordType: "SpamComplaint",
    MessageStream: "outbound",
    ID: 692560174,
    Type: "SpamComplaint",
    TypeCode: 100001,
    Name: "Spam complaint",
    Tag: "console-ticket-reply",
    MessageID: options.messageId ?? "883953f4-6105-42a2-a16a-77a8eac79483",
    Metadata: { supportTicketNumber: "VSS-1001" },
    ServerID: 23,
    Description: "The subscriber explicitly marked this message as spam.",
    Details: "Test spam complaint details",
    Email: "customer@example.com",
    From: "support@vssyl.com",
    BouncedAt: options.bouncedAt ?? "2026-10-03T14:44:00.0000000Z",
    DumpAvailable: false,
    Inactive: true,
    CanActivate: false,
    Subject: "[VSS-1001] Test",
  };
}
