import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FACILITY_VOCABULARY_PROFILES,
  DEFAULT_FACILITY_VOCABULARY,
  DEFAULT_BUILDER_COPY,
  buildBuilderCopy,
  pluralizeLabel,
  resolveFacilityVocabulary,
} from "./facility-vocabulary";
import { displayKindLabel } from "./builder-display";

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

describe("facility vocabulary — profile resolution", () => {
  it("defaults to LTC (Floor / Neighborhood / Room) when no settings exist", () => {
    const v = resolveFacilityVocabulary(null);
    assert.equal(v.profileKey, "ltc");
    assert.equal(v.level1.singular, "Floor");
    assert.equal(v.level2.singular, "Neighborhood");
    assert.equal(v.level3.singular, "Room");
  });

  it("defaults to LTC when vocabularyProfile is null or unknown", () => {
    assert.equal(resolveFacilityVocabulary({ vocabularyProfile: null }).profileKey, "ltc");
    assert.equal(
      resolveFacilityVocabulary({ vocabularyProfile: "not-a-profile" }).profileKey,
      "ltc",
    );
  });

  it("resolves the Hospital profile (Floor / Unit / Room)", () => {
    const v = resolveFacilityVocabulary({ vocabularyProfile: "hospital" });
    assert.equal(v.profileKey, "hospital");
    assert.equal(v.level1.singular, "Floor");
    assert.equal(v.level2.singular, "Unit");
    assert.equal(v.level3.singular, "Room");
  });

  it("resolves the Hotel profile (Floor / Wing / Room)", () => {
    const v = resolveFacilityVocabulary({ vocabularyProfile: "hotel" });
    assert.equal(v.level1.singular, "Floor");
    assert.equal(v.level2.singular, "Wing");
    assert.equal(v.level3.singular, "Room");
  });

  it("resolves the Campus profile (Building / Department / Room)", () => {
    const v = resolveFacilityVocabulary({ vocabularyProfile: "campus" });
    assert.equal(v.level1.singular, "Building");
    assert.equal(v.level2.singular, "Department");
    assert.equal(v.level3.singular, "Room");
  });

  it("resolves the Corporate profile (Building / Area / Space)", () => {
    const v = resolveFacilityVocabulary({ vocabularyProfile: "corporate" });
    assert.equal(v.level1.singular, "Building");
    assert.equal(v.level2.singular, "Area");
    assert.equal(v.level3.singular, "Space");
  });

  it("resolves a Custom profile from facility settings labels", () => {
    const v = resolveFacilityVocabulary({
      vocabularyProfile: "custom",
      vocabularyLevel1Label: "Deck",
      vocabularyLevel2Label: "Zone",
      vocabularyLevel3Label: "Cabin",
    });
    assert.equal(v.profileKey, "custom");
    assert.equal(v.level1.singular, "Deck");
    assert.equal(v.level2.singular, "Zone");
    assert.equal(v.level3.singular, "Cabin");
    assert.equal(v.level3.plural, "Cabins");
  });

  it("custom profile falls back to LTC labels for missing / blank custom labels", () => {
    const v = resolveFacilityVocabulary({
      vocabularyProfile: "custom",
      vocabularyLevel1Label: "  ",
      vocabularyLevel2Label: "Pod",
      vocabularyLevel3Label: null,
    });
    assert.equal(v.level1.singular, "Floor");
    assert.equal(v.level2.singular, "Pod");
    assert.equal(v.level3.singular, "Room");
  });
});

// ---------------------------------------------------------------------------
// Pluralization
// ---------------------------------------------------------------------------

describe("facility vocabulary — pluralization", () => {
  it("pluralizes regular labels", () => {
    assert.equal(pluralizeLabel("Room"), "Rooms");
    assert.equal(pluralizeLabel("Wing"), "Wings");
    assert.equal(pluralizeLabel("Floor"), "Floors");
  });

  it("pluralizes sibilant and -y endings", () => {
    assert.equal(pluralizeLabel("Annex"), "Annexes");
    assert.equal(pluralizeLabel("Branch"), "Branches");
    assert.equal(pluralizeLabel("Facility"), "Facilities");
    assert.equal(pluralizeLabel("Bay"), "Bays");
  });

  it("all built-in profiles carry explicit plural terms", () => {
    for (const profile of Object.values(FACILITY_VOCABULARY_PROFILES)) {
      assert.ok(profile.level1.plural.length > 0);
      assert.ok(profile.level2.plural.length > 0);
      assert.ok(profile.level3.plural.length > 0);
    }
    assert.equal(FACILITY_VOCABULARY_PROFILES.ltc.level2.plural, "Neighborhoods");
    assert.equal(FACILITY_VOCABULARY_PROFILES.hospital.level2.plural, "Units");
  });
});

