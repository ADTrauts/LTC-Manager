import assert from "node:assert/strict";
import test from "node:test";

import { AiInvalidResponseError } from "@/lib/ai/errors";
import { createMemoryBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";
import { loadAiConfiguration } from "@/lib/ai/configuration";
import { AiTimeoutError } from "@/lib/ai/errors";
import { setAiProviderForTests } from "@/lib/ai/provider";
import { buildFallbackRecoveryGuidance } from "@/lib/ai/recovery-assistant/fallback-recovery-guidance";
import { getOrGenerateRecoveryAssistant } from "@/lib/ai/recovery-assistant/generate-recovery-assistant";
import {
  buildRecoveryAssistantSystemPrompt,
  RECOVERY_ASSISTANT_PROMPT_VERSION,
} from "@/lib/ai/recovery-assistant/recovery-prompt";
import { evaluateRecoveryAssistantRateLimits } from "@/lib/ai/recovery-assistant/rate-limits";
import {
  hashRecoverySnapshot,
  sanitizePlainText,
  sanitizeRecoverySnapshot,
} from "@/lib/ai/recovery-assistant/sanitize";
import type { RecoverySnapshot } from "@/lib/ai/recovery-assistant/types";
import { validateRecoveryAssistantResponse } from "@/lib/ai/recovery-assistant/validate-recovery-response";
import type { AiGenerateStructuredRequest, AiGenerateStructuredResult, AiProvider } from "@/lib/ai/types";
import { hasAtLeastRole } from "@/lib/access";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

function sampleSnapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  const issueId = "issue-1";
  return {
    generatedAt: "2026-07-13T15:00:00.000Z",
    facilityLocalTime: "2026-07-13 11:00",
    timezone: "America/New_York",
    serviceDate: "2026-07-13",
    department: "DIETARY",
    activeOperation: {
      label: "Lunch preparation",
      phase: "Preparation",
      scheduledTime: "11:30",
    },
    issue: {
      id: issueId,
      issueType: "EQUIPMENT",
      title: "Dishwasher not heating",
      sanitizedDescription: "Wash tank temperature below target.",
      priority: "URGENT",
      recoveryStage: "REPORTED",
      reportedAt: "2026-07-13T14:00:00.000Z",
      dueAt: null,
      assigned: false,
      relatedAsset: {
        id: "asset-1",
        name: "Main dishwasher",
        status: "OUT_OF_SERVICE",
        criticality: "Critical",
      },
      location: {
        id: "unit-1",
        name: "Main Kitchen",
        readinessState: "needs_attention",
        readinessReason: "Urgent issue needs attention",
      },
      recentUpdates: [],
    },
    operationalImpact: {
      currentServiceAtRisk: true,
      currentOperationLabel: "Lunch preparation",
      affectedSignals: ["urgent priority", "unassigned"],
      staffingState: "no staffing signal from readiness",
      relatedSupplyShorts: 0,
      relatedOpenIssues: 1,
    },
    knowledge: [
      {
        title: "Dishwasher shutdown SOP",
        summary: "Isolate power and divert to backup if available.",
        category: "SOP",
        sourcePath: `${issueDetailPath(issueId)}#guidance-k1`,
      },
    ],
    availableActions: [
      {
        key: "assign_owner",
        label: "Assign an owner (human action required)",
        sourcePath: issueDetailPath(issueId),
      },
      {
        key: "unit_workspace",
        label: "Open unit workspace",
        sourcePath: "/unit/unit-1",
      },
    ],
    allowedSourcePaths: [
      issueDetailPath(issueId),
      "/unit/unit-1",
      "/assets",
      `${issueDetailPath(issueId)}#guidance-k1`,
    ],
    ...overrides,
  };
}

function stubProvider(
  impl: (req: AiGenerateStructuredRequest) => Promise<AiGenerateStructuredResult>,
): AiProvider {
  return { name: "mock", model: "test", generateStructured: impl };
}

test("recovery prompt is versioned and forbids autonomous mutations", () => {
  assert.equal(RECOVERY_ASSISTANT_PROMPT_VERSION, "recovery-assistant-v1");
  const system = buildRecoveryAssistantSystemPrompt();
  assert.match(system, /Never instruct the user to automatically assign/i);
  assert.match(system, /Needs Attention/);
  assert.doesNotMatch(system, /close the issue automatically|auto-assign/i);
});

