/**
 * Standard Catalog forms published by Vssyl (LEG-D17).
 * Any facility can install them. Facility-made forms are separate.
 */

/** @type {Array<Record<string, unknown>>} */
export const STANDARD_DEPARTMENT_FORMS = [
  form("plant_equipment_condition_inspection", "Equipment condition inspection", "INSPECTION", "EQUIPMENT", "AD_HOC", ["PLANT"], [
    field("condition", "Condition", "PASS_NEEDS_ATTENTION", 10, true),
    field("notes", "Notes", "OPTIONAL_COMMENT", 20, false),
  ]),
  form("plant_mechanical_room_inspection", "Mechanical room inspection", "INSPECTION", "EQUIPMENT", "ONCE_DAILY", ["PLANT"], [
    field("room_condition", "Room condition", "PASS_NEEDS_ATTENTION", 10, true),
    field("notes", "Notes", "OPTIONAL_COMMENT", 20, false),
  ]),
  form("plant_generator_inspection", "Generator inspection", "INSPECTION", "EQUIPMENT", "MONTHLY", ["PLANT"], [
    field("generator_condition", "Generator condition", "PASS_NEEDS_ATTENTION", 10, true),
    field("notes", "Notes", "OPTIONAL_COMMENT", 20, false),
  ]),
  form("plant_generator_weekly_run_log", "Generator weekly run log", "LOG", "EQUIPMENT", "WEEKLY", ["PLANT"], [
    field("run_minutes", "Run duration (minutes)", "NUMBER", 10, true),
    field("no_alarms", "No alarms during the run", "YES_NO", 20, true),
  ]),
  form("plant_basic_equipment_reading", "Basic equipment reading", "LOG", "EQUIPMENT", "ONCE_DAILY", ["PLANT"], [
    field("reading", "Reading", "NUMBER", 10, true),
    field("unit_label", "Unit", "SHORT_TEXT", 20, false),
  ]),
  form("plant_post_work_order_verification", "Post-work-order verification", "CHECKLIST", "EQUIPMENT", "AD_HOC", ["PLANT"], [
    field("verified", "Work verified", "YES_NO", 10, true),
    field("notes", "Notes", "OPTIONAL_COMMENT", 20, false),
  ]),
  form("evs_restroom_sanitation_round", "Restroom sanitation round", "CHECKLIST", "SANITATION", "ONCE_DAILY", ["EVS"], [
    field("restroom", "Restroom", "SHORT_TEXT", 10, true),
    field("sanitation_complete", "Sanitation complete", "YES_NO", 20, true),
  ]),
  form("dietary_dry_storage_ambient", "Dry storage ambient", "LOG", "TEMPERATURE", "ONCE_DAILY", ["DIETARY"], [
    field("ambient_temperature", "Ambient temperature", "TEMPERATURE", 10, true),
    field("in_range", "Within the posted range", "YES_NO", 20, true),
  ]),
  {
    ...form(
      "kitchen_sanitation_audit",
      "Kitchen sanitation audit",
      "INSPECTION",
      "SANITATION",
      "ONCE_DAILY",
      ["DIETARY"],
      [
        scored("hand_sinks", "Hand sinks", 10, false),
        scored("food_contact", "Food-contact surfaces", 20, true),
      ],
    ),
    passingScore: 100,
    criticalFailureForcesFailure: true,
    sections: [{ sectionKey: "sanitation", label: "Sanitation", displaySequence: 1 }],
  },
];

function form(stableKey, name, purposeType, category, cadence, departmentKeys, fields) {
  return {
    stableKey,
    version: 1,
    name,
    description: name,
    instructions: `Complete ${name} and record anything that needs attention.`,
    purposeType,
    category,
    recommendedCadence: cadence,
    recommendedScheduleKind: cadence === "AD_HOC" ? null : "FIXED_DAILY_WINDOW",
    recommendedDaypartLabels: [],
    suggestions: { assetTypes: [], spaceTypes: [], departmentKeys, keywords: [name.toLowerCase()] },
    fields,
  };
}

function scored(fieldKey, label, displaySequence, critical) {
  return {
    ...field(fieldKey, label, "COMPLIANCE", displaySequence, true),
    sectionKey: "sanitation",
    scoreWeight: 1,
    critical,
    creditValues: ["COMPLIANT"],
  };
}

function field(fieldKey, label, fieldType, displaySequence, isRequired) {
  return {
    fieldKey,
    label,
    fieldType,
    displaySequence,
    isRequired,
    correctiveActionTrigger: fieldType === "PASS_NEEDS_ATTENTION",
    correctiveActionRequired: fieldType === "PASS_NEEDS_ATTENTION",
    allowedSelections: fieldType === "PASS_NEEDS_ATTENTION" ? ["PASS", "NEEDS_ATTENTION"] : [],
    unitLabel: fieldType === "TEMPERATURE" ? "°F" : undefined,
  };
}
