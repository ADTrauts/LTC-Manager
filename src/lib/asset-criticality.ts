import type { AssetCriticality } from "@prisma/client";

export const ASSET_CRITICALITY_VALUES = ["CRITICAL", "IMPORTANT", "ROUTINE"] as const;

export type AssetCriticalityValue = (typeof ASSET_CRITICALITY_VALUES)[number];

export const ASSET_CRITICALITY_OPTIONS: ReadonlyArray<{
  value: AssetCriticalityValue;
  label: string;
  description: string;
}> = [
  {
    value: "CRITICAL",
    label: "Critical",
    description:
      "Failure can immediately prevent safe service, sanitation, life safety, or essential building operation.",
  },
  {
    value: "IMPORTANT",
    label: "Important",
    description: "Failure materially disrupts work, but a short-term workaround may exist.",
  },
  {
    value: "ROUTINE",
    label: "Routine",
    description: "Failure is inconvenient or cosmetic and does not materially threaten current service.",
  },
];

export function isAssetCriticality(value: string): value is AssetCriticalityValue {
  return (ASSET_CRITICALITY_VALUES as readonly string[]).includes(value);
}

export function normalizeAssetCriticality(
  value: string | null | undefined,
): AssetCriticalityValue {
  if (value && isAssetCriticality(value)) return value;
  return "ROUTINE";
}

export function assetCriticalityLabel(value: AssetCriticality | AssetCriticalityValue): string {
  return ASSET_CRITICALITY_OPTIONS.find((option) => option.value === value)?.label ?? "Routine";
}
