import assert from "node:assert/strict";
import test from "node:test";

import { platformNavItemsForRole } from "@/lib/route-registry";

import { applyCanonicalLogsNavRewrite, applyRunLogsNav } from "./run-nav";

test("canonical RUN nav hides Legacy Logs and keeps due Logs plus Log Book", () => {
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
    items.map((i) => ({ href: i.href, label: i.label })),
    [
      { href: "/workspace", label: "Dashboard" },
      { href: "/staffing/logs", label: "Logs" },
      { href: "/staffing/log-book", label: "Log Book" },
    ],
  );
  assert.deepEqual(
    applyCanonicalLogsNavRewrite([{ href: "/logs", label: "Logs" }], false).map((i) => i.href),
    ["/logs"],
  );
});

test("canonical RUN nav injects due Logs and Log Book when evidence nav is off", () => {
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
      { href: "/staffing/logs", label: "Logs" },
      { href: "/reports", label: "Review" },
      { href: "/staffing/log-book", label: "Log Book" },
    ],
  );
});

test("canonical-on manager nav offers due Logs and Log Book when Dietary Evidence is off", () => {
  const items = applyCanonicalLogsNavRewrite(
    platformNavItemsForRole("MANAGER", {
      canonicalLogsEnabled: true,
      dietaryOperationalEvidenceEnabled: false,
    }),
    true,
    { canViewLogBook: true },
  );
  assert.equal(
    items.some((i) => i.href === "/staffing/logs" && i.label === "Logs"),
    true,
  );
  assert.equal(
    items.some((i) => i.href === "/staffing/log-book" && i.label === "Log Book"),
    true,
  );
  assert.equal(items.some((i) => i.href === "/logs"), false);
  assert.equal(items.some((i) => i.href === "/staffing/templates"), false);
});

test("All Departments hides legacy Logs while the capability is on", () => {
  const items = applyRunLogsNav(
    [
      { href: "/staffing/logs", label: "Logs" },
      { href: "/staffing/log-book", label: "Log Book" },
      { href: "/assets", label: "Maintenance" },
      { href: "/logs", label: "Logs" },
      { href: "/reports", label: "Audit / Reports" },
    ],
    {
      capabilityEnabled: true,
      activeDepartmentId: null,
      departmentUsesCanonical: false,
      canViewLogBook: true,
    },
  );
  assert.deepEqual(
    items.map((item) => item.href),
    ["/staffing/logs", "/staffing/log-book", "/assets", "/reports"],
  );
});

test("a department on the previous engine keeps one legacy Logs item", () => {
  const items = applyRunLogsNav(
    [
      { href: "/staffing/logs", label: "Logs" },
      { href: "/logs", label: "Logs" },
    ],
    {
      capabilityEnabled: true,
      activeDepartmentId: "dietary",
      departmentUsesCanonical: false,
    },
  );
  assert.deepEqual(
    items.map((item) => item.href),
    ["/logs"],
  );
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
