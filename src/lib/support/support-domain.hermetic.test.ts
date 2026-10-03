import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { $Enums } from "@prisma/client";

import { normalizeSupportEmail } from "./contacts";
import {
  formatMessageIdHeader,
  generateSupportInternetMessageId,
  generateSupportReplyToken,
  messageIdDomainFromAddress,
} from "./identifiers";
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_TYPES } from "./labels";
import { parseSupportQueue, supportQueueWhere } from "./queues";
import { describeSupportDeliveryFailure } from "./reply";
import {
  allowedSupportTicketTransitions,
  canTransitionSupportTicket,
  planSupportTicketStatusChange,
  SUPPORT_TICKET_STATUSES,
} from "./status-transition";
import { formatSupportEmailSubject, formatSupportTicketNumber } from "./ticket-number";
import { describeSupportEvent, mergeSupportTimeline } from "./timeline";

const EXPECTED_TRANSITIONS = {
  NEW: ["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  OPEN: ["WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  WAITING_ON_CUSTOMER: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["OPEN", "CLOSED"],
  CLOSED: [],
} as const;

test("status lists match the Prisma enums", () => {
  assert.deepEqual([...SUPPORT_TICKET_STATUSES].sort(), Object.values($Enums.SupportTicketStatus).sort());
  assert.deepEqual([...SUPPORT_TICKET_TYPES].sort(), Object.values($Enums.SupportTicketType).sort());
  assert.deepEqual(
    [...SUPPORT_TICKET_PRIORITIES].sort(),
    Object.values($Enums.SupportTicketPriority).sort(),
  );
});

test("every status pair follows the canonical transition table", () => {
  for (const from of SUPPORT_TICKET_STATUSES) {
    assert.deepEqual([...allowedSupportTicketTransitions(from)], [...EXPECTED_TRANSITIONS[from]], from);
    for (const to of SUPPORT_TICKET_STATUSES) {
      const expected = (EXPECTED_TRANSITIONS[from] as readonly string[]).includes(to);
      assert.equal(canTransitionSupportTicket(from, to), expected, `${from} -> ${to}`);
    }
  }
});

test("closed tickets are final and backwards moves to NEW are rejected", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  for (const to of ["NEW", "OPEN", "WAITING_ON_CUSTOMER", "RESOLVED"] as const) {
    const plan = planSupportTicketStatusChange({ from: "CLOSED", to, resolvedAt: null, closedAt: now, now });
    assert.equal(plan.kind, "invalid", to);
  }
  for (const from of ["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED"] as const) {
    const plan = planSupportTicketStatusChange({ from, to: "NEW", resolvedAt: null, closedAt: null, now });
    assert.equal(plan.kind, "invalid", from);
  }
});

test("same-status requests are unchanged so no event is written", () => {
  const now = new Date();
  for (const status of SUPPORT_TICKET_STATUSES) {
    const plan = planSupportTicketStatusChange({ from: status, to: status, resolvedAt: null, closedAt: null, now });
    assert.deepEqual(plan, { kind: "unchanged" });
  }
});

test("resolvedAt and closedAt follow the lifecycle", () => {
  const earlier = new Date("2026-09-30T12:00:00Z");
  const now = new Date("2026-10-01T12:00:00Z");

  const resolve = planSupportTicketStatusChange({ from: "OPEN", to: "RESOLVED", resolvedAt: null, closedAt: null, now });
  assert.equal(resolve.kind, "change");
  assert.equal(resolve.kind === "change" && resolve.data.resolvedAt, now);

  const reopen = planSupportTicketStatusChange({ from: "RESOLVED", to: "OPEN", resolvedAt: earlier, closedAt: null, now });
  assert.equal(reopen.kind === "change" && reopen.data.resolvedAt, null);

  const closeResolved = planSupportTicketStatusChange({ from: "RESOLVED", to: "CLOSED", resolvedAt: earlier, closedAt: null, now });
  assert.equal(closeResolved.kind === "change" && closeResolved.data.resolvedAt, earlier);
  assert.equal(closeResolved.kind === "change" && closeResolved.data.closedAt, now);

  const closeOpen = planSupportTicketStatusChange({ from: "OPEN", to: "CLOSED", resolvedAt: null, closedAt: null, now });
  assert.equal(closeOpen.kind === "change" && closeOpen.data.resolvedAt, null);
  assert.equal(closeOpen.kind === "change" && closeOpen.data.closedAt, now);
});

test("ticket numbers format as VSS-n and reject non-positive integers", () => {
  assert.equal(formatSupportTicketNumber(1001), "VSS-1001");
  assert.equal(formatSupportEmailSubject(1001, "  Cooler logs not saving "), "[VSS-1001] Cooler logs not saving");
  assert.equal(formatSupportEmailSubject(1002, "  "), "[VSS-1002]");
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => formatSupportTicketNumber(bad));
  }
});

test("support emails normalize to trimmed lowercase", () => {
  assert.equal(normalizeSupportEmail("  Ada.Lovelace@Example.COM "), "ada.lovelace@example.com");
});

test("reply tokens fit the database format and an email local part", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const token = generateSupportReplyToken();
    assert.match(token, /^[0-9a-f]{40}$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 50);
  assert.ok(`support+${generateSupportReplyToken()}`.length <= 64);
});

