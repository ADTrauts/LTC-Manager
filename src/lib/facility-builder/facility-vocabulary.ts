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
    profileLabel: "Long-Term Care",
    level1: term("Floor"),
    level2: term("Neighborhood"),
    level3: term("Room"),
  },
  hospital: {
    profileKey: "hospital",
    profileLabel: "Hospital",
    level1: term("Floor"),
    level2: term("Unit"),
    level3: term("Patient Room"),
  },
  hotel: {
    profileKey: "hotel",
    profileLabel: "Hotel",
    level1: term("Floor"),
    level2: term("Wing"),
    level3: term("Guest Room"),
  },
  campus: {
    profileKey: "campus",
    profileLabel: "Campus",
    level1: term("Building"),
    level2: term("Area"),
    level3: term("Space"),
  },
  corporate: {
    profileKey: "corporate",
    profileLabel: "Corporate",
    level1: term("Building"),
    level2: term("Department"),
    level3: term("Workspace"),
  },
};

/** Ordered profile options for the terminology settings UI — derived from the registry. */
export const VOCABULARY_PROFILE_OPTIONS: ReadonlyArray<{
  key: FacilityVocabularyProfileKey;
  label: string;
}> = [
  ...Object.values(FACILITY_VOCABULARY_PROFILES).map((p) => ({
    key: p.profileKey as Exclude<FacilityVocabularyProfileKey, "custom">,
    label: p.profileLabel,
  })),
  { key: "custom" as const, label: "Custom" },
];

/** Max length for custom singular / plural labels. */
export const VOCABULARY_LABEL_MAX_LENGTH = 40;

/**
 * Encode a custom term for storage in existing Facility label columns
 * (no plural columns / no migration). Format: "Singular::Plural".
 */
export function encodeCustomVocabularyTerm(termValue: VocabularyTerm): string {
  const singular = termValue.singular.trim();
  const plural = termValue.plural.trim();
  if (!singular) return "";
  if (!plural || plural === pluralizeLabel(singular)) return singular;
  return `${singular}::${plural}`;
}

/** Parse a stored custom label column back into singular + plural. */
export function parseCustomVocabularyTerm(
  raw: string | null | undefined,
  fallback: VocabularyTerm,
): VocabularyTerm {
  const trimmed = raw?.trim();
  if (!trimmed) return { ...fallback };
  const sep = trimmed.indexOf("::");
  if (sep >= 0) {
    const singular = trimmed.slice(0, sep).trim();
    const plural = trimmed.slice(sep + 2).trim();
    if (singular && plural) return { singular, plural };
    if (singular) return term(singular);
    return { ...fallback };
  }
  return term(trimmed);
}

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
 * Custom labels may encode plurals as "Singular::Plural" in existing columns.
 */
export function resolveFacilityVocabulary(
  settings?: FacilityVocabularySettings | null,
): FacilityVocabulary {
  const key = settings?.vocabularyProfile;
  if (!key || key === "ltc") return DEFAULT_FACILITY_VOCABULARY;

  if (key === "custom") {
    return {
      profileKey: "custom",
      profileLabel: "Custom",
      level1: parseCustomVocabularyTerm(
        settings?.vocabularyLevel1Label,
        DEFAULT_FACILITY_VOCABULARY.level1,
      ),
      level2: parseCustomVocabularyTerm(
        settings?.vocabularyLevel2Label,
        DEFAULT_FACILITY_VOCABULARY.level2,
      ),
      level3: parseCustomVocabularyTerm(
        settings?.vocabularyLevel3Label,
        DEFAULT_FACILITY_VOCABULARY.level3,
      ),
    };
  }

  const profile =
    FACILITY_VOCABULARY_PROFILES[
      key as Exclude<FacilityVocabularyProfileKey, "custom">
    ];
  return profile ?? DEFAULT_FACILITY_VOCABULARY;
}

/**
 * Build a draft vocabulary from the terminology settings form
 * (live preview + save validation). Reuses the same resolve path for presets.
 */
export function draftFacilityVocabulary(input: {
  profileKey: FacilityVocabularyProfileKey;
  level1Singular?: string;
  level1Plural?: string;
  level2Singular?: string;
  level2Plural?: string;
  level3Singular?: string;
  level3Plural?: string;
}): FacilityVocabulary {
  if (input.profileKey !== "custom") {
    return (
      FACILITY_VOCABULARY_PROFILES[input.profileKey] ?? DEFAULT_FACILITY_VOCABULARY
    );
  }

  const l1s = input.level1Singular?.trim() || DEFAULT_FACILITY_VOCABULARY.level1.singular;
  const l2s = input.level2Singular?.trim() || DEFAULT_FACILITY_VOCABULARY.level2.singular;
  const l3s = input.level3Singular?.trim() || DEFAULT_FACILITY_VOCABULARY.level3.singular;
  return {
    profileKey: "custom",
    profileLabel: "Custom",
    level1: {
      singular: l1s,
      plural: input.level1Plural?.trim() || pluralizeLabel(l1s),
    },
    level2: {
      singular: l2s,
      plural: input.level2Plural?.trim() || pluralizeLabel(l2s),
    },
    level3: {
      singular: l3s,
      plural: input.level3Plural?.trim() || pluralizeLabel(l3s),
    },
  };
}

