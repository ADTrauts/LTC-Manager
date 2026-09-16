/**
 * System Base Type catalog — generic physical classification.
 * Facility Room Types choose a baseTypeKey and set their own displayName.
 * Servery is never a system base type; facilities name Kitchen-based types.
 */

import { SpaceType } from "@prisma/client";

export type FacilityBaseType = {
  key: string;
  label: string;
  description?: string;
  /**
   * Legacy SpaceType dual-write for UnitSpace.spaceType compatibility.
   * Run / old readers still use SpaceType until the Run migration pass.
   */
  legacySpaceType: SpaceType;
};

export const FACILITY_BASE_TYPES: readonly FacilityBaseType[] = [
  {
    key: "kitchen",
    label: "Kitchen",
    description: "Food production or point-of-service kitchen space.",
    legacySpaceType: SpaceType.PRODUCTION_AREA,
  },
  {
    key: "guest_room",
    label: "Guest / Resident Room",
    description: "Private or semi-private living / guest sleeping space.",
    legacySpaceType: SpaceType.PATIENT_ROOM,
  },
  {
    key: "dining_area",
    label: "Dining Area",
    description: "Shared dining or meal-service seating space.",
    legacySpaceType: SpaceType.SERVICE_AREA,
  },
  {
    key: "office",
    label: "Office",
    description: "Administrative or support office.",
    legacySpaceType: SpaceType.OFFICE,
  },
  {
    key: "storage",
    label: "Storage",
    description: "Storage for supplies or materials.",
    legacySpaceType: SpaceType.STORAGE,
  },
  {
    key: "restroom",
    label: "Restroom",
    description: "Restroom or bathroom space.",
    legacySpaceType: SpaceType.RESTROOM,
  },
  {
    key: "hallway",
    label: "Hallway",
    description: "Corridor connecting rooms and areas.",
    legacySpaceType: SpaceType.PUBLIC_AREA,
  },
  {
    key: "public_area",
    label: "Public / Common Area",
    description: "Shared public or common area.",
    legacySpaceType: SpaceType.PUBLIC_AREA,
  },
  {
    key: "utility_room",
    label: "Utility Room",
    description: "Utility or soiled/clean support room.",
    legacySpaceType: SpaceType.UTILITY,
  },
  {
    key: "laundry",
    label: "Laundry",
    description: "Laundry or linen processing space.",
    legacySpaceType: SpaceType.UTILITY,
  },
  {
    key: "mechanical_room",
    label: "Mechanical Room",
    description: "Mechanical or life-safety equipment room.",
    legacySpaceType: SpaceType.MECHANICAL,
  },
  {
    key: "treatment_room",
    label: "Treatment / Service Room",
    description: "Clinical treatment or service room.",
    legacySpaceType: SpaceType.SERVICE_AREA,
  },
  {
    key: "production_area",
    label: "Production / Work Area",
    description: "General production or work area.",
    legacySpaceType: SpaceType.PRODUCTION_AREA,
  },
  {
    key: "meeting_room",
    label: "Meeting / Conference Room",
    description: "Meeting or conference space.",
    legacySpaceType: SpaceType.OFFICE,
  },
  {
    key: "other",
    label: "Other",
    description: "Unclassified or facility-specific space.",
    legacySpaceType: SpaceType.OTHER,
  },
] as const;

const BY_KEY = new Map(FACILITY_BASE_TYPES.map((row) => [row.key, row]));

export function findFacilityBaseType(key: string): FacilityBaseType | undefined {
  return BY_KEY.get(key);
}

export function requireFacilityBaseType(key: string): FacilityBaseType {
  const row = findFacilityBaseType(key);
  if (!row) throw new Error("Invalid base type.");
  return row;
}

export function isFacilityBaseTypeKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Map legacy Facility Builder preset keys / SpaceType rows → base type keys.
 * Conservative: unknown custom labels → other.
 */
export function baseTypeKeyFromLegacyRoomIdentity(input: {
  presetKey?: string | null;
  spaceType: SpaceType;
  customTypeLabel?: string | null;
}): { baseTypeKey: string; confident: boolean } {
  const preset = (input.presetKey ?? "").trim().toLowerCase();
  switch (preset) {
    case "servery":
    case "production_area":
      return { baseTypeKey: "kitchen", confident: true };
    case "dining_room":
      return { baseTypeKey: "dining_area", confident: true };
    case "resident_room":
    case "patient_room":
      return { baseTypeKey: "guest_room", confident: true };
    case "office":
      return { baseTypeKey: "office", confident: true };
    case "storage":
      return { baseTypeKey: "storage", confident: true };
    case "restroom":
      return { baseTypeKey: "restroom", confident: true };
    case "hallway":
      return { baseTypeKey: "hallway", confident: true };
    case "public_area":
      return { baseTypeKey: "public_area", confident: true };
    case "utility_room":
      return { baseTypeKey: "utility_room", confident: true };
    case "mechanical_room":
      return { baseTypeKey: "mechanical_room", confident: true };
    case "custom":
      return { baseTypeKey: "other", confident: false };
    default:
      break;
  }

  switch (input.spaceType) {
    case SpaceType.PRODUCTION_AREA:
      return { baseTypeKey: "kitchen", confident: true };
    case SpaceType.SERVICE_AREA: {
      const label = (input.customTypeLabel ?? "").trim().toLowerCase();
      if (label.includes("dining")) return { baseTypeKey: "dining_area", confident: true };
      if (label.includes("servery") || label.includes("kitchen")) {
        return { baseTypeKey: "kitchen", confident: true };
      }
      // Ambiguous SERVICE_AREA without clear label → other
      return { baseTypeKey: "other", confident: false };
    }
    case SpaceType.PATIENT_ROOM:
      return { baseTypeKey: "guest_room", confident: true };
    case SpaceType.OFFICE:
      return { baseTypeKey: "office", confident: true };
    case SpaceType.STORAGE:
      return { baseTypeKey: "storage", confident: true };
    case SpaceType.RESTROOM:
      return { baseTypeKey: "restroom", confident: true };
    case SpaceType.PUBLIC_AREA: {
      const label = (input.customTypeLabel ?? "").trim().toLowerCase();
      if (label.includes("hall")) return { baseTypeKey: "hallway", confident: true };
      return { baseTypeKey: "public_area", confident: true };
    }
    case SpaceType.UTILITY:
      return { baseTypeKey: "utility_room", confident: true };
    case SpaceType.MECHANICAL:
      return { baseTypeKey: "mechanical_room", confident: true };
    case SpaceType.OTHER:
    default:
      return { baseTypeKey: "other", confident: false };
  }
}

/** Legacy dual-write helpers when assigning a Facility Room Type to a Room. */
export function legacyFieldsForFacilityRoomType(input: {
  baseTypeKey: string;
  displayName: string;
}): { spaceType: SpaceType; customTypeLabel: string } {
  const base = requireFacilityBaseType(input.baseTypeKey);
  // Preserve historical Servery → SERVICE_AREA so Run preset matching stays stable.
  if (
    base.key === "kitchen" &&
    input.displayName.trim().toLowerCase() === "servery"
  ) {
    return { spaceType: SpaceType.SERVICE_AREA, customTypeLabel: input.displayName.trim() };
  }
  return {
    spaceType: base.legacySpaceType,
    customTypeLabel: input.displayName.trim(),
  };
}