test("sanitize strips emails/phones and PII-shaped keys", () => {
  const dirty = {
    ...sampleSnapshot(),
    employeeName: "Jane Doe",
    issue: {
      ...sampleSnapshot().issue,
      sanitizedDescription: "Call jane@example.com or 555-123-4567 for parts.",
    },
  } as RecoverySnapshot & { employeeName: string };
  const clean = sanitizeRecoverySnapshot(dirty);
  assert.equal("employeeName" in clean, false);
  assert.doesNotMatch(clean.issue.sanitizedDescription, /jane@example.com|555-123/);
  assert.match(sanitizePlainText("a".repeat(500), 10), /^a{10}$/);
});

test("hashRecoverySnapshot changes when issue update changes", () => {
  const a = sampleSnapshot();
  const b = sampleSnapshot({
    issue: {
      ...sampleSnapshot().issue,
      recentUpdates: [
        {
          timestamp: "2026-07-13T14:30:00.000Z",
          sanitizedSummary: "Technician en route",
          status: "IN_PROGRESS",
        },
      ],
      recoveryStage: "IN_PROGRESS",
      assigned: true,
    },
  });
  assert.notEqual(hashRecoverySnapshot(a), hashRecoverySnapshot(b));
});

test("validateRecoveryAssistantResponse removes unknown paths and knowledge", () => {
  const snap = sampleSnapshot();
  const result = validateRecoveryAssistantResponse(
    {
      headline: "Assign an owner for the dishwasher.",
      situation: "Urgent equipment issue. Location Needs Attention. No owner yet.",
      checkFirst: [
        {
          action: "Invented",
          reason: "x",
          sourcePath: "/unit/unknown",
        },
        {
          action: "Assign an owner",
          reason: "Unassigned",
          sourcePath: issueDetailPath("issue-1"),
        },
      ],
      recoveryOptions: [
        {
          title: "Follow SOP",
          description: "Use linked shutdown SOP.",
          sourcePath: `${issueDetailPath("issue-1")}#guidance-k1`,
          confidence: "supported",
        },
      ],
      missingInformation: ["Assigned owner"],
      knowledgeUsed: [
        {
          title: "Fake article",
          sourcePath: `${issueDetailPath("issue-1")}#guidance-fake`,
        },
        {
          title: "Dishwasher shutdown SOP",
          sourcePath: `${issueDetailPath("issue-1")}#guidance-k1`,
        },
      ],
    },
    snap.allowedSourcePaths,
    new Set(snap.knowledge.map((k) => k.title)),
    new Set(snap.knowledge.map((k) => k.sourcePath)),
    "now",
  );
  assert.equal(result.checkFirst.length, 1);
  assert.equal(result.knowledgeUsed.length, 1);
  assert.equal(result.knowledgeUsed[0]!.title, "Dishwasher shutdown SOP");
});

test("validateRecoveryAssistantResponse rejects invalid confidence via schema", () => {
  assert.throws(
    () =>
      validateRecoveryAssistantResponse(
        {
          headline: "x",
          situation: "y",
          checkFirst: [],
          recoveryOptions: [
            {
              title: "t",
              description: "d",
              sourcePath: null,
              confidence: "high",
            },
          ],
          missingInformation: [],
          knowledgeUsed: [],
        },
        [],
        new Set(),
        new Set(),
        "now",
      ),
    (err: unknown) => err instanceof AiInvalidResponseError,
  );
});

test("fallback urgent unassigned equipment includes assign and knowledge", () => {
  const result = buildFallbackRecoveryGuidance(sampleSnapshot());
  assert.match(result.headline, /owner/i);
  assert.ok(result.checkFirst.some((c) => /Assign/i.test(c.action)));
  assert.ok(result.knowledgeUsed.length >= 1);
  assert.ok(result.missingInformation.includes("Assigned owner"));
});

