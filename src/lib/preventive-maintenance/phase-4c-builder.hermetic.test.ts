import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getDepartmentProduct } from "@/lib/department-products";

import { collectPmDraftValidationIssues } from "./draft-validation";
import {
  cadencePresetFromIntervalMonths,
  formatCadenceSummary,
  formatProjectedDateLabel,
  applyPmCadencePresetDefaults,
  intervalMonthsFromCadencePreset,
  persistPmPriority,
  presentPmPlanStatus,
  presentPmPriority,
  previewDraftProjectedSchedule,
} from "./presentation";
import { addMonthsClamped, projectPmSchedule } from "./schedule";

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test("cadence presets are presentation-only mappings of intervalMonths", () => {
  assert.equal(intervalMonthsFromCadencePreset("monthly"), 1);
  assert.equal(intervalMonthsFromCadencePreset("quarterly"), 3);
  assert.equal(intervalMonthsFromCadencePreset("semiannual"), 6);
  assert.equal(intervalMonthsFromCadencePreset("annual"), 12);
  assert.equal(intervalMonthsFromCadencePreset("custom", 5), 5);
  assert.equal(cadencePresetFromIntervalMonths(1), "monthly");
  assert.equal(cadencePresetFromIntervalMonths(3), "quarterly");
  assert.equal(cadencePresetFromIntervalMonths(6), "semiannual");
  assert.equal(cadencePresetFromIntervalMonths(12), "annual");
  assert.equal(cadencePresetFromIntervalMonths(5), "custom");
  assert.equal(formatCadenceSummary(3), "Quarterly");
  assert.equal(formatCadenceSummary(5), "Every 5 months");
  assert.deepEqual(applyPmCadencePresetDefaults("quarterly"), {
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "ROUTINE",
  });
});

test("Build priority presents Routine/High/Urgent and persists MEDIUM for Routine", () => {
  assert.equal(presentPmPriority("MEDIUM"), "Routine");
  assert.equal(presentPmPriority("LOW"), "Routine");
  assert.equal(presentPmPriority("HIGH"), "High");
  assert.equal(presentPmPriority("URGENT"), "Urgent");
  assert.equal(persistPmPriority("ROUTINE"), "MEDIUM");
  assert.equal(persistPmPriority("HIGH"), "HIGH");
});

test("plan list status shows successor drafts without hiding Published", () => {
  assert.equal(presentPmPlanStatus({ planStatus: "DRAFT", hasSuccessorDraft: false }).label, "Draft");
  assert.equal(
    presentPmPlanStatus({ planStatus: "PUBLISHED", hasSuccessorDraft: false }).label,
    "Published",
  );
  assert.equal(
    presentPmPlanStatus({ planStatus: "PUBLISHED", hasSuccessorDraft: true }).label,
    "Published · Draft changes",
  );
  assert.equal(presentPmPlanStatus({ planStatus: "RETIRED", hasSuccessorDraft: false }).label, "Retired");
});

test("schedule preview uses Phase 4A projection for quarterly January 15", () => {
  const projected = previewDraftProjectedSchedule({
    intervalMonths: 3,
    anchorDate: "2027-01-15",
    effectiveDate: "2027-01-01",
    cycles: 4,
  });
  assert.deepEqual(
    projected.map((row) => row.scheduledDate),
    ["2027-01-15", "2027-04-15", "2027-07-15", "2027-10-15"],
  );
  assert.deepEqual(
    projected.map((row) => formatProjectedDateLabel(row.scheduledDate)),
    ["Jan 15", "Apr 15", "Jul 15", "Oct 15"],
  );
  const viaSchedule = projectPmSchedule(
    [
      {
        id: "draft-preview",
        status: "PUBLISHED",
        effectiveDate: "2027-01-01",
        intervalMonths: 3,
        anchorDate: "2027-01-15",
      },
    ],
    { fromInclusive: "2027-01-01", throughInclusive: addMonthsClamped("2027-01-01", 12) },
  );
  assert.deepEqual(
    viaSchedule.map((row) => row.scheduledDate),
    projected.map((row) => row.scheduledDate),
  );
});

test("schedule preview month-end monthly clamps and leap February", () => {
  const monthly = previewDraftProjectedSchedule({
    intervalMonths: 1,
    anchorDate: "2027-01-31",
    effectiveDate: "2027-01-31",
    cycles: 4,
  });
  assert.deepEqual(
    monthly.map((row) => row.scheduledDate),
    ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"],
  );
  const leap = previewDraftProjectedSchedule({
    intervalMonths: 1,
    anchorDate: "2028-01-31",
    effectiveDate: "2028-01-31",
    cycles: 2,
  });
  assert.equal(leap[1]?.scheduledDate, "2028-02-29");
});

