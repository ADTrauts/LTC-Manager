/**
 * Synthetic Department Work Plan presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No facility-specific unit IDs or location names.
 */

import type { WorkPlanDraftInput } from "./types";

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
        applicabilities: [{ kind: "DEPARTMENT_UNIT" }],
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
            cycleStableKeys: ["morning_prep"],
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
            cycleStableKeys: ["morning_prep"],
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
        applicabilities: [{ kind: "DEPARTMENT_UNIT" }],
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
        applicabilities: [{ kind: "DEPARTMENT_UNIT" }],
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
            cycleStableKeys: ["closing"],
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
        description: "Patient-room clean checklist expanded per matching UnitSpace.",
        presetKey: "ROUTINE_ROOM_CLEAN",
        weekdays: [],
        applicabilities: [{ kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
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
        description: "Public area and restroom round checklist.",
        presetKey: "COMMON_AREA_ROUND",
        weekdays: [],
        applicabilities: [
          { kind: "SPACE_TYPE", spaceType: "PUBLIC_AREA" },
          { kind: "SPACE_TYPE", spaceType: "RESTROOM" },
        ],
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
            cycleStableKeys: ["afternoon_round"],
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
            cycleStableKeys: ["afternoon_round"],
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
            cycleStableKeys: ["shift_closeout"],
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
            cycleStableKeys: ["shift_closeout"],
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

export function listWorkPlanPresetSummaries(
  departmentKey?: "DIETARY" | "EVS" | "PLANT",
) {
  const keys =
    departmentKey === "DIETARY"
      ? DIETARY_WORK_PRESET_KEYS
      : departmentKey === "EVS"
        ? EVS_WORK_PRESET_KEYS
        : departmentKey === "PLANT"
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
