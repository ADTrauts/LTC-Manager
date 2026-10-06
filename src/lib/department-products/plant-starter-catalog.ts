/**
 * Plant starter catalog — client-safe. No Prisma.
 */

export const PLANT_STARTER_PACKAGE_NAME = "Plant Operations starter configuration";

export const PLANT_STARTER_INTRO =
  "Optional examples to help your Facility get started. Review and select what to add. Installed items become Facility-owned drafts — they are not published automatically and are not regulatory compliance.";

export type PlantStarterKind = "work" | "record";
export type PlantStarterPresence = "none" | "partial" | "added";

export type PlantStarterItemId =
  | "MECHANICAL_ROOM_ROUND"
  | "BUILDING_WALKTHROUGH"
  | "EXTERIOR_GROUNDS_WALKTHROUGH"
  | "GENERATOR_VISUAL_CHECK"
  | "EQUIPMENT_CONDITION_INSPECTION"
  | "MECHANICAL_ROOM_INSPECTION"
  | "GENERATOR_INSPECTION"
  | "BASIC_EQUIPMENT_READING"
  | "POST_WORK_ORDER_VERIFICATION";

export type PlantStarterCatalogItem = {
  id: PlantStarterItemId;
  kind: PlantStarterKind;
  title: string;
  description: string;
  defaultSelected: boolean;
};

export type PlantStarterLoadItem = PlantStarterCatalogItem & {
  alreadyAdded: boolean;
};

export type PlantStarterInstallResult = {
  workAdded: number;
  recordAdded: number;
  alreadyExisted: number;
  selectedCount: number;
  workHref: string;
  recordsHref: string;
};

const WORK_ITEMS: PlantStarterCatalogItem[] = [
  {
    id: "MECHANICAL_ROOM_ROUND",
    kind: "work",
    title: "Mechanical Room Round",
    description: "Routine operational walkthrough of mechanical spaces.",
    defaultSelected: true,
  },
  {
    id: "BUILDING_WALKTHROUGH",
    kind: "work",
    title: "Building Walkthrough",
    description: "General Facility condition observation.",
    defaultSelected: true,
  },
  {
    id: "EXTERIOR_GROUNDS_WALKTHROUGH",
    kind: "work",
    title: "Exterior / Grounds Walkthrough",
    description: "General exterior Facility condition observation.",
    defaultSelected: true,
  },
  {
    id: "GENERATOR_VISUAL_CHECK",
    kind: "work",
    title: "Generator Visual Check",
    description: "Visual operational check of the assigned generator area — not manufacturer PM.",
    defaultSelected: true,
  },
];

const RECORD_ITEMS: PlantStarterCatalogItem[] = [
  {
    id: "EQUIPMENT_CONDITION_INSPECTION",
    kind: "record",
    title: "Equipment Condition Inspection",
    description: "Generic equipment observation.",
    defaultSelected: true,
  },
  {
    id: "MECHANICAL_ROOM_INSPECTION",
    kind: "record",
    title: "Mechanical Room Inspection",
    description: "Generic mechanical-space observation.",
    defaultSelected: true,
  },
  {
    id: "GENERATOR_INSPECTION",
    kind: "record",
    title: "Generator Inspection",
    description: "Generic visual generator-area observation.",
    defaultSelected: true,
  },
  {
    id: "BASIC_EQUIPMENT_READING",
    kind: "record",
    title: "Basic Equipment Reading",
    description: "Reusable equipment reading evidence.",
    defaultSelected: true,
  },
  {
    id: "POST_WORK_ORDER_VERIFICATION",
    kind: "record",
    title: "Post-Work Order Verification",
    description: "Optional evidence after maintenance work.",
    defaultSelected: true,
  },
];

export function listPlantStarterCatalog(): PlantStarterCatalogItem[] {
  return [...WORK_ITEMS, ...RECORD_ITEMS];
}

export function plantStarterHref(departmentId: string): string {
  return `/build/departments/${departmentId}?starter=1`;
}

export function classifyPlantStarterPresence(input: {
  workPresetKeys: readonly string[];
  recordPresetKeys: readonly string[];
}): { addedIds: string[]; remainingIds: string[]; status: PlantStarterPresence } {
  const installed = new Set(
    [...input.workPresetKeys, ...input.recordPresetKeys].filter(Boolean),
  );
  const catalog = listPlantStarterCatalog();
  const addedIds = catalog.filter((row) => installed.has(row.id)).map((row) => row.id);
  const remainingIds = catalog.filter((row) => !installed.has(row.id)).map((row) => row.id);
  const status: PlantStarterPresence =
    addedIds.length === 0 ? "none" : remainingIds.length === 0 ? "added" : "partial";
  return { addedIds, remainingIds, status };
}

export function presentPlantStarterPresenceLabel(status: PlantStarterPresence): string {
  if (status === "added") return "Added";
  if (status === "partial") return "Partially added";
  return "Not added";
}