test("custom interval and successor effective boundary drop prior-cadence dates", () => {
  const custom = previewDraftProjectedSchedule({
    intervalMonths: 5,
    anchorDate: "2027-01-15",
    effectiveDate: "2027-01-15",
    cycles: 3,
  });
  assert.deepEqual(
    custom.map((row) => row.scheduledDate),
    ["2027-01-15", "2027-06-15", "2027-11-15"],
  );
  const afterSuccessor = projectPmSchedule(
    [
      {
        id: "v1",
        status: "SUPERSEDED",
        effectiveDate: "2027-01-01",
        intervalMonths: 3,
        anchorDate: "2027-01-15",
      },
      {
        id: "v2",
        status: "PUBLISHED",
        effectiveDate: "2027-07-01",
        intervalMonths: 12,
        anchorDate: "2027-01-15",
      },
    ],
    { fromInclusive: "2027-01-01", throughInclusive: "2028-01-15" },
  );
  assert.deepEqual(
    afterSuccessor.map((row) => ({ date: row.scheduledDate, version: row.planVersionId })),
    [
      { date: "2027-01-15", version: "v1" },
      { date: "2027-04-15", version: "v1" },
      { date: "2028-01-15", version: "v2" },
    ],
  );
});

test("Procedure is optional on publish; ineligible Procedure still blocks", () => {
  const withoutProcedure = collectPmDraftValidationIssues({
    name: "Quarterly Dishwasher PM",
    assetId: "a1",
    maintenanceCategoryId: "c1",
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "MEDIUM",
    anchorDate: "2027-01-15",
    effectiveDate: "2027-01-15",
    facilityToday: "2027-01-08",
    procedureVersionId: null,
    firstPublish: true,
  });
  assert.equal(
    withoutProcedure.some((row) => row.code === "PROCEDURE"),
    false,
  );
  const ineligible = collectPmDraftValidationIssues({
    name: "Quarterly Dishwasher PM",
    assetId: "a1",
    maintenanceCategoryId: "c1",
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "MEDIUM",
    anchorDate: "2027-01-15",
    effectiveDate: "2027-01-15",
    facilityToday: "2027-01-08",
    procedureVersionId: "proc-1",
    procedureEligible: false,
    firstPublish: true,
  });
  assert.ok(ineligible.some((row) => row.code === "PROCEDURE"));
});

test("incomplete drafts are allowed; publish issues are collected without throwing", () => {
  const issues = collectPmDraftValidationIssues({
    name: "",
    assetId: null,
    maintenanceCategoryId: null,
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "MEDIUM",
    anchorDate: "2027-01-15",
    effectiveDate: "2026-01-01",
    facilityToday: "2027-01-08",
    firstPublish: true,
  });
  assert.ok(issues.some((row) => row.code === "NAME"));
  assert.ok(issues.some((row) => row.code === "ASSET"));
  assert.ok(issues.some((row) => row.code === "CATEGORY"));
  assert.ok(issues.some((row) => row.code === "EFFECTIVE_PAST"));
  const emergency = collectPmDraftValidationIssues({
    name: "Plan",
    assetId: "a1",
    maintenanceCategoryId: "c1",
    intervalMonths: 3,
    generationLeadDays: 7,
    priority: "EMERGENCY",
    anchorDate: "2027-01-15",
    effectiveDate: "2027-01-15",
    facilityToday: "2027-01-08",
    firstPublish: true,
  });
  assert.ok(emergency.some((row) => row.code === "PRIORITY"));
});

test("Build UI calls shared schedule helpers and does not invoke the generator", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/plant-operations/pm-plan-editor.tsx"),
    "utf8",
  );
  assert.match(editor, /previewDraftProjectedSchedule/);
  assert.doesNotMatch(editor, /generatePmForFacility/);
  assert.doesNotMatch(editor, /nextDueAt/);
  assert.doesNotMatch(editor, /Weekly/);
  const actions = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/build/departments/[departmentId]/preventive-maintenance/actions.ts",
    ),
    "utf8",
  );
  assert.match(actions, /publishPmPlanVersion/);
  assert.match(actions, /createPmPlanSuccessorDraft/);
  assert.doesNotMatch(actions, /generatePmForFacility/);
  assert.doesNotMatch(actions, /createPreventiveWorkOrderForOccurrence/);
});
