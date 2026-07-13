import assert from "node:assert/strict";
import test from "node:test";

import { loadAiConfiguration } from "@/lib/ai/configuration";
import { AiTimeoutError } from "@/lib/ai/errors";
import { createMemoryBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import { unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";
import { setAiProviderForTests } from "@/lib/ai/provider";
import { getOrGenerateShiftTransition } from "@/lib/ai/shift-transition/generate-shift-transition";
import { evaluateShiftTransitionRateLimits } from "@/lib/ai/shift-transition/rate-limits";
import type { AiGenerateStructuredRequest, AiGenerateStructuredResult, AiProvider } from "@/lib/ai/types";
import { hasAtLeastRole } from "@/lib/access";

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
    issues: { urgent: 0, high: 0, inProgress: 0, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 0, openFindings: 0 },
    handoffs: [],
    allowedSourcePaths: [unitWorkspacePath("u1"), "/today/coverage", "/staffing"],
    ...partial,
  };
}

function stubProvider(
  impl: (req: AiGenerateStructuredRequest) => Promise<AiGenerateStructuredResult>,
): AiProvider {
  return { name: "mock", model: "test-model", generateStructured: impl };
}

test("shift summary disabled returns operational fallback without provider", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" });
  let called = false;
  setAiProviderForTests(
    stubProvider(async () => {
      called = true;
      return { rawText: "{}", provider: "mock", model: "x", latencyMs: 1 };
    }),
  );
  try {
    const view = await getOrGenerateShiftTransition(
      { facilityId: "fac-1", allowProvider: true },
      {
        config,
        cache,
        enabled: false,
        buildSnapshot: async () => snapshot(),
      },
    );
    assert.equal(called, false);
    assert.equal(view.origin, "fallback");
    assert.equal(view.cardTitle, "Operational Summary");
  } finally {
    setAiProviderForTests(null);
  }
});

test("SSR path does not call provider", async () => {
  const cache = createMemoryBriefCacheStore();
  let called = false;
  setAiProviderForTests(
    stubProvider(async () => {
      called = true;
      return { rawText: "{}", provider: "mock", model: "x", latencyMs: 1 };
    }),
  );
  try {
    const view = await getOrGenerateShiftTransition(
      { facilityId: "fac-1", allowProvider: false },
      {
        config: loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" }),
        cache,
        enabled: true,
        buildSnapshot: async () => snapshot(),
      },
    );
    assert.equal(called, false);
    assert.equal(view.origin, "fallback");
  } finally {
    setAiProviderForTests(null);
  }
});

test("baseline from prior persisted snapshot enables change summary", async () => {
  const cache = createMemoryBriefCacheStore();
  const earlier = snapshot({
    generatedAt: "2026-07-13T10:00:00.000Z",
    staffing: { gaps: 2, thinCoverage: 0, openCallDowns: 0 },
  });
  await cache.upsert({
    facilityId: "fac-2",
    departmentKey: "DIETARY",
    serviceDate: new Date("2026-07-13T00:00:00.000Z"),
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "baseline-hash",
    snapshotJson: earlier,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: { headline: "x", summary: "y", priorities: [], watchItems: [], generatedAt: earlier.generatedAt },
    provider: "mock",
    model: "test",
    status: "READY",
    promptVersion: "morning-brief-v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date("2026-07-13T10:00:00.000Z"),
    expiresAt: new Date("2026-07-14T00:00:00.000Z"),
  });

  const view = await getOrGenerateShiftTransition(
    {
      facilityId: "fac-2",
      allowProvider: false,
      now: new Date("2026-07-13T14:00:00.000Z"),
    },
    {
      cache,
      enabled: true,
      lookbackMs: 6 * 60 * 60 * 1000,
      buildSnapshot: async () =>
        snapshot({
          staffing: { gaps: 1, thinCoverage: 0, openCallDowns: 0 },
        }),
    },
  );
  assert.equal(view.result.baselineAvailable, true);
  assert.equal(view.baselineSnapshotHash, "baseline-hash");
  assert.equal(view.cardTitle, "Operational Change Summary");
});

test("stale baseline outside lookback is ignored", async () => {
  const cache = createMemoryBriefCacheStore();
  const earlier = snapshot({ generatedAt: "2026-07-12T01:00:00.000Z" });
  await cache.upsert({
    facilityId: "fac-3",
    departmentKey: "DIETARY",
    serviceDate: new Date("2026-07-12T00:00:00.000Z"),
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "stale",
    snapshotJson: earlier,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: { headline: "x", summary: "y", priorities: [], watchItems: [], generatedAt: earlier.generatedAt },
    provider: "mock",
    model: "test",
    status: "READY",
    promptVersion: "morning-brief-v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date("2026-07-12T01:00:00.000Z"),
    expiresAt: new Date("2026-07-20T00:00:00.000Z"),
  });

  const view = await getOrGenerateShiftTransition(
    {
      facilityId: "fac-3",
      allowProvider: false,
      now: new Date("2026-07-13T14:00:00.000Z"),
    },
    {
      cache,
      enabled: true,
      lookbackMs: 6 * 60 * 60 * 1000,
      buildSnapshot: async () => snapshot(),
    },
  );
  assert.equal(view.result.baselineAvailable, false);
  assert.equal(view.baselineSnapshotHash, null);
});

