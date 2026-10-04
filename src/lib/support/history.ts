import type { PrismaClient, SupportTicketPriority, SupportTicketStatus, SupportTicketType } from "@prisma/client";

import { supportListHref } from "./list-query";
import { ACTIVE_SUPPORT_STATUSES } from "./queues";

export const SUPPORT_HISTORY_RECENT_LIMIT = 5;

export const SUPPORT_HISTORY_TICKET_SELECT = {
  id: true,
  number: true,
  subject: true,
  status: true,
  priority: true,
  type: true,
  updatedAt: true,
} as const;

export type SupportHistoryTicketRow = {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  type: SupportTicketType | null;
  updatedAt: Date;
};

export type SupportHistoryCounts = {
  total: number;
  active: number;
  waitingOnCustomer: number;
  resolved: number;
  closed: number;
  byStatus: Record<SupportTicketStatus, number>;
};

export type SupportContactHistory = SupportHistoryCounts & {
  contact: {
    id: string;
    email: string;
    displayName: string | null;
    userId: string | null;
    facilityId: string | null;
    facilityName: string | null;
  };
  lastContactAt: Date | null;
  recent: SupportHistoryTicketRow[];
  viewAllHref: string;
};

export type SupportFacilityHistory = SupportHistoryCounts & {
  facilityId: string;
  lastUpdatedAt: Date | null;
  recent: Array<SupportHistoryTicketRow & { contact: { id: string; email: string; displayName: string | null } }>;
  recentRequesters: Array<{ id: string; email: string; displayName: string | null }>;
  viewAllHref: string;
};

export type SupportTicketHistoryContext = {
  contact: {
    id: string;
    previousCount: number;
    total: number;
    previousLabel: string;
    contactHref: string;
    ticketsHref: string;
  };
  facility: {
    id: string;
    total: number;
    active: number;
    label: string;
    facilityHref: string;
    ticketsHref: string;
  } | null;
};

const EMPTY_STATUS_COUNTS: Record<SupportTicketStatus, number> = {
  NEW: 0,
  OPEN: 0,
  WAITING_ON_CUSTOMER: 0,
  RESOLVED: 0,
  CLOSED: 0,
};

function emptyCounts(): SupportHistoryCounts {
  return {
    total: 0,
    active: 0,
    waitingOnCustomer: 0,
    resolved: 0,
    closed: 0,
    byStatus: { ...EMPTY_STATUS_COUNTS },
  };
}

function countsFromGroups(
  groups: Array<{ status: SupportTicketStatus; _count: { id: number } }>,
): SupportHistoryCounts {
  const counts = emptyCounts();
  for (const row of groups) {
    counts.byStatus[row.status] = row._count.id;
    counts.total += row._count.id;
  }
  counts.active = ACTIVE_SUPPORT_STATUSES.reduce((sum, status) => sum + counts.byStatus[status], 0);
  counts.waitingOnCustomer = counts.byStatus.WAITING_ON_CUSTOMER;
  counts.resolved = counts.byStatus.RESOLVED;
  counts.closed = counts.byStatus.CLOSED;
  return counts;
}

export function supportContactHref(contactId: string): string {
  return `/console/support/contacts/${contactId}`;
}

export function supportFacilityHref(facilityId: string): string {
  return `/console/customers/${facilityId}`;
}

export function supportContactTicketsHref(contactId: string): string {
  return supportListHref({ contact: { contactId } });
}

export function supportFacilityTicketsHref(facilityId: string): string {
  return supportListHref({ facility: { facilityId } });
}

export function supportPreviousTicketsLabel(previousCount: number): string {
  if (previousCount <= 0) return "No previous tickets";
  if (previousCount === 1) return "1 previous ticket";
  return `${previousCount} previous tickets`;
}

export function supportFacilityContextLabel(total: number, active: number): string {
  const tickets = total === 1 ? "1 support ticket" : `${total} support tickets`;
  return `${tickets} · ${active} active`;
}

