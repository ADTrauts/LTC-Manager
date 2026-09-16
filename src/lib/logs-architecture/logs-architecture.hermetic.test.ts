import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGS_DOMAIN_BOUNDARY,
  LEGACY_CUTOVER_PHASES,
  SCHEMA_CHANGE_RECOMMENDATION,
  attachmentTimingFingerprint,
  buildLogRequirementKey,
  classifyLegacyLogTemplate,
  daypartWindowsForCadence,
  deriveWindowProductState,
  dispositionForApplicabilityKind,
  evaluateAttachmentNeedsSetup,
  hintLegacyAssignmentMapping,
  isAttachmentBackedRequirementKey,
  isFacilityTargetDeferredForV1,
  isFloorAllowedAsLogTarget,
  mapEvidenceStateToProductState,
  productStateLabel,
  resolveDefaultAttachmentTiming,
  wouldDuplicateActiveAttachment,
} from "./index";

test("domain boundary: Logs include LOG+CHECKLIST; inspections separate; no MealPeriod authority", () => {
  assert.deepEqual(LOGS_DOMAIN_BOUNDARY.logsUmbrellaIncludes, ["LOG", "CHECKLIST"]);
  assert.equal(LOGS_DOMAIN_BOUNDARY.inspectionsRemainSeparate, true);
  assert.equal(LOGS_DOMAIN_BOUNDARY.mealPeriodIsNotTimingAuthority, true);
  assert.equal(LOGS_DOMAIN_BOUNDARY.typeApplicabilityIsSuggestionOnly, true);
  assert.equal(LOGS_DOMAIN_BOUNDARY.canonicalRunStore, "OperationalEvidenceRecord");
});

test("ASSET_TYPE and SPACE_TYPE are suggestion-only; specific targets remain operational", () => {
  assert.equal(dispositionForApplicabilityKind("ASSET_TYPE"), "SUGGESTION_ONLY");
  assert.equal(dispositionForApplicabilityKind("SPACE_TYPE"), "SUGGESTION_ONLY");
  assert.equal(dispositionForApplicabilityKind("SPECIFIC_ASSET"), "OPERATIONAL_TARGET");
  assert.equal(dispositionForApplicabilityKind("SPECIFIC_SPACE"), "OPERATIONAL_TARGET");
  assert.equal(dispositionForApplicabilityKind("DEPARTMENT_UNIT"), "OPERATIONAL_TARGET");
});

test("Floor is never a Log target; Facility target deferred from V1 UX", () => {
  assert.equal(isFloorAllowedAsLogTarget(), false);
  assert.equal(isFacilityTargetDeferredForV1(), true);
});

test("NOT_CONFIRMED maps to Overdue; NEEDS_REVIEW is Completed with exception + supervisor flag", () => {
  assert.deepEqual(mapEvidenceStateToProductState("NOT_CONFIRMED"), {
    productState: "OVERDUE",
    needsSupervisorReview: false,
  });
  assert.deepEqual(mapEvidenceStateToProductState("NEEDS_REVIEW"), {
    productState: "COMPLETED_WITH_EXCEPTION",
    needsSupervisorReview: true,
  });
  assert.deepEqual(mapEvidenceStateToProductState("COMPLETED_WITH_CORRECTIVE_ACTION"), {
    productState: "COMPLETED_WITH_EXCEPTION",
    needsSupervisorReview: false,
  });
  assert.equal(productStateLabel("OVERDUE"), "Overdue");
  assert.equal(productStateLabel("COMPLETED_WITH_EXCEPTION"), "Completed with exception");
});

test("window progression: Upcoming → Due → Overdue", () => {
  const start = new Date("2026-09-13T12:00:00.000Z");
  const end = new Date("2026-09-13T14:00:00.000Z");
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T11:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "UPCOMING",
  );
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T13:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "DUE",
  );
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T15:00:00.000Z"),
      windowStartsAt: start,
      windowEndsAt: end,
      isAdHoc: false,
    }),
    "OVERDUE",
  );
  assert.equal(
    deriveWindowProductState({
      now: new Date("2026-09-13T15:00:00.000Z"),
      windowStartsAt: null,
      windowEndsAt: null,
      isAdHoc: false,
    }),
    "NEEDS_SETUP",
  );
});

test("Catalog TWICE_DAILY defaults to Morning+Afternoon windows without Needs setup", () => {
  const resolved = resolveDefaultAttachmentTiming({
    catalog: {
      recommendedCadence: "TWICE_DAILY",
      recommendedScheduleKind: "FIXED_DAILY_WINDOW",
      recommendedDaypartLabels: [],
      recommendedFixedWindows: [],
    },
    publishedCycleStableKeys: [],
  });
  assert.equal(resolved.needsSetup, false);
  assert.equal(resolved.timing.source, "CATALOG_DEFAULT");
  assert.equal(resolved.timing.dailyWindows.length, 2);
  assert.deepEqual(
    daypartWindowsForCadence("TWICE_DAILY").map((w) => w.label),
    ["Morning", "Afternoon"],
  );
});