export type VocabularyLabelValidationError = {
  field:
    | "level1Singular"
    | "level1Plural"
    | "level2Singular"
    | "level2Plural"
    | "level3Singular"
    | "level3Plural";
  message: string;
};

/** Validate custom labels before save. Preset profiles skip custom fields. */
export function validateCustomVocabularyLabels(input: {
  level1Singular: string;
  level1Plural: string;
  level2Singular: string;
  level2Plural: string;
  level3Singular: string;
  level3Plural: string;
}): VocabularyLabelValidationError[] {
  const errors: VocabularyLabelValidationError[] = [];
  const fields: Array<{
    field: VocabularyLabelValidationError["field"];
    value: string;
    label: string;
  }> = [
    { field: "level1Singular", value: input.level1Singular, label: "Level 1 singular" },
    { field: "level1Plural", value: input.level1Plural, label: "Level 1 plural" },
    { field: "level2Singular", value: input.level2Singular, label: "Level 2 singular" },
    { field: "level2Plural", value: input.level2Plural, label: "Level 2 plural" },
    { field: "level3Singular", value: input.level3Singular, label: "Level 3 singular" },
    { field: "level3Plural", value: input.level3Plural, label: "Level 3 plural" },
  ];

  for (const { field, value, label } of fields) {
    const trimmed = value.trim();
    if (!trimmed) {
      errors.push({ field, message: `${label} is required.` });
      continue;
    }
    if (trimmed.length > VOCABULARY_LABEL_MAX_LENGTH) {
      errors.push({
        field,
        message: `${label} must be ${VOCABULARY_LABEL_MAX_LENGTH} characters or fewer.`,
      });
    }
  }

  return errors;
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

/**
 * Live hierarchy preview lines — sample names composed from vocabulary labels.
 * Toolbar labels come from buildBuilderCopy(); proper-noun samples are
 * illustrative and profile-keyed (not a second terminology registry).
 */
export function buildVocabularyHierarchyPreview(
  v: FacilityVocabulary,
): {
  profileLabel: string;
  lines: [string, string, string];
  toolbar: BuilderCopy["toolbar"];
} {
  const copy = buildBuilderCopy(v);
  const samples = PREVIEW_NAME_SAMPLES[v.profileKey] ?? PREVIEW_NAME_SAMPLES.ltc;
  return {
    profileLabel: v.profileLabel,
    lines: [
      samples.level1(v),
      samples.level2(v),
      samples.level3(v),
    ],
    toolbar: copy.toolbar,
  };
}

type PreviewNameFns = {
  level1: (v: FacilityVocabulary) => string;
  level2: (v: FacilityVocabulary) => string;
  level3: (v: FacilityVocabulary) => string;
};

const PREVIEW_NAME_SAMPLES: Record<FacilityVocabularyProfileKey, PreviewNameFns> = {
  ltc: {
    level1: (v) => `First ${v.level1.singular}`,
    level2: () => "1A Naval Park",
    level3: (v) => `${v.level3.singular} 32A`,
  },
  hospital: {
    level1: (v) => `First ${v.level1.singular}`,
    level2: (v) => `ICU ${v.level2.singular}`,
    level3: (v) => `${v.level3.singular} 32A`,
  },
  hotel: {
    level1: (v) => `Third ${v.level1.singular}`,
    level2: (v) => `West ${v.level2.singular}`,
    level3: (v) => `${v.level3.singular} 214`,
  },
  campus: {
    level1: () => "Science Building",
    level2: (v) => `Chemistry ${v.level2.singular}`,
    level3: (v) => `Lab ${v.level3.singular} A`,
  },
  corporate: {
    level1: (v) => `${v.level1.singular} A`,
    level2: (v) => `Accounting ${v.level2.singular}`,
    level3: (v) => `${v.level3.singular} 14`,
  },
  custom: {
    level1: (v) => `First ${v.level1.singular}`,
    level2: (v) => `Example ${v.level2.singular}`,
    level3: (v) => `${v.level3.singular} 101`,
  },
};

/** Human-readable summary of current vocabulary for the settings bar. */
export function formatVocabularySummary(v: FacilityVocabulary): string {
  return `${v.level1.singular} · ${v.level2.singular} · ${v.level3.singular}`;
}
