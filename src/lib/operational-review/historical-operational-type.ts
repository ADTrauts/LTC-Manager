/**
 * Date-effective Operational Type / profile resolution for Review.
 * Run continues to use ACTIVE only. This selector never falls back to today's ACTIVE.
 */

import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

import type { ReviewOtBindingFact, ReviewProfileFact, ReviewUnavailableReason } from "./types";

export type HistoricalProfileSelection =
  | { status: "evaluated"; profile: ReviewProfileFact }
  | { status: "unavailable"; reason: Extract<ReviewUnavailableReason, "no_historical_ot_version"> };

export function profileCoversServiceDate(
  profile: Pick<ReviewProfileFact, "activatedAt" | "retiredAt">,
  serviceDateKey: string,
  timezone: string,
): boolean {
  if (!profile.activatedAt) return false;
  const activatedKey = toServiceDateKey(getFacilityServiceDate(timezone, profile.activatedAt));
  if (activatedKey > serviceDateKey) return false;
  if (profile.retiredAt) {
    const retiredKey = toServiceDateKey(getFacilityServiceDate(timezone, profile.retiredAt));
    if (retiredKey <= serviceDateKey) return false;
  }
  return true;
}

export function selectHistoricalProfileForServiceDate(
  profiles: readonly ReviewProfileFact[],
  input: { departmentId: string; serviceDateKey: string; timezone: string },
): HistoricalProfileSelection {
  const covering = profiles.filter(
    (profile) =>
      profile.departmentId === input.departmentId &&
      profileCoversServiceDate(profile, input.serviceDateKey, input.timezone),
  );
  if (covering.length !== 1) {
    return { status: "unavailable", reason: "no_historical_ot_version" };
  }
  return { status: "evaluated", profile: covering[0]! };
}

export function historicalOtAssignmentsFromBindings(
  bindings: readonly ReviewOtBindingFact[],
  profileId: string,
): Map<string, { key: string; name: string }> {
  const assignments = new Map<string, { key: string; name: string }>();
  for (const row of bindings) {
    if (row.profileId !== profileId) continue;
    if (!row.archetypeIsActive) continue;
    const key = row.operationalTypeKey.trim();
    if (!key) continue;
    assignments.set(row.spaceId, { key, name: row.operationalTypeName });
  }
  return assignments;
}
