/**
 * Presentation helpers: lifecycle (Active/Retired) vs operational condition.
 * Persisted enum is unchanged — no migration.
 */

import { normalizeAssetStatus, type AssetOperationalStatus } from "./types";
import {
  ASSET_CONDITION_VALUES,
  ASSET_LIFECYCLE_RETIRED,
  type AssetConditionValue,
  isAssetLifecycleRetired,
} from "./ownership";

export type AssetLifecyclePresentation = "ACTIVE" | "RETIRED";

export type AssetConditionPresentation = {
  lifecycle: AssetLifecyclePresentation;
  lifecycleLabel: string;
  /** Null when retired — condition is not a day-to-day operational state. */
  condition: AssetConditionValue | null;
  conditionLabel: string | null;
  /** Single calm line for lists (never "Retired / Operational"). */
  summaryLabel: string;
  /** Tone for condition emphasis (not color-only status). */
  conditionTone: "neutral" | "attention" | "critical" | "retired";
};

export function presentAssetLifecycleAndCondition(
  status: string,
): AssetConditionPresentation {
  const normalized = normalizeAssetStatus(status);
  if (isAssetLifecycleRetired(normalized) || normalized === ASSET_LIFECYCLE_RETIRED) {
    return {
      lifecycle: "RETIRED",
      lifecycleLabel: "Retired",
      condition: null,
      conditionLabel: null,
      summaryLabel: "Retired",
      conditionTone: "retired",
    };
  }

  const condition = (
    ASSET_CONDITION_VALUES.includes(normalized as AssetConditionValue)
      ? normalized
      : "OPERATIONAL"
  ) as AssetConditionValue;

  const conditionLabel =
    condition === "OPERATIONAL"
      ? "Operational"
      : condition === "DEGRADED"
        ? "Degraded"
        : "Out of Service";

  const conditionTone =
    condition === "OUT_OF_SERVICE"
      ? "critical"
      : condition === "DEGRADED"
        ? "attention"
        : "neutral";

  return {
    lifecycle: "ACTIVE",
    lifecycleLabel: "Active",
    condition,
    conditionLabel,
    summaryLabel: conditionLabel,
    conditionTone,
  };
}

/** RUN condition select values — never includes Retired. */
export function runConditionSelectValues(
  current: AssetOperationalStatus | string,
): AssetConditionValue[] {
  const presentation = presentAssetLifecycleAndCondition(current);
  if (presentation.lifecycle === "RETIRED") {
    return [];
  }
  return [...ASSET_CONDITION_VALUES];
}

export function conditionToneClass(
  tone: AssetConditionPresentation["conditionTone"],
): string {
  switch (tone) {
    case "critical":
      return "font-semibold text-red-800";
    case "attention":
      return "font-medium text-amber-800";
    case "retired":
      return "font-medium text-zinc-600";
    default:
      return "font-medium text-zinc-800";
  }
}
