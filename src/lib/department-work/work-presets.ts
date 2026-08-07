/**
 * Synthetic Dietary Work Plan presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No facility-specific unit IDs or location names.
 */

import type { WorkPlanDraftInput } from "./types";

export const DEPARTMENT_WORK_PRESET_KEYS = [
  "SERVERY_OPENING_CHECKS",
  "MEAL_SERVICE_SUPPORT",
  "SERVERY_CLOSING_CHECKS",
] as const;

export type DepartmentWorkPresetKey = (typeof DEPARTMENT_WORK_PRESET_KEYS)[number];

export function isDepartmentWorkPresetKey(value: string): value is DepartmentWorkPresetKey {
  return (DEPARTMENT_WORK_PRESET_KEYS as readonly string[]).includes(value);
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
  }
}

export function listWorkPlanPresetSummaries() {
  return DEPARTMENT_WORK_PRESET_KEYS.map((key) => {
    const draft = buildWorkPlanPresetDraft(key);
    return {
      key,
      name: draft.name,
      description: draft.description ?? null,
      itemCount: draft.items.length,
    };
  });
}
