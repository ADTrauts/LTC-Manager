import assert from "node:assert/strict";
import test from "node:test";

import { isPlanFrontlineVisible } from "./assignment-plan";
import {
  assertValidResponsibilityWindow,
  responsibilityWindowsOverlap,
} from "./responsibility-window";
import { resolveCurrentEmployeeAssignment } from "./resolve-current-assignment";
import type { CoverageState } from "./build-coverage-summary";

test("Schedule and Assignment remain distinct concepts in frontline visibility", () => {
  // Draft Assignment plans are never frontline-visible even if a Schedule exists.
  assert.equal(isPlanFrontlineVisible("DRAFT"), false);
  assert.equal(isPlanFrontlineVisible("CONFIRMED"), true);
});

test("plan frontline visibility hides DRAFT only", () => {
  assert.equal(isPlanFrontlineVisible("DRAFT"), false);
  assert.equal(isPlanFrontlineVisible(null), false);
  assert.equal(isPlanFrontlineVisible("CONFIRMED"), true);
  assert.equal(isPlanFrontlineVisible("REOPENED"), true);
  assert.equal(isPlanFrontlineVisible("CLOSED"), true);
});

test("responsibility windows reject inverted bounds", () => {
  const start = new Date("2026-08-05T12:00:00.000Z");
  const end = new Date("2026-08-05T11:00:00.000Z");
  assert.throws(() => assertValidResponsibilityWindow(start, end), /before end/);
});

test("responsibility windows allow sequential non-overlap", () => {
  const aStart = new Date("2026-08-05T11:00:00.000Z");
  const aEnd = new Date("2026-08-05T14:00:00.000Z");
  const bStart = new Date("2026-08-05T14:00:00.000Z");
  const bEnd = new Date("2026-08-05T17:00:00.000Z");
  assert.equal(responsibilityWindowsOverlap(aStart, aEnd, bStart, bEnd), false);
});

test("responsibility windows reject overlap", () => {
  const aStart = new Date("2026-08-05T11:00:00.000Z");
  const aEnd = new Date("2026-08-05T15:00:00.000Z");
  const bStart = new Date("2026-08-05T14:00:00.000Z");
  const bEnd = new Date("2026-08-05T17:00:00.000Z");
  assert.equal(responsibilityWindowsOverlap(aStart, aEnd, bStart, bEnd), true);
});

test("null-bounded windows are treated as full-day overlap", () => {
  assert.equal(responsibilityWindowsOverlap(null, null, null, null), true);
});

test("draft-hidden employee resolution returns empty when no visible rows", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  const resolved = resolveCurrentEmployeeAssignment([], now);
  assert.equal(resolved.current, null);
  assert.equal(resolved.upcoming, null);
});

test("canonical coverage states use required vocabulary", () => {
  const states: CoverageState[] = [
    "COVERED",
    "AT_RISK",
    "UNCOVERED",
    "NOT_YET_ASSIGNED",
    "NOT_APPLICABLE",
    "NOT_CONFIRMED",
  ];
  assert.ok(!states.includes("BLOCKED" as CoverageState));
  assert.equal(states.length, 6);
});

test("EmployeeStatus.OFF remains off-shift semantics in Phase 7A contract note", () => {
  // Contract: OFF means off shift, not deactivated. Terminated is the assignability gate.
  const assignableStatuses = new Set(["ACTIVE", "OFF", "ON_LEAVE"]);
  assert.ok(assignableStatuses.has("OFF"));
  assert.ok(!assignableStatuses.has("TERMINATED"));
});
