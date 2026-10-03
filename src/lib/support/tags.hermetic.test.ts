import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { parseSupportListQuery, supportListHref, supportListWhere, supportQueueTabHref } from "./list-query";
import { normalizeSupportTagName, parseSupportTagName } from "./tags";
import { SupportTicketError } from "./errors";

test("tag names normalize to lowercase trimmed values and reject blanks", () => {
  assert.equal(normalizeSupportTagName("  Reporting  "), "reporting");
  assert.equal(normalizeSupportTagName("Asset-Management"), "asset-management");
  assert.equal(normalizeSupportTagName("   "), null);
  assert.equal(normalizeSupportTagName("x".repeat(41)), null);
  assert.deepEqual(parseSupportTagName("Permissions"), {
    name: "Permissions",
    normalizedName: "permissions",
  });
  assert.throws(() => parseSupportTagName("  "), (error: unknown) => {
    return error instanceof SupportTicketError && error.code === "invalid_input";
  });
});

test("tag filter is URL-backed, ANDs with queues, and is not implicit in q", () => {
  const query = parseSupportListQuery({
    queue: "open",
    tag: "Reporting",
    status: "OPEN",
    priority: "HIGH",
  });
  assert.equal(query.tag, "reporting");
  assert.equal(
    supportListHref(query),
    "/console/tickets?queue=open&status=OPEN&priority=HIGH&tag=reporting",
  );
  assert.equal(supportQueueTabHref(query, "open"), "/console/tickets?queue=open&priority=HIGH&tag=reporting");
  assert.deepEqual(supportListWhere(query, { staffId: "s1" }), {
    AND: [
      { status: "OPEN" },
      { status: "OPEN" },
      { priority: "HIGH" },
      { ticketTags: { some: { tag: { is: { normalizedName: "reporting" } } } } },
    ],
  });
  const search = parseSupportListQuery({ q: "reporting" });
  assert.equal(search.tag, null);
  assert.equal(JSON.stringify(supportListWhere(search, { staffId: "s1" })).includes("ticketTags"), false);
});

test("tag management and ticket tag actions require Harbor staff first", () => {
  const page = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/tags/page.tsx"), "utf8");
  const detail = readFileSync(
    join(process.cwd(), "src/app/console/(staff)/tickets/[ticketId]/page.tsx"),
    "utf8",
  );
  const actions = readFileSync(join(process.cwd(), "src/app/console/(staff)/tickets/actions.ts"), "utf8");
  assert.ok(page.indexOf("requireHarborStaff()") >= 0);
  assert.ok(detail.includes("addSupportTicketTagAction"));
  assert.ok(detail.includes("removeSupportTicketTagAction"));
  assert.equal(detail.includes("SupportTicketEventType"), false);
  for (const name of [
    "addSupportTicketTagAction",
    "removeSupportTicketTagAction",
    "createSupportTagAction",
    "renameSupportTagAction",
    "setSupportTagActiveAction",
  ]) {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    assert.match(actions.slice(start, start + 350), /requireHarborStaff\(\)/);
  }
});
