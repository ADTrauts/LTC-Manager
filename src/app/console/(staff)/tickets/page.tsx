import type { ReactNode } from "react";
import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import { latestOutboundDeliveryWarning } from "@/lib/support/delivery-presentation";
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
  SUPPORT_TICKET_TYPES,
} from "@/lib/support/labels";
import { listSupportTickets } from "@/lib/support/list";
import {
  hasSupportListRefinements,
  isDefaultSupportListQuery,
  supportListClearHref,
  supportListHref,
  supportQueueTabHref,
  type SupportListParamInput,
  type SupportListQuery,
} from "@/lib/support/list-query";
import { SUPPORT_QUEUES, supportQueueWhere } from "@/lib/support/queues";
import { SUPPORT_TICKET_STATUSES } from "@/lib/support/status-transition";
import { listSupportTags } from "@/lib/support/tags";
import { formatSupportTicketNumber } from "@/lib/support/ticket-number";

function formatUpdated(value: Date) {
  return value.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const selectClass =
  "rounded-md border border-[var(--border-strong)] bg-white px-2 py-2 text-sm";

export default async function ConsoleTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SupportListParamInput>;
}) {
  const session = await requireHarborStaff();
  const params = await searchParams;
  const [{ query, tickets, total, pageCount, exactTicketNumberHit }, counts, staff, facilities, tags] =
    await Promise.all([
      listSupportTickets(prisma, { staffId: session.uid, params }),
      Promise.all(
        SUPPORT_QUEUES.map((row) =>
          prisma.supportTicket.count({ where: supportQueueWhere(row.key, session.uid) }),
        ),
      ),
      prisma.platformStaff.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
        take: 100,
      }),
      prisma.facility.findMany({
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true },
        take: 200,
      }),
      listSupportTags(prisma),
    ]);

  const refined = hasSupportListRefinements(query);
  const emptyMessage = emptyListMessage(query, total);
  const assigneeValue =
    query.assignee === "me" || query.assignee === "unassigned"
      ? query.assignee
      : query.assignee
        ? query.assignee.staffId
        : "";
  const facilityValue =
    query.facility === "none" ? "none" : query.facility ? query.facility.facilityId : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Customer support for Vssyl. Replies are emailed to the requester; internal notes stay in Console.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/console/tickets/saved-replies" className="text-sm text-[var(--text-secondary)] hover:underline">
            Saved replies
          </Link>
          <Link href="/console/tickets/tags" className="text-sm text-[var(--text-secondary)] hover:underline">
            Tags
          </Link>
          <Link href="/console/tickets/macros" className="text-sm text-[var(--text-secondary)] hover:underline">
            Macros
          </Link>
          <Link
            href="/console/tickets/new"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
          >
            New ticket
          </Link>
        </div>
      </header>

      <form action="/console/tickets" className="space-y-3 rounded-md border border-[var(--border)] bg-white p-4">
        {query.queue !== "all" ? <input type="hidden" name="queue" value={query.queue} /> : null}
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="support-ticket-search">
            Search tickets
          </label>
          <input
            id="support-ticket-search"
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search tickets…"
            className="min-w-[16rem] flex-1 rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
          >
            Search
          </button>
          {refined ? (
            <Link
              href={supportListClearHref(query)}
              className="inline-flex items-center rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterSelect id="status" name="status" label="Status" defaultValue={query.status ?? ""}>
            <option value="">Any status</option>
            {SUPPORT_TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SUPPORT_TICKET_STATUS_LABEL[status]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="priority" name="priority" label="Priority" defaultValue={query.priority ?? ""}>
            <option value="">Any priority</option>
            {SUPPORT_TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {SUPPORT_TICKET_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="type" name="type" label="Type" defaultValue={query.type ?? ""}>
            <option value="">Any type</option>
            <option value="unclassified">Unclassified</option>
            {SUPPORT_TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPORT_TICKET_TYPE_LABEL[type]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="assignee" name="assignee" label="Assignee" defaultValue={assigneeValue}>
            <option value="">Any assignee</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="facility" name="facility" label="Facility" defaultValue={facilityValue}>
            <option value="">Any facility</option>
            <option value="none">No facility</option>
            {facilities.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect id="tag" name="tag" label="Tag" defaultValue={query.tag ?? ""}>
            <option value="">Any tag</option>
            {tags
              .filter((tag) => tag.isActive || tag.normalizedName === query.tag)
              .map((tag) => (
                <option key={tag.id} value={tag.normalizedName}>
                  {tag.name}
                  {tag.isActive ? "" : " (inactive)"}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect id="updated" name="updated" label="Updated" defaultValue={query.updated ?? ""}>
            <option value="">Any time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </FilterSelect>
          <button
            type="submit"
            className="self-end rounded-md border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium"
          >
            Apply
          </button>
        </div>
      </form>

      <nav aria-label="Ticket queues" className="flex flex-wrap gap-1">
        {SUPPORT_QUEUES.map((row, index) => {
          const active = row.key === query.queue;
          return (
            <Link
              key={row.key}
              href={supportQueueTabHref(query, row.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                active
                  ? "border-[var(--run-aside)] bg-[var(--run-aside)] font-semibold text-[var(--run-aside-fg)]"
                  : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              {row.label}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[index]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Ticket</th>
              <th className="px-4 py-2 font-medium">Requester</th>
              <th className="px-4 py-2 font-medium">Facility</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Assignee</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-[var(--text-secondary)]">
                  {emptyMessage}
                  {refined ? (
                    <>
                      {" "}
                      <Link href={supportListClearHref(query)} className="underline">
                        Clear filters
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ) : (
              tickets.map((ticket) => {
                const warning = latestOutboundDeliveryWarning([
                  {
                    kind: "OUTBOUND",
                    deliveryStatus: ticket.latestOutboundDeliveryStatus,
                    createdAt: ticket.updatedAt,
                  },
                ]);
                return (
                  <tr key={ticket.id} className="border-b border-[var(--border)] align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/console/tickets/${ticket.id}`} className="font-medium hover:underline">
                        <span className="mr-2 font-mono text-xs text-[var(--text-secondary)]">
                          {formatSupportTicketNumber(ticket.number)}
                        </span>
                        {ticket.subject}
                      </Link>
                      {ticket.tags.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {ticket.tags
                            .slice(0, 2)
                            .map((tag) => tag.name)
                            .join(" · ")}
                          {ticket.tags.length > 2 ? ` +${ticket.tags.length - 2}` : ""}
                        </p>
                      ) : null}
                      {exactTicketNumberHit ? (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">Exact ticket number</p>
                      ) : null}
                      {warning ? <p className="mt-1 text-xs font-medium text-red-700">{warning}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {ticket.contact.displayName ? (
                        <>
                          <span className="text-[var(--foreground)]">{ticket.contact.displayName}</span>
                          <br />
                        </>
                      ) : null}
                      {ticket.contact.email}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {ticket.facility?.displayName ?? "—"}
                    </td>
                    <td className="px-4 py-3">{SUPPORT_TICKET_STATUS_LABEL[ticket.status]}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {ticket.type ? SUPPORT_TICKET_TYPE_LABEL[ticket.type] : "Unclassified"}
                    </td>
                    <td
                      className={`px-4 py-3 ${ticket.priority === "URGENT" || ticket.priority === "HIGH" ? "font-semibold" : "text-[var(--text-secondary)]"}`}
                    >
                      {SUPPORT_TICKET_PRIORITY_LABEL[ticket.priority]}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {ticket.assignedStaff?.displayName ?? "Unassigned"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">
                      {formatUpdated(ticket.updatedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
        <p>
          {total === 0
            ? null
            : `Showing ${(query.page - 1) * query.pageSize + 1}–${Math.min(query.page * query.pageSize, total)} of ${total}. ${
                query.sort === "updatedAt_asc" ? "Oldest updated first." : "Most recently updated first."
              }`}
        </p>
        {total > query.pageSize ? (
          <nav aria-label="Ticket pages" className="flex gap-2">
            {query.page > 1 ? (
              <Link
                href={supportListHref({ ...query, page: query.page - 1 })}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 hover:text-[var(--foreground)]"
              >
                Previous
              </Link>
            ) : null}
            <span className="px-1 py-1.5">
              Page {query.page} of {pageCount}
            </span>
            {query.page < pageCount ? (
              <Link
                href={supportListHref({ ...query, page: query.page + 1 })}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 hover:text-[var(--foreground)]"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  name,
  label,
  defaultValue,
  children,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
      {label}
      <select id={id} name={name} defaultValue={defaultValue} className={selectClass}>
        {children}
      </select>
    </label>
  );
}

function emptyListMessage(query: SupportListQuery, total: number) {
  if (total > 0) return "";
  if (isDefaultSupportListQuery(query)) return "No tickets yet.";
  if (query.q) return `No tickets match “${query.q}”.`;
  return "No tickets match these filters.";
}