test("fallback in-progress assigned issue focuses on latest update", () => {
  const result = buildFallbackRecoveryGuidance(
    sampleSnapshot({
      issue: {
        ...sampleSnapshot().issue,
        assigned: true,
        recoveryStage: "IN_PROGRESS",
        recentUpdates: [
          {
            timestamp: "2026-07-13T14:40:00.000Z",
            sanitizedSummary: "Parts ordered",
            status: "IN_PROGRESS",
          },
        ],
      },
    }),
  );
  assert.match(result.headline, /in progress/i);
  assert.ok(result.checkFirst.some((c) => /latest recovery update/i.test(c.action)));
});

test("fallback supply shortage and safety without knowledge stay conservative", () => {
  const supply = buildFallbackRecoveryGuidance(
    sampleSnapshot({
      issue: {
        ...sampleSnapshot().issue,
        issueType: "SUPPLY_SHORT",
        title: "Sanitizer short",
        relatedAsset: null,
      },
      knowledge: [],
    }),
  );
  assert.match(supply.recoveryOptions[0]!.description, /stock|substitute/i);

  const safety = buildFallbackRecoveryGuidance(
    sampleSnapshot({
      issue: {
        ...sampleSnapshot().issue,
        issueType: "SAFETY",
        title: "Wet floor hazard",
        relatedAsset: null,
      },
      knowledge: [],
    }),
  );
  assert.match(safety.recoveryOptions[0]!.description, /Do not invent|No published safety/i);
  assert.ok(safety.missingInformation.some((m) => /safety procedure/i.test(m)));
});

test("fallback resolved issue monitors without pushy recovery steps", () => {
  const result = buildFallbackRecoveryGuidance(
    sampleSnapshot({
      issue: {
        ...sampleSnapshot().issue,
        assigned: true,
        recoveryStage: "RESOLVED",
      },
    }),
  );
  assert.match(result.headline, /resolved/i);
  assert.ok(result.recoveryOptions.some((o) => /Monitor/i.test(o.title)));
});

test("getOrGenerateRecoveryAssistant is read-only and falls back when disabled", async () => {
  const cache = createMemoryBriefCacheStore();
  const view = await getOrGenerateRecoveryAssistant(
    {
      facilityId: "fac-1",
      issueId: "issue-1",
      viewerDepartmentIds: null,
      allowProvider: true,
    },
    {
      enabled: false,
      cache,
      buildSnapshot: async () => {
        const snapshot = sampleSnapshot();
        return { snapshot, snapshotHash: hashRecoverySnapshot(snapshot) };
      },
    },
  );
  assert.equal(view.origin, "fallback");
  assert.equal(view.cardTitle, "Operational guidance");
});

test("SSR does not call provider; timeout falls back", async () => {
  const cache = createMemoryBriefCacheStore();
  let called = false;
  setAiProviderForTests(
    stubProvider(async () => {
      called = true;
      throw new AiTimeoutError();
    }),
  );
  try {
    const ssr = await getOrGenerateRecoveryAssistant(
      {
        facilityId: "fac-1",
        issueId: "issue-1",
        viewerDepartmentIds: null,
        allowProvider: false,
      },
      {
        enabled: true,
        cache,
        buildSnapshot: async () => {
          const snapshot = sampleSnapshot();
          return { snapshot, snapshotHash: hashRecoverySnapshot(snapshot) };
        },
      },
    );
    assert.equal(called, false);
    assert.equal(ssr.origin, "fallback");

    const timed = await getOrGenerateRecoveryAssistant(
      {
        facilityId: "fac-1",
        issueId: "issue-1",
        viewerDepartmentIds: null,
        allowProvider: true,
      },
      {
        enabled: true,
        config: loadAiConfiguration({
          ...process.env,
          AI_BRIEF_ENABLED: "true",
          AI_MIN_REFRESH_INTERVAL_MS: "1",
        }),
        cache,
        buildSnapshot: async () => {
          const snapshot = sampleSnapshot();
          return { snapshot, snapshotHash: hashRecoverySnapshot(snapshot) };
        },
      },
    );
    assert.equal(timed.fallbackReason, "TIMEOUT");
  } finally {
    setAiProviderForTests(null);
  }
});

