/**
 * Phase 2C-2H-1 — Dashboard Expected Work and supervisor Work exception reconciliation.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  deriveDepartmentDashboardCapabilities,
  type DepartmentCapabilityFacts,
} from "./capabilities";
import { DASHBOARD_CARDS } from "./cards/registry";
import { presentExpectedWorkFromRequirements } from "@/lib/work/expected/present-expected-work";
import type { WorkRequirement } from "@/lib/department-work/types";

function facts(
  departmentKey: string,
  overrides: Partial<DepartmentCapabilityFacts> = {},
): DepartmentCapabilityFacts {
  return {
    departmentId: `dept-${departmentKey.toLowerCase()}`,
    departmentKey,
    plantRuntimeEnabled: true,
    hasRuntimeLocations: true,
    hasPublishedCycles: true,
    hasPublishedWorkPlans: true,
    hasCoveragePlan: true,
    hasRoster: true,
    recordEngine: "CANONICAL",
    hasPlantRequestRoute: true,
    hasMenuApplicability: true,
    ...overrides,
  };
}

function work(
  partial: Partial<WorkRequirement> & {
    occurrenceKey: string;
    label: string;
    state: WorkRequirement["state"];
    sourceKind: WorkRequirement["sourceKind"];
  },
): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey,
    workPlanId: partial.sourceKind === "ONE_OFF" ? "" : "wp",
    workPlanStableKey: partial.sourceKind === "ONE_OFF" ? "one_off" : "wp",
    workPlanVersion: partial.sourceKind === "ONE_OFF" ? 0 : 1,
    workPlanName: partial.sourceKind === "ONE_OFF" ? "One-off Work" : "Plan",
    workItemId: "item",
    workItemKey: "item",
    label: partial.label,
    instructions: null,
    priority: partial.priority ?? "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: "unit-1",
    unitName: "Unit 1",
    spaceId: "space-1",
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    state: partial.state,
    occurrenceId: partial.occurrenceId ?? null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: partial.sourceKind,
    sourceHref:
      partial.sourceKind === "ONE_OFF"
        ? `/staffing/operations?work=${partial.occurrenceKey}`
        : "/staffing/work-plans",
  };
}

test("work.expected is never admitted even when published Work Plans exist", () => {
  const dietary = deriveDepartmentDashboardCapabilities(facts("DIETARY"));
  assert.equal(dietary.has.has("work.expected"), false);
  assert.equal(dietary.notConfigured.some((row) => row.capability === "work.expected"), false);
  assert.ok(dietary.has.has("cycles.published"));
  assert.ok(dietary.has.has("coverage.planned"));

  const custom = deriveDepartmentDashboardCapabilities(facts("ACTIVITIES"));
  assert.equal(custom.has.has("work.expected"), false);
  assert.equal(custom.notConfigured.some((row) => row.capability === "work.expected"), false);
});

test("expected_work card stays registered but requires retired capability", () => {
  const card = DASHBOARD_CARDS.find((row) => row.id === "expected_work");
  assert.ok(card);
  assert.deepEqual(card.requires, { kind: "capabilities", allOf: ["work.expected"] });
  const drills =
    typeof card.drillDowns === "function" ? card.drillDowns("dept-1") : card.drillDowns;
  assert.equal(drills[0]?.href, "/staffing/operations");
});

test("Expected Work presenter keeps ONE_OFF and drops WORK_PLAN", () => {
  const view = presentExpectedWorkFromRequirements({
    facilityId: "f1",
    departmentId: "d1",
    requirements: [
      work({ occurrenceKey: "plan-1", label: "Plan wipe", state: "DUE", sourceKind: "WORK_PLAN" }),
      work({
        occurrenceKey: "oo-1",
        occurrenceId: "db-oo",
        label: "One-off ask",
        state: "DUE",
        sourceKind: "ONE_OFF",
      }),
    ],
    runPresentation: null,
    workCapabilityEnabled: true,
    hasPublishedWorkPlans: true,
    canConfirmWork: true,
    canManageWorkPlans: true,
    workPlansHref: "/staffing/work-plans",
  });
  assert.equal(view.configureHref, null);
  assert.equal(view.hasPublishedWorkPlans, false);
  const labels = view.otherWork.flatMap((loc) =>
    loc.plans.flatMap((plan) => plan.items.map((item) => item.label)),
  );
  assert.deepEqual(labels, ["One-off ask"]);
});

test("supervisor exception loader filters plan-derived at source", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/department-work/load-runtime-work.ts"),
    "utf8",
  );
  assert.match(src, /sourceKind === "ONE_OFF"/);
  assert.match(src, /loadSupervisorWorkExceptions/);
});

test("employee Job Flow cutover and authoring fences remain in place", () => {
  const compose = readFileSync(
    join(process.cwd(), "src/lib/employee-runtime-flow/compose.ts"),
    "utf8",
  );
  assert.match(compose, /withoutPlanDerivedCompatibilityWork/);
  assert.match(
    readFileSync(
      join(process.cwd(), "src/lib/department-work/phase-2b-generic-work-authoring.hermetic.test.ts"),
      "utf8",
    ),
    /GENERIC_WORK_AUTHORING_RETIRED/,
  );
});
