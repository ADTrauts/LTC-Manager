import assert from "node:assert/strict";
import test from "node:test";

import { AiInvalidResponseError } from "@/lib/ai/errors";
import { diffOperationalSnapshots } from "@/lib/ai/operational-snapshot/diff-operational-snapshots";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import { unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";
import { buildFallbackShiftTransition } from "@/lib/ai/shift-transition/fallback";
import {
  buildShiftTransitionSystemPrompt,
  SHIFT_TRANSITION_PROMPT_VERSION,
} from "@/lib/ai/shift-transition/prompt";
import { validateShiftTransitionResponse } from "@/lib/ai/shift-transition/validate-response";

function snapshot(partial: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
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
    readiness: { ready: 3, inProgress: 0, needsAttention: 1 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server assigned for lunch",
        signals: [],
        sourcePath: unitWorkspacePath("u1"),
      },
    ],
    staffing: { gaps: 1, thinCoverage: 0, openCallDowns: 0 },
    issues: { urgent: 0, high: 0, inProgress: 1, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 0, openFindings: 0 },
    handoffs: [],
    allowedSourcePaths: [unitWorkspacePath("u1"), "/today/coverage", "/issues"],
    ...partial,
  };
}

test("shift transition prompt is versioned without blame language", () => {
  assert.equal(SHIFT_TRANSITION_PROMPT_VERSION, "shift-transition-v1");
  const system = buildShiftTransitionSystemPrompt();
  assert.match(system, /carry-forward/i);
  assert.match(system, /Needs Attention/);
  assert.doesNotMatch(system, /performance review|failed to manage|performed poorly/i);
});

test("validateShiftTransitionResponse accepts grounded output and trims excess", () => {
  const paths = [unitWorkspacePath("u1"), unitWorkspacePath("u2"), "/today/coverage"];
  const result = validateShiftTransitionResponse(
    {
      title: "Lunch handoff",
      summary: "One location needs attention. Coverage improved. Routine work can wait.",
      resolved: [
        { text: "Coverage gap closed", sourcePath: "/today/coverage" },
        { text: "extra1", sourcePath: "/today/coverage" },
        { text: "extra2", sourcePath: "/today/coverage" },
        { text: "extra3", sourcePath: "/today/coverage" },
      ],
      carryForward: Array.from({ length: 7 }, (_, i) => ({
        title: `Unit ${i}`,
        reason: "Needs attention",
        sourcePath: i % 2 === 0 ? unitWorkspacePath("u1") : unitWorkspacePath("u2"),
        urgency: "attention" as const,
      })),
      changed: [
        { text: "New gap", direction: "new" as const, sourcePath: "/today/coverage" },
      ],
      baselineAvailable: true,
    },
    paths,
    "now",
    true,
  );
  assert.equal(result.resolved.length, 3);
  assert.equal(result.carryForward.length, 5);
});

test("validateShiftTransitionResponse removes unknown source paths", () => {
  const result = validateShiftTransitionResponse(
    {
      title: "Handoff",
      summary: "Check carry forward.",
      resolved: [],
      carryForward: [
        {
          title: "Unknown",
          reason: "x",
          sourcePath: "/unit/not-real",
          urgency: "attention",
        },
        {
          title: "2A MLK",
          reason: "No server",
          sourcePath: unitWorkspacePath("u1"),
          urgency: "attention",
        },
      ],
      changed: [],
      baselineAvailable: false,
    },
    [unitWorkspacePath("u1")],
    "now",
    false,
  );
  assert.equal(result.carryForward.length, 1);
  assert.equal(result.carryForward[0]!.title, "2A MLK");
  assert.equal(result.changed.length, 0);
});

test("validateShiftTransitionResponse rejects invalid payload", () => {
  assert.throws(
    () => validateShiftTransitionResponse({ title: "" }, [], "now", false),
    (err: unknown) => err instanceof AiInvalidResponseError,
  );
});

test("fallback with no baseline summarizes current unresolved only", () => {
  const current = snapshot();
  const diff = diffOperationalSnapshots({
    current,
    baseline: null,
    currentHash: "c",
  });
  const result = buildFallbackShiftTransition({
    current,
    diff,
    contextLabel: "Lunch preparation handoff",
  });
  assert.equal(result.baselineAvailable, false);
  assert.equal(result.changed.length, 0);
  assert.equal(result.carryForward.length, 1);
  assert.match(result.summary, /No comparison baseline/i);
});

test("fallback with baseline includes resolved and changed", () => {
  const baseline = snapshot({
    generatedAt: "2026-07-13T10:00:00.000Z",
    staffing: { gaps: 2, thinCoverage: 0, openCallDowns: 0 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server",
        signals: [],
        sourcePath: unitWorkspacePath("u1"),
      },
      {
        unitId: "u2",
        name: "Kitchen",
        state: "needs_attention",
        primaryReason: "Urgent repair",
        signals: [],
        sourcePath: unitWorkspacePath("u2"),
      },
    ],
  });
  const current = snapshot({
    staffing: { gaps: 1, thinCoverage: 0, openCallDowns: 0 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server assigned for lunch",
        signals: [],
        sourcePath: unitWorkspacePath("u1"),
      },
    ],
  });
  const diff = diffOperationalSnapshots({
    current,
    baseline,
    currentHash: "c",
    baselineHash: "b",
  });
  const first = buildFallbackShiftTransition({
    current,
    diff,
    contextLabel: "Breakfast → Lunch transition",
  });
  const second = buildFallbackShiftTransition({
    current,
    diff,
    contextLabel: "Breakfast → Lunch transition",
  });
  assert.equal(first.baselineAvailable, true);
  assert.ok(first.resolved.length >= 1);
  assert.deepEqual(first.carryForward.map((c) => c.sourcePath), second.carryForward.map((c) => c.sourcePath));
});

test("fallback with nothing unresolved stays calm", () => {
  const current = snapshot({
    readiness: { ready: 5, inProgress: 0, needsAttention: 0 },
    priorityLocations: [],
    staffing: { gaps: 0, thinCoverage: 0, openCallDowns: 0 },
  });
  const baseline = snapshot({
    generatedAt: "2026-07-13T10:00:00.000Z",
    readiness: { ready: 4, inProgress: 0, needsAttention: 1 },
    priorityLocations: [
      {
        unitId: "u1",
        name: "2A MLK",
        state: "needs_attention",
        primaryReason: "No server",
        signals: [],
        sourcePath: unitWorkspacePath("u1"),
      },
    ],
  });
  const diff = diffOperationalSnapshots({
    current,
    baseline,
    currentHash: "c",
    baselineHash: "b",
  });
  const result = buildFallbackShiftTransition({
    current,
    diff,
    contextLabel: "Lunch handoff",
  });
  assert.equal(result.carryForward.length, 0);
  assert.match(result.summary, /No open Needs Attention|improved/i);
});
