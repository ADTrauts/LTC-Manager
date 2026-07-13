import assert from "node:assert/strict";
import test from "node:test";

import { loadAiConfiguration } from "@/lib/ai/configuration";
import {
  AiDisabledError,
  AiInvalidResponseError,
  AiProviderFailureError,
  AiTimeoutError,
} from "@/lib/ai/errors";
import { generateStructuredResponse, parseJsonObject } from "@/lib/ai/generate-structured-response";
import { createMemoryBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";
import { getOrGenerateMorningBrief } from "@/lib/ai/morning-brief/generate-morning-brief";
import { evaluateMorningBriefRateLimits } from "@/lib/ai/morning-brief/rate-limits";
import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import { unitWorkspacePath } from "@/lib/ai/operational-snapshot/source-paths";
import { setAiProviderForTests } from "@/lib/ai/provider";
import type { AiGenerateStructuredRequest, AiGenerateStructuredResult, AiProvider } from "@/lib/ai/types";

function withEnv(name: string, value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
}

function snapshot(): OperationalSnapshot {
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
    readiness: { ready: 3, inProgress: 0, needsAttention: 1 },
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
    issues: { urgent: 0, high: 0, inProgress: 0, supplyShorts: 0 },
    inspections: { overdue: 0, dueNow: 0, openFindings: 0 },
    handoffs: [],
    allowedSourcePaths: [unitWorkspacePath("u1"), "/today/coverage", "/staffing"],
  };
}

function stubProvider(
  impl: (req: AiGenerateStructuredRequest) => Promise<AiGenerateStructuredResult>,
): AiProvider {
  return {
    name: "mock",
    model: "test-model",
    generateStructured: impl,
  };
}

test("loadAiConfiguration defaults provider to mock and brief disabled", async () => {
  await withEnv("AI_BRIEF_ENABLED", undefined, () => {
    withEnv("AI_PROVIDER", undefined, () => {
      const config = loadAiConfiguration({ ...process.env });
      assert.equal(config.enabled, false);
      assert.equal(config.provider, "mock");
    });
  });
});

test("generateStructuredResponse throws when disabled", async () => {
  const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "false" });
  await assert.rejects(
    () =>
      generateStructuredResponse(config, {
        system: "s",
        user: "u",
        schemaDescription: "{}",
      }),
    (err: unknown) => err instanceof AiDisabledError,
  );
});

test("provider success path returns structured text", async () => {
  setAiProviderForTests(
    stubProvider(async () => ({
      rawText: JSON.stringify({ ok: true }),
      provider: "mock",
      model: "test-model",
      latencyMs: 1,
    })),
  );
  try {
    const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" });
    const result = await generateStructuredResponse(config, {
      system: "s",
      user: "u",
      schemaDescription: "{}",
    });
    assert.equal((parseJsonObject(result.rawText) as { ok: boolean }).ok, true);
  } finally {
    setAiProviderForTests(null);
  }
});

test("provider timeout surfaces AiTimeoutError", async () => {
  setAiProviderForTests(
    stubProvider(async () => {
      throw new AiTimeoutError();
    }),
  );
  try {
    const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" });
    await assert.rejects(
      () =>
        generateStructuredResponse(config, {
          system: "s",
          user: "u",
          schemaDescription: "{}",
        }),
      (err: unknown) => err instanceof AiTimeoutError,
    );
  } finally {
    setAiProviderForTests(null);
  }
});

test("provider failure surfaces AiProviderFailureError", async () => {
  setAiProviderForTests(
    stubProvider(async () => {
      throw new AiProviderFailureError("boom");
    }),
  );
  try {
    const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" });
    await assert.rejects(
      () =>
        generateStructuredResponse(config, {
          system: "s",
          user: "u",
          schemaDescription: "{}",
        }),
      (err: unknown) => err instanceof AiProviderFailureError,
    );
  } finally {
    setAiProviderForTests(null);
  }
});

test("malformed JSON is rejected by parseJsonObject", () => {
  assert.throws(() => parseJsonObject("not-json"), (err: unknown) => err instanceof AiInvalidResponseError);
});

test("getOrGenerateMorningBrief returns fallback when provider disabled", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "false" });
  const view = await getOrGenerateMorningBrief(
    { facilityId: "fac-1", allowProvider: true },
    {
      config,
      cache,
      buildSnapshot: async () => snapshot(),
    },
  );
  assert.equal(view.title, "Operational Summary");
  assert.equal(view.origin, "fallback");
  assert.equal(view.fallbackReason, "disabled");
});

