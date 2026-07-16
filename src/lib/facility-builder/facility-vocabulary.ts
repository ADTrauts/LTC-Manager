/**
 * Facility Vocabulary — canonical hierarchy terminology registry.
 *
 * The internal architecture never changes: Unit, UnitSpace, and
 * UnitHierarchyRole (FLOOR / NEIGHBORHOOD / LEGACY_LOCATION / STAGED)
 * remain the source of truth. This module only controls the words the
 * product shows for the three physical levels:
 *
 *   Level 1 — hierarchyRole FLOOR         (e.g. Floor, Building)
 *   Level 2 — hierarchyRole NEIGHBORHOOD  (e.g. Neighborhood, Unit, Wing)
 *   Level 3 — UnitSpace                   (e.g. Room, Space)
 *
 * All user-facing hierarchy copy (toolbar, drawers, empty states, help,
 * validation, confirmations) must come from here. No scattered strings.
 */

export type FacilityVocabularyProfileKey =
  | "ltc"
  | "hospital"
  | "hotel"
  | "campus"
  | "corporate"
  | "custom";

export type VocabularyTerm = {
  singular: string;
  plural: string;
};

export type FacilityVocabulary = {
  profileKey: FacilityVocabularyProfileKey;
  profileLabel: string;
  level1: VocabularyTerm;
  level2: VocabularyTerm;
  level3: VocabularyTerm;
};

/** Naive English pluralizer for custom labels; profiles define plurals explicitly. */
export function pluralizeLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  if (/(s|x|z|ch|sh)$/i.test(trimmed)) return `${trimmed}es`;
  if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
  return `${trimmed}s`;
}

function term(singular: string, plural?: string): VocabularyTerm {
  return { singular, plural: plural ?? pluralizeLabel(singular) };
}

export const FACILITY_VOCABULARY_PROFILES: Record<
  Exclude<FacilityVocabularyProfileKey, "custom">,
  FacilityVocabulary
> = {
  ltc: {
    profileKey: "ltc",
    profileLabel: "Long Term Care",
    level1: term("Floor"),
    level2: term("Neighborhood"),
    level3: term("Room"),
  },
  hospital: {
    profileKey: "hospital",
    profileLabel: "Hospital",
    level1: term("Floor"),
    level2: term("Unit"),
    level3: term("Room"),
  },
  hotel: {
    profileKey: "hotel",
    profileLabel: "Hotel",
    level1: term("Floor"),
    level2: term("Wing"),
    level3: term("Room"),
  },
  campus: {
    profileKey: "campus",
    profileLabel: "Campus / School",
    level1: term("Building"),
    level2: term("Department"),
    level3: term("Room"),
  },
  corporate: {
    profileKey: "corporate",
    profileLabel: "Corporate",
    level1: term("Building"),
    level2: term("Area"),
    level3: term("Space"),
  },
};

/** LTC is the product default — existing facilities keep Floor / Neighborhood / Room. */
export const DEFAULT_FACILITY_VOCABULARY: FacilityVocabulary =
  FACILITY_VOCABULARY_PROFILES.ltc;

export type FacilityVocabularySettings = {
  vocabularyProfile?: string | null;
  vocabularyLevel1Label?: string | null;
  vocabularyLevel2Label?: string | null;
  vocabularyLevel3Label?: string | null;
};

/**
 * Resolve a facility's vocabulary from stored settings.
 * Unknown / missing profile → LTC default. Custom fills gaps from LTC.
 */
export function resolveFacilityVocabulary(
  settings?: FacilityVocabularySettings | null,
): FacilityVocabulary {
  const key = settings?.vocabularyProfile;
  if (!key || key === "ltc") return DEFAULT_FACILITY_VOCABULARY;

  if (key === "custom") {
    const l1 = settings?.vocabularyLevel1Label?.trim();
    const l2 = settings?.vocabularyLevel2Label?.trim();
    const l3 = settings?.vocabularyLevel3Label?.trim();
    return {
      profileKey: "custom",
      profileLabel: "Custom",
      level1: term(l1 || DEFAULT_FACILITY_VOCABULARY.level1.singular),
      level2: term(l2 || DEFAULT_FACILITY_VOCABULARY.level2.singular),
      level3: term(l3 || DEFAULT_FACILITY_VOCABULARY.level3.singular),
    };
  }

  const profile =
    FACILITY_VOCABULARY_PROFILES[
      key as Exclude<FacilityVocabularyProfileKey, "custom">
    ];
  return profile ?? DEFAULT_FACILITY_VOCABULARY;
}

