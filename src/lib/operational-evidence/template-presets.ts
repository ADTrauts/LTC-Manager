/**
 * Synthetic Dietary Operational Template presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No Terrace View-specific asset IDs or location names.
 */

import type { TemplateDraftInput } from "./types";

export const DIETARY_EVIDENCE_PRESET_KEYS = [
  "COOLER_TEMPERATURE_LOG",
  "DISHWASHER_SANITIZER_LOG",
  "OPENING_CLOSING_CHECKLIST",
] as const;

export const PLANT_RECORD_PRESET_KEYS = [
  "EQUIPMENT_CONDITION_INSPECTION",
  "MECHANICAL_ROOM_INSPECTION",
  "GENERATOR_INSPECTION",
  "BASIC_EQUIPMENT_READING",
  "POST_WORK_ORDER_VERIFICATION",
] as const;

export const OPERATIONAL_EVIDENCE_PRESET_KEYS = [
  ...DIETARY_EVIDENCE_PRESET_KEYS,
  ...PLANT_RECORD_PRESET_KEYS,
] as const;

export type DietaryEvidencePresetKey = (typeof DIETARY_EVIDENCE_PRESET_KEYS)[number];
export type PlantRecordPresetKey = (typeof PLANT_RECORD_PRESET_KEYS)[number];
export type OperationalEvidencePresetKey = (typeof OPERATIONAL_EVIDENCE_PRESET_KEYS)[number];

export function isOperationalEvidencePresetKey(value: string): value is OperationalEvidencePresetKey {
  return (OPERATIONAL_EVIDENCE_PRESET_KEYS as readonly string[]).includes(value);
}

