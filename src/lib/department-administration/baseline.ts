/**
 * System Department Baseline adapter.
 *
 * Materializes a DRAFT profile plan from the Wave 14A registries
 * (Experience catalog + Operational Area catalog). The registries remain the
 * single canonical definition — nothing here duplicates them; this adapter
 * reads them and emits a per-facility draft plan for persistence.
 *
 * Baseline creation never assigns physical rooms and never activates.
 */

import {
  listOperationalAreasForDepartment,
  requireExperience,
} from "@/lib/experiences";
import type { OperationalDepartmentKey } from "@/lib/experiences";

export const BASELINE_DEPARTMENT_KEYS = ["DIETARY", "EVS", "PLANT"] as const;

export type BaselineDepartmentKey = (typeof BASELINE_DEPARTMENT_KEYS)[number];

export function isBaselineDepartmentKey(
  value: string,
): value is BaselineDepartmentKey {
  return (BASELINE_DEPARTMENT_KEYS as readonly string[]).includes(value);
}

export type BaselineAreaPlan = {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Ordered registry Experience keys. */
  experienceKeys: readonly string[];
};

export type BaselineArchetypePlan = {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Registry Experience keys the archetype activates (must exist in areas). */
  experienceKeys: readonly string[];
};

export type BaselineProfilePlan = {
  baselineKey: BaselineDepartmentKey;
  name: string;
  areas: BaselineAreaPlan[];
  archetypes: BaselineArchetypePlan[];
};

/**
 * Conservative default archetypes per baseline department (Wave 14B).
 * Archetypes are operational templates; physical rooms are mapped later
 * and never automatically.
 */
const BASELINE_ARCHETYPES: Record<BaselineDepartmentKey, BaselineArchetypePlan[]> = {
  DIETARY: [
    {
      key: "servery",
      name: "Servery",
      description: "Point-of-service meal line.",
      sortOrder: 10,
      experienceKeys: [
        "MEAL_SERVICE",
        "MEAL_TIMES",
        "TRAY_ACCURACY",
        "TEMPERATURE_MONITORING",
        "SANITATION",
        "EQUIPMENT",
        "CLEANING_LISTS",
      ],
    },
    {
      key: "production_kitchen",
      name: "Production Kitchen",
      description: "Food production space.",
      sortOrder: 20,
      experienceKeys: [
        "PRODUCTION",
        "RECIPES",
        "BATCH_RECORDS",
        "TEMPERATURE_MONITORING",
        "SANITATION",
        "HACCP",
        "EQUIPMENT",
        "CLEANING",
      ],
    },
    {
      key: "dining_room",
      name: "Dining Room",
      description: "Dine-in service space.",
      sortOrder: 30,
      experienceKeys: ["MEAL_SERVICE", "MEAL_TIMES", "SATISFACTION", "CLEANING_LISTS"],
    },
    {
      key: "tray_delivery_point",
      name: "Tray Delivery Point",
      description: "Rooms receiving tray delivery.",
      sortOrder: 40,
      experienceKeys: ["MEAL_SERVICE", "NOURISHMENTS"],
    },
    {
      key: "storage_supply",
      name: "Storage / Supply",
      description: "Dietary storage and supply space.",
      sortOrder: 50,
      experienceKeys: ["TEMPERATURE_MONITORING", "CLEANING", "EQUIPMENT"],
    },
    {
      key: "office_support",
      name: "Office / Support",
      description: "Department office and support space.",
      sortOrder: 60,
      experienceKeys: ["ASSIGNMENTS"],
    },
  ],
  EVS: [
    {
      key: "occupied_resident_room",
      name: "Occupied Resident Room",
      description: "Daily cleaning of an occupied room.",
      sortOrder: 10,
      experienceKeys: ["ROOM_CLEANING", "ROOM_STATUS", "CLEANING_LISTS"],
    },
    {
      key: "discharge_turnover_room",
      name: "Discharge / Turnover Room",
      description: "Terminal clean and turnover.",
      sortOrder: 20,
      experienceKeys: ["ROOM_CLEANING", "ROOM_STATUS", "INFECTION_CONTROL"],
    },
    {
      key: "public_area",
      name: "Public Area",
      description: "Common and public spaces.",
      sortOrder: 30,
      experienceKeys: ["PROJECT_CLEANING", "CLEANING_LISTS", "ROUNDING"],
    },
    {
      key: "restroom",
      name: "Restroom",
      description: "Restroom cleaning.",
      sortOrder: 40,
      experienceKeys: ["CLEANING", "CLEANING_LISTS"],
    },
    {
      key: "utility_soiled_area",
      name: "Utility / Soiled Area",
      description: "Soiled utility and service spaces.",
      sortOrder: 50,
      experienceKeys: ["CLEANING", "CLEANING_LISTS", "INFECTION_CONTROL"],
    },
    {
      key: "office_support",
      name: "Office / Support",
      description: "Department office and support space.",
      sortOrder: 60,
      experienceKeys: ["ASSIGNMENTS"],
    },
  ],
  PLANT: [
    {
      key: "serviceable_space",
      name: "Serviceable Space",
      description: "General maintainable space (reactive work).",
      sortOrder: 10,
      experienceKeys: ["WORK_ORDERS"],
    },
    {
      key: "mechanical_room",
      name: "Mechanical Room",
      description: "Mechanical and life-safety critical space.",
      sortOrder: 20,
      experienceKeys: [
        "ASSETS",
        "PREVENTIVE_MAINTENANCE",
        "WORK_ORDERS",
        "UTILITIES",
        "LIFE_SAFETY",
      ],
    },
    {
      key: "equipment_area",
      name: "Equipment Area",
      description: "Space with maintainable equipment.",
      sortOrder: 30,
      experienceKeys: ["ASSETS", "PREVENTIVE_MAINTENANCE", "WORK_ORDERS"],
    },
    {
      key: "utility_area",
      name: "Utility Area",
      description: "Utility infrastructure space.",
      sortOrder: 40,
      experienceKeys: ["UTILITIES", "PREVENTIVE_MAINTENANCE", "WORK_ORDERS", "INSPECTIONS"],
    },
    {
      key: "exterior_grounds",
      name: "Exterior / Grounds",
      description: "Exterior and grounds space.",
      sortOrder: 50,
      experienceKeys: ["WORK_ORDERS", "ROUNDING"],
    },
    {
      key: "plant_shop",
      name: "Plant Shop",
      description: "Maintenance shop and staging.",
      sortOrder: 60,
      experienceKeys: ["ASSETS", "WORK_ORDERS", "ASSIGNMENTS"],
    },
  ],
};

