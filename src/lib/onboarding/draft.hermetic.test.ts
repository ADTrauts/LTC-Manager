import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenGuideStep,
  applyBuilderReturn,
  guideArrival,
  guidePath,
  nextGuideStep,
  previousGuideStep,
  readSetupDraft,
} from "./draft";

const available = ["HEALTHCARE_FOOD_NUTRITION", "PLANT", "EVS"];

test("no Product choice goes site, products, building, equipment, people, finish", () => {
  const path = guidePath([], []);
  assert.deepEqual(path, ["site", "products", "building", "equipment", "people", "finish"]);
  assert.equal(nextGuideStep(path, "products"), "building");
  assert.equal(previousGuideStep(path, "building"), "products");
  assert.equal(canOpenGuideStep(path, "products", "building"), false);
  assert.equal(canOpenGuideStep(path, "products", "site"), true);
  assert.equal(canOpenGuideStep(path, "products", "products"), true);
});

test("each chosen Product gets a page after equipment, before people", () => {
  const path = guidePath(["HEALTHCARE_FOOD_NUTRITION", "PLANT"], ["PLANT"]);
  assert.deepEqual(path, [
    "site",
    "products",
    "building",
    "equipment",
    "department:HEALTHCARE_FOOD_NUTRITION",
    "department:PLANT",
    "people",
    "finish",
  ]);
});

test("a licensed Product still gets a page when it was not in the draft", () => {
  const path = guidePath([], ["PLANT"]);
  assert.ok(path.includes("department:PLANT"));
  assert.equal(nextGuideStep(path, "equipment"), "department:PLANT");
});

test("checkout return continues at the building and a cancel stays on Products", () => {
  const draft = readSetupDraft(
    JSON.stringify({
      version: 5,
      facilityId: "fac",
      step: "products",
      reached: "products",
      selectedKeys: ["PLANT"],
    }),
    "fac",
    available,
    "site",
  );
  const path = guidePath(draft.selectedKeys, []);
  assert.deepEqual(guideArrival(draft, path, "success"), { step: "building", reached: "building" });
  assert.deepEqual(guideArrival(draft, path, "updated"), { step: "building", reached: "building" });
  assert.deepEqual(guideArrival(draft, path, "canceled"), { step: "products", reached: "products" });
});

test("checkout keeps a guide that already passed the building", () => {
  const draft = readSetupDraft(
    JSON.stringify({
      version: 5,
      facilityId: "fac",
      step: "products",
      reached: "people",
      selectedKeys: ["PLANT"],
    }),
    "fac",
    available,
    "site",
  );
  const path = guidePath(draft.selectedKeys, []);
  assert.deepEqual(guideArrival(draft, path, "success"), { step: "people", reached: "people" });
});

test("returning from a builder opens the next question and does not skip ahead", () => {
  const path = guidePath(["PLANT"], []);
  assert.deepEqual(applyBuilderReturn({ step: "building", reached: "building" }, path, "building"), {
    step: "equipment",
    reached: "equipment",
  });
  assert.deepEqual(applyBuilderReturn({ step: "products", reached: "products" }, path, "building"), {
    step: "products",
    reached: "products",
  });
  assert.deepEqual(applyBuilderReturn({ step: "people", reached: "people" }, path, "building"), {
    step: "people",
    reached: "people",
  });
  assert.deepEqual(
    applyBuilderReturn({ step: "department:PLANT", reached: "department:PLANT" }, path, "department:PLANT"),
    { step: "people", reached: "people" },
  );
});

test("versioned drafts resume one Facility only and ignore an old tab workspace", () => {
  const raw = JSON.stringify({
    version: 5,
    facilityId: "a",
    step: "products",
    reached: "products",
    selectedKeys: ["PLANT", "EVS", "PLANT", "unknown"],
  });
  assert.deepEqual(readSetupDraft(raw, "a", ["PLANT"], "site"), {
    version: 5,
    facilityId: "a",
    step: "products",
    reached: "products",
    selectedKeys: ["PLANT"],
    approach: null,
  });
  assert.equal(
    readSetupDraft(
      JSON.stringify({ version: 5, facilityId: "a", step: "site", reached: "site", selectedKeys: [], approach: "vssyl" }),
      "a",
      ["PLANT"],
      "site",
    ).approach,
    "vssyl",
  );
  assert.deepEqual(readSetupDraft(raw, "b", ["PLANT"], "site").selectedKeys, []);
  assert.equal(readSetupDraft(JSON.stringify({ version: 3, facilityId: "a", view: "builders", selectedKeys: ["PLANT"] }), "a", ["PLANT"], "site").step, "site");
});
