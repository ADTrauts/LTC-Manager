import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackMorningBrief } from "@/lib/ai/morning-brief/fallback";
import {
  buildMorningBriefSystemPrompt,
  buildMorningBriefUserPrompt,
  MORNING_BRIEF_PROMPT_VERSION,
} from "@/lib/ai/morning-brief/prompt";
import { validateMorningBriefResponse } from "@/lib/ai/morning-brief/validate-response";
import { AiInvalidResponseError } from "@/lib/ai/errors";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import { unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";

function snapshot(partial: Partial<OperationalSnapshot> = {}): OperationalSnapshot {
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
    readiness: { ready: 5, inProgress: 0, needsAttention: 0 },
    priorityLocations: [],
    staffing: { gaps: 0, thinCoverage: 0, openCallDowns: 0 },
    issues: { urgent: 0, high: 0, inProgress: 0, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 0, openFindings: 0 },
    handoffs: [],
    allowedSourcePaths: [unitWorkspacePath("u1"), "/today/coverage", "/staffing"],
    ...partial,
  };
}

test("prompt is versioned and prioritizes Needs Attention terminology", () => {
  assert.equal(MORNING_BRIEF_PROMPT_VERSION, "morning-brief-v1");
  const system = buildMorningBriefSystemPrompt();
  assert.match(system, /Needs Attention/);
  assert.match(system, /Never invent/);
  assert.doesNotMatch(system, /autonomously (fix|close|assign)/i);
  const user = buildMorningBriefUserPrompt('{"readiness":{"needsAttention":1}}');
  assert.match(user, /Needs Attention/);
  assert.match(system, /at most three priorities/i);
});

test("validateMorningBriefResponse accepts valid grounded output", () => {
  const result = validateMorningBriefResponse(
    {
      headline: "Lunch preparation needs attention at one location.",
      summary: "Start with 2A MLK. Coverage is thin. Routine work can wait.",
      priorities: [
        {
          title: "2A MLK",
          reason: "No server assigned for lunch",
          sourcePath: unitWorkspacePath("u1"),
          urgency: "attention",
        },
      ],
      watchItems: ["One coverage gap on Today's Work."],
      generatedAt: "2026-07-12T14:05:00.000Z",
    },
    [unitWorkspacePath("u1"), "/today/coverage"],
    "2026-07-12T14:00:00.000Z",
  );
  assert.equal(result.priorities.length, 1);
  assert.equal(result.priorities[0]!.sourcePath, unitWorkspacePath("u1"));
});

test("validateMorningBriefResponse removes unknown source paths", () => {
  const result = validateMorningBriefResponse(
    {
      headline: "Check priorities.",
      summary: "One item needs review.",
      priorities: [
        {
          title: "Unknown",
          reason: "Invented",
          sourcePath: "/unit/not-in-snapshot",
          urgency: "attention",
        },
        {
          title: "2A MLK",
          reason: "No server",
          sourcePath: unitWorkspacePath("u1"),
          urgency: "attention",
        },
      ],
      watchItems: [],
    },
    [unitWorkspacePath("u1")],
    "2026-07-12T14:00:00.000Z",
  );
  assert.equal(result.priorities.length, 1);
  assert.equal(result.priorities[0]!.title, "2A MLK");
});

test("validateMorningBriefResponse trims excess priorities", () => {
  const paths = [unitWorkspacePath("u1"), unitWorkspacePath("u2"), unitWorkspacePath("u3"), unitWorkspacePath("u4")];
  const result = validateMorningBriefResponse(
    {
      headline: "Several locations need attention.",
      summary: "Focus on the top three.",
      priorities: paths.map((sourcePath, i) => ({
        title: `Unit ${i}`,
        reason: "Needs attention",
        sourcePath,
        urgency: "attention" as const,
      })),
      watchItems: ["a", "b", "c", "d"],
    },
    paths,
    "2026-07-12T14:00:00.000Z",
  );
  assert.equal(result.priorities.length, 3);
  assert.equal(result.watchItems.length, 3);
});

test("validateMorningBriefResponse rejects unsupported urgency", () => {
  assert.throws(
    () =>
      validateMorningBriefResponse(
        {
          headline: "Monitor service.",
          summary: "One watch item.",
          priorities: [
            {
              title: "2A",
              reason: "x",
              sourcePath: unitWorkspacePath("u1"),
              urgency: "critical",
            },
          ],
          watchItems: [],
        },
        [unitWorkspacePath("u1")],
        "2026-07-12T14:00:00.000Z",
      ),
    (err: unknown) => err instanceof AiInvalidResponseError,
  );
});

test("validateMorningBriefResponse throws on invalid payload", () => {
  assert.throws(
    () => validateMorningBriefResponse({ headline: "" }, [], "now"),
    (err: unknown) => err instanceof AiInvalidResponseError,
  );
});

test("fallback with no attention items is calm and linked", () => {
  const brief = buildFallbackMorningBrief(snapshot());
  assert.match(brief.headline, /on track/i);
  assert.equal(brief.priorities.length, 0);
});

test("fallback with one priority uses that location and source path", () => {
  const brief = buildFallbackMorningBrief(
    snapshot({
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
    }),
  );
  assert.equal(brief.priorities.length, 1);
  assert.equal(brief.priorities[0]!.sourcePath, unitWorkspacePath("u1"));
  assert.match(brief.summary, /2A MLK/);
});

test("fallback with multiple priorities is deterministic and capped", () => {
  const locs = ["a", "b", "c", "d"].map((id) => ({
    unitId: id,
    name: `Unit ${id}`,
    state: "needs_attention" as const,
    primaryReason: `Reason ${id}`,
    signals: [],
    sourcePath: unitWorkspacePath(id),
  }));
  const first = buildFallbackMorningBrief(
    snapshot({ readiness: { ready: 0, inProgress: 0, needsAttention: 4 }, priorityLocations: locs }),
  );
  const second = buildFallbackMorningBrief(
    snapshot({ readiness: { ready: 0, inProgress: 0, needsAttention: 4 }, priorityLocations: locs }),
  );
  assert.equal(first.priorities.length, 3);
  assert.deepEqual(
    first.priorities.map((p) => p.sourcePath),
    second.priorities.map((p) => p.sourcePath),
  );
});