export function buildTemplatePresetDraft(presetKey: OperationalEvidencePresetKey): TemplateDraftInput {
  switch (presetKey) {
    case "COOLER_TEMPERATURE_LOG":
      return {
        name: "Cooler Temperature Log",
        description: "Record cooler temperatures twice daily with corrective action when out of range.",
        instructions:
          "Check the cooler thermometer. Enter the temperature. If outside the acceptable range, document corrective action before submitting.",
        purposeType: "LOG",
        presetKey: "COOLER_TEMPERATURE_LOG",
        allowAdHoc: false,
        fields: [
          {
            fieldKey: "cooler_temperature",
            label: "Cooler temperature",
            fieldType: "TEMPERATURE",
            isRequired: true,
            displaySequence: 10,
            unitLabel: "°F",
            minNumber: 33,
            maxNumber: 41,
            correctiveActionTrigger: true,
            correctiveActionRequired: true,
            helpText: "Acceptable range 33–41°F.",
          },
        ],
        applicabilities: [
          {
            kind: "ASSET_TYPE",
            assetType: "COOLER",
          },
        ],
        schedules: [
          {
            kind: "OPERATIONAL_CYCLE",
            // Placeholder cycle keys — manager replaces with published department cycles.
            cycleStableKey: "morning_prep",
          },
          {
            kind: "OPERATIONAL_CYCLE",
            cycleStableKey: "lunch_prep",
          },
        ],
      };
    case "DISHWASHER_SANITIZER_LOG":
      return {
        name: "Dishwasher Sanitizer Log",
        description: "Record sanitizer concentration/temperature and pass/needs-attention result.",
        instructions:
          "Check dishwasher sanitizer. Enter concentration or temperature as configured, then mark Pass or Needs Attention. Needs Attention requires corrective action.",
        purposeType: "LOG",
        presetKey: "DISHWASHER_SANITIZER_LOG",
        allowAdHoc: false,
        fields: [
          {
            fieldKey: "sanitizer_concentration",
            label: "Sanitizer concentration / temperature",
            fieldType: "NUMBER",
            isRequired: true,
            displaySequence: 10,
            unitLabel: "ppm / °F",
            minNumber: 50,
            maxNumber: 200,
            correctiveActionTrigger: true,
            correctiveActionRequired: false,
            helpText: "Enter measured concentration or final rinse temperature as posted.",
          },
          {
            fieldKey: "result",
            label: "Result",
            fieldType: "PASS_NEEDS_ATTENTION",
            isRequired: true,
            displaySequence: 20,
            correctiveActionTrigger: true,
            correctiveActionRequired: true,
            allowedSelections: ["PASS", "NEEDS_ATTENTION"],
          },
        ],
        applicabilities: [
          {
            kind: "ASSET_TYPE",
            assetType: "DISHWASHER",
          },
        ],
        schedules: [
          {
            kind: "OPERATIONAL_CYCLE",
            cycleStableKey: "breakfast_service",
          },
          {
            kind: "OPERATIONAL_CYCLE",
            cycleStableKey: "lunch_service",
          },
          {
            kind: "OPERATIONAL_CYCLE",
            cycleStableKey: "dinner_service",
          },
        ],
      };
    case "OPENING_CLOSING_CHECKLIST":
      return {
        name: "Opening / Closing Checklist",
        description: "Attestation checklist for opening or closing duties.",
        instructions: "Complete each item. Add an optional comment when something needs follow-up.",
        purposeType: "CHECKLIST",
        presetKey: "OPENING_CLOSING_CHECKLIST",
        allowAdHoc: false,
        fields: [
          {
            fieldKey: "handwash_stocked",
            label: "Handwash stations stocked",
            fieldType: "YES_NO",
            isRequired: true,
            displaySequence: 10,
          },
          {
            fieldKey: "surfaces_sanitized",
            label: "Work surfaces sanitized",
            fieldType: "YES_NO",
            isRequired: true,
            displaySequence: 20,
          },
          {
            fieldKey: "temp_logs_started",
            label: "Temperature logs started / completed",
            fieldType: "YES_NO",
            isRequired: true,
            displaySequence: 30,
          },
          {
            fieldKey: "attestation",
            label: "I completed this checklist accurately",
            fieldType: "ATTESTATION",
            isRequired: true,
            displaySequence: 40,
          },
          {
            fieldKey: "comment",
            label: "Comment",
            fieldType: "OPTIONAL_COMMENT",
            isRequired: false,
            displaySequence: 50,
          },
        ],
        applicabilities: [
          {
            kind: "SPACE_TYPE",
            spaceType: "PRODUCTION_AREA",
          },
        ],
        schedules: [
          {
            kind: "FIXED_DAILY_WINDOW",
            windowStartLocal: "05:30",
            windowEndLocal: "07:00",
          },
          {
            kind: "FIXED_DAILY_WINDOW",
            windowStartLocal: "19:00",
            windowEndLocal: "21:00",
          },
        ],
      };
    case "EQUIPMENT_CONDITION_INSPECTION":
      return {
        name: "Equipment Condition Inspection",
        description:
          "Generic observation of equipment condition. This is not a manufacturer inspection.",
        instructions:
          "Observe the equipment and record visible facts. Do not treat this as a detailed manufacturer inspection.",
        purposeType: "INSPECTION",
        presetKey: "EQUIPMENT_CONDITION_INSPECTION",
        stableKey: "EQUIPMENT_CONDITION_INSPECTION",
        allowAdHoc: true,
        fields: [
          plantYesNo("general_condition_ok", "General condition acceptable", 10),
          plantYesNo("visible_damage", "Visible damage observed", 20, true),
          plantYesNo("leak_observed", "Leak observed", 30, true),
          plantYesNo("abnormal_noise", "Abnormal noise or vibration (if applicable)", 40, true),
          plantYesNo("access_ok", "Cleanliness and access acceptable", 50),
          plantYesNo("operating_concern", "Operating concern observed", 60, true),
          plantNotes(70),
          plantFollowUp(80),
        ],
        applicabilities: [],
        schedules: [{ kind: "AD_HOC" }],
      };
    case "MECHANICAL_ROOM_INSPECTION":
      return {
        name: "Mechanical Room Inspection",
        description:
          "Generic mechanical-space observation. This does not imply code compliance.",
        instructions:
          "Record visible room facts. This is not a code or regulatory inspection.",
        purposeType: "INSPECTION",
        presetKey: "MECHANICAL_ROOM_INSPECTION",
        stableKey: "MECHANICAL_ROOM_INSPECTION",
        allowAdHoc: true,
        fields: [
          plantYesNo("room_accessible", "Room is accessible", 10),
          plantYesNo("obvious_leak", "Obvious leak or water observed", 20, true),
          plantYesNo("housekeeping_ok", "Housekeeping acceptable", 30),
          plantYesNo("equipment_condition_ok", "Visible equipment condition acceptable", 40),
          plantYesNo("lighting_access_ok", "Lighting and access acceptable", 50),
          plantNotes(60),
          plantFollowUp(70),
        ],
        applicabilities: [],
        schedules: [{ kind: "AD_HOC" }],
      };
    case "GENERATOR_INSPECTION":
      return {
        name: "Generator Inspection",
        description:
          "Generic visual generator-area observation. This does not satisfy regulatory testing.",
        instructions:
          "Record visible facts only. This does not satisfy manufacturer service, load-bank testing, or regulatory generator inspection.",
        purposeType: "INSPECTION",
        presetKey: "GENERATOR_INSPECTION",
        stableKey: "GENERATOR_INSPECTION",
        allowAdHoc: true,
        fields: [
          plantYesNo("visible_condition_ok", "Visible condition acceptable", 10),
          plantYesNo("area_accessible", "Area is accessible", 20),
          plantYesNo("obvious_leak", "Obvious leak observed", 30, true),
          plantYesNo("warning_observed", "Warning or alarm observed", 40, true),
          plantNotes(50),
          plantFollowUp(60),
        ],
        applicabilities: [],
        schedules: [{ kind: "AD_HOC" }],
      };
    case "BASIC_EQUIPMENT_READING":
      return {
        name: "Basic Equipment Reading",
        description:
          "Reusable simple equipment reading. This is evidence, not a Preventive Maintenance trigger.",
        instructions:
          "Enter the reading name, numeric value, unit, and optional notes. Expected ranges can be configured later by the Facility.",
        purposeType: "LOG",
        presetKey: "BASIC_EQUIPMENT_READING",
        stableKey: "BASIC_EQUIPMENT_READING",
        allowAdHoc: true,
        fields: [
          {
            fieldKey: "reading_name",
            label: "Reading name",
            fieldType: "SHORT_TEXT",
            isRequired: true,
            displaySequence: 10,
          },
          {
            fieldKey: "reading_value",
            label: "Numeric value",
            fieldType: "NUMBER",
            isRequired: true,
            displaySequence: 20,
          },
          {
            fieldKey: "reading_unit",
            label: "Unit",
            fieldType: "SHORT_TEXT",
            isRequired: false,
            displaySequence: 30,
          },
          plantNotes(40),
        ],
        applicabilities: [],
        schedules: [{ kind: "AD_HOC" }],
      };
    case "POST_WORK_ORDER_VERIFICATION":
      return {
        name: "Post-Work Order Verification",
        description:
          "Optional evidence after maintenance work. This does not replace Work Order closeout.",
        instructions:
          "Use when the Facility chooses to record a follow-up observation after work. This is evidence, not closeout.",
        purposeType: "CHECKLIST",
        presetKey: "POST_WORK_ORDER_VERIFICATION",
        stableKey: "POST_WORK_ORDER_VERIFICATION",
        allowAdHoc: true,
        fields: [
          plantYesNo("area_reviewed", "Work area reviewed", 10),
          {
            fieldKey: "subject_observed",
            label: "Equipment or location observed",
            fieldType: "SHORT_TEXT",
            isRequired: true,
            displaySequence: 20,
          },
          plantYesNo("abnormal_remaining", "Abnormal condition remaining", 30, true),
          plantFollowUp(40),
          plantNotes(50),
        ],
        applicabilities: [],
        schedules: [{ kind: "AD_HOC" }],
      };
  }
}

