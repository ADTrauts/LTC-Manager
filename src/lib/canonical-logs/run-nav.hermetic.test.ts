import assert from "node:assert/strict";
import test from "node:test";

import { platformNavItemsForRole } from "@/lib/route-registry";

import { applyCanonicalLogsNavRewrite } from "./run-nav";

test("canonical RUN nav hides Legacy Logs and the duplicate today's Logs tab", () => {
  const items = applyCanonicalLogsNavRewrite(
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/staffing/logs", label: "Logs" },
      { href: "/staffing/log-book", label: "Log Book" },
      { href: "/logs", label: "Logs" },
    ],
    true,
  );
  assert.deepEqual(
    items.map((i) => i.href),
    ["/workspace", "/staffing/log-book"],
  );
  assert.deepEqual(
    applyCanonicalLogsNavRewrite([{ href: "/logs", label: "Logs" }], false).map((i) => i.href),
    ["/logs"],
  );
});

test("canonical RUN nav injects Log Book when evidence nav is off", () => {
  const items = applyCanonicalLogsNavRewrite(
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/logs", label: "Logs" },
      { href: "/reports", label: "Review" },
    ],
    true,
  );
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/staffing/log-book", label: "Log Book" },
      { href: "/reports", label: "Review" },
    ],
  );
});

test("canonical-on manager nav still offers Log Book when Dietary Evidence is off", () => {
  const items = applyCanonicalLogsNavRewrite(
    platformNavItemsForRole("MANAGER", {
      todaysWorkEnabled: true,
      canonicalLogsEnabled: true,
      dietaryOperationalEvidenceEnabled: false,
    }),
    true,
    { canViewLogBook: true },
  );
  assert.equal(
    items.some((i) => i.href === "/staffing/log-book" && i.label === "Log Book"),
    true,
  );
  assert.equal(items.some((i) => i.href === "/logs"), false);
  assert.equal(items.some((i) => i.href === "/staffing/logs"), false);
});

test("canonical RUN nav keeps today's Logs for roles that cannot open Log Book", () => {
  const items = applyCanonicalLogsNavRewrite(
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/logs", label: "Logs" },
    ],
    true,
    { canViewLogBook: false },
  );
  assert.deepEqual(
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/staffing/logs", label: "Logs" },
    ],
  );
});
