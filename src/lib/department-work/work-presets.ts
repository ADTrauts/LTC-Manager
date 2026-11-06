/**
 * Synthetic Department Work Plan presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No facility-specific unit IDs or location names.
 */

import { getLocationFunction } from "@/lib/department-products/location-functions";
import {
  getDepartmentProduct,
  type DepartmentProductKey,
} from "@/lib/department-products/registry";

import type { WorkPlanDraftInput } from "./types";

const FOOD_SERVICE_AREA = getLocationFunction("DIETARY", "food_service_area");
const RESIDENT_CARE = getLocationFunction("EVS", "resident_care");
const SERVICE_SUPPORT = getLocationFunction("EVS", "service_support");

if (!FOOD_SERVICE_AREA || !RESIDENT_CARE || !SERVICE_SUPPORT) {
  throw new Error("Department Product Location Functions required by Work presets are missing.");
}

const FOOD_SERVICE_AREA_APPLICABILITY = {
  kind: "OPERATIONAL_TYPE" as const,
  operationalTypeKey: FOOD_SERVICE_AREA.functionKey,
};

const RESIDENT_CARE_APPLICABILITY = {
  kind: "OPERATIONAL_TYPE" as const,
  operationalTypeKey: RESIDENT_CARE.functionKey,
};

const SERVICE_SUPPORT_APPLICABILITY = {
  kind: "OPERATIONAL_TYPE" as const,
  operationalTypeKey: SERVICE_SUPPORT.functionKey,
};

export const DIETARY_WORK_PRESET_KEYS = [
  "SERVERY_OPENING_CHECKS",
  "MEAL_SERVICE_SUPPORT",
  "SERVERY_CLOSING_CHECKS",
] as const;

export const EVS_WORK_PRESET_KEYS = [
  "ROUTINE_ROOM_CLEAN",
  "COMMON_AREA_ROUND",
  "SHIFT_CLOSEOUT",
  "ROOM_TURN_SPECIAL_CLEAN",
] as const;

export const PLANT_WORK_PRESET_KEYS = [
  "MECHANICAL_ROOM_ROUND",
  "BUILDING_WALKTHROUGH",
  "EXTERIOR_GROUNDS_WALKTHROUGH",
  "GENERATOR_VISUAL_CHECK",
] as const;

export const DEPARTMENT_WORK_PRESET_KEYS = [
  ...DIETARY_WORK_PRESET_KEYS,
  ...EVS_WORK_PRESET_KEYS,
  ...PLANT_WORK_PRESET_KEYS,
] as const;

export type DietaryWorkPresetKey = (typeof DIETARY_WORK_PRESET_KEYS)[number];
export type EvsWorkPresetKey = (typeof EVS_WORK_PRESET_KEYS)[number];
export type PlantWorkPresetKey = (typeof PLANT_WORK_PRESET_KEYS)[number];
export type DepartmentWorkPresetKey = (typeof DEPARTMENT_WORK_PRESET_KEYS)[number];

