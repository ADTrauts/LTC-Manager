import type {
  Prisma,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";

import {
  formatFacilityLocalDate,
  getFacilityLocalParts,
} from "@/lib/operational-time/zoned-parts";

import { isSupportTicketPriority, isSupportTicketType } from "./labels";
import { parseSupportQueue, supportQueueWhere, type SupportQueueKey } from "./queues";
import { isSupportTicketStatus } from "./status-transition";
import { parseSupportTicketNumberQuery } from "./ticket-number";

export const SUPPORT_LIST_PAGE_SIZE = 25;
export const SUPPORT_LIST_TIME_ZONE = "America/New_York";
export const SUPPORT_LIST_UPDATED_PRESETS = ["today", "7d", "30d"] as const;

export type SupportListUpdatedPreset = (typeof SUPPORT_LIST_UPDATED_PRESETS)[number];
export type SupportListTypeFilter = SupportTicketType | "unclassified";
export type SupportListAssigneeFilter = "me" | "unassigned" | { staffId: string };
export type SupportListFacilityFilter = "none" | { facilityId: string };
export type SupportListSort = "updatedAt_asc" | "updatedAt_desc";

export type SupportListQuery = {
  q: string | null;
  ticketNumber: number | null;
  exactTicketNumber: boolean;
  queue: SupportQueueKey;
  status: SupportTicketStatus | null;
  priority: SupportTicketPriority | null;
  type: SupportListTypeFilter | null;
  assignee: SupportListAssigneeFilter | null;
  facility: SupportListFacilityFilter | null;
  updated: SupportListUpdatedPreset | null;
  page: number;
  pageSize: number;
  sort: SupportListSort;
};

export type SupportListParamInput = Record<string, string | string[] | undefined>;

const MAX_QUERY_LENGTH = 200;
const CUID_RE = /^c[a-z0-9]{20,}$/i;

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function parsePage(value: string | null): number {
  if (!value) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

function parseAssignee(value: string | null): SupportListAssigneeFilter | null {
  if (!value) return null;
  if (value === "me" || value === "unassigned") return value;
  return CUID_RE.test(value) ? { staffId: value } : null;
}

function parseFacility(value: string | null): SupportListFacilityFilter | null {
  if (!value) return null;
  if (value === "none") return "none";
  return CUID_RE.test(value) ? { facilityId: value } : null;
}

function parseType(value: string | null): SupportListTypeFilter | null {
  if (!value) return null;
  if (value === "unclassified") return "unclassified";
  return isSupportTicketType(value) ? value : null;
}

function parseUpdated(value: string | null): SupportListUpdatedPreset | null {
  return SUPPORT_LIST_UPDATED_PRESETS.includes(value as SupportListUpdatedPreset)
    ? (value as SupportListUpdatedPreset)
    : null;
}

function sortForQueue(queue: SupportQueueKey): SupportListSort {
  return queue === "new" || queue === "unassigned" ? "updatedAt_asc" : "updatedAt_desc";
}

export function parseSupportListQuery(params: SupportListParamInput = {}): SupportListQuery {
  const rawQ = firstParam(params.q);
  const q = rawQ ? rawQ.slice(0, MAX_QUERY_LENGTH) : null;
  const ticketNumber = q ? parseSupportTicketNumberQuery(q) : null;
  const queue = parseSupportQueue(firstParam(params.queue));
  const statusValue = firstParam(params.status);
  return {
    q,
    ticketNumber,
    exactTicketNumber: ticketNumber !== null,
    queue,
    status: isSupportTicketStatus(statusValue) ? statusValue : null,
    priority: (() => {
      const value = firstParam(params.priority);
      return isSupportTicketPriority(value) ? value : null;
    })(),
    type: parseType(firstParam(params.type)),
    assignee: parseAssignee(firstParam(params.assignee)),
    facility: parseFacility(firstParam(params.facility)),
    updated: parseUpdated(firstParam(params.updated)),
    page: parsePage(firstParam(params.page)),
    pageSize: SUPPORT_LIST_PAGE_SIZE,
    sort: sortForQueue(queue),
  };
}

/** True when q is only a ticket number token (not "VSS-1002 cooler"). */
export function isExactSupportTicketNumberQuery(query: SupportListQuery): boolean {
  if (!query.q || query.ticketNumber === null) return false;
  return parseSupportTicketNumberQuery(query.q) === query.ticketNumber;
}

export function hasSupportListRefinements(query: SupportListQuery): boolean {
  return Boolean(
    query.q ||
      query.status ||
      query.priority ||
      query.type ||
      query.assignee ||
      query.facility ||
      query.updated ||
      query.page > 1,
  );
}

export function isDefaultSupportListQuery(query: SupportListQuery): boolean {
  return query.queue === "all" && !hasSupportListRefinements(query);
}

export function supportListSearchParams(
  input: Partial<SupportListQuery> & { queue?: SupportQueueKey },
): URLSearchParams {
  const params = new URLSearchParams();
  const queue = input.queue ?? "all";
  if (queue !== "all") params.set("queue", queue);
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  if (input.priority) params.set("priority", input.priority);
  if (input.type) params.set("type", input.type);
  if (input.assignee === "me" || input.assignee === "unassigned") {
    params.set("assignee", input.assignee);
  } else if (input.assignee && "staffId" in input.assignee) {
    params.set("assignee", input.assignee.staffId);
  }
  if (input.facility === "none") params.set("facility", "none");
  else if (input.facility && "facilityId" in input.facility) {
    params.set("facility", input.facility.facilityId);
  }
  if (input.updated) params.set("updated", input.updated);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return params;
}

export function supportListHref(
  input: Partial<SupportListQuery> & { queue?: SupportQueueKey } = {},
): string {
  const params = supportListSearchParams(input);
  const qs = params.toString();
  return qs ? `/console/tickets?${qs}` : "/console/tickets";
}

/** Queue tabs keep search and compatible refinements; they drop status/assignee/page. */
export function supportQueueTabHref(query: SupportListQuery, queue: SupportQueueKey): string {
  return supportListHref({
    q: query.q,
    queue,
    priority: query.priority,
    type: query.type,
    facility: query.facility,
    updated: query.updated,
  });
}

export function supportListClearHref(query: SupportListQuery): string {
  return supportListHref({ queue: query.queue });
}

export function startOfSupportTriageDay(now: Date, timeZone = SUPPORT_LIST_TIME_ZONE): Date {
  const today = formatFacilityLocalDate(getFacilityLocalParts(now, timeZone));
  const floor = now.getTime() - 36 * 60 * 60 * 1000;
  const walkBack = (from: number, stepMs: number) => {
    let cursor = from;
    while (cursor - stepMs > floor) {
      const previous = cursor - stepMs;
      if (formatFacilityLocalDate(getFacilityLocalParts(new Date(previous), timeZone)) !== today) {
        return cursor;
      }
      cursor = previous;
    }
    return cursor;
  };
  return new Date(walkBack(walkBack(now.getTime(), 60 * 60 * 1000), 60_000));
}

export function supportListUpdatedSince(
  preset: SupportListUpdatedPreset,
  now: Date,
): Date {
  if (preset === "today") return startOfSupportTriageDay(now);
  const days = preset === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function assigneeWhere(
  assignee: SupportListAssigneeFilter,
  staffId: string,
): Prisma.SupportTicketWhereInput {
  if (assignee === "me") return { assignedStaffId: staffId };
  if (assignee === "unassigned") return { assignedStaffId: null };
  return { assignedStaffId: assignee.staffId };
}

export function supportListSearchWhere(q: string): Prisma.SupportTicketWhereInput {
  const ticketNumber = parseSupportTicketNumberQuery(q);
  const clauses: Prisma.SupportTicketWhereInput[] = [
    { subject: { contains: q, mode: "insensitive" } },
    { contact: { is: { email: { contains: q, mode: "insensitive" } } } },
    { contact: { is: { displayName: { contains: q, mode: "insensitive" } } } },
    { facility: { is: { displayName: { contains: q, mode: "insensitive" } } } },
    { messages: { some: { bodyText: { contains: q, mode: "insensitive" } } } },
  ];
  if (ticketNumber !== null) {
    clauses.unshift({ number: ticketNumber });
  }
  return { OR: clauses };
}

export function supportListWhere(
  query: SupportListQuery,
  options: { staffId: string; now?: Date; exactTicketExists?: boolean },
): Prisma.SupportTicketWhereInput {
  if (isExactSupportTicketNumberQuery(query) && query.ticketNumber !== null && options.exactTicketExists) {
    return { number: query.ticketNumber };
  }

  const parts: Prisma.SupportTicketWhereInput[] = [supportQueueWhere(query.queue, options.staffId)];
  if (query.status) parts.push({ status: query.status });
  if (query.priority) parts.push({ priority: query.priority });
  if (query.type === "unclassified") parts.push({ type: null });
  else if (query.type) parts.push({ type: query.type });
  if (query.assignee) parts.push(assigneeWhere(query.assignee, options.staffId));
  if (query.facility === "none") parts.push({ facilityId: null });
  else if (query.facility) parts.push({ facilityId: query.facility.facilityId });
  if (query.updated) {
    parts.push({ updatedAt: { gte: supportListUpdatedSince(query.updated, options.now ?? new Date()) } });
  }
  if (query.q) parts.push(supportListSearchWhere(query.q));
  return { AND: parts };
}