test("RFC Message-IDs use the sender domain and are unique", () => {
  assert.equal(messageIdDomainFromAddress("noreply@vssyl.com"), "vssyl.com");
  assert.equal(messageIdDomainFromAddress("Vssyl Support <help@Support.Vssyl.com>"), "support.vssyl.com");
  assert.equal(messageIdDomainFromAddress("not-an-address"), "vssyl.com");
  const a = generateSupportInternetMessageId("vssyl.com");
  const b = generateSupportInternetMessageId("vssyl.com");
  assert.notEqual(a, b);
  assert.match(a, /^support\.[0-9a-f-]{36}@vssyl\.com$/);
  assert.equal(formatMessageIdHeader(a), `<${a}>`);
});

test("queues scope active work for Unassigned and My tickets", () => {
  assert.equal(parseSupportQueue("mine"), "mine");
  assert.equal(parseSupportQueue("bogus"), "all");
  assert.equal(parseSupportQueue(undefined), "all");
  assert.deepEqual(supportQueueWhere("all", "s1"), {});
  assert.deepEqual(supportQueueWhere("closed", "s1"), { status: "CLOSED" });
  assert.deepEqual(supportQueueWhere("waiting", "s1"), { status: "WAITING_ON_CUSTOMER" });
  assert.deepEqual(supportQueueWhere("unassigned", "s1"), {
    assignedStaffId: null,
    status: { in: ["NEW", "OPEN", "WAITING_ON_CUSTOMER"] },
  });
  assert.deepEqual(supportQueueWhere("mine", "s1"), {
    assignedStaffId: "s1",
    status: { in: ["NEW", "OPEN", "WAITING_ON_CUSTOMER"] },
  });
});

test("timeline puts CREATED first, then a message, then the events it carried", () => {
  const at = new Date("2026-10-01T12:00:00Z");
  const later = new Date("2026-10-01T13:00:00Z");
  const message = {
    id: "m1",
    kind: "OUTBOUND" as const,
    bodyText: "Hi",
    authorName: "Staff",
    contactEmail: null,
    fromEmail: "noreply@vssyl.com",
    toEmails: ["ada@example.com"],
    deliveryStatus: "SENT" as const,
    deliveryError: null,
    sentAt: at,
    createdAt: at,
  };
  const event = (id: string, type: "CREATED" | "STATUS_CHANGED", createdAt: Date) => ({
    id,
    type,
    actorName: null,
    fromValue: null,
    toValue: null,
    metadata: null,
    createdAt,
  });
  const items = mergeSupportTimeline(
    [message],
    [event("e-status", "STATUS_CHANGED", at), event("e-later", "STATUS_CHANGED", later), event("e-created", "CREATED", at)],
  );
  assert.deepEqual(
    items.map((item) => (item.kind === "message" ? item.message.id : item.event.id)),
    ["e-created", "m1", "e-status", "e-later"],
  );
});

test("event descriptions use labels and name snapshots", () => {
  const base = { id: "e", actorName: null, createdAt: new Date(), metadata: null };
  assert.equal(
    describeSupportEvent({ ...base, type: "STATUS_CHANGED", fromValue: "OPEN", toValue: "WAITING_ON_CUSTOMER" }),
    "Status changed from Open to Waiting on customer",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "TYPE_CHANGED", fromValue: null, toValue: "FEATURE_REQUEST" }),
    "Type changed from Unclassified to Feature request",
  );
  assert.equal(
    describeSupportEvent({
      ...base,
      type: "FACILITY_CHANGED",
      fromValue: "f1",
      toValue: null,
      metadata: { fromFacilityName: "Terrace View", toFacilityName: null },
    }),
    "Facility Terrace View removed",
  );
  assert.equal(
    describeSupportEvent({
      ...base,
      type: "ASSIGNMENT_CHANGED",
      fromValue: null,
      toValue: "s1",
      metadata: { fromStaffName: null, toStaffName: "Sam" },
    }),
    "Assigned to Sam",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "EMAIL_BOUNCED", fromValue: null, toValue: "HardBounce" }),
    "Outbound email bounced",
  );
  assert.equal(
    describeSupportEvent({ ...base, type: "EMAIL_COMPLAINT", fromValue: null, toValue: "SpamComplaint" }),
    "Customer marked a reply as spam",
  );
});

test("delivery failures are described without throwing away the Postmark reason", () => {
  assert.equal(
    describeSupportDeliveryFailure({ sent: false, reason: "not_configured" }),
    "Email is not configured on this server.",
  );
  const long = describeSupportDeliveryFailure({ sent: false, reason: "send_failed", error: "x".repeat(2000) });
  assert.ok(long.startsWith("Postmark did not accept the message: "));
  assert.equal(long.length, 500);
});

test("every Console ticket server action authorizes Harbor staff before doing anything", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"),
    "utf8",
  );
  const actions = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n([^\n]*)/g)];
  assert.ok(actions.length >= 6, "expected the ticket actions to be discovered");
  for (const [, name, firstLine] of actions) {
    assert.match(firstLine, /await requireHarborStaff\(\)/, `${name} must call requireHarborStaff() first`);
  }
});
