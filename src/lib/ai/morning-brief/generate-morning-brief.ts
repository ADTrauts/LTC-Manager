import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { loadAiConfiguration, type AiConfiguration } from "@/lib/ai/configuration";
import {
  AiDisabledError,
  AiError,
  AiInvalidResponseError,
  AiRateLimitedError,
  isAiError,
} from "@/lib/ai/errors";
import { generateStructuredResponse, parseJsonObject } from "@/lib/ai/generate-structured-response";
import {
  buildOperationalSnapshot,
  hashOperationalSnapshot,
  type OperationalSnapshot,
} from "@/lib/ai/operational-snapshot";
import type { MorningBriefResult, MorningBriefView } from "@/lib/ai/types";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { createMemoryBriefCacheStore, type MorningBriefCacheStore } from "./cache-store";
import { buildFallbackMorningBrief } from "./fallback";
import { createPrismaBriefCacheStore } from "./prisma-cache-store";
import {
  buildMorningBriefSystemPrompt,
  buildMorningBriefUserPrompt,
  MORNING_BRIEF_PROMPT_VERSION,
  MORNING_BRIEF_SCHEMA_DESCRIPTION,
} from "./prompt";
import { evaluateMorningBriefRateLimits } from "./rate-limits";
import { validateMorningBriefResponse } from "./validate-response";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type GenerateMorningBriefInput = {
  facilityId: string;
  departmentKey?: OperationalDepartmentKey | null;
  now?: Date;
  forceRefresh?: boolean;
  /** When true, may call the provider. Default false for SSR. */
  allowProvider?: boolean;
};

export type MorningBriefDeps = {
  config?: AiConfiguration;
  cache?: MorningBriefCacheStore;
  buildSnapshot?: (input: {
    facilityId: string;
    departmentContext?: OperationalDepartmentKey | null;
    now?: Date;
  }) => Promise<OperationalSnapshot>;
};

let memoryFallbackCache: MorningBriefCacheStore | null = null;

function resolveCache(deps?: MorningBriefDeps): MorningBriefCacheStore {
  if (deps?.cache) return deps.cache;
  try {
    return createPrismaBriefCacheStore(prisma);
  } catch {
    memoryFallbackCache ??= createMemoryBriefCacheStore();
    return memoryFallbackCache;
  }
}

function toView(input: {
  result: MorningBriefResult;
  origin: MorningBriefView["origin"];
  title: MorningBriefView["title"];
  snapshotHash: string;
  provider: string | null;
  model: string | null;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
}): MorningBriefView {
  return {
    title: input.title,
    origin: input.origin,
    result: input.result,
    provider: input.provider,
    model: input.model,
    snapshotHash: input.snapshotHash,
    promptVersion: MORNING_BRIEF_PROMPT_VERSION,
    fallbackReason: input.fallbackReason,
    canRefresh: input.canRefresh,
    refreshBlockedReason: input.refreshBlockedReason,
    generatedAt: input.result.generatedAt,
  };
}

async function persistBrief(input: {
  cache: MorningBriefCacheStore;
  facilityId: string;
  departmentKey: string;
  serviceDateKey: string;
  snapshotHash: string;
  result: MorningBriefResult;
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
    operationInstanceId: null,
    snapshotHash: input.snapshotHash,
    resultJson: input.result,
    provider: input.provider,
    model: input.model,
    status: input.status,
    promptVersion: MORNING_BRIEF_PROMPT_VERSION,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode,
    generatedAt: input.now,
    expiresAt: new Date(input.now.getTime() + CACHE_TTL_MS),
  });
}

/**
 * Returns a Morning Brief for Operations Center.
 * SSR should call with allowProvider=false (cache or deterministic fallback only).
 * Refresh/ensure actions may set allowProvider=true.
 */
