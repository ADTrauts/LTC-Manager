/**
 * Idempotent platform Catalog seeds for Canonical Logs.
 * Seeded as PUBLISHED (intentional representative Catalog for architecture proof).
 */

import type {
  CatalogLogCategory,
  CatalogLogPurposeType,
  CatalogRecommendedCadence,
  OperationalEvidenceFieldType,
  OperationalTemplateScheduleKind,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

type Db = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

type SeedField = {
  fieldKey: string;
  label: string;
  fieldType: OperationalEvidenceFieldType;
  isRequired?: boolean;
  displaySequence: number;
  helpText?: string;
  unitLabel?: string;
  minNumber?: number;
  maxNumber?: number;
  allowedSelections?: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired?: boolean;
};

export type CatalogSeedDefinition = {
  stableKey: string;
  version: number;
  name: string;
  description: string;
  instructions: string;
  purposeType: CatalogLogPurposeType;
  category: CatalogLogCategory;
  recommendedCadence: CatalogRecommendedCadence;
  recommendedScheduleKind: OperationalTemplateScheduleKind | null;
  recommendedDaypartLabels: string[];
  suggestions: {
    assetTypes: string[];
    spaceTypes: string[];
    departmentKeys: string[];
    keywords: string[];
  };
  fields: SeedField[];
};

export const CATALOG_SEED_DEFINITIONS: CatalogSeedDefinition[] = [
  {
    stableKey: "cooler_temperature_log",
    version: 1,
    name: "Cooler Temperature Log",
    description: "Record cooler temperatures twice daily with corrective action when out of range.",
    instructions:
      "Check the cooler thermometer. Enter the temperature. If outside the acceptable range, document corrective action before submitting.",
    purposeType: "LOG",
    category: "TEMPERATURE",
    recommendedCadence: "TWICE_DAILY",
    recommendedScheduleKind: "FIXED_DAILY_WINDOW",
    recommendedDaypartLabels: ["Morning", "Afternoon"],
    suggestions: {
      assetTypes: ["COOLER", "REACH_IN_COOLER", "WALK_IN_COOLER"],
      spaceTypes: [],
      departmentKeys: ["DIETARY"],
      keywords: ["cooler", "temperature", "cold holding"],
    },
    fields: [
      {
        fieldKey: "cooler_temperature",
        label: "Cooler temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 10,
        unitLabel: "°F",
        minNumber: 33,
        maxNumber: 41,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        helpText: "Acceptable range 33–41°F.",
      },
    ],
  },
  {
    stableKey: "high_temp_dishwasher_log",
    version: 1,
    name: "High-Temperature Dishwasher Log",
    description: "Final rinse temperature verification for high-temp dishwashers.",
    instructions:
      "Record final rinse temperature. If below standard, document corrective action before submitting.",
    purposeType: "LOG",
    category: "SANITATION",
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    recommendedScheduleKind: "OPERATIONAL_CYCLE",
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: ["DISHWASHER", "HIGH_TEMP_DISHWASHER"],
      spaceTypes: [],
      departmentKeys: ["DIETARY"],
      keywords: ["dishwasher", "high-temp", "rinse"],
    },
    fields: [
      {
        fieldKey: "final_rinse_temp",
        label: "Final rinse temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 10,
        unitLabel: "°F",
        minNumber: 180,
        maxNumber: 210,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        helpText: "Typical high-temp final rinse ≥ 180°F — confirm local policy.",
      },
      {
        fieldKey: "result",
        label: "Result",
        fieldType: "PASS_NEEDS_ATTENTION",
        displaySequence: 20,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
  {
    stableKey: "low_temp_chemical_dishwasher_log",
    version: 1,
    name: "Low-Temperature Chemical Dishwasher Log",
    description: "Sanitizer concentration / temperature for low-temp chemical dishwashers.",
    instructions:
      "Check dishwasher sanitizer. Enter concentration or temperature as posted, then mark Pass or Needs Attention.",
    purposeType: "LOG",
    category: "SANITATION",
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    recommendedScheduleKind: "OPERATIONAL_CYCLE",
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: ["DISHWASHER", "LOW_TEMP_DISHWASHER", "CHEMICAL_DISHWASHER"],
      spaceTypes: [],
      departmentKeys: ["DIETARY"],
      keywords: ["dishwasher", "sanitizer", "ppm", "low-temp"],
    },
    fields: [
      {
        fieldKey: "sanitizer_concentration",
        label: "Sanitizer concentration / temperature",
        fieldType: "NUMBER",
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
        displaySequence: 20,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
  {
    stableKey: "opening_checklist",
    version: 1,
    name: "Opening Checklist",
    description: "Servery / unit opening checklist attestation.",
    instructions: "Complete each opening item. Note exceptions before submitting.",
    purposeType: "CHECKLIST",
    category: "OPENING_CLOSING",
    recommendedCadence: "ONCE_DAILY",
    recommendedScheduleKind: "FIXED_DAILY_WINDOW",
    recommendedDaypartLabels: ["Morning"],
    suggestions: {
      assetTypes: [],
      spaceTypes: ["SERVERY", "KITCHEN"],
      departmentKeys: ["DIETARY"],
      keywords: ["opening", "checklist", "servery"],
    },
    fields: [
      {
        fieldKey: "area_clean",
        label: "Service area clean and ready",
        fieldType: "YES_NO",
        displaySequence: 10,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      },
      {
        fieldKey: "equipment_ready",
        label: "Equipment ready for service",
        fieldType: "YES_NO",
        displaySequence: 20,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      },
      {
        fieldKey: "notes",
        label: "Notes",
        fieldType: "OPTIONAL_COMMENT",
        isRequired: false,
        displaySequence: 30,
      },
    ],
  },
  {
    stableKey: "food_temperature_log",
    version: 1,
    name: "Food Temperature Log",
    description: "Record prepared or held food temperatures during service.",
    instructions:
      "Check the food temperature with a clean, calibrated thermometer. Enter the reading and note the item. Mark Needs Attention if the food is not safe to serve, then document corrective action.",
    purposeType: "LOG",
    category: "FOOD_SAFETY",
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    recommendedScheduleKind: "OPERATIONAL_CYCLE",
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: [],
      spaceTypes: ["KITCHEN", "SERVERY"],
      departmentKeys: ["DIETARY"],
      keywords: ["food", "temperature", "hot holding", "cold holding"],
    },
    fields: [
      {
        fieldKey: "item_name",
        label: "Food item",
        fieldType: "SHORT_TEXT",
        displaySequence: 10,
        helpText: "What food was checked.",
      },
      {
        fieldKey: "food_temperature",
        label: "Temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 20,
        unitLabel: "°F",
        helpText: "Enter the measured temperature. Use local policy for acceptable ranges.",
      },
      {
        fieldKey: "result",
        label: "Result",
        fieldType: "PASS_NEEDS_ATTENTION",
        displaySequence: 30,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
  {
    stableKey: "ice_machine_cleaning_log",
    version: 1,
    name: "Ice Machine Cleaning Log",
    description: "Record ice machine cleaning and sanitation when completed.",
    instructions:
      "Complete ice machine cleaning per the posted procedure. Confirm the machine was returned to service.",
    purposeType: "LOG",
    category: "CLEANING",
    recommendedCadence: "AD_HOC",
    recommendedScheduleKind: null,
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: ["ICE_MACHINE", "ICE_MAKER"],
      spaceTypes: ["KITCHEN"],
      departmentKeys: ["DIETARY"],
      keywords: ["ice", "cleaning", "sanitation"],
    },
    fields: [
      {
        fieldKey: "cleaning_complete",
        label: "Cleaning completed",
        fieldType: "YES_NO",
        displaySequence: 10,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      },
      {
        fieldKey: "notes",
        label: "Notes",
        fieldType: "OPTIONAL_COMMENT",
        isRequired: false,
        displaySequence: 20,
      },
    ],
  },
  {
    stableKey: "ice_machine_cleaning_log",
    version: 2,
    name: "Ice Machine Cleaning Log",
    description:
      "Weekly ice machine cleaning. Suggested Tuesday is an operational default, not a certified policy — change the weekday if this facility uses a different day.",
    instructions:
      "Complete ice machine cleaning per the posted procedure. Confirm the machine was returned to service.",
    purposeType: "LOG",
    category: "CLEANING",
    recommendedCadence: "WEEKLY",
    recommendedScheduleKind: null,
    recommendedDaypartLabels: ["Tuesday"],
    suggestions: {
      assetTypes: ["ICE_MACHINE", "ICE_MAKER"],
      spaceTypes: ["KITCHEN"],
      departmentKeys: ["DIETARY"],
      keywords: ["ice", "cleaning", "sanitation"],
    },
    fields: [
      {
        fieldKey: "cleaning_complete",
        label: "Cleaning completed",
        fieldType: "YES_NO",
        displaySequence: 10,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
      },
      {
        fieldKey: "notes",
        label: "Notes",
        fieldType: "OPTIONAL_COMMENT",
        isRequired: false,
        displaySequence: 20,
      },
    ],
  },
  {
    stableKey: "receiving_temperature_log",
    version: 1,
    name: "Receiving Temperature Log",
    description: "Record temperatures of incoming refrigerated or frozen deliveries.",
    instructions:
      "Check product temperature at receiving. Enter the item and reading. Mark Needs Attention if the delivery is not acceptable, then document corrective action.",
    purposeType: "LOG",
    category: "FOOD_SAFETY",
    recommendedCadence: "AD_HOC",
    recommendedScheduleKind: null,
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: [],
      spaceTypes: ["RECEIVING", "KITCHEN"],
      departmentKeys: ["DIETARY"],
      keywords: ["receiving", "delivery", "temperature"],
    },
    fields: [
      {
        fieldKey: "product_name",
        label: "Product",
        fieldType: "SHORT_TEXT",
        displaySequence: 10,
      },
      {
        fieldKey: "receiving_temperature",
        label: "Temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 20,
        unitLabel: "°F",
        helpText: "Enter the measured receiving temperature. Use local receiving policy for limits.",
      },
      {
        fieldKey: "result",
        label: "Result",
        fieldType: "PASS_NEEDS_ATTENTION",
        displaySequence: 30,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
  {
    stableKey: "freezer_temperature_log",
    version: 1,
    name: "Freezer Temperature Log",
    description: "Record freezer temperatures on a twice-daily schedule.",
    instructions:
      "Check the freezer thermometer. Enter the temperature. Mark Needs Attention if the unit is not holding, then document corrective action.",
    purposeType: "LOG",
    category: "TEMPERATURE",
    recommendedCadence: "TWICE_DAILY",
    recommendedScheduleKind: "FIXED_DAILY_WINDOW",
    recommendedDaypartLabels: ["Morning", "Afternoon"],
    suggestions: {
      assetTypes: ["FREEZER", "REACH_IN_FREEZER", "WALK_IN_FREEZER"],
      spaceTypes: [],
      departmentKeys: ["DIETARY"],
      keywords: ["freezer", "temperature"],
    },
    fields: [
      {
        fieldKey: "freezer_temperature",
        label: "Freezer temperature",
        fieldType: "TEMPERATURE",
        displaySequence: 10,
        unitLabel: "°F",
        helpText: "Enter the measured freezer temperature. Use the range posted on this unit.",
      },
      {
        fieldKey: "result",
        label: "Result",
        fieldType: "PASS_NEEDS_ATTENTION",
        displaySequence: 20,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
  {
    stableKey: "three_bay_sink_sanitizer_log",
    version: 1,
    name: "3-Bay Sink Sanitizer Log",
    description: "Record sanitizer concentration for the three-compartment sink.",
    instructions:
      "Test the sanitizer in the third bay. Enter the reading as posted for the chemical in use. Mark Needs Attention if the sink is not ready, then document corrective action.",
    purposeType: "LOG",
    category: "SANITATION",
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    recommendedScheduleKind: "OPERATIONAL_CYCLE",
    recommendedDaypartLabels: [],
    suggestions: {
      assetTypes: [],
      spaceTypes: ["KITCHEN", "DISH_ROOM"],
      departmentKeys: ["DIETARY"],
      keywords: ["sanitizer", "sink", "3-bay", "three compartment"],
    },
    fields: [
      {
        fieldKey: "sanitizer_concentration",
        label: "Sanitizer concentration",
        fieldType: "NUMBER",
        displaySequence: 10,
        unitLabel: "ppm",
        helpText: "Enter the tested concentration. Use the posted range for this sanitizer.",
      },
      {
        fieldKey: "result",
        label: "Result",
        fieldType: "PASS_NEEDS_ATTENTION",
        displaySequence: 20,
        correctiveActionTrigger: true,
        correctiveActionRequired: true,
        allowedSelections: ["PASS", "NEEDS_ATTENTION"],
      },
    ],
  },
];

/**
 * Upsert published Catalog seeds by stableKey+version.
 * Does not mutate an already-published row's fields (immutability).
 */
export async function upsertPublishedCatalogSeeds(client: Db): Promise<{
  created: number;
  skipped: number;
}> {
  let created = 0;
  let skipped = 0;

  for (const seed of CATALOG_SEED_DEFINITIONS) {
    const existing = await client.catalogLogDefinition.findUnique({
      where: {
        stableKey_version: { stableKey: seed.stableKey, version: seed.version },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await client.catalogLogDefinition.create({
      data: {
        id: cuidLike(),
        stableKey: seed.stableKey,
        version: seed.version,
        status: "PUBLISHED",
        name: seed.name,
        description: seed.description,
        instructions: seed.instructions,
        purposeType: seed.purposeType,
        category: seed.category,
        recommendedCadence: seed.recommendedCadence,
        recommendedScheduleKind: seed.recommendedScheduleKind,
        recommendedDaypartLabels: seed.recommendedDaypartLabels,
        suggestionsJson: seed.suggestions as unknown as Prisma.InputJsonValue,
        publishedAt: new Date(),
        fields: {
          create: seed.fields.map((f) => ({
            id: cuidLike(),
            fieldKey: f.fieldKey,
            label: f.label,
            fieldType: f.fieldType,
            isRequired: f.isRequired !== false,
            displaySequence: f.displaySequence,
            helpText: f.helpText ?? null,
            unitLabel: f.unitLabel ?? null,
            minNumber: f.minNumber ?? null,
            maxNumber: f.maxNumber ?? null,
            allowedSelections: f.allowedSelections ?? [],
            correctiveActionTrigger: f.correctiveActionTrigger === true,
            correctiveActionRequired: f.correctiveActionRequired === true,
          })),
        },
      },
    });
    created += 1;
  }

  return { created, skipped };
}
