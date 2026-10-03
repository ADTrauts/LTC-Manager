import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  hasSupportListRefinements,
  isDefaultSupportListQuery,
  isExactSupportTicketNumberQuery,
  parseSupportListQuery,
  startOfSupportTriageDay,
  supportListClearHref,
  supportListHref,
  supportListSearchWhere,
  supportListUpdatedSince,
  supportListWhere,
  supportQueueTabHref,
} from "./list-query";
import { parseSupportTicketNumberQuery } from "./ticket-number";

test("ticket-number fast path accepts VSS-#### and 4+ digit numbers from 1001", () => {
  assert.equal(parseSupportTicketNumberQuery("VSS-1002"), 1002);
  assert.equal(parseSupportTicketNumberQuery("vss-1002"), 1002);
  assert.equal(parseSupportTicketNumberQuery("[VSS-1002]"), 1002);
  assert.equal(parseSupportTicketNumberQuery("1002"), 1002);
  assert.equal(parseSupportTicketNumberQuery("  1002  "), 1002);
  assert.equal(parseSupportTicketNumberQuery("7"), null);
  assert.equal(parseSupportTicketNumberQuery("42"), null);
  assert.equal(parseSupportTicketNumberQuery("1000"), null);
  assert.equal(parseSupportTicketNumberQuery("VSS-1002 cooler"), null);
  assert.equal(parseSupportTicketNumberQuery("ticket 1002"), null);
});

test("list query normalizes defaults and ignores unknown enums", () => {
  const query = parseSupportListQuery({});
  assert.equal(query.queue, "all");
  assert.equal(query.page, 1);
  assert.equal(query.pageSize, 25);
  assert.equal(query.sort, "updatedAt_desc");
  assert.equal(query.q, null);
  assert.equal(isDefaultSupportListQuery(query), true);
  assert.equal(hasSupportListRefinements(query), false);

  const dirty = parseSupportListQuery({
    q: "  Export  ",
    queue: "bogus",
    status: "NOPE",
    priority: "HIGH",
    type: "unclassified",
    assignee: "me",
    facility: "none",
    updated: "7d",
    page: "0",
  });
  assert.equal(dirty.q, "Export");
  assert.equal(dirty.queue, "all");
  assert.equal(dirty.status, null);
  assert.equal(dirty.priority, "HIGH");
  assert.equal(dirty.type, "unclassified");
  assert.equal(dirty.assignee, "me");
  assert.equal(dirty.facility, "none");
  assert.equal(dirty.updated, "7d");
  assert.equal(dirty.page, 1);
});

test("New and Unassigned queues sort oldest-updated first", () => {
  assert.equal(parseSupportListQuery({ queue: "new" }).sort, "updatedAt_asc");
  assert.equal(parseSupportListQuery({ queue: "unassigned" }).sort, "updatedAt_asc");
  assert.equal(parseSupportListQuery({ queue: "recent" }).sort, "updatedAt_desc");
  assert.equal(parseSupportListQuery({ queue: "mine" }).sort, "updatedAt_desc");
});

test("exact ticket-number query is the whole q token", () => {
  const exact = parseSupportListQuery({ q: "VSS-1002" });
  assert.equal(exact.ticketNumber, 1002);
  assert.equal(isExactSupportTicketNumberQuery(exact), true);
  const mixed = parseSupportListQuery({ q: "VSS-1002 cooler" });
  assert.equal(mixed.ticketNumber, null);
  assert.equal(isExactSupportTicketNumberQuery(mixed), false);
});

test("URL state is bookmarkable and clear/queue tabs drop incompatible params", () => {
  const query = parseSupportListQuery({
    q: "export",
    queue: "unassigned",
    status: "OPEN",
    priority: "HIGH",
    assignee: "me",
    page: "2",
  });
  assert.equal(
    supportListHref(query),
    "/console/tickets?queue=unassigned&q=export&status=OPEN&priority=HIGH&assignee=me&page=2",
  );
  assert.equal(
    supportQueueTabHref(query, "high"),
    "/console/tickets?queue=high&q=export&priority=HIGH",
  );
  assert.equal(supportListClearHref(query), "/console/tickets?queue=unassigned");
  assert.equal(supportListHref({}), "/console/tickets");
});

test("filters AND with the queue; exact ticket number ignores them when the row exists", () => {
  const query = parseSupportListQuery({
    q: "VSS-1002",
    queue: "closed",
    status: "OPEN",
    priority: "HIGH",
  });
  assert.deepEqual(supportListWhere(query, { staffId: "s1", exactTicketExists: true }), {
    number: 1002,
  });
  const refined = parseSupportListQuery({ queue: "unassigned", priority: "HIGH" });
  assert.deepEqual(supportListWhere(refined, { staffId: "s1" }), {
    AND: [
      { assignedStaffId: null, status: { in: ["NEW", "OPEN", "WAITING_ON_CUSTOMER"] } },
      { priority: "HIGH" },
    ],
  });
});

test("search where covers subject, contact, facility, messages, and ticket number", () => {
  const where = supportListSearchWhere("Ada");
  assert.deepEqual(where, {
    OR: [
      { subject: { contains: "Ada", mode: "insensitive" } },
      { contact: { is: { email: { contains: "Ada", mode: "insensitive" } } } },
      { contact: { is: { displayName: { contains: "Ada", mode: "insensitive" } } } },
      { facility: { is: { displayName: { contains: "Ada", mode: "insensitive" } } } },
      { messages: { some: { bodyText: { contains: "Ada", mode: "insensitive" } } } },
    ],
  });
  const numbered = supportListSearchWhere("1002");
  assert.equal((numbered.OR as object[])[0] && "number" in (numbered.OR as object[])[0], true);
});

test("date presets use America/New_York today and rolling 7/30 day windows", () => {
  const now = new Date("2026-10-03T16:00:00.000Z");
  const today = startOfSupportTriageDay(now);
  assert.ok(today.getTime() <= now.getTime());
  assert.equal(supportListUpdatedSince("today", now).getTime(), today.getTime());
  assert.equal(supportListUpdatedSince("7d", now).getTime(), now.getTime() - 7 * 86400000);
  assert.equal(supportListUpdatedSince("30d", now).getTime(), now.getTime() - 30 * 86400000);
});

test("Console ticket list still requires Harbor staff before querying", () => {
  const source = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/page.tsx"), "utf8");
  const auth = source.indexOf("requireHarborStaff()");
  const list = source.indexOf("listSupportTickets(");
  assert.ok(auth >= 0 && list > auth);
  assert.equal(source.includes("OperationalRequest"), false);
  assert.equal(source.includes("requireFacility"), false);
});
