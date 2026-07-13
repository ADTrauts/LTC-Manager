import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { loadAiConfiguration, type AiConfiguration } from "@/lib/ai/configuration";
import { AiError, AiInvalidResponseError, isAiError } from "@/lib/ai/errors";
import { generateStructuredResponse, parseJsonObject } from "@/lib/ai/generate-structured-response";
import {
  createMemoryBriefCacheStore,
  type MorningBriefCacheStore,
} from "@/lib/ai/morning-brief/cache-store";
import { createPrismaBriefCacheStore } from "@/lib/ai/morning-brief/prisma-cache-store";
import { diffOperationalSnapshots } from "@/lib/ai/operational-snapshot/diff-operational-snapshots";
import {
  buildOperationalSnapshot,
  hashOperationalSnapshot,
  type OperationalSnapshot,
} from "@/lib/ai/operational-snapshot";
import { isAiShiftSummaryEnabled } from "@/lib/feature-flags";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { buildShiftContextLabel, formatShiftWindowLabel, resolveShiftLookbackMs } from "./context";
import { buildFallbackShiftTransition } from "./fallback";
import {
  buildShiftTransitionSystemPrompt,
  buildShiftTransitionUserPrompt,
  SHIFT_TRANSITION_PROMPT_VERSION,
  SHIFT_TRANSITION_SCHEMA_DESCRIPTION,
} from "./prompt";
import { evaluateShiftTransitionRateLimits } from "./rate-limits";
import type { ShiftTransitionResult, ShiftTransitionView } from "./types";
import { validateShiftTransitionResponse } from "./validate-response";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type GenerateShiftTransitionInput = {
  facilityId: string;
  departmentKey?: OperationalDepartmentKey | null;
  now?: Date;
  forceRefresh?: boolean;
  allowProvider?: boolean;
};

export type ShiftTransitionDeps = {
  config?: AiConfiguration;
  cache?: MorningBriefCacheStore;
  enabled?: boolean;
  buildSnapshot?: (input: {
    facilityId: string;
    departmentContext?: OperationalDepartmentKey | null;
    now?: Date;
  }) => Promise<OperationalSnapshot>;
  lookbackMs?: number;
};

let memoryFallbackCache: MorningBriefCacheStore | null = null;

function resolveCache(deps?: ShiftTransitionDeps): MorningBriefCacheStore {
  if (deps?.cache) return deps.cache;
  try {
    return createPrismaBriefCacheStore(prisma);
  } catch {
    memoryFallbackCache ??= createMemoryBriefCacheStore();
    return memoryFallbackCache;
  }
}

function toView(input: {
  result: ShiftTransitionResult;
  origin: ShiftTransitionView["origin"];
  cardTitle: ShiftTransitionView["cardTitle"];
  contextLabel: string;
  windowLabel: string;
  snapshotHash: string;
  baselineSnapshotHash: string | null;
  provider: string | null;
  model: string | null;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
}): ShiftTransitionView {
  return {
    cardTitle: input.cardTitle,
    origin: input.origin,
    result: input.result,
    contextLabel: input.contextLabel,
    windowLabel: input.windowLabel,
    provider: input.provider,
    model: input.model,
    snapshotHash: input.snapshotHash,
    baselineSnapshotHash: input.baselineSnapshotHash,
    promptVersion: SHIFT_TRANSITION_PROMPT_VERSION,
    fallbackReason: input.fallbackReason,
    canRefresh: input.canRefresh,
    refreshBlockedReason: input.refreshBlockedReason,
    generatedAt: input.result.generatedAt,
  };
}

function cardTitleFor(result: ShiftTransitionResult, origin: ShiftTransitionView["origin"]): ShiftTransitionView["cardTitle"] {
  if (origin === "ai" || origin === "cached") return "Shift Transition Summary";
  return result.baselineAvailable ? "Operational Change Summary" : "Operational Summary";
}

async function persistShiftBrief(input: {
  cache: MorningBriefCacheStore;
  facilityId: string;
  departmentKey: string;
  serviceDateKey: string;
  snapshotHash: string;
  snapshot: OperationalSnapshot;
  baselineSnapshotHash: string | null;
  windowStart: Date | null;
  windowEnd: Date;
  result: ShiftTransitionResult;
  provider: string;
  model: string;
  status: "READY" | "FALLBACK" | "FAILED";
  latencyMs: number | null;
  errorCode: string | null;
  now: Date;
}) {
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDateKey);
  await input.cache.upsert({
    facilityId: input.facilityId,
    departmentKey: input.departmentKey,
    serviceDate,
    briefType: "SHIFT_TRANSITION",
    operationInstanceId: null,
    snapshotHash: input.snapshotHash,
    snapshotJson: input.snapshot,
    baselineSnapshotHash: input.baselineSnapshotHash,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    resultJson: input.result,
    provider: input.provider,
    model: input.model,
    status: input.status,
    promptVersion: SHIFT_TRANSITION_PROMPT_VERSION,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode,
    generatedAt: input.now,
    expiresAt: new Date(input.now.getTime() + CACHE_TTL_MS),
  });
}

