import type {
  PrismaClient,
  SupportMessageDeliveryStatus,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";

import {
  isExactSupportTicketNumberQuery,
  parseSupportListQuery,
  SUPPORT_LIST_PAGE_SIZE,
  supportListWhere,
  type SupportListParamInput,
  type SupportListQuery,
} from "./list-query";

export type SupportTicketListRow = {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
  type: SupportTicketType | null;
  priority: SupportTicketPriority;
  updatedAt: Date;
  contact: { email: string; displayName: string | null };
  facility: { displayName: string } | null;
  assignedStaff: { displayName: string } | null;
  tags: { name: string; normalizedName: string }[];
  latestOutboundDeliveryStatus: SupportMessageDeliveryStatus | null;
};

export type SupportTicketListResult = {
  query: SupportListQuery;
  tickets: SupportTicketListRow[];
  total: number;
  pageCount: number;
  exactTicketNumberHit: boolean;
};

export async function listSupportTickets(
  db: PrismaClient,
  input: { staffId: string; params?: SupportListParamInput; now?: Date; pageSize?: number },
): Promise<SupportTicketListResult> {
  const query = parseSupportListQuery(input.params ?? {});
  if (input.pageSize && input.pageSize > 0) {
    query.pageSize = input.pageSize;
  }
  const exactNumber = isExactSupportTicketNumberQuery(query) ? query.ticketNumber : null;
  const exactTicket =
    exactNumber === null
      ? null
      : await db.supportTicket.findUnique({
          where: { number: exactNumber },
          select: { id: true },
        });

  const where = supportListWhere(query, {
    staffId: input.staffId,
    now: input.now,
    exactTicketExists: Boolean(exactTicket),
  });
  const skip = exactTicket ? 0 : (query.page - 1) * query.pageSize;
  const [tickets, total] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: { updatedAt: query.sort === "updatedAt_asc" ? "asc" : "desc" },
      skip,
      take: query.pageSize,
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        type: true,
        priority: true,
        updatedAt: true,
        contact: { select: { email: true, displayName: true } },
        facility: { select: { displayName: true } },
        assignedStaff: { select: { displayName: true } },
        ticketTags: {
          orderBy: { addedAt: "asc" },
          select: { tag: { select: { name: true, normalizedName: true } } },
        },
        messages: {
          where: { kind: "OUTBOUND" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { deliveryStatus: true },
        },
      },
    }),
    db.supportTicket.count({ where }),
  ]);

  return {
    query,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      type: ticket.type,
      priority: ticket.priority,
      updatedAt: ticket.updatedAt,
      contact: ticket.contact,
      facility: ticket.facility,
      assignedStaff: ticket.assignedStaff,
      tags: ticket.ticketTags.map((row) => row.tag),
      latestOutboundDeliveryStatus: ticket.messages[0]?.deliveryStatus ?? null,
    })),
    total,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    exactTicketNumberHit: Boolean(exactTicket),
  };
}
