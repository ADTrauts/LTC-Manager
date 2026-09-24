import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { resolveDefaultAttachmentTiming } from "@/lib/logs-architecture/timing";

import { CATALOG_SEED_DEFINITIONS } from "./catalog-seed";
import { accessibleHistoryCellLabel } from "./history-presentation";
import { projectLogExpectationHistory } from "./expectation-history";
import { targetRunAttachmentWhere } from "./load-target-run-logs";
import { resolveLogRequirementsForAttachment } from "./resolve-log-requirements";
import {
  groupLabel,
  groupRunLogRequirements,
  presentRunLogRequirement,
} from "./run-presentation";
import { catalogRecommendedScheduleLabel } from "./timing-display";
import type { LogAttachmentForResolve } from "./resolve-log-requirements";

function iceMachineAttachment(
  overrides?: Partial<LogAttachmentForResolve>,
): LogAttachmentForResolve {
  return {
    id: "att-ice",
    stableKey: "att_ice_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "ice_machine_cleaning_log",
    catalogVersion: 2,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "CALENDAR",
    allowAdHoc: false,
    calendarCadence: "WEEKLY",
    calendarDaysOfWeek: [2],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "ASSET",
    assetId: "ice-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    dailyWindows: [],
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-ice",
      name: "Ice Machine Cleaning Log",
      purposeType: "LOG",
      instructions: "Clean the ice machine.",
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: "cleaning_complete",
          label: "Cleaning completed",
          fieldType: "YES_NO",
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: null,
          minNumber: null,
          maxNumber: null,
          allowedSelections: [],
          correctiveActionTrigger: true,
          correctiveActionRequired: true,
        },
      ],
    },
    ...overrides,
    operationalTypeKey: overrides?.operationalTypeKey ?? null,
  };
}

function foodTempDepartmentAttachment(
  overrides?: Partial<LogAttachmentForResolve>,
): LogAttachmentForResolve {
  return {
    id: "att-food",
    stableKey: "att_food_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "food_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "OPERATIONAL_CYCLE",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "DEPARTMENT",
    assetId: null,
    spaceId: null,
    unitId: null,
    targetDepartmentId: "d1",
    dailyWindows: [],
    cycleSelections: [{ cycleStableKey: "lunch", displaySequence: 10 }],
    catalogDefinition: {
      id: "cat-food",
      name: "Food Temperature Log",
      purposeType: "LOG",
      instructions: "Check food temperature.",
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: "food_temperature",
          label: "Temperature",
          fieldType: "TEMPERATURE",
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: "°F",
          minNumber: null,
          maxNumber: null,
          allowedSelections: [],
          correctiveActionTrigger: false,
          correctiveActionRequired: false,
        },
      ],
    },
    ...overrides,
    operationalTypeKey: overrides?.operationalTypeKey ?? null,
  };
}

test("feature flag defaults off and activates canonical surfaces only when set", () => {
  const prev = process.env.CANONICAL_LOGS_ENABLED;
  try {
    delete process.env.CANONICAL_LOGS_ENABLED;
    assert.equal(isCanonicalLogsEnabled(), false);
    process.env.CANONICAL_LOGS_ENABLED = "true";
    assert.equal(isCanonicalLogsEnabled(), true);
    process.env.CANONICAL_LOGS_ENABLED = "false";
    assert.equal(isCanonicalLogsEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
    else process.env.CANONICAL_LOGS_ENABLED = prev;
  }
});

test("Room RUN where clause is direct SPACE attachments only — no Asset mixing", () => {
  const space = targetRunAttachmentWhere("f1", { kind: "SPACE", id: "room-1" });
  assert.equal(space.targetKind, "SPACE");
  assert.equal(space.spaceId, "room-1");
  assert.equal(space.assetId, undefined);
  assert.equal(space.unitId, undefined);

  const department = targetRunAttachmentWhere("f1", { kind: "DEPARTMENT", id: "d1" });
  assert.equal(department.targetKind, "DEPARTMENT");
  assert.equal(department.targetDepartmentId, "d1");
  assert.equal(department.spaceId, undefined);
});

test("same Requirement presenter is used for queue and target context — no status drift", () => {
  const reqs = resolveLogRequirementsForAttachment({
    attachment: foodTempDepartmentAttachment(),
    operationalDateKey: "2026-09-15",
    now: new Date("2026-09-15T16:30:00.000Z"),
    facilityTimezone: "America/New_York",
    publishedCycles: [
      {
        stableKey: "lunch",
        label: "Lunch",
        startLocal: "11:00",
        endLocal: "14:00",
        overnight: false,
        startsAt: new Date("2026-09-15T15:00:00.000Z"),
        endsAt: new Date("2026-09-15T18:00:00.000Z"),
      },
    ],
    existingRecords: [],
  });
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]!.cycleLabel, "Lunch");
  assert.doesNotMatch(reqs[0]!.requirementKey, /MealType|LUNCH/);

  const queueView = presentRunLogRequirement({
    requirement: reqs[0]!,
    catalogDefinitionName: "Food Temperature Log",
    localDisplayLabel: null,
    localInstructions: null,
    catalogInstructions: null,
    targetLabel: "Dietary",
    isManager: false,
  });
  const departmentView = presentRunLogRequirement({
    requirement: reqs[0]!,
    catalogDefinitionName: "Food Temperature Log",
    localDisplayLabel: null,
    localInstructions: null,
    catalogInstructions: null,
    targetLabel: "Dietary",
    isManager: false,
  });
  assert.equal(queueView.stateLabel, departmentView.stateLabel);
  assert.equal(queueView.productState, departmentView.productState);
  assert.equal(queueView.requirementKey, departmentView.requirementKey);
  assert.equal(queueView.timingContextLabel, "Lunch");
});

