import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { presentPlantGettingStarted } from "@/lib/department-administration/plant-getting-started";
import { listWorkPlanPresetSummaries, buildWorkPlanPresetDraft } from "@/lib/department-work";
import { listTemplatePresetSummaries, buildTemplatePresetDraft } from "@/lib/operational-evidence";
import {
  applyPmCadencePresetDefaults,
  intervalMonthsFromCadencePreset,
} from "@/lib/preventive-maintenance/presentation";
import { collectPmDraftValidationIssues } from "@/lib/preventive-maintenance/draft-validation";
import { evaluateCustomerDepartmentOperability, marketplaceDenialReason } from "@/lib/department-products/eligibility";
import {
  getDepartmentProduct,
  isDepartmentProductAvailableForInstall,
  classifyPlantStarterPresence,
  listPlantStarterCatalog,
  presentPlantStarterPresenceLabel,
  PLANT_STARTER_PACKAGE_NAME,
  PLANT_STARTER_INTRO,
} from "@/lib/department-products";

function source(relative: string) {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

test("Plant starter catalog is four Work presets and five Record templates", () => {
  const catalog = listPlantStarterCatalog();
  assert.equal(PLANT_STARTER_PACKAGE_NAME, "Plant Operations starter configuration");
  assert.match(PLANT_STARTER_INTRO, /Optional examples to help your Facility get started/);
  assert.deepEqual(
    catalog.filter((row) => row.kind === "work").map((row) => row.id),
    [
      "MECHANICAL_ROOM_ROUND",
      "BUILDING_WALKTHROUGH",
      "EXTERIOR_GROUNDS_WALKTHROUGH",
      "GENERATOR_VISUAL_CHECK",
    ],
  );
  assert.deepEqual(
    catalog.filter((row) => row.kind === "record").map((row) => row.id),
    [
      "EQUIPMENT_CONDITION_INSPECTION",
      "MECHANICAL_ROOM_INSPECTION",
      "GENERATOR_INSPECTION",
      "BASIC_EQUIPMENT_READING",
      "POST_WORK_ORDER_VERIFICATION",
    ],
  );
  assert.equal(catalog.length, 9);
  assert.ok(catalog.every((row) => row.defaultSelected));
});

test("starter presence is derived from identities, never SETUP_COMPLETE", () => {
  assert.deepEqual(classifyPlantStarterPresence({ workPresetKeys: [], recordPresetKeys: [] }), {
    addedIds: [],
    remainingIds: listPlantStarterCatalog().map((row) => row.id),
    status: "none",
  });
  const partial = classifyPlantStarterPresence({
    workPresetKeys: ["MECHANICAL_ROOM_ROUND"],
    recordPresetKeys: ["EQUIPMENT_CONDITION_INSPECTION"],
  });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.addedIds, ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"]);
  const added = classifyPlantStarterPresence({
    workPresetKeys: [
      "MECHANICAL_ROOM_ROUND",
      "BUILDING_WALKTHROUGH",
      "EXTERIOR_GROUNDS_WALKTHROUGH",
      "GENERATOR_VISUAL_CHECK",
    ],
    recordPresetKeys: [
      "EQUIPMENT_CONDITION_INSPECTION",
      "MECHANICAL_ROOM_INSPECTION",
      "GENERATOR_INSPECTION",
      "BASIC_EQUIPMENT_READING",
      "POST_WORK_ORDER_VERIFICATION",
    ],
  });
  assert.equal(added.status, "added");
  assert.equal(presentPlantStarterPresenceLabel("none"), "Not added");
  assert.equal(presentPlantStarterPresenceLabel("partial"), "Partially added");
  assert.equal(presentPlantStarterPresenceLabel("added"), "Added");
  assert.doesNotMatch(source("src/lib/department-products/plant-starter.ts"), /SETUP_COMPLETE/);
  assert.doesNotMatch(
    source("src/lib/department-administration/plant-getting-started.ts"),
    /SETUP_COMPLETE/,
  );
});

test("Plant Work presets are draft shared Work, not PM or fake Assets", () => {
  assert.equal(listWorkPlanPresetSummaries("PLANT").length, 4);
  for (const key of [
    "MECHANICAL_ROOM_ROUND",
    "BUILDING_WALKTHROUGH",
    "EXTERIOR_GROUNDS_WALKTHROUGH",
    "GENERATOR_VISUAL_CHECK",
  ] as const) {
    const draft = buildWorkPlanPresetDraft(key);
    assert.equal(draft.presetKey, key);
    assert.equal(draft.stableKey, key);
    assert.ok(draft.items.length >= 1);
    assert.ok((draft.applicabilities ?? []).every((row) => row.kind === "DEPARTMENT_UNIT"));
    assert.doesNotMatch(JSON.stringify(draft), /Example Generator|Example Boiler|Demo AHU/);
  }
  const generator = buildWorkPlanPresetDraft("GENERATOR_VISUAL_CHECK");
  assert.match(generator.description ?? "", /visual operational check/);
  assert.match(generator.description ?? "", /not manufacturer preventive service/);
  assert.doesNotMatch(generator.description ?? "", /NFPA/);
  const workSource = source("src/lib/department-work/work-presets.ts");
  assert.match(workSource, /Always created as DRAFT/);
  assert.doesNotMatch(workSource, /status: "PUBLISHED"/);
});

test("Plant Record presets use OperationalTemplate drafts with ad-hoc evidence", () => {
  assert.equal(listTemplatePresetSummaries("PLANT").length, 5);
  for (const key of [
    "EQUIPMENT_CONDITION_INSPECTION",
    "MECHANICAL_ROOM_INSPECTION",
    "GENERATOR_INSPECTION",
    "BASIC_EQUIPMENT_READING",
    "POST_WORK_ORDER_VERIFICATION",
  ] as const) {
    const draft = buildTemplatePresetDraft(key);
    assert.equal(draft.presetKey, key);
    assert.equal(draft.stableKey, key);
    assert.equal(draft.allowAdHoc, true);
    assert.deepEqual(draft.applicabilities, []);
    assert.ok((draft.schedules ?? []).some((row) => row.kind === "AD_HOC"));
  }
  const generator = buildTemplatePresetDraft("GENERATOR_INSPECTION");
  assert.doesNotMatch(generator.description ?? "", /satisfies regulatory/);
  const reading = buildTemplatePresetDraft("BASIC_EQUIPMENT_READING");
  assert.match(reading.description ?? "", /not a Preventive Maintenance trigger/);
  const verification = buildTemplatePresetDraft("POST_WORK_ORDER_VERIFICATION");
  assert.match(verification.description ?? "", /does not replace Work Order closeout/);
});

test("PM cadence presets map months, lead days, and Routine without creating a Plan", () => {
  assert.deepEqual(applyPmCadencePresetDefaults("monthly"), {
    intervalMonths: 1,
    generationLeadDays: 7,
    priority: "ROUTINE",
  });
  assert.equal(intervalMonthsFromCadencePreset("quarterly"), 3);
  assert.deepEqual(applyPmCadencePresetDefaults("quarterly"), {
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "ROUTINE",
  });
  assert.equal(intervalMonthsFromCadencePreset("semiannual"), 6);
  assert.equal(intervalMonthsFromCadencePreset("annual"), 12);
  const noAsset = collectPmDraftValidationIssues({
    name: "Quarterly",
    assetId: null,
    maintenanceCategoryId: "cat",
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "ROUTINE",
    anchorDate: "2027-01-15",
    effectiveDate: null,
    facilityToday: "2026-10-06",
    firstPublish: true,
  });
  assert.ok(noAsset.some((row) => row.code === "ASSET"));
});

test("Getting Started starter step is optional and does not mark unrelated items complete", () => {
  const before = presentPlantGettingStarted({
    departmentId: "dept-plant",
    locationCount: 0,
    assetCount: 0,
    peopleCount: 0,
    workPlanCount: 0,
    recordCount: 0,
    publishedPmPlanCount: 0,
    starterPresence: "none",
    canInstallStarter: true,
  });
  const starter = before.find((row) => row.id === "starter");
  assert.equal(starter?.status, "optional");
  assert.match(starter?.statusLabel ?? "", /Optional/);
  assert.equal(starter?.actionLabel, "Add starter configuration");
  assert.equal(starter?.href, "/build/departments/dept-plant?starter=1");
  assert.equal(before.find((row) => row.id === "work")?.status, "optional");
  assert.equal(before.find((row) => row.id === "records")?.status, "optional");
  assert.equal(before.find((row) => row.id === "assets")?.status, "needed");
  assert.equal(before.find((row) => row.id === "pm")?.status, "optional");
  assert.equal(before.find((row) => row.id === "operate")?.status, "ready");

  const partial = presentPlantGettingStarted({
    departmentId: "dept-plant",
    locationCount: 2,
    assetCount: 1,
    peopleCount: 1,
    workPlanCount: 0,
    recordCount: 0,
    publishedPmPlanCount: 0,
    starterPresence: "partial",
    canInstallStarter: true,
  });
  assert.equal(partial.find((row) => row.id === "starter")?.statusLabel, "Partially added");
  assert.equal(partial.find((row) => row.id === "work")?.status, "optional");
  assert.equal(partial.find((row) => row.id === "pm")?.status, "optional");

  const added = presentPlantGettingStarted({
    departmentId: "dept-plant",
    locationCount: 2,
    assetCount: 1,
    peopleCount: 1,
    workPlanCount: 4,
    recordCount: 5,
    publishedPmPlanCount: 0,
    starterPresence: "added",
    canInstallStarter: true,
  });
  assert.equal(added.find((row) => row.id === "starter")?.status, "ready");
  assert.equal(added.find((row) => row.id === "starter")?.statusLabel, "Added");
  assert.equal(added.find((row) => row.id === "pm")?.status, "optional");
  assert.equal(added.find((row) => row.id === "operate")?.status, "ready");
});

test("Facility Plant Operations registry is release-prep copy while DEVELOPMENT", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.ok(plant);
  assert.equal(plant.name, "Facility Plant Operations");
  assert.equal(plant.defaultDepartmentName, "Plant Operations");
  assert.equal(plant.status, "DEVELOPMENT");
  assert.equal(plant.starters.workPresets, true);
  assert.match(plant.shortDescription ?? "", /Work Orders/);
  assert.ok(plant.customerCapabilities?.includes("Preventive Maintenance"));
  assert.ok(plant.customerCapabilities?.includes("Recurring facility rounds"));
  assert.equal(isDepartmentProductAvailableForInstall(plant), false);
  assert.equal(
    evaluateCustomerDepartmentOperability({
      productKey: "PLANT",
      releaseStatus: "DEVELOPMENT",
      installed: true,
      departmentActive: true,
      entitled: true,
    }).operable,
    false,
  );
  assert.equal(
    marketplaceDenialReason({ releaseStatus: "DEVELOPMENT", installed: false }),
    "hidden",
  );
  const registry = source("src/lib/department-products/registry.ts");
  assert.doesNotMatch(registry, /priceId|stripeProduct|billingSku/i);
});

test("starter installer copies once and never overwrites", () => {
  const installer = source("src/lib/department-products/plant-starter.ts");
  assert.match(installer, /already\.has\(id\)/);
  assert.match(installer, /createDraftFromPreset/);
  assert.doesNotMatch(installer, /updateDraft|publishWorkPlan|publishTemplate/);
  assert.doesNotMatch(installer, /preventiveMaintenancePlan|asset\.create/);
});
