import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isActiveSupportHistoryStatus,
  SUPPORT_HISTORY_RECENT_LIMIT,
  SUPPORT_HISTORY_TICKET_SELECT,
  supportContactHref,
  supportContactTicketsHref,
  supportFacilityContextLabel,
  supportFacilityHref,
  supportFacilityTicketsHref,
  supportPreviousTicketsLabel,
} from "./history";
import { ACTIVE_SUPPORT_STATUSES } from "./queues";

test("active support history matches existing queues", () => {
  assert.deepEqual(ACTIVE_SUPPORT_STATUSES, ["NEW", "OPEN", "WAITING_ON_CUSTOMER"]);
  assert.equal(isActiveSupportHistoryStatus("NEW"), true);
  assert.equal(isActiveSupportHistoryStatus("OPEN"), true);
  assert.equal(isActiveSupportHistoryStatus("WAITING_ON_CUSTOMER"), true);
  assert.equal(isActiveSupportHistoryStatus("RESOLVED"), false);
  assert.equal(isActiveSupportHistoryStatus("CLOSED"), false);
  assert.equal(SUPPORT_HISTORY_RECENT_LIMIT, 5);
});

test("history copy and links stay on Console ticket routes", () => {
  assert.equal(supportPreviousTicketsLabel(0), "No previous tickets");
  assert.equal(supportPreviousTicketsLabel(1), "1 previous ticket");
  assert.equal(supportPreviousTicketsLabel(4), "4 previous tickets");
  assert.equal(supportFacilityContextLabel(12, 2), "12 support tickets · 2 active");
  assert.equal(supportFacilityContextLabel(1, 1), "1 support ticket · 1 active");
  assert.equal(supportContactHref("con_1"), "/console/support/contacts/con_1");
  assert.equal(supportFacilityHref("fac_1"), "/console/customers/fac_1");
  assert.equal(supportContactTicketsHref("cabcdefghijklmnopqrstu"), "/console/tickets?contact=cabcdefghijklmnopqrstu");
  assert.equal(supportFacilityTicketsHref("cabcdefghijklmnopqrstu"), "/console/tickets?facility=cabcdefghijklmnopqrstu");
});

test("history rows select operational ticket fields only", () => {
  const keys = Object.keys(SUPPORT_HISTORY_TICKET_SELECT);
  assert.deepEqual(keys.sort(), ["id", "number", "priority", "status", "subject", "type", "updatedAt"]);
  assert.equal("messages" in SUPPORT_HISTORY_TICKET_SELECT, false);
  assert.equal("events" in SUPPORT_HISTORY_TICKET_SELECT, false);
  assert.equal("attachments" in SUPPORT_HISTORY_TICKET_SELECT, false);
});

test("contact, facility, and ticket history surfaces are Harbor-only", () => {
  const contactPage = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/support/contacts/[contactId]/page.tsx"),
    "utf8",
  );
  const facilityPage = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/customers/[facilityId]/page.tsx"),
    "utf8",
  );
  const ticketPage = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/tickets/[ticketId]/page.tsx"),
    "utf8",
  );
  const panel = readFileSync(
    join(process.cwd(), "src/components/harbor-console/support-history-panel.tsx"),
    "utf8",
  );
  const help = readFileSync(join(process.cwd(), "src/components/help/help-support-panel.tsx"), "utf8");

  assert.ok(contactPage.indexOf("requireHarborStaff()") < contactPage.indexOf("loadSupportContactHistory("));
  assert.ok(facilityPage.indexOf("requireHarborStaff()") < facilityPage.indexOf("loadSupportFacilityHistory("));
  assert.ok(ticketPage.indexOf("requireHarborStaff()") < ticketPage.indexOf("loadSupportTicketHistoryContext("));
  assert.match(ticketPage, /history\.contact\.ticketsHref/);
  assert.match(ticketPage, /history\.facility\.ticketsHref/);
  assert.match(ticketPage, /history\.contact\.contactHref/);
  assert.match(panel, /\/console\/tickets\/\$\{ticket\.id\}/);
  assert.equal(contactPage.includes("requireFacility"), false);
  assert.equal(help.includes("loadSupportContactHistory"), false);
  assert.equal(help.includes("/console/support/contacts"), false);
});