const BASELINE_PROFILE_NAMES: Record<BaselineDepartmentKey, string> = {
  DIETARY: "Dietary Standard Operating Model",
  EVS: "EVS Standard Operating Model",
  PLANT: "Plant Operations Standard Operating Model",
};

/**
 * Materialize a baseline DRAFT plan from the Wave 14A registries.
 * Pure: emits a plan; persistence happens in the profile service.
 */
export function materializeBaselineProfilePlan(
  departmentKey: string,
): BaselineProfilePlan {
  if (!isBaselineDepartmentKey(departmentKey)) {
    throw new Error(`No system baseline for department: ${departmentKey}`);
  }

  const registryAreas = listOperationalAreasForDepartment(
    departmentKey as OperationalDepartmentKey,
  );
  if (registryAreas.length === 0) {
    throw new Error(`Registry has no Operational Areas for ${departmentKey}`);
  }

  const areas: BaselineAreaPlan[] = registryAreas.map((area) => ({
    key: area.key,
    name: area.name,
    description: area.description,
    sortOrder: area.order,
    // Validate every key against the canonical registry; throws on unknowns.
    experienceKeys: area.experienceKeys.map((key) => requireExperience(key).key),
  }));

  const areaExperienceKeys = new Set(
    areas.flatMap((area) => area.experienceKeys),
  );

  const archetypes = BASELINE_ARCHETYPES[departmentKey].map((archetype) => {
    for (const key of archetype.experienceKeys) {
      if (!areaExperienceKeys.has(key)) {
        throw new Error(
          `Baseline archetype ${archetype.key} references Experience ${key} not present in ${departmentKey} areas`,
        );
      }
    }
    return archetype;
  });

  return {
    baselineKey: departmentKey,
    name: BASELINE_PROFILE_NAMES[departmentKey],
    areas,
    archetypes,
  };
}
