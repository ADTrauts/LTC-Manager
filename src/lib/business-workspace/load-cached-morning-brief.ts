import type { MorningBriefResult } from "@/lib/ai/types";
import { createPrismaBriefCacheStore } from "@/lib/ai/morning-brief/prisma-cache-store";
import type { MorningBriefCacheStore } from "@/lib/ai/morning-brief/cache-store";
import { isAiBriefEnabled } from "@/lib/feature-flags";
import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import type { WorkspaceCachedMorningBrief } from "./types";

export type LoadCachedMorningBriefPreviewInput = {
  facilityId: string;
  /** Facility-local YYYY-MM-DD from operational time. */
  facilityLocalDate: string;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  /** Inject for tests. Defaults to prisma store. */
  cache?: MorningBriefCacheStore;
  /** Inject for tests. Defaults to `isAiBriefEnabled()`. */
  aiEnabled?: boolean;
};

function isMorningBriefResult(value: unknown): value is MorningBriefResult {
  return (
    typeof value === "object" &&
    value != null &&
    typeof (value as MorningBriefResult).headline === "string" &&
    (value as MorningBriefResult).headline.trim().length > 0
  );
}

/**
 * Read-only Morning Brief preview for Workspace.
 * Never calls the AI provider. Never creates or refreshes a brief.
 * Returns null unless AI is enabled and a non-expired READY brief exists
 * for this facility + department + service date.
 */
export async function loadCachedMorningBriefPreview(
  input: LoadCachedMorningBriefPreviewInput,
): Promise<WorkspaceCachedMorningBrief | null> {
  const aiEnabled = input.aiEnabled ?? isAiBriefEnabled();
  if (!aiEnabled) return null;

  const departmentKey = input.activeDepartmentKey ?? "DIETARY";
  const serviceDate = facilityLocalDateToServiceDate(input.facilityLocalDate);
  const cache = input.cache ?? createPrismaBriefCacheStore(prisma);

  const record = await cache.findLatest({
    facilityId: input.facilityId,
    departmentKey,
    serviceDate,
    briefType: "MORNING_BRIEF",
  });

  if (!record) return null;
  if (record.facilityId !== input.facilityId) return null;
  if (record.departmentKey !== departmentKey) return null;
  if (record.status !== "READY") return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  if (!isMorningBriefResult(record.resultJson)) return null;

  return {
    headline: record.resultJson.headline.trim(),
    origin: "cached",
    href: "/dashboard",
  };
}