const lower = (s: string) => s.toLowerCase();

/**
 * All Facility Builder copy derived from one vocabulary.
 * UI components must consume this object instead of hardcoding level names.
 */
export function buildBuilderCopy(v: FacilityVocabulary) {
  const l1 = v.level1.singular;
  const l1s = v.level1.plural;
  const l2 = v.level2.singular;
  const l2s = v.level2.plural;
  const l3 = v.level3.singular;
  const l3s = v.level3.plural;

  return {
    vocabulary: v,

    page: {
      subtitle: `Define your facility's physical structure — ${lower(l1s)}, ${lower(l2s)}, and ${lower(l3s)}. Assign department responsibilities that control operational access at each location.`,
    },

    labels: {
      level1: l1,
      level1Plural: l1s,
      level2: l2,
      level2Plural: l2s,
      level3: l3,
      level3Plural: l3s,
      legacyLocation: "Location",
      undesignated: "Undesignated",
    },

    toolbar: {
      addLevel1: l1,
      addLevel2: l2,
      addLevel3: l3,
      searchPlaceholder: `Search ${lower(l1s)}, ${lower(l3s)}…`,
    },

    drawers: {
      addLevel1: `Add ${l1}`,
      addLevel2: `Add ${l2}`,
      addLevel3: `Add ${l3}`,
      addLevel3Bulk: `Add Multiple ${l3s}`,
      moveToLevel1: `Move to ${l1}`,
      moveToLevel2: `Move to ${l2}`,
    },

    tree: {
      emptyTitle: `No ${lower(l1s)} have been added yet.`,
      emptyBody: `${l1s} organize ${lower(l2s)} and ${lower(l3s)}. Existing top-level locations can be moved into a ${lower(l1)} later.`,
      emptyAction: `Add ${l1}`,
      noSearchResults: "No locations found",
      noSearchResultsHint: `Try a different ${lower(l1)}, ${lower(l2)}, ${lower(l3)}, or code.`,
      legacyTopLevelHint: `Top-level locations below are not assigned to a ${lower(l1)}. Add a ${l1}, then drag them into it.`,
      selectPrompt: `Select a ${lower(l1)}, ${lower(l2)}, or ${lower(l3)} from the tree to view and edit its details.`,
      unassignedBadge: "Unassigned",
      unassignedTitle: `Unassigned to a ${lower(l1)}`,
      stagedBadge: "Staged",
      stagedTitle: "Not yet placed",
    },

    undesignatedSection: {
      warningTitle: "Locations still need placement",
      warningBody: `These locations will not appear anywhere in the application until they are assigned to a ${l1} or ${l2}.`,
      dropHint: "Drag locations here to stage them before placement.",
      bannerTitle: "Not yet placed",
      bannerBody: "This location is waiting to be assigned before it becomes operational.",
    },

    contextMenu: {
      convertToLevel1: `Convert to ${l1}`,
      moveToLevel1: `Move to ${l1}…`,
      moveToAnotherLevel1: `Move to another ${l1}…`,
      addLevel2: `Add ${l2}`,
      addLevel3: `Add ${l3}`,
      addLevel3Bulk: `Add Multiple ${l3s}`,
      moveToAnotherLevel2: `Move to another ${l2}…`,
    },

    editor: {
      level3Count: (n: number) => `${n} ${lower(n === 1 ? l3 : l3s)}`,
      level2Count: (n: number) => `${n} ${lower(n === 1 ? l2 : l2s)}`,
      level3ListTitle: (n: number) => `${l3s} (${n})`,
      addLevel2: `Add ${l2}`,
      addLevel3: `Add ${l3}`,
      addLevel3Bulk: `Add Multiple ${l3s}`,
      unassignedToLevel1: `Unassigned to a ${lower(l1)}`,
      level3Badge: l3,
      level3NameLabel: `${l3} name`,
      level3NumberLabel: `${l3} number`,
      level3ResponsibilityHelp: `Assign the departments responsible for operational work performed in this ${lower(l3)}.`,
      addLevel3Responsibility: `Add ${lower(l3)} responsibility`,
      deleteConfirm: (name: string) =>
        `Delete "${name}"?\n\n` +
        "Related schedules, logs, repairs, and assets for this location will also be permanently removed. " +
        `Nested ${lower(l2s)}/${lower(l3s)} must be removed first. This cannot be undone.`,
    },

    forms: {
      level1NameLabel: `${l1} name`,
      level1NamePlaceholder: `e.g. First ${l1}, Basement`,
      createLevel1: `Create ${lower(l1)}`,
      level2NameLabel: `${l2} name`,
      level2NamePlaceholder: "e.g. 1A Naval Park, Wing B",
      createLevel2: `Create ${lower(l2)}`,
      level3NameLabel: `${l3} name`,
      level3NamePlaceholder: "e.g. Resident Room, Servery, Soil Hold",
      level3NumberLabel: `${l3} number`,
      createLevel3: `Create ${lower(l3)}`,
      bulkNamesLabel: `${l3} names (one per line)`,
      bulkMaxHint: (max: number) =>
        `Blank lines are ignored. Max ${max} ${lower(l3s)} per batch. Optional ranges use the same letter suffix (e.g. 32A–40A).`,
      bulkCreated: (n: number) => `Created ${n} ${lower(n === 1 ? l3 : l3s)}.`,
      bulkSubmit: `Create ${lower(l3s)}`,
      noOtherLevel1: (name: string) =>
        `No other ${l1s} available. Create a ${l1} first, then move "${name}" into it.`,
      moveUnitIntro: (allowUndesignated: boolean) =>
        `onto a ${l1}${allowUndesignated ? " or Undesignated" : ""}. It will become a ${l2} when placed on a ${l1}.`,
      moveSpaceIntro: `to a ${l1}, ${l2}, or Undesignated.`,
    },

    validation: {
      parentLevel1NotFound: `Parent ${lower(l1)} not found in this facility.`,
      level2RequiresLevel1: `${l2s} must be created under a ${l1}.`,
      level2MustSitUnderLevel1: `${l2s} must sit under a ${l1}.`,
      deleteHasChildUnits: `Cannot delete a ${lower(l1)}/${lower(l2)} that has nested ${lower(l2s)}. Remove or move them first.`,
      deleteHasChildSpaces: `Cannot delete a ${lower(l1)}/${lower(l2)} that has ${lower(l3s)}. Remove ${lower(l3s)} first.`,
      level3NotAllowedHere: `${l3s} cannot be added under this location type.`,
      level3BulkNotAllowedHere: `${l3s} cannot be bulk-created under this location type.`,
      bulkNeedName: `Enter at least one ${lower(l3)} name (one per line).`,
      bulkTooMany: (max: number) =>
        `Batch limited to ${max} ${lower(l3s)}. Split into smaller batches.`,
      bulkAllExist: `All entered names already exist in this ${lower(l2)}.`,
      bulkNothing: `No ${lower(l3s)} to create.`,
      level1CannotMove: `${l1s} cannot be moved under another location.`,
      unitsMoveOntoLevel1Only: `Locations can only be moved onto a ${l1}.`,
      level3MoveTargets: `${l3s} can only be moved into a ${l1}, ${l2}, or Undesignated.`,
      level2NoTopLevelReorder: `${l2s} cannot be reordered at the top level.`,
      parentLevel1NotFoundShort: `Parent ${lower(l1)} not found.`,
      reorderNonLevel1Parent: `Unit reordering under a non-${l1} parent is not supported.`,
      level3ReorderNotAllowed: `${l3s} cannot be ordered under this location type.`,
      reorderLevel3NotInUndesignated: `Reorder list includes a ${lower(l3)} that is not in Undesignated.`,
      reorderLevel3NotInLocation: `Reorder list includes a ${lower(l3)} that is not in this location.`,
      convertOnlyUnassigned: `Only unassigned top-level locations can be converted to a ${l1}.`,
      convertOnlyTopLevel: `Only top-level locations can become ${l1s}.`,
      level3NotFound: `${l3} not found.`,
      level3DuplicateInLevel2: (name: string) =>
        `"${name}" already exists in this ${lower(l2)}.`,
    },
  };
}

export type BuilderCopy = ReturnType<typeof buildBuilderCopy>;

/** Builder copy for the default (LTC) vocabulary — compatibility baseline. */
export const DEFAULT_BUILDER_COPY: BuilderCopy = buildBuilderCopy(
  DEFAULT_FACILITY_VOCABULARY,
);