export function isDepartmentWorkPresetKey(value: string): value is DepartmentWorkPresetKey {
  return (DEPARTMENT_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

/**
 * Authoritative Department Product owner for each Vssyl Work preset.
 * Marketplace category reads this map. Display names are not ownership.
 */
export const WORK_PRESET_PRODUCT_KEYS = {
  SERVERY_OPENING_CHECKS: "HEALTHCARE_FOOD_NUTRITION",
  MEAL_SERVICE_SUPPORT: "HEALTHCARE_FOOD_NUTRITION",
  SERVERY_CLOSING_CHECKS: "HEALTHCARE_FOOD_NUTRITION",
  ROUTINE_ROOM_CLEAN: "EVS",
  COMMON_AREA_ROUND: "EVS",
  SHIFT_CLOSEOUT: "EVS",
  ROOM_TURN_SPECIAL_CLEAN: "EVS",
  MECHANICAL_ROOM_ROUND: "PLANT",
  BUILDING_WALKTHROUGH: "PLANT",
  EXTERIOR_GROUNDS_WALKTHROUGH: "PLANT",
  GENERATOR_VISUAL_CHECK: "PLANT",
} as const satisfies Record<DepartmentWorkPresetKey, DepartmentProductKey>;

export function workPresetOwningProductKey(
  presetKey: DepartmentWorkPresetKey,
): DepartmentProductKey {
  return WORK_PRESET_PRODUCT_KEYS[presetKey];
}

function isDietaryPresetKey(value: string): value is DietaryWorkPresetKey {
  return (DIETARY_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

function isEvsPresetKey(value: string): value is EvsWorkPresetKey {
  return (EVS_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

function isPlantPresetKey(value: string): value is PlantWorkPresetKey {
  return (PLANT_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

const DEPARTMENT_WIDE_APPLICABILITY = { kind: "DEPARTMENT_UNIT" as const };

function plantRoundItem(
  itemKey: string,
  label: string,
  instructions: string,
  displaySequence: number,
): WorkPlanDraftInput["items"][number] {
  return {
    itemKey,
    label,
    instructions,
    displaySequence,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    supervisorVisible: true,
  };
}

export function buildWorkPlanPresetDraft(presetKey: DepartmentWorkPresetKey): WorkPlanDraftInput {
  switch (presetKey) {
    case "SERVERY_OPENING_CHECKS":
      return {
        name: "Servery Opening Checks",
        description: "Unit-shared opening steps before meal service.",
        presetKey: "SERVERY_OPENING_CHECKS",
        weekdays: [],
        applicabilities: [FOOD_SERVICE_AREA_APPLICABILITY],
        items: [
          {
            itemKey: "verify_stations",
            label: "Verify stations ready",
            instructions: "Confirm stations are stocked and ready for service.",
            displaySequence: 10,
            priority: "TIME_SENSITIVE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            // Opening is the morning start-of-day window (historical morning_prep).
            cycleStableKeys: ["breakfast_prep"],
            supervisorVisible: true,
          },
          {
            itemKey: "confirm_temps",
            label: "Confirm holding temperatures",
            instructions: "Check holding equipment temperatures before service.",
            displaySequence: 20,
            priority: "TIME_SENSITIVE",
            completionMode: "LINKED_EVIDENCE",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["breakfast_prep"],
            linkedTemplateStableKey: "cooler_temperature_log",
            supervisorVisible: true,
          },
        ],
      };
    case "MEAL_SERVICE_SUPPORT":
      return {
        name: "Meal Service Support",
        description: "Unit-shared support steps during meal service windows.",
        presetKey: "MEAL_SERVICE_SUPPORT",
        weekdays: [],
        applicabilities: [FOOD_SERVICE_AREA_APPLICABILITY],
        items: [
          {
            itemKey: "tray_line_check",
            label: "Tray line check",
            instructions: "Walk the tray line and confirm presentation and allergens.",
            displaySequence: 10,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            // During-meal Work binds to Service Phases (not the full meal Cycle window).
            cycleStableKeys: ["breakfast_service", "lunch_service", "dinner_service"],
            supervisorVisible: true,
          },
          {
            itemKey: "sanitizer_check",
            label: "Sanitizer check",
            instructions: "Confirm sanitizer is in range for the service window.",
            displaySequence: 20,
            priority: "TIME_SENSITIVE",
            completionMode: "LINKED_EVIDENCE",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["breakfast_service", "lunch_service", "dinner_service"],
            linkedTemplateStableKey: "dishwasher_sanitizer_log",
            supervisorVisible: true,
          },
        ],
      };
    case "SERVERY_CLOSING_CHECKS":
      return {
        name: "Servery Closing Checks",
        description: "Unit-shared closing steps after meal service.",
        presetKey: "SERVERY_CLOSING_CHECKS",
        weekdays: [],
        applicabilities: [FOOD_SERVICE_AREA_APPLICABILITY],
        items: [
          {
            itemKey: "leftover_handling",
            label: "Leftover handling",
            instructions: "Label, date, and store leftovers per procedure.",
            displaySequence: 10,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            // Leftovers are handled after each meal (historical singular "closing").
            cycleStableKeys: ["breakfast_cleanup", "lunch_cleanup", "dinner_cleanup"],
            supervisorVisible: true,
          },
          {
            itemKey: "station_reset",
            label: "Station reset",
            instructions: "Reset stations and confirm closing checklist items.",
            displaySequence: 20,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
        ],
      };
    case "ROUTINE_ROOM_CLEAN":
      return {
        name: "Routine Room Clean",
        description: "Resident-care clean checklist for rooms bound to that Location Function.",
        presetKey: "ROUTINE_ROOM_CLEAN",
        weekdays: [],
        applicabilities: [RESIDENT_CARE_APPLICABILITY],
        items: [
          {
            itemKey: "surfaces",
            label: "Clean high-touch surfaces",
            instructions: "Wipe high-touch surfaces per procedure.",
            displaySequence: 10,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["morning_routine"],
            supervisorVisible: true,
          },
          {
            itemKey: "bathroom",
            label: "Clean bathroom",
            instructions: "Clean sink, toilet, and fixtures.",
            displaySequence: 20,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["morning_routine"],
            supervisorVisible: true,
          },
          {
            itemKey: "waste",
            label: "Empty waste",
            instructions: "Empty trash and replace liners as needed.",
            displaySequence: 30,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
          {
            itemKey: "supplies",
            label: "Restock supplies",
            instructions: "Restock soap, towels, and other room supplies.",
            displaySequence: 40,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
          {
            itemKey: "floor",
            label: "Clean floor",
            instructions: "Sweep and mop or vacuum the floor.",
            displaySequence: 50,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
          {
            itemKey: "final_check",
            label: "Final visual check",
            instructions: "Confirm room is ready for use.",
            displaySequence: 60,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
        ],
      };
    case "COMMON_AREA_ROUND":
      return {
        name: "Common Area Round",
        description: "Service and support area round for rooms bound to that Location Function.",
        presetKey: "COMMON_AREA_ROUND",
        weekdays: [],
        applicabilities: [SERVICE_SUPPORT_APPLICABILITY],
        items: [
          {
            itemKey: "walk_area",
            label: "Walk common area",
            instructions: "Walk the area and address visible litter or spills.",
            displaySequence: 10,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["day_cleaning"],
            supervisorVisible: true,
          },
          {
            itemKey: "restock_supplies",
            label: "Restock supplies",
            instructions: "Restock paper and soap where needed.",
            displaySequence: 20,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["day_cleaning"],
            supervisorVisible: true,
          },
          {
            itemKey: "spot_clean",
            label: "Spot clean",
            instructions: "Spot-clean floors and fixtures as needed.",
            displaySequence: 30,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
        ],
      };
    case "SHIFT_CLOSEOUT":
      return {
        name: "EVS Shift Closeout",
        description: "Unit-shared end-of-shift closeout steps.",
        presetKey: "SHIFT_CLOSEOUT",
        weekdays: [],
        applicabilities: [{ kind: "DEPARTMENT_UNIT" }],
        items: [
          {
            itemKey: "cart_reset",
            label: "Reset cart",
            instructions: "Restock and reset the cleaning cart.",
            displaySequence: 10,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["evening_closeout"],
            supervisorVisible: true,
          },
          {
            itemKey: "handoff_notes",
            label: "Handoff notes",
            instructions: "Record open items for the next shift.",
            displaySequence: 20,
            priority: "ROUTINE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "OPERATIONAL_CYCLE",
            cycleStableKeys: ["evening_closeout"],
            supervisorVisible: true,
          },
        ],
      };
    case "ROOM_TURN_SPECIAL_CLEAN":
      return {
        name: "Room Turn / Special Clean",
        description:
          "One-item draft for a specific room. Set SPECIFIC_SPACE applicability before publish.",
        presetKey: "ROOM_TURN_SPECIAL_CLEAN",
        weekdays: [],
        applicabilities: [{ kind: "SPECIFIC_SPACE" }],
        items: [
          {
            itemKey: "special_clean",
            label: "Complete special clean",
            instructions: "Perform the requested room turn or special clean.",
            displaySequence: 10,
            priority: "TIME_SENSITIVE",
            completionMode: "EXPLICIT_CONFIRMATION",
            responsibilityMode: "UNIT_SHARED",
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            supervisorVisible: true,
          },
        ],
      };
    case "MECHANICAL_ROOM_ROUND":
      return {
        name: "Mechanical Room Round",
        description:
          "Routine operational walkthrough of mechanical spaces. Review assigned mechanical spaces for obvious leaks, abnormal conditions, access concerns, housekeeping issues, or equipment conditions requiring follow-up.",
        presetKey: "MECHANICAL_ROOM_ROUND",
        stableKey: "MECHANICAL_ROOM_ROUND",
        weekdays: [],
        applicabilities: [DEPARTMENT_WIDE_APPLICABILITY],
        items: [
          plantRoundItem(
            "walk_spaces",
            "Walk assigned mechanical spaces",
            "Review assigned mechanical spaces for obvious leaks, abnormal conditions, access concerns, housekeeping issues, or equipment conditions requiring follow-up.",
            10,
          ),
          plantRoundItem(
            "note_follow_up",
            "Note conditions that need follow-up",
            "Record anything that should be reported through the normal Request or Issue workflow. This round does not create Issues automatically.",
            20,
          ),
        ],
      };
    case "BUILDING_WALKTHROUGH":
      return {
        name: "Building Walkthrough",
        description:
          "General Facility condition observation: walls and ceilings, doors, visible damage, leaks, lighting, trip hazards, and other maintenance needs. This is not an inspection or compliance program.",
        presetKey: "BUILDING_WALKTHROUGH",
        stableKey: "BUILDING_WALKTHROUGH",
        weekdays: [],
        applicabilities: [DEPARTMENT_WIDE_APPLICABILITY],
        items: [
          plantRoundItem(
            "observe_interior",
            "Observe interior condition",
            "Look for walls/ceilings, doors, visible damage, leaks, lighting, trip hazards, or other maintenance needs.",
            10,
          ),
          plantRoundItem(
            "note_follow_up",
            "Note conditions that need follow-up",
            "Report maintenance needs through the normal Request or Issue workflow. This walkthrough does not create Issues automatically.",
            20,
          ),
        ],
      };
    case "EXTERIOR_GROUNDS_WALKTHROUGH":
      return {
        name: "Exterior / Grounds Walkthrough",
        description:
          "General exterior Facility condition observation: walkways, exterior damage, grounds concerns, drainage, lighting, and access. This is not a grounds-management program.",
        presetKey: "EXTERIOR_GROUNDS_WALKTHROUGH",
        stableKey: "EXTERIOR_GROUNDS_WALKTHROUGH",
        weekdays: [],
        applicabilities: [DEPARTMENT_WIDE_APPLICABILITY],
        items: [
          plantRoundItem(
            "observe_exterior",
            "Observe exterior and grounds",
            "Look for walkway, exterior damage, grounds, drainage, lighting, or access concerns.",
            10,
          ),
          plantRoundItem(
            "note_follow_up",
            "Note conditions that need follow-up",
            "Report maintenance needs through the normal Request or Issue workflow.",
            20,
          ),
        ],
      };
    case "GENERATOR_VISUAL_CHECK":
      return {
        name: "Generator Visual Check",
        description:
          "Perform a basic visual check of the assigned generator area and report abnormal visible conditions. This is a visual operational check — not manufacturer preventive service, load-bank testing, or a regulatory generator inspection.",
        presetKey: "GENERATOR_VISUAL_CHECK",
        stableKey: "GENERATOR_VISUAL_CHECK",
        weekdays: [],
        applicabilities: [DEPARTMENT_WIDE_APPLICABILITY],
        items: [
          plantRoundItem(
            "visual_check",
            "Perform a basic visual check",
            "Check the assigned generator area for abnormal visible conditions. Do not treat this as manufacturer PM, load-bank testing, or regulatory inspection.",
            10,
          ),
          plantRoundItem(
            "note_follow_up",
            "Report abnormal visible conditions",
            "Report abnormal visible conditions through the normal Request or Issue workflow.",
            20,
          ),
        ],
      };
  }
}

/** Product function keys a new preset draft requires the facility to have adopted. */
export function unadoptedPresetLocationFunctions(
  draft: Pick<WorkPlanDraftInput, "applicabilities">,
  adoptedKeys: readonly string[],
): string[] {
  const adopted = new Set(adoptedKeys);
  const missing: string[] = [];
  for (const app of draft.applicabilities ?? []) {
    if (app.kind !== "OPERATIONAL_TYPE") continue;
    const key = app.operationalTypeKey?.trim();
    if (!key || adopted.has(key) || missing.includes(key)) continue;
    missing.push(key);
  }
  return missing;
}

function resolveWorkPresetDepartmentKey(departmentKey?: string): string | undefined {
  if (!departmentKey) return undefined;
  return getDepartmentProduct(departmentKey)?.installationKey ?? departmentKey;
}

export function listWorkPlanPresetSummaries(departmentKey?: string) {
  const resolvedKey = resolveWorkPresetDepartmentKey(departmentKey);
  const keys =
    resolvedKey === "DIETARY"
      ? DIETARY_WORK_PRESET_KEYS
      : resolvedKey === "EVS"
        ? EVS_WORK_PRESET_KEYS
        : resolvedKey === "PLANT"
          ? PLANT_WORK_PRESET_KEYS
          : departmentKey
            ? ([] as const)
            : [...DIETARY_WORK_PRESET_KEYS, ...EVS_WORK_PRESET_KEYS];

  return keys.map((key) => {
    const draft = buildWorkPlanPresetDraft(key);
    return {
      key,
      name: draft.name,
      description: draft.description ?? null,
      itemCount: draft.items.length,
      departmentKey: isDietaryPresetKey(key)
        ? ("DIETARY" as const)
        : isEvsPresetKey(key)
          ? ("EVS" as const)
          : isPlantPresetKey(key)
            ? ("PLANT" as const)
            : null,
    };
  });
}