export function isActiveSupportHistoryStatus(status: SupportTicketStatus): boolean {
  return ACTIVE_SUPPORT_STATUSES.includes(status);
}

async function countTicketsByStatus(
  db: PrismaClient,
  where: { contactId: string } | { facilityId: string },
): Promise<SupportHistoryCounts> {
  const groups = await db.supportTicket.groupBy({
    by: ["status"],
    where,
    _count: { id: true },
  });
  return countsFromGroups(groups);
}

export async function loadSupportContactHistory(
  db: PrismaClient,
  contactId: string,
): Promise<SupportContactHistory | null> {
  const contact = await db.supportContact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      email: true,
      displayName: true,
      userId: true,
      facilityId: true,
      facility: { select: { displayName: true } },
    },
  });
  if (!contact) return null;

  const [counts, recent] = await Promise.all([
    countTicketsByStatus(db, { contactId }),
    db.supportTicket.findMany({
      where: { contactId },
      orderBy: [{ updatedAt: "desc" }, { number: "desc" }],
      take: SUPPORT_HISTORY_RECENT_LIMIT,
      select: SUPPORT_HISTORY_TICKET_SELECT,
    }),
  ]);

  return {
    contact: {
      id: contact.id,
      email: contact.email,
      displayName: contact.displayName,
      userId: contact.userId,
      facilityId: contact.facilityId,
      facilityName: contact.facility?.displayName ?? null,
    },
    ...counts,
    lastContactAt: recent[0]?.updatedAt ?? null,
    recent,
    viewAllHref: supportContactTicketsHref(contact.id),
  };
}

export async function loadSupportFacilityHistory(
  db: PrismaClient,
  facilityId: string,
): Promise<SupportFacilityHistory> {
  const [counts, recent] = await Promise.all([
    countTicketsByStatus(db, { facilityId }),
    db.supportTicket.findMany({
      where: { facilityId },
      orderBy: [{ updatedAt: "desc" }, { number: "desc" }],
      take: SUPPORT_HISTORY_RECENT_LIMIT,
      select: {
        ...SUPPORT_HISTORY_TICKET_SELECT,
        contact: { select: { id: true, email: true, displayName: true } },
      },
    }),
  ]);

  const seen = new Set<string>();
  const recentRequesters: SupportFacilityHistory["recentRequesters"] = [];
  for (const ticket of recent) {
    if (seen.has(ticket.contact.id)) continue;
    seen.add(ticket.contact.id);
    recentRequesters.push(ticket.contact);
  }

  return {
    facilityId,
    ...counts,
    lastUpdatedAt: recent[0]?.updatedAt ?? null,
    recent,
    recentRequesters,
    viewAllHref: supportFacilityTicketsHref(facilityId),
  };
}

export async function loadSupportTicketHistoryContext(
  db: PrismaClient,
  input: { contactId: string; facilityId: string | null },
): Promise<SupportTicketHistoryContext> {
  const [contactCounts, facilityCounts] = await Promise.all([
    countTicketsByStatus(db, { contactId: input.contactId }),
    input.facilityId ? countTicketsByStatus(db, { facilityId: input.facilityId }) : Promise.resolve(null),
  ]);
  const previousCount = Math.max(0, contactCounts.total - 1);
  return {
    contact: {
      id: input.contactId,
      previousCount,
      total: contactCounts.total,
      previousLabel: supportPreviousTicketsLabel(previousCount),
      contactHref: supportContactHref(input.contactId),
      ticketsHref: supportContactTicketsHref(input.contactId),
    },
    facility: input.facilityId && facilityCounts
      ? {
          id: input.facilityId,
          total: facilityCounts.total,
          active: facilityCounts.active,
          label: supportFacilityContextLabel(facilityCounts.total, facilityCounts.active),
          facilityHref: supportFacilityHref(input.facilityId),
          ticketsHref: supportFacilityTicketsHref(input.facilityId),
        }
      : null,
  };
}