test("same snapshot hash returns cached AI brief", async () => {
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
        headline: "Lunch preparation needs attention at 2A MLK.",
        summary: "Start with 2A MLK: no server is currently assigned for lunch.",
        priorities: [
          {
            title: "2A MLK",
            reason: "No server assigned for lunch",
            sourcePath: unitWorkspacePath("u1"),
            urgency: "attention",
          },
        ],
        watchItems: ["One coverage gap on Today's Work."],
        generatedAt: "2026-07-12T14:10:00.000Z",
      }),
      provider: "mock",
      model: "test-model",
      latencyMs: 5,
    })),
  );

  try {
    const first = await getOrGenerateMorningBrief(
      { facilityId: "fac-1", allowProvider: true },
      { config, cache, buildSnapshot: async () => snapshot() },
    );
    assert.equal(first.origin, "ai");
    assert.equal(first.title, "Morning Brief");

    const second = await getOrGenerateMorningBrief(
      { facilityId: "fac-1", allowProvider: true },
      { config, cache, buildSnapshot: async () => snapshot() },
    );
    assert.equal(second.origin, "cached");
    assert.equal(second.result.headline, first.result.headline);
  } finally {
    setAiProviderForTests(null);
  }
});

test("provider failure falls back without crashing", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({
    ...process.env,
    AI_BRIEF_ENABLED: "true",
    AI_MIN_REFRESH_INTERVAL_MS: "1",
  });
  setAiProviderForTests(
    stubProvider(async () => {
      throw new AiTimeoutError();
    }),
  );
  try {
    const view = await getOrGenerateMorningBrief(
      { facilityId: "fac-2", allowProvider: true },
      { config, cache, buildSnapshot: async () => snapshot() },
    );
    assert.equal(view.origin, "fallback");
    assert.equal(view.title, "Operational Summary");
    assert.equal(view.fallbackReason, "TIMEOUT");
    assert.ok(view.result.headline.length > 0);
  } finally {
    setAiProviderForTests(null);
  }
});

test("daily limit and min interval are enforced", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({
    ...process.env,
    AI_BRIEF_ENABLED: "true",
    AI_DAILY_REQUEST_LIMIT: "1",
    AI_MIN_REFRESH_INTERVAL_MS: "60000",
  });

  await cache.upsert({
    facilityId: "fac-3",
    departmentKey: "DIETARY",
    serviceDate: new Date("2026-07-12T00:00:00.000Z"),
    briefType: "MORNING_BRIEF",
    operationInstanceId: null,
    snapshotHash: "abc",
    snapshotJson: null,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: {
      headline: "Cached",
      summary: "Cached summary.",
      priorities: [],
      watchItems: [],
      generatedAt: new Date().toISOString(),
    },
    provider: "mock",
    model: "test",
    status: "READY",
    promptVersion: "morning-brief-v1",
    latencyMs: 1,
    errorCode: null,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });

  const daily = await evaluateMorningBriefRateLimits({
    cache,
    config,
    facilityId: "fac-3",
    departmentKey: "DIETARY",
    serviceDateKey: "2026-07-12",
  });
  assert.equal(daily.ok, false);
  if (!daily.ok) assert.equal(daily.reason, "daily_limit");

  const intervalConfig = loadAiConfiguration({
    ...process.env,
    AI_BRIEF_ENABLED: "true",
    AI_DAILY_REQUEST_LIMIT: "100",
    AI_MIN_REFRESH_INTERVAL_MS: "60000",
  });
  const interval = await evaluateMorningBriefRateLimits({
    cache,
    config: intervalConfig,
    facilityId: "fac-3",
    departmentKey: "DIETARY",
    serviceDateKey: "2026-07-12",
  });
  assert.equal(interval.ok, false);
  if (!interval.ok) assert.equal(interval.reason, "min_interval");
});

test("SSR path does not call provider", async () => {
  let called = false;
  setAiProviderForTests(
    stubProvider(async () => {
      called = true;
      return {
        rawText: "{}",
        provider: "mock",
        model: "x",
        latencyMs: 1,
      };
    }),
  );
  try {
    const cache = createMemoryBriefCacheStore();
    const config = loadAiConfiguration({ ...process.env, AI_BRIEF_ENABLED: "true" });
    const view = await getOrGenerateMorningBrief(
      { facilityId: "fac-4", allowProvider: false },
      { config, cache, buildSnapshot: async () => snapshot() },
    );
    assert.equal(called, false);
    assert.equal(view.origin, "fallback");
  } finally {
    setAiProviderForTests(null);
  }
});