test("Operational Cycle Catalog ONCE_PER_OPERATIONAL_CYCLE preselects all published cycles — never MealType", () => {
  const noCycles = resolveDefaultAttachmentTiming({
    catalog: {
      recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
      recommendedScheduleKind: "OPERATIONAL_CYCLE",
      recommendedDaypartLabels: [],
      recommendedFixedWindows: [],
    },
    publishedCycleStableKeys: [],
  });
  assert.equal(noCycles.needsSetup, true);
  assert.match(noCycles.reason ?? "", /Operational Cycles/);

  const withCycles = resolveDefaultAttachmentTiming({
    catalog: {
      recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
      recommendedScheduleKind: "OPERATIONAL_CYCLE",
      recommendedDaypartLabels: [],
      recommendedFixedWindows: [],
    },
    publishedCycleStableKeys: ["breakfast", "lunch", "dinner"],
  });
  assert.equal(withCycles.needsSetup, false);
  assert.deepEqual(withCycles.timing.cycleStableKeys, ["breakfast", "lunch", "dinner"]);
});

test("missing published cycleStableKey marks Attachment Needs setup — no silent remap", () => {
  const result = evaluateAttachmentNeedsSetup({
    attachment: {
      status: "ACTIVE",
      target: { kind: "ASSET", assetId: "a1" },
      timing: {
        source: "OPERATIONAL_CYCLE",
        cycleStableKeys: ["breakfast", "ghost_cycle"],
        dailyWindows: [],
        calendar: null,
        allowAdHoc: false,
      },
    },
    publishedCycleStableKeys: ["breakfast", "lunch"],
  });
  assert.equal(result.needsSetup, true);
  assert.match(result.reason ?? "", /no longer available/);
});

test("duplicate Active Attachment with same Catalog+target+timing fingerprint is rejected", () => {
  const timing = {
    source: "CATALOG_DEFAULT" as const,
    cycleStableKeys: [] as string[],
    dailyWindows: daypartWindowsForCadence("TWICE_DAILY"),
    calendar: null,
    allowAdHoc: false,
  };
  const target = { kind: "ASSET" as const, assetId: "cooler-1" };
  assert.equal(
    wouldDuplicateActiveAttachment({
      facilityId: "f1",
      catalogStableKey: "cooler_temperature_log",
      target,
      timing,
      existing: [
        {
          catalogStableKey: "cooler_temperature_log",
          status: "ACTIVE",
          target,
          timing,
        },
      ],
    }),
    true,
  );
  assert.equal(
    attachmentTimingFingerprint(timing),
    attachmentTimingFingerprint({ ...timing, dailyWindows: [...timing.dailyWindows] }),
  );
});

test("buildLogRequirementKey includes Attachment identity and is deterministic", () => {
  const parts = {
    attachmentStableKey: "att_cooler_1",
    catalogStableKey: "cooler_temperature_log",
    scheduleKind: "FIXED_DAILY_WINDOW" as const,
    windowStartLocal: "05:00",
    windowEndLocal: "11:00",
    target: { kind: "ASSET" as const, assetId: "cooler-1" },
    operationalDateKey: "2026-09-13",
  };
  const key = buildLogRequirementKey(parts);
  assert.equal(key, buildLogRequirementKey(parts));
  assert.ok(key.startsWith("att_cooler_1|"));
  assert.ok(key.includes("|kind:ASSET"));
  assert.equal(isAttachmentBackedRequirementKey(key), true);
  assert.equal(
    isAttachmentBackedRequirementKey(
      "cooler_temperature_log|FIXED_DAILY_WINDOW|-|05:00|11:00|-|-|cooler-1|2026-09-13",
    ),
    false,
  );
});

test("legacy meal assignment hints Operational Cycle selection, not MealPeriod authority", () => {
  const hint = hintLegacyAssignmentMapping({ recurrence: "PER_MEAL", mealType: "LUNCH" });
  assert.equal(hint.timingSourceHint, "OPERATIONAL_CYCLE");
  assert.equal(hint.mealTypeRequiresCycleSelection, true);
  assert.equal(classifyLegacyLogTemplate({ name: "Unit Cooler Temp Log", category: "Temperature" }), "MATCHES_CATALOG");
  assert.equal(classifyLegacyLogTemplate({ name: "Custom Night Audit", category: "Other" }), "FACILITY_CUSTOM");
});

test("cutover has four phases; Phase 3 ships migration 83", () => {
  assert.equal(LEGACY_CUTOVER_PHASES.length, 4);
  assert.equal(SCHEMA_CHANGE_RECOMMENDATION.phase2Migration, null);
  assert.equal(SCHEMA_CHANGE_RECOMMENDATION.migrationCountExpected, 83);
  assert.equal(SCHEMA_CHANGE_RECOMMENDATION.phase3RequiresMigration83, false);
});