/**
 * Shift Transition Summary for Today's Work Handoffs.
 * SSR: allowProvider=false. Refresh actions: allowProvider=true.
 */
export async function getOrGenerateShiftTransition(
  input: GenerateShiftTransitionInput,
  deps?: ShiftTransitionDeps,
): Promise<ShiftTransitionView> {
  const config = deps?.config ?? loadAiConfiguration();
  const enabled = deps?.enabled ?? isAiShiftSummaryEnabled();
  const cache = resolveCache(deps);
  const now = input.now ?? new Date();
  const departmentKey = input.departmentKey ?? "DIETARY";
  const buildSnapshot = deps?.buildSnapshot ?? buildOperationalSnapshot;
  const lookbackMs = deps?.lookbackMs ?? resolveShiftLookbackMs();

  const snapshot = await buildSnapshot({
    facilityId: input.facilityId,
    departmentContext: departmentKey,
    now,
  });
  const snapshotHash = hashOperationalSnapshot(snapshot);
  const serviceDate = facilityLocalDateToServiceDate(snapshot.serviceDate);

  const baselineRecord = await cache.findBaselineSnapshot({
    facilityId: input.facilityId,
    departmentKey,
    now,
    lookbackMs,
    excludeSnapshotHash: snapshotHash,
  });

  let baseline: OperationalSnapshot | null = null;
  let baselineHash: string | null = null;
  if (
    baselineRecord?.snapshotJson &&
    baselineRecord.facilityId === input.facilityId &&
    baselineRecord.departmentKey === departmentKey
  ) {
    const age = now.getTime() - baselineRecord.generatedAt.getTime();
    if (age > 0 && age <= lookbackMs) {
      baseline = baselineRecord.snapshotJson;
      baselineHash = baselineRecord.snapshotHash;
    }
  }

  const diff = diffOperationalSnapshots({
    current: snapshot,
    baseline,
    currentHash: snapshotHash,
    baselineHash,
    windowStart: baseline?.generatedAt ?? null,
  });

  const contextLabel = buildShiftContextLabel({
    department: departmentKey,
    current: snapshot,
    baseline,
  });
  const windowLabel = formatShiftWindowLabel({
    timezone: snapshot.timezone,
    windowStart: diff.windowStart,
    windowEnd: diff.windowEnd,
    baselineAvailable: diff.baselineAvailable,
  });

  const rate = await evaluateShiftTransitionRateLimits({
    cache,
    config: { ...config, enabled },
    facilityId: input.facilityId,
    departmentKey,
    serviceDateKey: snapshot.serviceDate,
    now,
  });

  const canRefresh = enabled && rate.ok;
  const refreshBlockedReason = !enabled
    ? "AI shift summary disabled"
    : rate.ok
      ? null
      : rate.message;

  const cacheKeyHash = baselineHash ? `${snapshotHash}:${baselineHash}` : snapshotHash;
  const cachedExact = await cache.findByHash({
    facilityId: input.facilityId,
    departmentKey,
    serviceDate,
    briefType: "SHIFT_TRANSITION",
    snapshotHash: cacheKeyHash,
  });

  if (cachedExact && cachedExact.status === "READY" && !input.forceRefresh) {
    const result = cachedExact.resultJson as ShiftTransitionResult;
    return toView({
      result,
      origin: "cached",
      cardTitle: cardTitleFor(result, "cached"),
      contextLabel,
      windowLabel,
      snapshotHash,
      baselineSnapshotHash: baselineHash,
      provider: cachedExact.provider,
      model: cachedExact.model,
      fallbackReason: null,
      canRefresh,
      refreshBlockedReason,
    });
  }

  const buildFallbackView = (reason: string | null, origin: ShiftTransitionView["origin"] = "fallback") => {
    const result = buildFallbackShiftTransition({ current: snapshot, diff, contextLabel });
    return toView({
      result,
      origin,
      cardTitle: cardTitleFor(result, origin),
      contextLabel,
      windowLabel,
      snapshotHash,
      baselineSnapshotHash: baselineHash,
      provider: null,
      model: null,
      fallbackReason: reason,
      canRefresh,
      refreshBlockedReason,
    });
  };

  if (!enabled || !input.allowProvider) {
    if (cachedExact) {
      const isAi = cachedExact.status === "READY";
      const result = cachedExact.resultJson as ShiftTransitionResult;
      return toView({
        result,
        origin: isAi ? "cached" : "fallback",
        cardTitle: cardTitleFor(result, isAi ? "cached" : "fallback"),
        contextLabel,
        windowLabel,
        snapshotHash,
        baselineSnapshotHash: baselineHash,
        provider: isAi ? cachedExact.provider : null,
        model: isAi ? cachedExact.model : null,
        fallbackReason: isAi ? null : cachedExact.errorCode ?? "cached_fallback",
        canRefresh,
        refreshBlockedReason,
      });
    }
    return buildFallbackView(enabled ? "awaiting_generation" : "disabled");
  }

  if (!rate.ok) {
    if (cachedExact) {
      const result = cachedExact.resultJson as ShiftTransitionResult;
      const isAi = cachedExact.status === "READY";
      return toView({
        result,
        origin: isAi ? "cached" : "fallback",
        cardTitle: cardTitleFor(result, isAi ? "cached" : "fallback"),
        contextLabel,
        windowLabel,
        snapshotHash,
        baselineSnapshotHash: baselineHash,
        provider: isAi ? cachedExact.provider : null,
        model: isAi ? cachedExact.model : null,
        fallbackReason: rate.reason,
        canRefresh: false,
        refreshBlockedReason: rate.message,
      });
    }
    const fallback = buildFallbackShiftTransition({ current: snapshot, diff, contextLabel });
    await persistShiftBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash: cacheKeyHash,
      snapshot,
      baselineSnapshotHash: baselineHash,
      windowStart: baseline ? new Date(baseline.generatedAt) : null,
      windowEnd: now,
      result: fallback,
      provider: "none",
      model: "fallback",
      status: "FALLBACK",
      latencyMs: null,
      errorCode: rate.reason,
      now,
    });
    return toView({
      result: fallback,
      origin: "fallback",
      cardTitle: cardTitleFor(fallback, "fallback"),
      contextLabel,
      windowLabel,
      snapshotHash,
      baselineSnapshotHash: baselineHash,
      provider: null,
      model: null,
      fallbackReason: rate.reason,
      canRefresh: false,
      refreshBlockedReason: rate.message,
    });
  }

  try {
    const promptPayload = {
      contextLabel,
      windowLabel,
      baselineAvailable: diff.baselineAvailable,
      current: snapshot,
      diff: {
        readinessMoves: diff.readinessMoves,
        items: diff.items.slice(0, 20),
        allowedSourcePaths: diff.allowedSourcePaths,
      },
    };
    const payloadJson = JSON.stringify(promptPayload);
    if (payloadJson.length > config.maxSnapshotChars * 2) {
      throw new AiInvalidResponseError("Shift transition payload exceeded maximum size.");
    }

    const generation = await generateStructuredResponse(
      { ...config, enabled: true },
      {
        system: buildShiftTransitionSystemPrompt(),
        user: buildShiftTransitionUserPrompt(payloadJson),
        schemaDescription: SHIFT_TRANSITION_SCHEMA_DESCRIPTION,
        temperature: 0.2,
      },
    );

    let parsed = parseJsonObject(generation.rawText);

    if (
      generation.provider === "mock" &&
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { carryForward?: unknown }).carryForward) &&
      (parsed as { carryForward: unknown[] }).carryForward.length === 0
    ) {
      const grounded = buildFallbackShiftTransition({ current: snapshot, diff, contextLabel });
      parsed = {
        ...grounded,
        title: grounded.title,
        summary: grounded.summary,
        generatedAt: new Date().toISOString(),
      };
    }

    const result = validateShiftTransitionResponse(
      parsed,
      diff.allowedSourcePaths,
      new Date().toISOString(),
      diff.baselineAvailable,
    );

    await persistShiftBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash: cacheKeyHash,
      snapshot,
      baselineSnapshotHash: baselineHash,
      windowStart: baseline ? new Date(baseline.generatedAt) : null,
      windowEnd: now,
      result,
      provider: generation.provider,
      model: generation.model,
      status: "READY",
      latencyMs: generation.latencyMs,
      errorCode: null,
      now,
    });

    return toView({
      result,
      origin: "ai",
      cardTitle: "Shift Transition Summary",
      contextLabel,
      windowLabel,
      snapshotHash,
      baselineSnapshotHash: baselineHash,
      provider: generation.provider,
      model: generation.model,
      fallbackReason: null,
      canRefresh: false,
      refreshBlockedReason: "Minimum refresh interval has not elapsed.",
    });
  } catch (error) {
    const code = isAiError(error) ? error.code : "PROVIDER_FAILURE";
    const fallback = buildFallbackShiftTransition({ current: snapshot, diff, contextLabel });
    await persistShiftBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash: cacheKeyHash,
      snapshot,
      baselineSnapshotHash: baselineHash,
      windowStart: baseline ? new Date(baseline.generatedAt) : null,
      windowEnd: now,
      result: fallback,
      provider: "none",
      model: "fallback",
      status: "FALLBACK",
      latencyMs: null,
      errorCode: code,
      now,
    });

    return toView({
      result: fallback,
      origin: "fallback",
      cardTitle: cardTitleFor(fallback, "fallback"),
      contextLabel,
      windowLabel,
      snapshotHash,
      baselineSnapshotHash: baselineHash,
      provider: null,
      model: null,
      fallbackReason: code,
      canRefresh: rate.ok && !(error instanceof AiError && error.code === "RATE_LIMITED"),
      refreshBlockedReason:
        error instanceof AiError && error.code === "RATE_LIMITED" ? error.message : refreshBlockedReason,
    });
  }
}
