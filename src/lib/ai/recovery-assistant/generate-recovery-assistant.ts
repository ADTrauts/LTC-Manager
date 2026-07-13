import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { loadAiConfiguration, type AiConfiguration } from "@/lib/ai/configuration";
import { AiError, AiInvalidResponseError, isAiError } from "@/lib/ai/errors";
import { generateStructuredResponse, parseJsonObject } from "@/lib/ai/generate-structured-response";
import {
  createMemoryBriefCacheStore,
  type MorningBriefCacheStore,
} from "@/lib/ai/morning-brief/cache-store";
import { createPrismaBriefCacheStore } from "@/lib/ai/morning-brief/prisma-cache-store";
import { isAiRecoveryAssistantEnabled } from "@/lib/feature-flags";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { buildRecoverySnapshot } from "./build-recovery-snapshot";
import { buildFallbackRecoveryGuidance } from "./fallback-recovery-guidance";
import {
  buildRecoveryAssistantSystemPrompt,
  buildRecoveryAssistantUserPrompt,
  RECOVERY_ASSISTANT_PROMPT_VERSION,
  RECOVERY_ASSISTANT_SCHEMA_DESCRIPTION,
} from "./recovery-prompt";
import { evaluateRecoveryAssistantRateLimits } from "./rate-limits";
import type { RecoveryAssistantResult, RecoveryAssistantView, RecoverySnapshot } from "./types";
import { validateRecoveryAssistantResponse } from "./validate-recovery-response";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type GenerateRecoveryAssistantInput = {
  facilityId: string;
  issueId: string;
  viewerDepartmentIds: string[] | null;
  departmentKey?: OperationalDepartmentKey | null;
  now?: Date;
  forceRefresh?: boolean;
  allowProvider?: boolean;
};

export type RecoveryAssistantDeps = {
  config?: AiConfiguration;
  cache?: MorningBriefCacheStore;
  enabled?: boolean;
  buildSnapshot?: (
    input: GenerateRecoveryAssistantInput,
  ) => Promise<{ snapshot: RecoverySnapshot; snapshotHash: string }>;
};

let memoryFallbackCache: MorningBriefCacheStore | null = null;

function resolveCache(deps?: RecoveryAssistantDeps): MorningBriefCacheStore {
  if (deps?.cache) return deps.cache;
  try {
    return createPrismaBriefCacheStore(prisma);
  } catch {
    memoryFallbackCache ??= createMemoryBriefCacheStore();
    return memoryFallbackCache;
  }
}

function toView(input: {
  result: RecoveryAssistantResult;
  origin: RecoveryAssistantView["origin"];
  issueId: string;
  snapshotHash: string;
  provider: string | null;
  model: string | null;
  fallbackReason: string | null;
  canRefresh: boolean;
  refreshBlockedReason: string | null;
}): RecoveryAssistantView {
  const cardTitle =
    input.origin === "ai" || input.origin === "cached"
      ? "Recovery Assistant"
      : "Operational guidance";
  return {
    cardTitle,
    origin: input.origin,
    result: input.result,
    issueId: input.issueId,
    provider: input.provider,
    model: input.model,
    snapshotHash: input.snapshotHash,
    promptVersion: RECOVERY_ASSISTANT_PROMPT_VERSION,
    fallbackReason: input.fallbackReason,
    canRefresh: input.canRefresh,
    refreshBlockedReason: input.refreshBlockedReason,
    generatedAt: input.result.generatedAt,
  };
}

async function persistRecovery(input: {
  cache: MorningBriefCacheStore;
  facilityId: string;
  departmentKey: string;
  serviceDateKey: string;
  issueId: string;
  snapshotHash: string;
  snapshot: RecoverySnapshot;
  result: RecoveryAssistantResult;
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
    briefType: "RECOVERY_ASSISTANT",
    operationInstanceId: input.issueId,
    snapshotHash: input.snapshotHash,
    snapshotJson: null,
    baselineSnapshotHash: null,
    windowStart: null,
    windowEnd: null,
    resultJson: input.result,
    provider: input.provider,
    model: input.model,
    status: input.status,
    promptVersion: RECOVERY_ASSISTANT_PROMPT_VERSION,
    latencyMs: input.latencyMs,
    errorCode: input.errorCode,
    generatedAt: input.now,
    expiresAt: new Date(input.now.getTime() + CACHE_TTL_MS),
  });
}

/**
 * Recovery Assistant for Issue Detail.
 * Read-only: never mutates issues, tasks, readiness, or knowledge.
 * SSR: allowProvider=false. Manager+ refresh: allowProvider=true.
 */