test("global queue section labels stay Overdue / Due now / Upcoming / Needs review / Recent completion / As needed", () => {
  assert.equal(groupLabel("overdue"), "Overdue");
  assert.equal(groupLabel("due"), "Due now");
  assert.equal(groupLabel("upcoming"), "Upcoming");
  assert.equal(groupLabel("needs_review"), "Needs review");
  assert.equal(groupLabel("completed"), "Recent completion");
  assert.equal(groupLabel("adhoc"), "As needed");
  const grouped = groupRunLogRequirements([], [
    {
      attachmentId: "a1",
      departmentId: "d1",
      displayName: "Receiving Temperature Log",
      catalogDefinitionName: "Receiving Temperature Log",
      targetLabel: "Dietary",
      startHref: "/staffing/logs/adhoc/a1",
    },
  ]);
  assert.equal(grouped.some((g) => g.id === "adhoc"), true);
});

test("Ice Machine v2 is Weekly · Suggested Tuesday and generates one weekly slot", () => {
  const ice = CATALOG_SEED_DEFINITIONS.find(
    (d) => d.stableKey === "ice_machine_cleaning_log" && d.version === 2,
  )!;
  assert.equal(
    catalogRecommendedScheduleLabel(ice.recommendedCadence, ice.recommendedDaypartLabels),
    "Weekly · Suggested Tuesday",
  );
  const defaults = resolveDefaultAttachmentTiming({
    catalog: {
      recommendedCadence: ice.recommendedCadence,
      recommendedScheduleKind: ice.recommendedScheduleKind,
      recommendedDaypartLabels: ice.recommendedDaypartLabels,
      recommendedFixedWindows: [],
    },
    publishedCycleStableKeys: [],
  });
  assert.equal(defaults.needsSetup, false);
  assert.deepEqual(defaults.timing.calendar?.daysOfWeek, [2]);

  const tuesday = resolveLogRequirementsForAttachment({
    attachment: iceMachineAttachment(),
    operationalDateKey: "2026-09-15",
    now: new Date("2026-09-15T16:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(tuesday.length, 1);

  const wednesday = resolveLogRequirementsForAttachment({
    attachment: iceMachineAttachment(),
    operationalDateKey: "2026-09-16",
    now: new Date("2026-09-16T16:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedCycles: [],
    existingRecords: [],
  });
  assert.equal(wednesday.length, 0);

  const days = projectLogExpectationHistory({
    segments: [iceMachineAttachment()],
    fromDateKey: "2026-09-14",
    toDateKey: "2026-09-16",
    todayKey: "2026-09-16",
    now: new Date("2026-09-16T16:00:00.000Z"),
    facilityTimezone: "UTC",
    publishedCyclesByDate: {},
    submissions: [],
  });
  const monday = days.find((d) => d.operationalDateKey === "2026-09-14")!;
  const tue = days.find((d) => d.operationalDateKey === "2026-09-15")!;
  const wed = days.find((d) => d.operationalDateKey === "2026-09-16")!;
  assert.equal(monday.expected, false);
  assert.equal(monday.slots.length, 0);
  assert.equal(tue.expected, true);
  assert.equal(tue.slots[0]!.state, "NOT_COMPLETE");
  assert.equal(wed.expected, false);
  assert.equal(wed.slots.length, 0);
});

test("history cells expose meaningful accessible labels, not color-only status", () => {
  const label = accessibleHistoryCellLabel({
    operationalDateKey: "2026-09-14",
    slotLabel: "Afternoon",
    displayValue: "39°F",
    stateLabel: "Complete",
  });
  assert.equal(label, "September 14, Afternoon, 39 degrees Fahrenheit, Complete");
});

test("canonical submit path does not write legacy LogSubmission", () => {
  const root = process.cwd();
  const submitSrc = readFileSync(join(root, "src/lib/canonical-logs/submit-canonical-log.ts"), "utf8");
  assert.doesNotMatch(submitSrc, /logSubmission\.create/);
  assert.match(submitSrc, /operationalEvidenceRecord/);

  const syncSrc = readFileSync(join(root, "src/lib/offline/process-sync-command.ts"), "utf8");
  assert.match(syncSrc, /logAttachmentId/);
  assert.match(syncSrc, /submitCanonicalLogSubmission/);
});

test("staffing/templates remains a compatibility surface — canonical BUILD does not require it", () => {
  const templatesSrc = readFileSync(
    join(process.cwd(), "src/app/(protected)/staffing/templates/page.tsx"),
    "utf8",
  );
  assert.match(templatesSrc, /Compatibility surface/);
  assert.match(templatesSrc, /BUILD · Logs/);
});