test("same snapshot hash returns cached AI result; rate limits scoped by issue", async () => {
  const cache = createMemoryBriefCacheStore();
  const config = loadAiConfiguration({
    ...process.env,
    AI_BRIEF_ENABLED: "true",
    AI_MIN_REFRESH_INTERVAL_MS: "1",
    AI_DAILY_REQUEST_LIMIT: "100",
  });
  const snapshot = sampleSnapshot();
  const snapshotHash = hashRecoverySnapshot(snapshot);

  setAiProviderForTests(
    stubProvider(async () => ({
      rawText: JSON.stringify({
        headline: "Assign an owner for the dishwasher.",
        situation: "Urgent equipment issue at Main Kitchen.",
        checkFirst: [
          {
            action: "Assign an owner",
            reason: "Unassigned",
            sourcePath: issueDetailPath("issue-1"),
          },
        ],
        recoveryOptions: [
          {
            title: "Follow SOP",
            description: "Use dishwasher shutdown SOP.",
            sourcePath: `${issueDetailPath("issue-1")}#guidance-k1`,
            confidence: "supported",
          },
        ],
        missingInformation: ["Assigned owner"],
        knowledgeUsed: [
          {
            title: "Dishwasher shutdown SOP",
            sourcePath: `${issueDetailPath("issue-1")}#guidance-k1`,
          },
        ],
        generatedAt: "2026-07-13T15:05:00.000Z",
      }),
      provider: "mock",
      model: "test",
      latencyMs: 3,
    })),
  );

  try {
    const first = await getOrGenerateRecoveryAssistant(
      {
        facilityId: "fac-2",
        issueId: "issue-1",
        viewerDepartmentIds: null,
        allowProvider: true,
      },
      {
        enabled: true,
        config,
        cache,
        buildSnapshot: async () => ({ snapshot, snapshotHash }),
      },
    );
    assert.equal(first.origin, "ai");

    const second = await getOrGenerateRecoveryAssistant(
      {
        facilityId: "fac-2",
        issueId: "issue-1",
        viewerDepartmentIds: null,
        allowProvider: true,
      },
      {
        enabled: true,
        config,
        cache,
        buildSnapshot: async () => ({ snapshot, snapshotHash }),
      },
    );
    assert.equal(second.origin, "cached");

    await cache.upsert({
      facilityId: "fac-3",
      departmentKey: "DIETARY",
      serviceDate: new Date("2026-07-13T00:00:00.000Z"),
      briefType: "RECOVERY_ASSISTANT",
      operationInstanceId: "issue-9",
      snapshotHash: "other",
      snapshotJson: null,
      baselineSnapshotHash: null,
      windowStart: null,
      windowEnd: null,
      resultJson: first.result,
      provider: "mock",
      model: "t",
      status: "READY",
      promptVersion: "recovery-assistant-v1",
      latencyMs: 1,
      errorCode: null,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const limited = loadAiConfiguration({
      ...process.env,
      AI_DAILY_REQUEST_LIMIT: "1",
      AI_MIN_REFRESH_INTERVAL_MS: "60000",
    });
    const decision = await evaluateRecoveryAssistantRateLimits({
      cache,
      config: limited,
      facilityId: "fac-3",
      departmentKey: "DIETARY",
      serviceDateKey: "2026-07-13",
      issueId: "issue-9",
    });
    assert.equal(decision.ok, false);
  } finally {
    setAiProviderForTests(null);
  }
});

test("RBAC: Supervisor views, Manager refreshes, Staff denied refresh", () => {
  assert.equal(hasAtLeastRole("SUPERVISOR", "SUPERVISOR"), true);
  assert.equal(hasAtLeastRole("STAFF", "SUPERVISOR"), false);
  assert.equal(hasAtLeastRole("MANAGER", "MANAGER"), true);
  assert.equal(hasAtLeastRole("SUPERVISOR", "MANAGER"), false);
});

test("read-only guarantee: generation path never exposes mutation verbs in fallback options for safety", () => {
  const result = buildFallbackRecoveryGuidance(
    sampleSnapshot({
      issue: { ...sampleSnapshot().issue, issueType: "SAFETY" },
      knowledge: [],
    }),
  );
  const blob = JSON.stringify(result);
  assert.doesNotMatch(blob, /auto-assign|automatically close|send notification/i);
});
