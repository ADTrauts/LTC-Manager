import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

import type { AiConfiguration } from "@/lib/ai/configuration";
import type { MorningBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; reason: "min_interval" | "daily_limit"; message: string };

export async function evaluateShiftTransitionRateLimits(input: {
  cache: MorningBriefCacheStore;
  config: AiConfiguration;
  facilityId: string;
  departmentKey: string;
  serviceDateKey: string;
  now?: Date;
}): Promise<RateLimitDecision> {
  const now = input.now ?? new Date();
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDateKey);

  const dailyCount = await input.cache.countGeneratedToday(
    input.facilityId,
    serviceDate,
    "SHIFT_TRANSITION",
  );
  if (dailyCount >= input.config.dailyRequestLimit) {
    return {
      ok: false,
      reason: "daily_limit",
      message: `Daily shift summary limit of ${input.config.dailyRequestLimit} reached.`,
    };
  }

  const latest = await input.cache.findMostRecentAny(
    input.facilityId,
    input.departmentKey,
    serviceDate,
    "SHIFT_TRANSITION",
  );
  if (latest && latest.status === "READY") {
    const elapsed = now.getTime() - latest.generatedAt.getTime();
    if (elapsed < input.config.minRefreshIntervalMs) {
      return {
        ok: false,
        reason: "min_interval",
        message: "Minimum refresh interval has not elapsed.",
      };
    }
  }

  return { ok: true };
}
