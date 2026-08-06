import type { OperationalTemplateScheduleKind } from "@prisma/client";

export type RequirementKeyParts = {
  templateStableKey: string;
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  unitId?: string | null;
  spaceId?: string | null;
  assetId?: string | null;
  operationalDateKey: string;
};

/**
 * Deterministic requirement identity for one operational date + scope + window.
 * Stable across resolver runs; used for idempotent matching to records and offline keys.
 */
export function buildRequirementKey(parts: RequirementKeyParts): string {
  const seg = (value: string | null | undefined, fallback = "-") =>
    value && value.trim() ? value.trim() : fallback;

  return [
    seg(parts.templateStableKey),
    seg(parts.scheduleKind),
    seg(parts.cycleStableKey),
    seg(parts.windowStartLocal),
    seg(parts.windowEndLocal),
    seg(parts.unitId),
    seg(parts.spaceId),
    seg(parts.assetId),
    seg(parts.operationalDateKey),
  ].join("|");
}