// ---------------------------------------------------------------------------
// Builder copy — default LTC vocabulary (compatibility baseline)
// ---------------------------------------------------------------------------

describe("builder copy — default LTC vocabulary", () => {
  const copy = DEFAULT_BUILDER_COPY;

  it("toolbar labels use Floor / Neighborhood / Room", () => {
    assert.equal(copy.toolbar.addLevel1, "Floor");
    assert.equal(copy.toolbar.addLevel2, "Neighborhood");
    assert.equal(copy.toolbar.addLevel3, "Room");
    assert.equal(copy.toolbar.searchPlaceholder, "Search floors, rooms…");
  });

  it("drawer titles use LTC terms", () => {
    assert.equal(copy.drawers.addLevel1, "Add Floor");
    assert.equal(copy.drawers.addLevel2, "Add Neighborhood");
    assert.equal(copy.drawers.addLevel3, "Add Room");
    assert.equal(copy.drawers.addLevel3Bulk, "Add Multiple Rooms");
    assert.equal(copy.drawers.moveToLevel1, "Move to Floor");
    assert.equal(copy.drawers.moveToLevel2, "Move to Neighborhood");
  });

  it("tree empty states and prompts use LTC terms", () => {
    assert.equal(copy.tree.emptyTitle, "No floors have been added yet.");
    assert.ok(copy.tree.emptyBody.includes("neighborhoods"));
    assert.ok(copy.tree.emptyBody.includes("rooms"));
    assert.equal(copy.tree.emptyAction, "Add Floor");
    assert.equal(
      copy.tree.selectPrompt,
      "Select a floor, neighborhood, or room from the tree to view and edit its details.",
    );
  });

  it("undesignated warning names Floor and Neighborhood", () => {
    assert.equal(copy.undesignatedSection.warningTitle, "Locations still need placement");
    assert.ok(copy.undesignatedSection.warningBody.includes("Floor or Neighborhood"));
  });

  it("validation copy uses LTC terms", () => {
    assert.equal(copy.validation.level2RequiresLevel1, "Neighborhoods must be created under a Floor.");
    assert.equal(copy.validation.level1CannotMove, "Floors cannot be moved under another location.");
    assert.equal(
      copy.validation.level3MoveTargets,
      "Rooms can only be moved into a Floor, Neighborhood, or Undesignated.",
    );
    assert.equal(copy.validation.level3NotFound, "Room not found.");
  });

  it("counts pluralize correctly", () => {
    assert.equal(copy.editor.level3Count(1), "1 room");
    assert.equal(copy.editor.level3Count(3), "3 rooms");
    assert.equal(copy.editor.level2Count(1), "1 neighborhood");
    assert.equal(copy.editor.level2Count(2), "2 neighborhoods");
    assert.equal(copy.editor.level3ListTitle(4), "Rooms (4)");
  });

  it("no builder copy hardcodes the legacy 'Neighborhood / Unit' phrase", () => {
    const serialized = JSON.stringify({
      toolbar: copy.toolbar,
      drawers: copy.drawers,
      tree: copy.tree,
      labels: copy.labels,
      contextMenu: copy.contextMenu,
    });
    assert.ok(!serialized.includes("Neighborhood / Unit"));
  });
});

// ---------------------------------------------------------------------------
// Builder copy — Hospital vocabulary
// ---------------------------------------------------------------------------

describe("builder copy — Hospital vocabulary", () => {
  const copy = buildBuilderCopy(FACILITY_VOCABULARY_PROFILES.hospital);

  it("toolbar and drawers say Unit instead of Neighborhood", () => {
    assert.equal(copy.toolbar.addLevel2, "Unit");
    assert.equal(copy.drawers.addLevel2, "Add Unit");
    assert.equal(copy.drawers.moveToLevel2, "Move to Unit");
  });

  it("tree and validation copy use Unit", () => {
    assert.equal(
      copy.tree.selectPrompt,
      "Select a floor, unit, or room from the tree to view and edit its details.",
    );
    assert.equal(copy.validation.level2RequiresLevel1, "Units must be created under a Floor.");
    assert.ok(copy.undesignatedSection.warningBody.includes("Floor or Unit"));
  });
});

