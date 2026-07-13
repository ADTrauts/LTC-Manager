import assert from "node:assert/strict";
import test from "node:test";

import { diffOperationalSnapshots } from "@/lib/ai/operational-snapshot/diff-operational-snapshots";
import { hashOperationalSnapshot } from "@/lib/ai/operational-snapshot/sanitize-snapshot";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import { unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";

function baseSnapshot(overrides: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
  return {
    generatedAt: "2026-07-13T14:00:00.000Z",
    facilityLocalTime: "2026-07-13 10:00",
    timezone: "America/New_York",
    serviceDate: "2026-07-13",
    activeDepartment: "DIETARY",
    activeOperation: {
      label: "Lunch preparation",
      phase: "Preparation",
      scheduledTime: "11:30",
      source: "operations_center",
    },
    readiness: { ready: 4, inProgress: 0, needsAttention: 1 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server assigned for lunch",
        signals: ["no staffing assigned"],
        sourcePath: unitWorkspacePath("u1"),
      },
    ],
    staffing: { gaps: 1, thinCoverage: 0, openCallDowns: 0 },
    issues: { urgent: 0, high: 1, inProgress: 0, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 1, openFindings: 1 },
    handoffs: [
      {
        type: "coverage_gap",
        location: "2A MLK",
        summary: "Coverage gap at 2A MLK",
        sourcePath: "/today/coverage",
      },
    ],
    allowedSourcePaths: [unitWorkspacePath("u1"), "/today/coverage", "/issues", "/staffing"],
    ...overrides,
  };
}

test("diff with no baseline reports baselineAvailable false and no invented changes", () => {
  const current = baseSnapshot();
  const diff = diffOperationalSnapshots({
    current,
    baseline: null,
    currentHash: hashOperationalSnapshot(current),
  });
  assert.equal(diff.baselineAvailable, false);
  assert.equal(diff.items.length, 0);
});

test("Ready → Needs Attention and Needs Attention → Ready are detected", () => {
  const baseline = baseSnapshot({
    generatedAt: "2026-07-13T10:00:00.000Z",
    priorityLocations: [
      {
        unitId: "u2",
        name: "West Servery",
        state: "ready",
        primaryReason: "Ready for lunch",
        signals: [],
        sourcePath: unitWorkspacePath("u2"),
      },
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server assigned",
        signals: [],
        sourcePath: unitWorkspacePath("u1"),
      },
    ],
  });
  const current = baseSnapshot({
    priorityLocations: [
      {
        unitId: "u2",
        name: "West Servery",
        state: "needs_attention",
        primaryReason: "Failed log",
        signals: ["1 failed logs"],
        sourcePath: unitWorkspacePath("u2"),
      },
    ],
  });
  const diff = diffOperationalSnapshots({
    current,
    baseline,
    currentHash: "c",
    baselineHash: "b",
  });
  assert.ok(diff.items.some((i) => /West Servery.*Needs Attention/i.test(i.text)));
  assert.ok(diff.items.some((i) => /2A MLK.*no longer needs attention/i.test(i.text)));
  assert.equal(diff.readinessMoves.toNeedsAttention >= 1, true);
  assert.equal(diff.readinessMoves.toReady >= 1, true);
});

test("new and resolved issues, staffing gaps, and inspections appear", () => {
  const baseline = baseSnapshot({
    staffing: { gaps: 0, thinCoverage: 0, openCallDowns: 1 },
    issues: { urgent: 0, high: 0, inProgress: 0, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 0, openFindings: 1 },
  });
  const current = baseSnapshot({
    staffing: { gaps: 1, thinCoverage: 0, openCallDowns: 0 },
    issues: { urgent: 1, high: 0, inProgress: 1, supplyShorts: 1 },
    inspections: { overdue: 1, dueNow: 0, openFindings: 0 },
  });
  const diff = diffOperationalSnapshots({
    current,
    baseline,
    currentHash: "c",
    baselineHash: "b",
  });
  assert.ok(diff.items.some((i) => /coverage gap/i.test(i.text) && i.direction === "new"));
  assert.ok(diff.items.some((i) => /call-down/i.test(i.text) && i.direction === "improved"));
  assert.ok(diff.items.some((i) => /urgent\/high/i.test(i.text)));
  assert.ok(diff.items.some((i) => /supply shortage/i.test(i.text)));
  assert.ok(diff.items.some((i) => /overdue inspection/i.test(i.text) && i.direction === "new"));
  assert.ok(diff.items.some((i) => /open inspection finding/i.test(i.text) && i.direction === "improved"));
});

test("handoff added and removed are detected; ordering is deterministic", () => {
  const baseline = baseSnapshot({
    handoffs: [
      {
        type: "open_repair",
        location: "Kitchen",
        summary: "Dishwasher open",
        sourcePath: "/issues/1",
      },
    ],
  });
  const current = baseSnapshot({
    handoffs: [
      {
        type: "coverage_gap",
        location: "2A MLK",
        summary: "Coverage gap at 2A MLK",
        sourcePath: "/today/coverage",
      },
    ],
  });
  const a = diffOperationalSnapshots({ current, baseline, currentHash: "c", baselineHash: "b" });
  const b = diffOperationalSnapshots({ current, baseline, currentHash: "c", baselineHash: "b" });
  assert.deepEqual(
    a.items.map((i) => i.sortKey),
    b.items.map((i) => i.sortKey),
  );
  assert.ok(a.items.some((i) => i.direction === "new" && /Coverage gap/i.test(i.text)));
  assert.ok(a.items.some((i) => i.direction === "improved" && /Dishwasher/i.test(i.text)));
});

test("diff output does not include PII-shaped fields", () => {
  const baseline = baseSnapshot();
  const current = baseSnapshot({
    staffing: { gaps: 2, thinCoverage: 0, openCallDowns: 1 },
  });
  const diff = diffOperationalSnapshots({
    current,
    baseline,
    currentHash: "c",
    baselineHash: "b",
  });
  const json = JSON.stringify(diff);
  assert.doesNotMatch(json, /employeeName|email|@example\.com/i);
});
