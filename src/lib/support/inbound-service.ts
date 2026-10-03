import { Prisma, type PrismaClient, type SupportTicketStatus } from "@prisma/client";

import { persistInboundSupportAttachments } from "./attachments";
import type { SupportAttachmentStore } from "./attachment-store";
import { upsertSupportContact } from "./contacts";
import { generateSupportReplyToken } from "./identifiers";
import { type InboundSupportEmail, normalizeInboundSubject, parseTicketMarkers } from "./inbound-email";
import { applySupportTicketStatusChange } from "./ticket-service";
import { formatSupportTicketNumber } from "./ticket-number";

type Tx = Prisma.TransactionClient;

export type SupportInboundRouting = "reply_token" | "in_reply_to" | "references" | "subject_marker" | "new_ticket";

export type SupportInboundResult =
  | {
      result: "created" | "attached";
      ticketId: string;
      ticketNumber: number;
      messageId: string;
      routing: SupportInboundRouting;
      /** Set when the matched ticket was CLOSED and this email opened a follow-up ticket. */
      followUpOfTicketNumber: number | null;
      statusChanged: boolean;
    }
  | { result: "duplicate"; ticketId: string; ticketNumber: number; messageId: string }
  | { result: "ignored"; reason: "own_address" };

type RoutedTicket = {
  id: string;
  number: number;
  status: SupportTicketStatus;
  resolvedAt: Date | null;
  closedAt: Date | null;
  contactId: string;
};

type Route =
  | { kind: "existing"; ticket: RoutedTicket; routing: SupportInboundRouting }
  | { kind: "new"; routing: SupportInboundRouting; previous: RoutedTicket | null };

const ROUTED_TICKET_SELECT = {
  id: true,
  number: true,
  status: true,
  resolvedAt: true,
  closedAt: true,
  contactId: true,
} as const;

const REPLY_TOKEN_PATTERN = /^[0-9a-f]{32,40}$/;
const REOPEN_ON_CUSTOMER_REPLY: ReadonlySet<SupportTicketStatus> = new Set(["WAITING_ON_CUSTOMER", "RESOLVED"]);

function routeTo(ticket: RoutedTicket, routing: SupportInboundRouting): Route {
  return ticket.status === "CLOSED"
    ? { kind: "new", routing, previous: ticket }
    : { kind: "existing", ticket, routing };
}

async function ticketForMessageIds(tx: Tx, ids: string[]): Promise<RoutedTicket | null> {
  if (ids.length === 0) return null;
  const rows = await tx.supportTicketMessage.findMany({
    where: { internetMessageId: { in: ids } },
    distinct: ["ticketId"],
    select: { ticket: { select: ROUTED_TICKET_SELECT } },
    take: 2,
  });
  return rows.length === 1 ? rows[0].ticket : null;
}

/**
 * Reply token first (authoritative), then In-Reply-To, then References, then a `[VSS-n]` subject
 * marker from the ticket's own requester. Ambiguous signals never pick a ticket.
 */
async function resolveRoute(tx: Tx, email: InboundSupportEmail, contactId: string): Promise<Route> {
  const tokens = email.mailboxHashes.filter((hash) => REPLY_TOKEN_PATTERN.test(hash));
  if (tokens.length > 0) {
    const tickets = await tx.supportTicket.findMany({
      where: { replyToken: { in: tokens } },
      select: ROUTED_TICKET_SELECT,
      take: 2,
    });
    if (tickets.length === 1) return routeTo(tickets[0], "reply_token");
  }

  if (email.inReplyTo) {
    const ticket = await ticketForMessageIds(tx, [email.inReplyTo]);
    if (ticket) return routeTo(ticket, "in_reply_to");
  }
  const referenced = await ticketForMessageIds(tx, email.references);
  if (referenced) return routeTo(referenced, "references");

  const markers = parseTicketMarkers(email.subject);
  if (markers.length === 1) {
    const ticket = await tx.supportTicket.findUnique({
      where: { number: markers[0] },
      select: ROUTED_TICKET_SELECT,
    });
    if (ticket && ticket.contactId === contactId) return routeTo(ticket, "subject_marker");
  }

  return { kind: "new", routing: "new_ticket", previous: null };
}

async function findDuplicate(
  db: PrismaClient,
  email: InboundSupportEmail,
): Promise<Extract<SupportInboundResult, { result: "duplicate" }> | null> {
  const select = { id: true, ticket: { select: { id: true, number: true } } } as const;
  const prior =
    (await db.supportTicketMessage.findUnique({
      where: { providerMessageId: email.providerMessageId },
      select,
    })) ??
    // The same email delivered to two Vssyl addresses arrives with two Postmark ids.
    (email.internetMessageId
      ? await db.supportTicketMessage.findFirst({
          where: { kind: "INBOUND", internetMessageId: email.internetMessageId, fromEmail: email.fromEmail },
          select,
        })
      : null);
  return prior
    ? { result: "duplicate", ticketId: prior.ticket.id, ticketNumber: prior.ticket.number, messageId: prior.id }
    : null;
}