// ---------------------------------------------------------------------------
// Builder copy — Hotel vocabulary
// ---------------------------------------------------------------------------

describe("builder copy — Hotel vocabulary", () => {
  const copy = buildBuilderCopy(FACILITY_VOCABULARY_PROFILES.hotel);

  it("level 2 becomes Wing everywhere", () => {
    assert.equal(copy.toolbar.addLevel2, "Wing");
    assert.equal(copy.drawers.addLevel2, "Add Wing");
    assert.equal(copy.contextMenu.addLevel2, "Add Wing");
    assert.equal(copy.editor.level2Count(2), "2 wings");
    assert.equal(copy.validation.level2MustSitUnderLevel1, "Wings must sit under a Floor.");
  });

  it("rooms remain rooms", () => {
    assert.equal(copy.drawers.addLevel3, "Add Room");
    assert.equal(copy.forms.createLevel3, "Create room");
  });
});

// ---------------------------------------------------------------------------
// Builder copy — Custom vocabulary
// ---------------------------------------------------------------------------

describe("builder copy — Custom vocabulary", () => {
  const copy = buildBuilderCopy(
    resolveFacilityVocabulary({
      vocabularyProfile: "custom",
      vocabularyLevel1Label: "Deck",
      vocabularyLevel2Label: "Zone",
      vocabularyLevel3Label: "Cabin",
    }),
  );

  it("all copy derives from custom labels", () => {
    assert.equal(copy.toolbar.addLevel1, "Deck");
    assert.equal(copy.toolbar.addLevel2, "Zone");
    assert.equal(copy.toolbar.addLevel3, "Cabin");
    assert.equal(copy.toolbar.searchPlaceholder, "Search decks, cabins…");
    assert.equal(copy.drawers.addLevel3Bulk, "Add Multiple Cabins");
    assert.equal(copy.tree.emptyTitle, "No decks have been added yet.");
    assert.equal(copy.editor.level3ListTitle(2), "Cabins (2)");
    assert.equal(copy.forms.level3NameLabel, "Cabin name");
    assert.equal(copy.validation.level3NotFound, "Cabin not found.");
    assert.equal(
      copy.validation.level2RequiresLevel1,
      "Zones must be created under a Deck.",
    );
  });
});

// ---------------------------------------------------------------------------
// displayKindLabel — vocabulary-aware builder display labels
// ---------------------------------------------------------------------------

describe("displayKindLabel with vocabulary", () => {
  it("defaults to LTC labels for backwards compatibility", () => {
    assert.equal(displayKindLabel("floor"), "Floor");
    assert.equal(displayKindLabel("neighborhood"), "Neighborhood");
    assert.equal(displayKindLabel("legacy_location"), "Location");
    assert.equal(displayKindLabel("staged"), "Undesignated");
  });

  it("uses the provided vocabulary copy", () => {
    const hospital = buildBuilderCopy(FACILITY_VOCABULARY_PROFILES.hospital);
    assert.equal(displayKindLabel("neighborhood", hospital), "Unit");
    const corporate = buildBuilderCopy(FACILITY_VOCABULARY_PROFILES.corporate);
    assert.equal(displayKindLabel("floor", corporate), "Building");
    assert.equal(displayKindLabel("neighborhood", corporate), "Area");
    // Internal builder-only concepts stay stable across vocabularies.
    assert.equal(displayKindLabel("staged", corporate), "Undesignated");
    assert.equal(displayKindLabel("legacy_location", hospital), "Location");
  });

  it("internal hierarchy kinds and roles are untouched by vocabulary", () => {
    // The vocabulary changes words only; kinds/roles remain the same identifiers.
    assert.equal(DEFAULT_FACILITY_VOCABULARY.profileKey, "ltc");
    const v = resolveFacilityVocabulary({ vocabularyProfile: "corporate" });
    assert.deepEqual(Object.keys(v).sort(), [
      "level1",
      "level2",
      "level3",
      "profileKey",
      "profileLabel",
    ]);
  });
});
