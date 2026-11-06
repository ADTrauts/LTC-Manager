import assert from "node:assert/strict";
import test from "node:test";

import { deriveSpaceWorkSummary } from "./space-work-summary";
import type { WorkRequirement } from "./types";

function req(
  overrides: Partial<WorkRequirement> & Pick<WorkRequirement, "spaceId" | "state">,
): WorkRequirement {
  return {
    occurrenceKey: overrides.occurrenceKey ?? `k-${overrides.state}`,
    workPlanId: "p1",
    workPlanStableKey: "plan",
    workPlanVersion: 1,
    workPlanName: "Plan",
    workItemId: "i1",
    workItemKey: "item",
    label: "Item",
    instructions: null,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "u1",
    unitName: "Unit",
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    occurrenceId: null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: "WORK_PLAN",
    sourceHref: null,
    ...overrides,
  };
}

test("NOT_CONFIGURED when no requirements for space", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "other", state: "DUE" })],
  });
  assert.equal(s.state, "NOT_CONFIGURED");
  assert.equal(s.totalCount, 0);
});

test("CONFLICT_REVIEW beats other states", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "CONFLICT_REVIEW", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "COMPLETED", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "CONFLICT_REVIEW");
});

test("SAVED_ON_THIS_TABLET when any pending offline", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "SAVED_ON_THIS_TABLET", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "DUE", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "SAVED_ON_THIS_TABLET");
});

test("NEEDS_REVIEW and REWORK_REQUIRED from space id lists", () => {
  const needs = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "s1", state: "DUE" })],
    needsReviewSpaceIds: ["s1"],
  });
  assert.equal(needs.state, "NEEDS_REVIEW");

  const rework = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "s1", state: "DUE" })],
    reworkRequiredSpaceIds: ["s1"],
  });
  assert.equal(rework.state, "REWORK_REQUIRED");
});

test("NOT_APPLICABLE when all requirements are not applicable", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "NOT_APPLICABLE", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "NOT_APPLICABLE", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "NOT_APPLICABLE");
});

test("NOT_REQUIRED when all required are not-required", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "NOT_REQUIRED", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "NOT_REQUIRED", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "NOT_REQUIRED");
});

test("WORK_COMPLETE when all required are complete or not-required", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "COMPLETED", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "COMPLETED_WITH_EVIDENCE", occurrenceKey: "b" }),
      req({ spaceId: "s1", state: "NOT_REQUIRED", occurrenceKey: "c" }),
    ],
  });
  assert.equal(s.state, "WORK_COMPLETE");
  assert.equal(s.completedCount, 3);
  assert.equal(s.totalCount, 3);
});

test("IN_PROGRESS when some complete and some incomplete", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "COMPLETED", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "DUE", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "IN_PROGRESS");
  assert.equal(s.completedCount, 1);
  assert.equal(s.totalCount, 2);
});

test("PAST_DUE_NOT_CONFIRMED when any past due incomplete", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [
      req({ spaceId: "s1", state: "PAST_DUE_NOT_CONFIRMED", occurrenceKey: "a" }),
      req({ spaceId: "s1", state: "UPCOMING", occurrenceKey: "b" }),
    ],
  });
  assert.equal(s.state, "PAST_DUE_NOT_CONFIRMED");
});

test("WORK_DUE when any DUE or CURRENT incomplete", () => {
  const due = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "s1", state: "DUE" })],
  });
  assert.equal(due.state, "WORK_DUE");

  const current = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "s1", state: "CURRENT" })],
  });
  assert.equal(current.state, "WORK_DUE");
});

test("UPCOMING otherwise", () => {
  const s = deriveSpaceWorkSummary({
    spaceId: "s1",
    requirements: [req({ spaceId: "s1", state: "UPCOMING" })],
  });
  assert.equal(s.state, "UPCOMING");
});
