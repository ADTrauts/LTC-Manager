/**
 * Canonical Room Type presets for Facility Builder.
 * Internal SpaceType remains the bounded Prisma enum; presets map to it.
 * User-facing language is "Room Type".
 */

import { SpaceType } from "@prisma/client";

export type SpaceTypePreset = {
  key: string;
  label: string;
  canonicalType: SpaceType;
  /** Shared Room Type meaning — not department-specific. */
  description?: string;
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
  {
    key: "resident_room",
    label: "Resident Room",
    canonicalType: SpaceType.PATIENT_ROOM,
    description: "A private or semi-private living space for a resident.",
  },
  {
    key: "patient_room",
    label: "Patient Room",
    canonicalType: SpaceType.PATIENT_ROOM,
    description: "A clinical or short-stay patient living space.",
  },
  {
    key: "servery",
    label: "Servery",
    canonicalType: SpaceType.SERVICE_AREA,
    description:
      "A point-of-service food service room used within a resident neighborhood.",
  },
  {
    key: "dining_room",
    label: "Dining Room",
    canonicalType: SpaceType.SERVICE_AREA,
    description: "A shared dining space for meal service.",
  },
  {
    key: "hallway",
    label: "Hallway",
    canonicalType: SpaceType.PUBLIC_AREA,
    description: "A corridor connecting rooms and neighborhoods.",
  },
  {
    key: "restroom",
    label: "Restroom",
    canonicalType: SpaceType.RESTROOM,
    description: "A restroom or bathroom space.",
  },
  {
    key: "office",
    label: "Office",
    canonicalType: SpaceType.OFFICE,
    description: "An administrative or support office.",
  },
  {
    key: "storage",
    label: "Storage",
    canonicalType: SpaceType.STORAGE,
    description: "A storage room for supplies or materials.",
  },
  {
    key: "utility_room",
    label: "Utility Room",
    canonicalType: SpaceType.UTILITY,
    description: "A utility or soiled/clean support room.",
  },
  {
    key: "mechanical_room",
    label: "Mechanical Room",
    canonicalType: SpaceType.MECHANICAL,
    description: "A mechanical or life-safety equipment room.",
  },
  {
    key: "public_area",
    label: "Public Area",
    canonicalType: SpaceType.PUBLIC_AREA,
    description: "A shared public or common area.",
  },
  {
    key: "production_area",
    label: "Production Area",
    canonicalType: SpaceType.PRODUCTION_AREA,
    description: "A food production or preparation kitchen area.",
  },
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
    throw new Error("Invalid room type selection.");
  }

  if (preset.requiresCustomLabel) {
    const label = (input.customTypeLabel ?? "").trim();
    if (!label) {
      throw new Error("Custom room type is required.");
    }
    if (label.length > 80) {
      throw new Error("Custom room type must be 80 characters or fewer.");
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

export type RoomTypeIdentity = {
  /** Stable-enough key: preset key, or custom:<normalized label>. */
  key: string;
  label: string;
  presetKey: string;
  isCustom: boolean;
};

/**
 * Canonical Room Type identity for a stored UnitSpace.
 * Presets are distinguished by customTypeLabel (Facility Builder stores the preset label).
 * Custom types are identified by label text — renaming the label in Facility Builder
 * is a new identity (no separate custom-type id exists).
 */
export function roomTypeIdentity(input: {
  spaceType: SpaceType;
  customTypeLabel?: string | null;
}): RoomTypeIdentity {
  const stored = {
    spaceType: input.spaceType,
    customTypeLabel: input.customTypeLabel ?? null,
  };
  const preset = findPresetForStoredSpace(stored);
  const label = resolveSpaceTypeDisplayLabel(stored);
  const isCustom = preset.key === CUSTOM_SPACE_PRESET_KEY;
  return {
    key: isCustom ? `custom:${label.trim().toLowerCase()}` : preset.key,
    label,
    presetKey: preset.key,
    isCustom,
  };
}

/** Shared Room Type meaning from Facility Builder presets. Null for custom/unknown. */
export function sharedRoomTypeDescription(roomTypeKey: string): string | null {
  if (roomTypeKey.startsWith("custom:")) return null;
  return findSpaceTypePreset(roomTypeKey)?.description?.trim() || null;
}
