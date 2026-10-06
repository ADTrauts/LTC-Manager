/**
 * PM generation eligibility.
 *
 * Asset RETIRED ≠ Plan RETIRED.
 * Asset retirement makes generation ineligible without mutating Plan status.
 * OUT_OF_SERVICE remains eligible. Plan DRAFT / RETIRED is ineligible.
 * Phase 4A does not run the generator.
 */

import { isAssetLifecycleRetired } from "@/lib/asset-operations/ownership";

export function isPmPlanGenerationEligible(input: {
  planStatus: string;
  assetStatus: string;
}): boolean {
  if (input.planStatus !== "PUBLISHED") return false;
  if (isAssetLifecycleRetired(input.assetStatus)) return false;
  return true;
}

export function pmIneligibilityReason(input: {
  planStatus: string;
  assetStatus: string;
}): "PLAN_NOT_PUBLISHED" | "PLAN_RETIRED" | "ASSET_RETIRED" | null {
  if (input.planStatus === "RETIRED") return "PLAN_RETIRED";
  if (input.planStatus !== "PUBLISHED") return "PLAN_NOT_PUBLISHED";
  if (isAssetLifecycleRetired(input.assetStatus)) return "ASSET_RETIRED";
  return null;
}