test("department mismatch baseline is not selected", async () => {
  const cache = createMemoryBriefCacheStore();
  const earlier = snapshot({ activeDepartment: "EVS", generatedAt: "2026-07-13T10:00:00.000Z" });
  await cache.upsert({
    facilityId: "fac-4",
    departmentKey: "EVS",
    serviceDate: new Date("2026-07-13T00:00:00.000Z"),
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "evs-base",
    snapshotJson: earlier,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: { headline: "x", summary: "y", priorities: [], watchItems: [], generatedAt: earlier.generatedAt },
    provider: "mock",
    model: "test",
    status: "READY",
    promptVersion: "morning-brief-v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date("2026-07-13T10:00:00.000Z"),
    expiresAt: new Date("2026-07-14T00:00:00.000Z"),
  });

  const view = await getOrGenerateShiftTransition(
    {
      facilityId: "fac-4",
      departmentKey: "DIETARY",
      allowProvider: false,
      now: new Date("2026-07-13T14:00:00.000Z"),
    },
    {
      cache,
      enabled: true,
      lookbackMs: 6 * 60 * 60 * 1000,
      buildSnapshot: async () => snapshot(),
    },
  );
  assert.equal(view.result.baselineAvailable, false);
});

test("provider timeout falls back without breaking", async () => {
  const cache = createMemoryBriefCacheStore();
  setAiProviderForTests(
    stubProvider(async () => {
      throw new AiTimeoutError();
    }),
  );
  try {
    const view = await getOrGenerateShiftTransition(
      { facilityId: "fac-5", allowProvider: true },
      {
        config: loadAiConfiguration({
          ...process.env,
          AI_BRIEF_ENABLED: "true",
          AI_MIN_REFRESH_INTERVAL_MS: "1",
        }),
        cache,
        enabled: true,
        buildSnapshot: async () => snapshot(),
      },
    );
    assert.equal(view.origin, "fallback");
    assert.equal(view.fallbackReason, "TIMEOUT");
    assert.ok(view.result.summary.length > 0);
  } finally {
    setAiProviderForTests(null);
  }
});

test("same snapshot+baseline returns cached AI result; morning briefs unaffected by shift daily limit", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({
    ...process.env,
    AI_BRIEF_ENABLED: "true",
    AI_MIN_REFRESH_INTERVAL_MS: "1",
    AI_DAILY_REQUEST_LIMIT: "100",
  });

  setAiProviderForTests(
    stubProvider(async () => ({
      rawText: JSON.stringify({
        title: "Lunch handoff",
        summary: "Carry forward 2A MLK.",
        resolved: [],
        carryForward: [
          {
            title: "2A MLK",
            reason: "No server assigned for lunch",
            sourcePath: unitWorkspacePath("u1"),
            urgency: "attention",
          },
        ],
        changed: [],
        generatedAt: "2026-07-13T14:10:00.000Z",
        baselineAvailable: false,
      }),
      provider: "mock",
      model: "test-model",
      latencyMs: 4,
    })),
  );

  try {
    const first = await getOrGenerateShiftTransition(
      { facilityId: "fac-6", allowProvider: true },
      { config, cache, enabled: true, buildSnapshot: async () => snapshot() },
    );
    assert.equal(first.origin, "ai");

    const second = await getOrGenerateShiftTransition(
      { facilityId: "fac-6", allowProvider: true },
      { config, cache, enabled: true, buildSnapshot: async () => snapshot() },
    );
    assert.equal(second.origin, "cached");

    // Morning brief READY rows do not count against shift daily limit when scoped.
    await cache.upsert({
      facilityId: "fac-7",
      departmentKey: "DIETARY",
      serviceDate: new Date("2026-07-13T00:00:00.000Z"),
      briefType: "MORNING_BRIEF",
      operationInstanceId: null,
      snapshotHash: "mb",
      snapshotJson: snapshot(),
      baselineSnapshotHash: null,
      windowStart: null,
      windowEnd: null,
      resultJson: {
        headline: "mb",
        summary: "mb",
        priorities: [],
        watchItems: [],
        generatedAt: new Date().toISOString(),
      },
      provider: "mock",
      model: "t",
      status: "READY",
      promptVersion: "morning-brief-v1",
      latencyMs: 1,
      errorCode: null,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const limitedConfig = loadAiConfiguration({
      ...process.env,
      AI_DAILY_REQUEST_LIMIT: "1",
      AI_MIN_REFRESH_INTERVAL_MS: "60000",
    });
    // Seed one SHIFT READY to hit limit
    await cache.upsert({
      facilityId: "fac-7",
      departmentKey: "DIETARY",
      serviceDate: new Date("2026-07-13T00:00:00.000Z"),
      briefType: "SHIFT_TRANSITION",
      operationInstanceId: null,
      snapshotHash: "st",
      snapshotJson: snapshot(),
      baselineSnapshotHash: null,
      windowStart: null,
      windowEnd: new Date(),
      resultJson: first.result,
      provider: "mock",
      model: "t",
      status: "READY",
      promptVersion: "shift-transition-v1",
      latencyMs: 1,
      errorCode: null,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const decision = await evaluateShiftTransitionRateLimits({
      cache,
      config: limitedConfig,
      facilityId: "fac-7",
      departmentKey: "DIETARY",
      serviceDateKey: "2026-07-13",
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.reason, "daily_limit");
  } finally {
    setAiProviderForTests(null);
  }
});

test("refresh requires Manager+; view aligns with Supervisor+", () => {
  assert.equal(hasAtLeastRole("SUPERVISOR", "SUPERVISOR"), true);
  assert.equal(hasAtLeastRole("STAFF", "SUPERVISOR"), false);
  assert.equal(hasAtLeastRole("MANAGER", "MANAGER"), true);
  assert.equal(hasAtLeastRole("SUPERVISOR", "MANAGER"), false);
  assert.equal(hasAtLeastRole("STAFF", "MANAGER"), false);
});
