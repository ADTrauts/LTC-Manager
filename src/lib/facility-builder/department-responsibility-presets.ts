/**
 * Department Responsibility Presets — UX templates for room capability selection.
 *
 * These are NOT a new permission model, capability system, or persisted entity.
 * Selecting a preset only pre-checks existing CAPABILITY_KEYS checkboxes.
 * Once saved, only Department + Capabilities[] persist (as today).
 * The preset identity is never stored.
 *
 * Later: recommended room setup, quick-create, onboarding, analytics can
 * reuse this registry. Do not invent parallel lists.
 */

import type { CapabilityKey } from "@/lib/facility-builder/load-facility-hierarchy";
import { CAPABILITY_KEYS } from "@/lib/facility-builder/load-facility-hierarchy";

/** Well-known department keys that own curated presets today. */
export type ResponsibilityPresetDepartmentKey = "DIETARY" | "EVS" | "PLANT";

export type DepartmentResponsibilityPreset = {
  /** Stable registry key — never persisted on UnitSpaceResponsibility. */
  key: string;
  departmentKey: ResponsibilityPresetDepartmentKey;
  label: string;
  description: string;
  /** Capabilities preselected when this preset is chosen. Empty for Custom. */
  defaultCapabilities: readonly CapabilityKey[];
  /**
   * Space-type preset keys (from SPACE_TYPE_PRESETS) that recommend this
   * responsibility preset as the default selection for the department.
   */
  recommendedSpaceTypes: readonly string[];
};

export const CUSTOM_RESPONSIBILITY_PRESET_KEY = "custom";

/**
 * Canonical registry — single source of truth for responsibility templates.
 * Order within a department is display order in the picker.
 */
export const DEPARTMENT_RESPONSIBILITY_PRESETS: readonly DepartmentResponsibilityPreset[] = [
  // -------------------------------------------------------------------------
  // Dietary
  // -------------------------------------------------------------------------
  {
    key: "dietary_food_service_room",
    departmentKey: "DIETARY",
    label: "Food Service Room",
    description: "Servery / dining service — meals, food safety, and service logs.",
    defaultCapabilities: [
      "SERVICE_OPERATIONS",
      "MEAL_SERVICE",
      "FOOD_SAFETY",
      "SERVICE_LOGS",
      "CLEANING",
      "KNOWLEDGE",
    ],
    recommendedSpaceTypes: ["servery", "dining_room"],
  },
  {
    key: "dietary_production_kitchen",
    departmentKey: "DIETARY",
    label: "Production Kitchen",
    description: "Kitchen production — food safety, equipment, and repairs.",
    defaultCapabilities: [
      "SERVICE_OPERATIONS",
      "FOOD_SAFETY",
      "SERVICE_LOGS",
      "REPAIRS",
      "ASSET_MANAGEMENT",
      "CLEANING",
      "KNOWLEDGE",
    ],
    recommendedSpaceTypes: ["production_area"],
  },
  {
    key: "dietary_storage_area",
    departmentKey: "DIETARY",
    label: "Storage Area",
    description: "Dietary storage — cleaning and asset care.",
    defaultCapabilities: ["CLEANING", "ASSET_MANAGEMENT", "REPAIRS"],
    recommendedSpaceTypes: ["storage"],
  },
  {
    key: "dietary_office",
    departmentKey: "DIETARY",
    label: "Office",
    description: "Dietary office — knowledge only.",
    defaultCapabilities: ["KNOWLEDGE"],
    recommendedSpaceTypes: ["office"],
  },
  {
    key: "dietary_custom",
    departmentKey: "DIETARY",
    label: "Custom",
    description: "Start with no capabilities selected.",
    defaultCapabilities: [],
    recommendedSpaceTypes: [],
  },

  // -------------------------------------------------------------------------
  // EVS
  // -------------------------------------------------------------------------
  {
    key: "evs_resident_room",
    departmentKey: "EVS",
    label: "Resident Room",
    description: "Resident / patient room cleaning and room status.",
    defaultCapabilities: [
      "CLEANING",
      "ROOM_STATUS",
      "WORK_QUEUE",
      "INSPECTIONS",
      "KNOWLEDGE",
    ],
    recommendedSpaceTypes: ["resident_room", "patient_room"],
  },
  {
    key: "evs_public_area",
    departmentKey: "EVS",
    label: "Public Area",
    description: "Hallways and shared public spaces.",
    defaultCapabilities: ["CLEANING", "WORK_QUEUE"],
    recommendedSpaceTypes: ["hallway", "public_area", "restroom"],
  },
  {
    key: "evs_soiled_utility",
    departmentKey: "EVS",
    label: "Soiled Utility",
    description: "Soiled / utility hold areas.",
    defaultCapabilities: ["CLEANING", "WORK_QUEUE", "INSPECTIONS"],
    recommendedSpaceTypes: ["utility_room"],
  },
  {
    key: "evs_custom",
    departmentKey: "EVS",
    label: "Custom",
    description: "Start with no capabilities selected.",
    defaultCapabilities: [],
    recommendedSpaceTypes: [],
  },

  // -------------------------------------------------------------------------
  // Plant
  // -------------------------------------------------------------------------
  {
    key: "plant_mechanical_room",
    departmentKey: "PLANT",
    label: "Mechanical Room",
    description: "Mechanical spaces — maintenance, assets, repairs, inspections.",
    defaultCapabilities: [
      "BUILDING_MAINTENANCE",
      "ASSET_MANAGEMENT",
      "REPAIRS",
      "INSPECTIONS",
    ],
    recommendedSpaceTypes: ["mechanical_room"],
  },
  {
    key: "plant_equipment_area",
    departmentKey: "PLANT",
    label: "Equipment Area",
    description: "Equipment-focused plant access.",
    defaultCapabilities: ["ASSET_MANAGEMENT", "REPAIRS"],
    recommendedSpaceTypes: [],
  },
  {
    key: "plant_utility_area",
    departmentKey: "PLANT",
    label: "Utility Area",
    description: "Plant utility / infrastructure areas.",
    defaultCapabilities: ["BUILDING_MAINTENANCE", "REPAIRS"],
    recommendedSpaceTypes: ["utility_room"],
  },
  {
    key: "plant_custom",
    departmentKey: "PLANT",
    label: "Custom",
    description: "Start with no capabilities selected.",
    defaultCapabilities: [],
    recommendedSpaceTypes: [],
  },
] as const;