function uniqueTarget(error: unknown): string[] | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.map(String) : [String(target ?? "")];
}

async function recordInbound(
  db: PrismaClient,
  email: InboundSupportEmail,
  now: Date,
): Promise<Extract<SupportInboundResult, { result: "created" | "attached" }>> {
  return db.$transaction(async (tx) => {
    const contact = await upsertSupportContact(tx, { email: email.fromEmail, displayName: email.fromName });
    const route = await resolveRoute(tx, email, contact.id);

    let ticket: { id: string; number: number };
    if (route.kind === "new") {
      ticket = await tx.supportTicket.create({
        data: {
          replyToken: generateSupportReplyToken(),
          subject: normalizeInboundSubject(email.subject),
          status: "NEW",
          type: null,
          priority: "NORMAL",
          contactId: contact.id,
          facilityId: contact.facilityId,
          assignedStaffId: null,
        },
        select: { id: true, number: true },
      });
      await tx.supportTicketEvent.create({
        data: {
          ticketId: ticket.id,
          type: "CREATED",
          actorStaffId: null,
          toValue: "NEW",
          metadata: {
            source: "EMAIL",
            providerMessageId: email.providerMessageId,
            facilityId: contact.facilityId,
            ...(route.previous
              ? {
                  previousTicketId: route.previous.id,
                  previousTicketNumber: formatSupportTicketNumber(route.previous.number),
                  previousTicketRouting: route.routing,
                }
              : {}),
          },
        },
      });
    } else {
      ticket = route.ticket;
    }

    const message = await tx.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        kind: "INBOUND",
        contactId: contact.id,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        strippedReplyText: email.strippedReplyText,
        fromEmail: email.fromEmail,
        fromName: email.fromName,
        toEmails: email.toEmails,
        ccEmails: email.ccEmails,
        replyTo: email.replyTo,
        subject: email.subject,
        providerMessageId: email.providerMessageId,
        internetMessageId: email.internetMessageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        inboundHeaders: email.headers,
        ...(email.attachments.length > 0 ? { attachmentManifest: email.attachments } : {}),
        receivedAt: now,
      },
      select: { id: true },
    });

    let statusChanged = false;
    if (route.kind === "existing" && !email.autoSubmitted && REOPEN_ON_CUSTOMER_REPLY.has(route.ticket.status)) {
      statusChanged = await applySupportTicketStatusChange(tx, {
        ticket: route.ticket,
        to: "OPEN",
        actorStaffId: null,
        causedByMessageId: message.id,
        now,
      });
    }
    await tx.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: now } });

    return {
      result: route.kind === "new" ? "created" : "attached",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      messageId: message.id,
      routing: route.routing,
      followUpOfTicketNumber: route.kind === "new" ? (route.previous?.number ?? null) : null,
      statusChanged,
    };
  });
}

/**
 * Records one Postmark inbound email. Safe to call repeatedly with the same email: the unique
 * providerMessageId is the final guard, and a lost race reports the winner as a duplicate.
 */
export async function processInboundSupportEmail(
  db: PrismaClient,
  email: InboundSupportEmail,
  options: {
    now?: Date;
    isOwnAddress?: (address: string) => boolean;
    attachmentContents?: Array<string | null>;
    attachmentStore?: SupportAttachmentStore | null;
    logger?: Pick<Console, "info" | "warn" | "error">;
  } = {},
): Promise<SupportInboundResult> {
  if (options.isOwnAddress?.(email.fromEmail)) {
    return { result: "ignored", reason: "own_address" };
  }
  const shouldPersistAttachments =
    options.attachmentContents !== undefined || options.attachmentStore !== undefined;

  const persist = (ticketId: string, messageId: string) =>
    shouldPersistAttachments
      ? persistInboundSupportAttachments(db, {
          ticketId,
          messageId,
          attachments: email.attachments,
          contents: options.attachmentContents,
          store: options.attachmentStore,
          logger: options.logger,
        })
      : Promise.resolve();

  const prior = await findDuplicate(db, email);
  if (prior) {
    await persist(prior.ticketId, prior.messageId);
    return prior;
  }

  const now = options.now ?? new Date();
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await recordInbound(db, email, now);
      await persist(result.ticketId, result.messageId);
      return result;
    } catch (error) {
      const target = uniqueTarget(error);
      if (!target) throw error;
      if (target.some((field) => field.includes("providerMessageId"))) {
        const raced = await findDuplicate(db, email);
        if (raced) {
          await persist(raced.ticketId, raced.messageId);
          return raced;
        }
      }
      // A concurrent email from the same new sender created the contact first.
      if (attempt === 0 && target.some((field) => field.includes("email"))) continue;
      throw error;
    }
  }
}
