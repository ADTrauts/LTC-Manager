/**
 * User-facing Space type presets for Facility Builder.
 * Canonical SpaceType remains the bounded Prisma enum; presets map to it.
 */

import { SpaceType } from "@prisma/client";

export type SpaceTypePreset = {
  key: string;
  label: string;
  canonicalType: SpaceType;
  /** When true, user must supply customTypeLabel. */
  requiresCustomLabel?: boolean;
};

/** Canonical SpaceType → default user-facing label (never enum constants). */
export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  SERVICE_AREA: "Service area",
  PATIENT_ROOM: "Patient room",
  PRODUCTION_AREA: "Production area",
  STORAGE: "Storage",
  UTILITY: "Utility room",
  OFFICE: "Office",
  RESTROOM: "Restroom",
  MECHANICAL: "Mechanical room",
  PUBLIC_AREA: "Public area",
  OTHER: "Other",
};

/**
 * Curated presets shown in Add Room / Room editor.
 * Multiple presets may share one canonical SpaceType.
 */
export const SPACE_TYPE_PRESETS: readonly SpaceTypePreset[] = [
  { key: "resident_room", label: "Resident Room", canonicalType: SpaceType.PATIENT_ROOM },
  { key: "patient_room", label: "Patient Room", canonicalType: SpaceType.PATIENT_ROOM },
  { key: "servery", label: "Servery", canonicalType: SpaceType.SERVICE_AREA },
  { key: "dining_room", label: "Dining Room", canonicalType: SpaceType.SERVICE_AREA },
  { key: "hallway", label: "Hallway", canonicalType: SpaceType.PUBLIC_AREA },
  { key: "restroom", label: "Restroom", canonicalType: SpaceType.RESTROOM },
  { key: "office", label: "Office", canonicalType: SpaceType.OFFICE },
  { key: "storage", label: "Storage", canonicalType: SpaceType.STORAGE },
  { key: "utility_room", label: "Utility Room", canonicalType: SpaceType.UTILITY },
  { key: "mechanical_room", label: "Mechanical Room", canonicalType: SpaceType.MECHANICAL },
  { key: "public_area", label: "Public Area", canonicalType: SpaceType.PUBLIC_AREA },
  { key: "production_area", label: "Production Area", canonicalType: SpaceType.PRODUCTION_AREA },
  {
    key: "custom",
    label: "Other / Custom",
    canonicalType: SpaceType.OTHER,
    requiresCustomLabel: true,
  },
] as const;

export const CUSTOM_SPACE_PRESET_KEY = "custom";

export function findSpaceTypePreset(key: string): SpaceTypePreset | undefined {
  return SPACE_TYPE_PRESETS.find((p) => p.key === key);
}

export function findPresetForStoredSpace(input: {
  spaceType: SpaceType;
  customTypeLabel: string | null | undefined;
}): SpaceTypePreset {
  const label = input.customTypeLabel?.trim();
  if (label) {
    const byLabel = SPACE_TYPE_PRESETS.find(
      (p) => !p.requiresCustomLabel && p.label.toLowerCase() === label.toLowerCase(),
    );
    if (byLabel) return byLabel;
    if (input.spaceType === SpaceType.OTHER || label) {
      return SPACE_TYPE_PRESETS.find((p) => p.key === CUSTOM_SPACE_PRESET_KEY)!;
    }
  }
  const byType = SPACE_TYPE_PRESETS.find(
    (p) => !p.requiresCustomLabel && p.canonicalType === input.spaceType,
  );
  return byType ?? SPACE_TYPE_PRESETS.find((p) => p.key === CUSTOM_SPACE_PRESET_KEY)!;
}

/**
 * Resolve visible type label for tree/editor.
 * Prefer customTypeLabel, then preset label for known types, then canonical map.
 */
export function resolveSpaceTypeDisplayLabel(input: {
  spaceType: SpaceType;
  customTypeLabel?: string | null;
}): string {
  const custom = input.customTypeLabel?.trim();
  if (custom) return custom;
  return SPACE_TYPE_LABELS[input.spaceType] ?? "Other";
}

export type ResolvedSpaceTypeInput = {
  spaceType: SpaceType;
  customTypeLabel: string | null;
};

/**
 * Resolve FormData-style preset selection into canonical type + optional custom label.
 * For non-custom presets, stores the preset label as customTypeLabel so Resident vs Patient
 * remain distinguishable when both map to PATIENT_ROOM.
 */
export function resolveSpaceTypeFromPreset(input: {
  presetKey: string;
  customTypeLabel?: string | null;
}): ResolvedSpaceTypeInput {
  const preset = findSpaceTypePreset(input.presetKey);
  if (!preset) {
    throw new Error("Invalid space type selection.");
  }

  if (preset.requiresCustomLabel) {
    const label = (input.customTypeLabel ?? "").trim();
    if (!label) {
      throw new Error("Custom type label is required.");
    }
    if (label.length > 80) {
      throw new Error("Custom type label must be 80 characters or fewer.");
    }
    return { spaceType: SpaceType.OTHER, customTypeLabel: label };
  }

  return {
    spaceType: preset.canonicalType,
    customTypeLabel: preset.label,
  };
}

/** True if a string looks like a raw Prisma enum constant (should never be user-facing). */
export function looksLikeTechnicalEnumName(label: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(label.trim());
}
