/**
 * Synthetic Dietary Operational Template presets for Builder "create from preset".
 * Always created as DRAFT — never auto-published.
 * No Terrace View-specific asset IDs or location names.
 */

import type { TemplateDraftInput } from "./types";

export const OPERATIONAL_EVIDENCE_PRESET_KEYS = [
  "COOLER_TEMPERATURE_LOG",
  "DISHWASHER_SANITIZER_LOG",
  "OPENING_CLOSING_CHECKLIST",
] as const;

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
  }
}

export function listTemplatePresetSummaries(): Array<{
  presetKey: OperationalEvidencePresetKey;
  name: string;
  purposeType: TemplateDraftInput["purposeType"];
  description: string;
}> {
  return OPERATIONAL_EVIDENCE_PRESET_KEYS.map((presetKey) => {
    const draft = buildTemplatePresetDraft(presetKey);
    return {
      presetKey,
      name: draft.name,
      purposeType: draft.purposeType,
      description: draft.description ?? "",
    };
  });
}