export async function getOrGenerateRecoveryAssistant(
  input: GenerateRecoveryAssistantInput,
  deps?: RecoveryAssistantDeps,
): Promise<RecoveryAssistantView> {
  const config = deps?.config ?? loadAiConfiguration();
  const enabled = deps?.enabled ?? isAiRecoveryAssistantEnabled();
  const cache = resolveCache(deps);
  const now = input.now ?? new Date();
  const departmentKey = input.departmentKey ?? "DIETARY";
  const buildSnapshot = deps?.buildSnapshot ?? buildRecoverySnapshot;

  const { snapshot, snapshotHash } = await buildSnapshot({
    ...input,
    maxSnapshotChars: config.maxSnapshotChars,
  });

  const rate = await evaluateRecoveryAssistantRateLimits({
    cache,
    config: { ...config, enabled },
    facilityId: input.facilityId,
    departmentKey,
    serviceDateKey: snapshot.serviceDate,
    issueId: input.issueId,
    now,
  });

  const serviceDateKey = snapshot.serviceDate;
  const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);

  const canRefresh = enabled && rate.ok;
  const refreshBlockedReason = !enabled
    ? "AI recovery assistant disabled"
    : rate.ok
      ? null
      : rate.message;

  const cachedExact = await cache.findByHash({
    facilityId: input.facilityId,
    departmentKey,
    serviceDate,
    briefType: "RECOVERY_ASSISTANT",
    snapshotHash,
  });

  if (cachedExact && cachedExact.status === "READY" && !input.forceRefresh) {
    return toView({
      result: cachedExact.resultJson as RecoveryAssistantResult,
      origin: "cached",
      issueId: input.issueId,
      snapshotHash,
      provider: cachedExact.provider,
      model: cachedExact.model,
      fallbackReason: null,
      canRefresh,
      refreshBlockedReason,
    });
  }

  if (!enabled || !input.allowProvider) {
    if (cachedExact) {
      const isAi = cachedExact.status === "READY";
      return toView({
        result: cachedExact.resultJson as RecoveryAssistantResult,
        origin: isAi ? "cached" : "fallback",
        issueId: input.issueId,
        snapshotHash,
        provider: isAi ? cachedExact.provider : null,
        model: isAi ? cachedExact.model : null,
        fallbackReason: isAi ? null : cachedExact.errorCode ?? "cached_fallback",
        canRefresh,
        refreshBlockedReason,
      });
    }
    const fallback = buildFallbackRecoveryGuidance(snapshot);
    return toView({
      result: fallback,
      origin: "fallback",
      issueId: input.issueId,
      snapshotHash,
      provider: null,
      model: null,
      fallbackReason: enabled ? "awaiting_generation" : "disabled",
      canRefresh,
      refreshBlockedReason,
    });
  }

  if (!rate.ok) {
    if (cachedExact) {
      const isAi = cachedExact.status === "READY";
      return toView({
        result: cachedExact.resultJson as RecoveryAssistantResult,
        origin: isAi ? "cached" : "fallback",
        issueId: input.issueId,
        snapshotHash,
        provider: isAi ? cachedExact.provider : null,
        model: isAi ? cachedExact.model : null,
        fallbackReason: rate.reason,
        canRefresh: false,
        refreshBlockedReason: rate.message,
      });
    }
    const fallback = buildFallbackRecoveryGuidance(snapshot);
    await persistRecovery({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey,
      issueId: input.issueId,
      snapshotHash,
      snapshot,
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
      issueId: input.issueId,
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
      throw new AiInvalidResponseError("Recovery snapshot exceeded maximum size.");
    }

    const generation = await generateStructuredResponse(
      { ...config, enabled: true },
      {
        system: buildRecoveryAssistantSystemPrompt(),
        user: buildRecoveryAssistantUserPrompt(snapshotJson),
        schemaDescription: RECOVERY_ASSISTANT_SCHEMA_DESCRIPTION,
        temperature: 0.2,
      },
    );

    let parsed = parseJsonObject(generation.rawText);

    if (
      generation.provider === "mock" &&
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { checkFirst?: unknown }).checkFirst) &&
      (parsed as { checkFirst: unknown[] }).checkFirst.length === 0
    ) {
      const grounded = buildFallbackRecoveryGuidance(snapshot);
      parsed = { ...grounded, generatedAt: new Date().toISOString() };
    }

    const knowledgeTitles = new Set(snapshot.knowledge.map((k) => k.title));
    const knowledgePaths = new Set(snapshot.knowledge.map((k) => k.sourcePath));
    const result = validateRecoveryAssistantResponse(
      parsed,
      snapshot.allowedSourcePaths,
      knowledgeTitles,
      knowledgePaths,
      new Date().toISOString(),
    );

    await persistRecovery({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey,
      issueId: input.issueId,
      snapshotHash,
      snapshot,
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
      issueId: input.issueId,
      snapshotHash,
      provider: generation.provider,
      model: generation.model,
      fallbackReason: null,
      canRefresh: false,
      refreshBlockedReason: "Minimum refresh interval has not elapsed.",
    });
  } catch (error) {
    const code = isAiError(error) ? error.code : "PROVIDER_FAILURE";
    const fallback = buildFallbackRecoveryGuidance(snapshot);
    await persistRecovery({
      cache,
      facilityId: input.facilityId,
      departmentKey,
      serviceDateKey,
      issueId: input.issueId,
      snapshotHash,
      snapshot,
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
      issueId: input.issueId,
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