export async function getOrGenerateMorningBrief(
  input: GenerateMorningBriefInput,
  deps?: MorningBriefDeps,
): Promise<MorningBriefView> {
  const config = deps?.config ?? loadAiConfiguration();
  const cache = resolveCache(deps);
  const now = input.now ?? new Date();
  const departmentKey = input.departmentKey ?? "DIETARY";
  const buildSnapshot = deps?.buildSnapshot ?? buildOperationalSnapshot;

  const snapshot = await buildSnapshot({
    facilityId: input.facilityId,
    departmentContext: departmentKey,
    now,
  });
  const snapshotHash = hashOperationalSnapshot(snapshot);
  const serviceDate = facilityLocalDateToServiceDate(snapshot.serviceDate);

  const rate = await evaluateMorningBriefRateLimits({
    cache,
    config,
    facilityId: input.facilityId,
    departmentKey,
    serviceDateKey: snapshot.serviceDate,
    now,
  });

  const canRefresh = config.enabled && rate.ok;
  const refreshBlockedReason = !config.enabled
    ? "AI brief disabled"
    : rate.ok
      ? null
      : rate.message;

  const cachedExact = await cache.findByHash({
    facilityId: input.facilityId,
    departmentKey,
    serviceDate,
    snapshotHash,
  });

  if (cachedExact && cachedExact.status === "READY" && !input.forceRefresh) {
    return toView({
      result: cachedExact.resultJson,
      origin: "cached",
      title: "Morning Brief",
      snapshotHash,
      provider: cachedExact.provider,
      model: cachedExact.model,
      fallbackReason: null,
      canRefresh,
      refreshBlockedReason,
    });
  }

  if (!config.enabled || !input.allowProvider) {
    if (cachedExact) {
      const isAi = cachedExact.status === "READY";
      return toView({
        result: cachedExact.resultJson,
        origin: isAi ? "cached" : "fallback",
        title: isAi ? "Morning Brief" : "Operational Summary",
        snapshotHash,
        provider: isAi ? cachedExact.provider : null,
        model: isAi ? cachedExact.model : null,
        fallbackReason: isAi ? null : cachedExact.errorCode ?? "cached_fallback",
        canRefresh,
        refreshBlockedReason,
      });
    }

    const fallback = buildFallbackMorningBrief(snapshot);
    return toView({
      result: fallback,
      origin: "fallback",
      title: "Operational Summary",
      snapshotHash,
      provider: null,
      model: null,
      fallbackReason: config.enabled ? "awaiting_generation" : "disabled",
      canRefresh,
      refreshBlockedReason,
    });
  }

  if (!rate.ok) {
    if (cachedExact) {
      return toView({
        result: cachedExact.resultJson,
        origin: cachedExact.status === "READY" ? "cached" : "fallback",
        title: cachedExact.status === "READY" ? "Morning Brief" : "Operational Summary",
        snapshotHash,
        provider: cachedExact.status === "READY" ? cachedExact.provider : null,
        model: cachedExact.status === "READY" ? cachedExact.model : null,
        fallbackReason: rate.reason,
        canRefresh: false,
        refreshBlockedReason: rate.message,
      });
    }
    const fallback = buildFallbackMorningBrief(snapshot);
    await persistBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash,
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
      title: "Operational Summary",
      snapshotHash,
      provider: null,
      model: null,
      fallbackReason: rate.reason,
      canRefresh: false,
      refreshBlockedReason: rate.message,
    });
  }

  try {
    const snapshotJson = JSON.stringify(snapshot);
    if (snapshotJson.length > config.maxSnapshotChars) {
      throw new AiInvalidResponseError("Snapshot exceeded maximum size after sanitization.");
    }

    const generation = await generateStructuredResponse(config, {
      system: buildMorningBriefSystemPrompt(),
      user: buildMorningBriefUserPrompt(snapshotJson),
      schemaDescription: MORNING_BRIEF_SCHEMA_DESCRIPTION,
      temperature: 0.2,
    });

    let parsed = parseJsonObject(generation.rawText);

    // Mock provider returns empty priorities — ground them from the snapshot for local/dev.
    if (
      generation.provider === "mock" &&
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { priorities?: unknown }).priorities) &&
      (parsed as { priorities: unknown[] }).priorities.length === 0 &&
      snapshot.priorityLocations.length > 0
    ) {
      const grounded = buildFallbackMorningBrief(snapshot);
      parsed = {
        headline: grounded.headline.replace(/\.$/, "") + " (reviewed).",
        summary: grounded.summary,
        priorities: grounded.priorities,
        watchItems: grounded.watchItems,
        generatedAt: new Date().toISOString(),
      };
    }

    const result = validateMorningBriefResponse(
      parsed,
      snapshot.allowedSourcePaths,
      new Date().toISOString(),
    );

    await persistBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash,
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
      title: "Morning Brief",
      snapshotHash,
      provider: generation.provider,
      model: generation.model,
      fallbackReason: null,
      canRefresh: false,
      refreshBlockedReason: "Minimum refresh interval has not elapsed.",
    });
  } catch (error) {
    const code = isAiError(error) ? error.code : "PROVIDER_FAILURE";
    const fallback = buildFallbackMorningBrief(snapshot);
    await persistBrief({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey: snapshot.serviceDate,
      snapshotHash,
      result: fallback,
      provider: "none",
      model: "fallback",
      status: "FALLBACK",
      latencyMs: null,
      errorCode: code,
      now,
    });

    if (error instanceof AiDisabledError || error instanceof AiRateLimitedError) {
      // already handled above for rate; keep fallback view
    }

    return toView({
      result: fallback,
      origin: "fallback",
      title: "Operational Summary",
      snapshotHash,
      provider: null,
      model: null,
      fallbackReason: code,
      canRefresh: rate.ok && !(error instanceof AiError && error.code === "RATE_LIMITED"),
      refreshBlockedReason:
        error instanceof AiError && error.code === "RATE_LIMITED" ? error.message : refreshBlockedReason,
    });
  }
}