const PRESET_BY_KEY = new Map(
  DEPARTMENT_RESPONSIBILITY_PRESETS.map((p) => [p.key, p]),
);

export function findResponsibilityPreset(
  key: string,
): DepartmentResponsibilityPreset | undefined {
  return PRESET_BY_KEY.get(key);
}

/** Presets for a department key, in registry order. Empty if unknown department. */
export function listPresetsForDepartment(
  departmentKey: string,
): DepartmentResponsibilityPreset[] {
  const key = departmentKey.trim().toUpperCase();
  return DEPARTMENT_RESPONSIBILITY_PRESETS.filter(
    (p) => p.departmentKey === key,
  );
}

/**
 * Recommend a preset key for a department + space-type preset pair.
 * Falls back to that department's Custom preset when no recommendation matches.
 * Never auto-assigns a department — only suggests which template to preselect.
 */
export function recommendResponsibilityPresetKey(
  departmentKey: string,
  spaceTypePresetKey: string | null | undefined,
): string | null {
  const presets = listPresetsForDepartment(departmentKey);
  if (presets.length === 0) return null;

  const spaceKey = spaceTypePresetKey?.trim() ?? "";
  if (spaceKey) {
    const match = presets.find(
      (p) =>
        p.defaultCapabilities.length > 0 &&
        p.recommendedSpaceTypes.includes(spaceKey),
    );
    if (match) return match.key;
  }

  const custom = presets.find((p) => p.key.endsWith("_custom") || p.label === "Custom");
  return custom?.key ?? presets[presets.length - 1]!.key;
}

/** Capabilities a preset would preselect (empty for Custom / unknown). */
export function capabilitiesForPreset(presetKey: string): CapabilityKey[] {
  const preset = findResponsibilityPreset(presetKey);
  if (!preset) return [];
  return [...preset.defaultCapabilities];
}

/** True when every capability in the list is a known CAPABILITY_KEYS value. */
export function assertKnownCapabilities(
  capabilities: readonly string[],
): capabilities is CapabilityKey[] {
  const allowed = new Set<string>(CAPABILITY_KEYS);
  return capabilities.every((c) => allowed.has(c));
}

/**
 * After the admin edits checkboxes manually, the preset has done its job.
 * This helper compares current selection to a preset — used by tests / UI
 * to detect "diverged from template" without persisting anything.
 */
export function capabilitiesMatchPreset(
  capabilities: readonly string[],
  presetKey: string,
): boolean {
  const expected = capabilitiesForPreset(presetKey);
  if (capabilities.length !== expected.length) return false;
  const set = new Set(capabilities);
  return expected.every((c) => set.has(c));
}