function plantYesNo(
  fieldKey: string,
  label: string,
  displaySequence: number,
  followUpTrigger = false,
): TemplateDraftInput["fields"][number] {
  return {
    fieldKey,
    label,
    fieldType: "YES_NO",
    isRequired: true,
    displaySequence,
    correctiveActionTrigger: followUpTrigger,
    correctiveActionRequired: false,
  };
}

function plantNotes(displaySequence: number): TemplateDraftInput["fields"][number] {
  return {
    fieldKey: "notes",
    label: "Notes",
    fieldType: "OPTIONAL_COMMENT",
    isRequired: false,
    displaySequence,
  };
}

function plantFollowUp(displaySequence: number): TemplateDraftInput["fields"][number] {
  return {
    fieldKey: "follow_up_required",
    label: "Follow-up required",
    fieldType: "YES_NO",
    isRequired: true,
    displaySequence,
    correctiveActionTrigger: true,
    correctiveActionRequired: false,
  };
}

export function listTemplatePresetSummaries(departmentKey?: string): Array<{
  presetKey: OperationalEvidencePresetKey;
  name: string;
  purposeType: TemplateDraftInput["purposeType"];
  description: string;
}> {
  const keys =
    departmentKey === "PLANT"
      ? PLANT_RECORD_PRESET_KEYS
      : departmentKey === "DIETARY" || departmentKey === "HEALTHCARE_FOOD_NUTRITION" || !departmentKey
        ? DIETARY_EVIDENCE_PRESET_KEYS
        : [];

  return keys.map((presetKey) => {
    const draft = buildTemplatePresetDraft(presetKey);
    return {
      presetKey,
      name: draft.name,
      purposeType: draft.purposeType,
      description: draft.description ?? "",
    };
  });
}
