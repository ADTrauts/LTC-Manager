/**
 * Shipped log template presets: upserted per facility so staff can assign them to units.
 * Run from prisma/seed.mjs and scripts/provision-facility.mjs (blank installs).
 */
import { LogFieldType, LogRecurrence } from "@prisma/client";

/** @typedef {{ label: string; fieldType: import("@prisma/client").LogFieldType; isRequired?: boolean; unitLabel?: string; fieldOptions?: string[]; }} PresetField */

/**
 * @typedef {{
 *   name: string;
 *   category: string;
 *   description?: string;
 *   instructions?: string;
 *   recurrence: import("@prisma/client").LogRecurrence;
 *   fields: PresetField[];
 *   departmentKey?: "DIETARY" | "EVS" | "PLANT";
 * }} LogTemplatePreset
 */

/** @type {LogTemplatePreset[]} */
export const LOG_TEMPLATE_PRESETS = [
  {
    name: "Unit Cooler Temp Log",
    category: "Temperature",
    departmentKey: "DIETARY",
    description: "Point-in-time check of a unit servery or reach-in cooler during service.",
    instructions:
      "Record the cooler air temperature. Use Corrective action on the submission if out of range (e.g. re-temp after door closed, note result).",
    recurrence: LogRecurrence.PER_MEAL,
    fields: [
      { label: "Cooler air temperature", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "In temperature range (≤ 41 °F for cold holding)", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Location / which cooler (if more than one)", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Servery – Hot and cold holding",
    category: "Food service",
    departmentKey: "DIETARY",
    description: "Per meal: verify hot and cold held foods meet policy (typ. ≥135 °F hot, ≤41 °F cold).",
    instructions:
      "Record each required hot and cold item and temperature, or use pass/fail when a single check covers all items on the line. Document out-of-range items in the submission’s Corrective action field.",
    recurrence: LogRecurrence.PER_MEAL,
    fields: [
      {
        label: "All hot-held items meet minimum (e.g. ≥ 135 °F) or on approved time control",
        fieldType: LogFieldType.PASS_FAIL,
        isRequired: true,
      },
      {
        label: "All cold-held items meet maximum (e.g. ≤ 41 °F)",
        fieldType: LogFieldType.PASS_FAIL,
        isRequired: true,
      },
      {
        label: "Item list and temperatures (as required by policy or surveyor)",
        fieldType: LogFieldType.LONG_TEXT,
        isRequired: false,
      },
      { label: "Griddle / hot line / well identifier (if applicable)", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Walk-in cooler temperature",
    category: "Temperature",
    departmentKey: "DIETARY",
    description: "Daily (or per policy) check of main walk-in or designated refrigeration.",
    instructions:
      "If out of range, record cause and re-check in Corrective action (e.g. door open for restocking; re-temp in one hour at 39 °F).",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Which cooler or zone", fieldType: LogFieldType.SHORT_TEXT, isRequired: true },
      { label: "Air or probe temperature", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "In range for refrigeration", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Walk-in freezer temperature",
    category: "Temperature",
    departmentKey: "DIETARY",
    description: "Daily check of freezer storage per local policy (typ. 0 °F or below for frozen storage).",
    instructions: "Confirm temperature meets your facility’s written standard. Log Corrective action if not.",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Which freezer or zone", fieldType: LogFieldType.SHORT_TEXT, isRequired: true },
      { label: "Air or probe temperature", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "In range for frozen storage", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Dishwashing – high-temp / machine",
    category: "Sanitation",
    departmentKey: "DIETARY",
    description: "Dish machine final rinse and cycle verification (high-temp machine; adapt fields if low-temp sanitizer).",
    instructions:
      "If rinse fails, document corrective steps in Corrective action (re-run load, use 3-comp sink per procedure, service call, etc.).",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Final rinse temperature (°F) at plate / manifold", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "Meets minimum for sanitizer (high-temp)", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Chemical sanitizer (PPM) if low-temp or verification", fieldType: LogFieldType.NUMBER, isRequired: false },
      { label: "Cycle completed; no error codes on machine", fieldType: LogFieldType.YES_NO, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Dry storage – ambient",
    category: "Temperature",
    departmentKey: "DIETARY",
    description: "Ambient temperature in dry storage or storeroom when monitored.",
    instructions: "If out of range, note action in Corrective action (HVAC, fan, propping door, product rotation).",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Room or zone", fieldType: LogFieldType.SHORT_TEXT, isRequired: true },
      { label: "Ambient temperature", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "Acceptable per policy", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Receiving – TCS / cold chain",
    category: "Receiving",
    departmentKey: "DIETARY",
    description: "Time and temperature of receiving for time-temperature for safety (TCS) products.",
    instructions: "If cold chain is broken, document in Corrective action: reject, rapid chill, inform chef, or vendor return.",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Delivery or receive time (describe)", fieldType: LogFieldType.SHORT_TEXT, isRequired: true },
      { label: "Supplier or invoice reference (optional)", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
      { label: "Coldest TCS / flesh foods temp (°F) checked", fieldType: LogFieldType.TEMPERATURE, isRequired: true, unitLabel: "F" },
      { label: "Cold chain / receiving standards met", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes (product, lot, exceptions)", fieldType: LogFieldType.LONG_TEXT, isRequired: false },
    ],
  },
  {
    name: "Restroom sanitation round",
    category: "EVS",
    departmentKey: "EVS",
    description: "Public or common restroom check: supplies, odors, visible soil, fixtures.",
    instructions: "Fail any critical item and note corrective action / work order if needed.",
    recurrence: LogRecurrence.DAILY,
    fields: [
      { label: "Restroom identifier / location", fieldType: LogFieldType.SHORT_TEXT, isRequired: true },
      { label: "Paper and soap adequately stocked", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Fixtures clean and functional", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Floors dry and free of debris", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
  {
    name: "Generator weekly run log",
    category: "Plant Ops",
    departmentKey: "PLANT",
    description: "Brief verification of emergency generator exercise per policy.",
    instructions: "Record run duration and any alarms or transfers. Use Corrective action if faults observed.",
    recurrence: LogRecurrence.WEEKLY,
    fields: [
      { label: "Generator started successfully", fieldType: LogFieldType.YES_NO, isRequired: true },
      { label: "Run duration (minutes)", fieldType: LogFieldType.NUMBER, isRequired: true },
      { label: "No alarms / faults during test", fieldType: LogFieldType.PASS_FAIL, isRequired: true },
      { label: "Notes", fieldType: LogFieldType.SHORT_TEXT, isRequired: false },
    ],
  },
];

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ facilityId: string; createdByRoleId?: string | null; departmentIds?: { DIETARY: string; EVS: string; PLANT: string } }} opts
 */
export async function applyLogTemplatePresets(prisma, { facilityId, createdByRoleId = null, departmentIds = null }) {
  for (const preset of LOG_TEMPLATE_PRESETS) {
    const departmentKey = preset.departmentKey ?? "DIETARY";
    const departmentId =
      departmentIds && departmentKey in departmentIds ? departmentIds[departmentKey] : null;

    const template = await prisma.logTemplate.upsert({
      where: {
        facilityId_name: {
          facilityId,
          name: preset.name,
        },
      },
      update: {
        category: preset.category,
        description: preset.description ?? null,
        instructions: preset.instructions ?? null,
        recurrence: preset.recurrence,
        isActive: true,
        departmentId,
        ...(createdByRoleId != null ? { createdByRoleId } : {}),
      },
      create: {
        facilityId,
        name: preset.name,
        category: preset.category,
        description: preset.description ?? null,
        instructions: preset.instructions ?? null,
        recurrence: preset.recurrence,
        isActive: true,
        departmentId: departmentId ?? undefined,
        createdByRoleId: createdByRoleId ?? undefined,
      },
    });

    await prisma.logTemplateField.deleteMany({ where: { templateId: template.id } });

    await prisma.logTemplateField.createMany({
      data: preset.fields.map((field, index) => ({
        templateId: template.id,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired !== false,
        fieldOrder: index + 1,
        unitLabel: field.unitLabel ?? null,
        fieldOptions: field.fieldOptions ?? [],
      })),
    });
  }
}
