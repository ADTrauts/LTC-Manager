/**
 * Synthetic Department Work Plan presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No facility-specific unit IDs or location names.
 */

import { getLocationFunction } from "@/lib/department-products/location-functions";

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

export const DEPARTMENT_WORK_PRESET_KEYS = [
  ...DIETARY_WORK_PRESET_KEYS,
  ...EVS_WORK_PRESET_KEYS,
] as const;

export type DietaryWorkPresetKey = (typeof DIETARY_WORK_PRESET_KEYS)[number];
export type EvsWorkPresetKey = (typeof EVS_WORK_PRESET_KEYS)[number];
export type DepartmentWorkPresetKey = (typeof DEPARTMENT_WORK_PRESET_KEYS)[number];

export function isDepartmentWorkPresetKey(value: string): value is DepartmentWorkPresetKey {
  return (DEPARTMENT_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

function isDietaryPresetKey(value: string): value is DietaryWorkPresetKey {
  return (DIETARY_WORK_PRESET_KEYS as readonly string[]).includes(value);
}

function isEvsPresetKey(value: string): value is EvsWorkPresetKey {
  return (EVS_WORK_PRESET_KEYS as readonly string[]).includes(value);
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

export function listWorkPlanPresetSummaries(departmentKey?: string) {
  const keys =
    departmentKey === "DIETARY"
      ? DIETARY_WORK_PRESET_KEYS
      : departmentKey === "EVS"
        ? EVS_WORK_PRESET_KEYS
        : departmentKey === "PLANT" || departmentKey
          ? ([] as const)
          : DEPARTMENT_WORK_PRESET_KEYS;

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
          : null,
    };
  });
}
