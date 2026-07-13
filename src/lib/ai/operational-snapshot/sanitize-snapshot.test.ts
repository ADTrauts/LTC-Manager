import assert from "node:assert/strict";
import test from "node:test";

import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import {
  enforceSnapshotSize,
  hashOperationalSnapshot,
  sanitizeOperationalSnapshot,
} from "@/lib/ai/operational-snapshot/sanitize-snapshot";
import { isAllowedAppSourcePath, unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";

function sampleSnapshot(overrides: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
  return {
    generatedAt: "2026-07-12T14:00:00.000Z",
    facilityLocalTime: "2026-07-12 10:00",
    timezone: "America/New_York",
    serviceDate: "2026-07-12",
    activeDepartment: "DIETARY",
    activeOperation: {
      label: "Lunch preparation",
      phase: "Preparation",
      scheduledTime: "11:30",
      source: "operations_center",
    },
    readiness: { ready: 4, inProgress: 1, needsAttention: 2 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server assigned for lunch",
        signals: ["no staffing assigned"],
        sourcePath: unitWorkspacePath("u1"),
      },
      {
        unitId: "u2",
        name: "Main Kitchen",
        state: "in_progress",
        primaryReason: "Dishwasher repair is in progress",
        signals: ["1 open issues"],
        sourcePath: unitWorkspacePath("u2"),
      },
    ],
    staffing: { gaps: 1, thinCoverage: 1, openCallDowns: 1 },
    issues: { urgent: 1, high: 0, inProgress: 1, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 1, openFindings: 0 },
    handoffs: [
      {
        type: "call_down",
        location: "2A MLK",
        summary: "Open call-down affecting 2A MLK",
        sourcePath: "/staffing",
      },
    ],
    allowedSourcePaths: [unitWorkspacePath("u1"), unitWorkspacePath("u2"), "/staffing"],
    ...overrides,
  };
}

test("sanitizeOperationalSnapshot strips PII-shaped keys", () => {
  const dirty = {
    ...sampleSnapshot(),
    employeeName: "Jane Doe",
    email: "jane@example.com",
  } as OperationalSnapshot & { employeeName: string; email: string };

  const clean = sanitizeOperationalSnapshot(dirty);
  const json = JSON.stringify(clean);
  assert.equal("employeeName" in clean, false);
  assert.doesNotMatch(json, /Jane Doe/);
  assert.doesNotMatch(json, /jane@example.com/);
});

test("sanitizeOperationalSnapshot keeps operational fields and caps lists", () => {
  const many = sampleSnapshot({
    priorityLocations: Array.from({ length: 12 }, (_, i) => ({
      unitId: `u${i}`,
      name: `Unit ${i}`,
      state: "needs_attention" as const,
      primaryReason: "Needs attention",
      signals: ["a", "b", "c", "d", "e"],
      sourcePath: unitWorkspacePath(`u${i}`),
    })),
  });
  const clean = sanitizeOperationalSnapshot(many);
  assert.equal(clean.priorityLocations.length, 8);
  assert.ok(clean.priorityLocations.every((l) => l.signals.length <= 4));
  assert.equal(clean.readiness.needsAttention, 2);
  assert.equal(clean.timezone, "America/New_York");
});

test("enforceSnapshotSize reduces payload when over limit", () => {
  const big = sampleSnapshot({
    priorityLocations: Array.from({ length: 8 }, (_, i) => ({
      unitId: `u${i}`,
      name: `Unit ${i}`.repeat(20),
      state: "needs_attention" as const,
      primaryReason: "reason ".repeat(40),
      signals: ["signal ".repeat(10), "x", "y", "z"],
      sourcePath: unitWorkspacePath(`u${i}`),
    })),
  });
  const limited = enforceSnapshotSize(big, 800);
  assert.ok(JSON.stringify(limited).length <= JSON.stringify(big).length);
  assert.ok(limited.priorityLocations.length <= 5);
});

test("hashOperationalSnapshot is stable for identical snapshots", () => {
  const a = sampleSnapshot();
  const b = sampleSnapshot();
  assert.equal(hashOperationalSnapshot(a), hashOperationalSnapshot(b));
});

test("source paths must be allowlisted app paths", () => {
  const allowed = new Set([unitWorkspacePath("u1"), "/today/coverage"]);
  assert.equal(isAllowedAppSourcePath(unitWorkspacePath("u1"), allowed), true);
  assert.equal(isAllowedAppSourcePath("/today/coverage", allowed), true);
  assert.equal(isAllowedAppSourcePath("/unit/unknown", allowed), false);
  assert.equal(isAllowedAppSourcePath("https://evil.example", allowed), false);
  assert.equal(isAllowedAppSourcePath("../etc/passwd", allowed), false);
});

test("priority location ordering prefers needs_attention then in_progress in sample", () => {
  const snap = sampleSnapshot();
  assert.equal(snap.priorityLocations[0]!.state, "needs_attention");
  assert.equal(snap.priorityLocations[1]!.state, "in_progress");
  assert.ok(snap.priorityLocations.every((l) => l.sourcePath.startsWith("/unit/")));
});
