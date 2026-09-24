/**
 * Phase 6H — Dashboard is a presentation aggregation of child SPACE RLS.
 * Pure adapter. No Prisma. No ScheduleEntry. No readiness. No Site Pulse.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { DEFERRED_READINESS, type RuntimeLocationState } from "@/lib/runtime-location-state";

import { presentDashboardWorkspace } from "./from-runtime-state";
import {
  DASHBOARD_COVERAGE_UNAVAILABLE_LABEL,
  DASHBOARD_MULTIPLE_OPERATIONS_LABEL,
  DASHBOARD_NO_ACTIVE_OPERATION_LABEL,
} from "./types";

const NEXT_A = new Date("2026-08-17T12:30:00.000Z");
const NEXT_B = new Date("2026-08-17T15:00:00.000Z");

function location(spaceId: string, unitId = "unit-1") {
  return {
    kind: "SPACE" as const,
    spaceId,
    unitId,
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
}

function state(partial: {
  spaceId: string;
  name?: string;
  unitId?: string;
  ot?: "assigned" | "unassigned";
  cycle?: string | null;
  cycleLabel?: string;
  coverageAvailability?: RuntimeLocationState["coverage"]["availability"];
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  overdue?: string[];
  dueNow?: string[];
  assets?: RuntimeLocationState["assets"]["assets"];
  issues?: RuntimeLocationState["assets"]["openIssues"];
  nextAt?: Date | null;
  nextLabel?: string | null;
}): RuntimeLocationState {
  const loc = location(partial.spaceId, partial.unitId);
  const assigned = (partial.ot ?? "assigned") === "assigned";
  const items = partial.evidenceItems ?? [];
  const issues = partial.issues ?? [];
  return {
    identity: {
      location: loc,
      displayName: partial.name ?? partial.spaceId,
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 3",
        neighborhoodName: "Central Terminal",
        unitName: "Central Terminal",
        spaceName: partial.name ?? partial.spaceId,
      },
      physical: { roomTypeKey: null, roomTypeLabel: null },
    },
    program: {
      operationalType: {
        state: assigned ? "assigned" : "unassigned",
        key: assigned ? "SERVERY" : null,
        name: assigned ? "Servery" : null,
        id: assigned ? "ot" : null,
        profileId: assigned ? "p1" : null,
        profileVersion: assigned ? 1 : null,
        profileStatus: assigned ? "ACTIVE" : null,
      },
      cycleSetRef: null,
      coverageExpectationRefs: [],
      logAttachmentRefs: [],
    },
    operation: {
      state: partial.cycle ? "ACTIVE" : "NONE",
      current: partial.cycle
        ? {
            cycleStableKey: partial.cycle,
            cycleVersion: 1,
            label: partial.cycleLabel ?? partial.cycle,
            hierarchyLabel: partial.cycleLabel ?? partial.cycle,
            window: { start: "06:00", end: "10:00" },
            timing: {
              configured: "06:00",
              adjusted: null,
              expectedToday: "06:00",
              actual: null,
              recordedAt: null,
            },
          }
        : null,
      upcoming: null,
      provenance: "NEW_PERIOD_KEY_TIME",
    },
    coverage: {
      availability: partial.coverageAvailability ?? "evaluated",
      planLifecycle: "RUNTIME_VISIBLE",
      slots: partial.slots ?? [],
    },
    evidence: {
      requiredToday: items.length,
      dueNow: partial.dueNow ?? [],
      upcoming: [],
      completed: [],
      overdue: partial.overdue ?? [],
      needsReview: [],
      correctiveOpen: [],
      items,
    },
    assets: {
      assets: partial.assets ?? [],
      openIssues: issues,
      issuesAffectingOperation: issues.filter(
        (issue) =>
          issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
      ),
    },
    milestones: { items: [] },
    readiness: DEFERRED_READINESS,
    changes: [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null || partial.nextAt === null
        ? null
        : {
            kind: "evidence_window",
            at: partial.nextAt ?? NEXT_A,
            label: partial.nextLabel ?? "Food Temperature",
            sourceId: `${partial.spaceId}-next`,
          },
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  };
}

function slot(slotState: "COVERED" | "UNCOVERED" | "AT_RISK") {
  return {
    expectationId: "e1",
    templateStableKey: "cov",
    templateVersion: 1,
    roleKey: "SERVER",
    roleLabel: "Server",
    requiredCount: 1,
    filledCount: slotState === "COVERED" ? 1 : 0,
    state: slotState,
    cycleStableKey: "breakfast",
    assignmentIds: slotState === "COVERED" ? ["oa-1"] : [],
    assignmentRefs:
      slotState === "COVERED"
        ? [{ assignmentId: "oa-1", employeeId: null, employeeDisplayName: null }]
        : [],
  } satisfies RuntimeLocationState["coverage"]["slots"][number];
}

test("healthy department stays calm with shared operation and earliest next", () => {
  const view = presentDashboardWorkspace([
    state({
      spaceId: "a",
      name: "Main Kitchen",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      nextAt: NEXT_B,
      nextLabel: "Lunch",
    }),
    state({
      spaceId: "b",
      name: "Retail",
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      nextAt: NEXT_A,
      nextLabel: "Food Temperature",
    }),
  ]);
  assert.equal(view.operatingCount, 2);
  assert.equal(view.attentionCount, 0);
  assert.equal(view.operation.label, "Breakfast · Active");
  assert.equal(view.next?.label, "Food Temperature");
  assert.equal(view.next?.spaceName, "Retail");
  assert.equal(view.next?.timeLabel, "12:30 PM");
  assert.ok(!("health" in view));
  assert.ok(!JSON.stringify(view).toLowerCase().includes("site pulse"));
});

test("mixed operations stay neutral", () => {
  const view = presentDashboardWorkspace([
    state({ spaceId: "a", cycle: "breakfast", cycleLabel: "Breakfast" }),
    state({ spaceId: "b", cycle: "production", cycleLabel: "Production" }),
    state({ spaceId: "c", cycle: "cleaning", cycleLabel: "Cleaning" }),
  ]);
  assert.equal(view.operation.kind, "mixed");
  assert.equal(view.operation.label, DASHBOARD_MULTIPLE_OPERATIONS_LABEL);
});

test("no active operation keeps earliest next", () => {
  const view = presentDashboardWorkspace([
    state({ spaceId: "a", cycle: null, nextAt: NEXT_B, nextLabel: "Lunch" }),
    state({ spaceId: "b", cycle: null, nextAt: NEXT_A, nextLabel: "Food Temperature" }),
  ]);
  assert.equal(view.operation.label, DASHBOARD_NO_ACTIVE_OPERATION_LABEL);
  assert.equal(view.next?.label, "Food Temperature");
});

test("coverage gap becomes an intervention with SPACE identity and #coverage", () => {
  const view = presentDashboardWorkspace([
    state({
      spaceId: "servery",
      name: "3A Servery",
      unitId: "unit-ct",
      slots: [slot("UNCOVERED")],
      exceptions: [
        {
          source: "coverage",
          state: "UNCOVERED",
          location: location("servery", "unit-ct"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "SERVER uncovered",
          href: null,
        },
      ],
    }),
    state({ spaceId: "dining", name: "Dining Room", slots: [slot("COVERED")] }),
  ]);
  assert.equal(view.attentionCount, 1);
  assert.equal(view.coverage.uncoveredSlotCount, 1);
  assert.equal(view.interventions[0]?.spaceName, "3A Servery");
  assert.match(view.interventions[0]?.href ?? "", /space=servery/);
  assert.match(view.interventions[0]?.href ?? "", /#coverage/);
  assert.doesNotMatch(view.coverage.summary, /ScheduleEntry|staffing gap/i);
});

test("OA disabled is Coverage unavailable with no staffing-gap count", () => {
  const view = presentDashboardWorkspace([
    state({ spaceId: "a", coverageAvailability: "feature_disabled" }),
    state({ spaceId: "b", coverageAvailability: "feature_disabled" }),
  ]);
  assert.equal(view.coverage.unavailable, true);
  assert.equal(view.coverage.summary, DASHBOARD_COVERAGE_UNAVAILABLE_LABEL);
  assert.equal(view.coverage.uncoveredSlotCount, 0);
});

test("mixed coverage availability is not collapsed to Covered or Uncovered", () => {
  const view = presentDashboardWorkspace([
    state({ spaceId: "a", coverageAvailability: "feature_disabled" }),
    state({ spaceId: "b", coverageAvailability: "evaluated", slots: [slot("COVERED")] }),
  ]);
  assert.equal(view.coverage.availability, "mixed");
  assert.match(view.coverage.summary, /coverage unavailable/);
  assert.doesNotMatch(view.coverage.summary, /^Covered$|^Uncovered$/);
});

test("overdue evidence counts and links without LogAssignment math", () => {
  const view = presentDashboardWorkspace([
    state({
      spaceId: "servery",
      name: "3B Servery",
      overdue: ["temp-a"],
      exceptions: [
        {
          source: "evidence",
          state: "OVERDUE",
          location: location("servery"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: null,
        },
      ],
    }),
  ]);
  assert.equal(view.overdueEvidenceCount, 1);
  assert.match(view.interventions[0]?.href ?? "", /#evidence/);
  const src = readFileSync(join(import.meta.dirname, "from-runtime-state.ts"), "utf8");
  assert.equal(src.includes("LogAssignment"), false);
  assert.equal(src.includes("from \"@/lib/prisma\""), false);
});

test("asset impact counts only explicit operational issues", () => {
  const view = presentDashboardWorkspace([
    state({
      spaceId: "kitchen",
      name: "Main Kitchen",
      issues: [
        {
          issueId: "iss-1",
          assetId: "ref-1",
          impact: "EQUIPMENT_UNAVAILABLE",
          summary: "Refrigerator unavailable",
          href: "/asset-issues/iss-1",
        },
      ],
      exceptions: [
        {
          source: "asset_issue",
          state: "EQUIPMENT_UNAVAILABLE",
          location: location("kitchen"),
          operationalContext: { cycleStableKey: null, operationalTypeKey: "KITCHEN" },
          label: "Refrigerator unavailable",
          href: "/asset-issues/iss-1",
        },
      ],
    }),
    state({
      spaceId: "utility",
      name: "Utility",
      assets: [
        {
          assetId: "cart-1",
          name: "Cart",
          status: "OPERATIONAL",
          openIssueCount: 0,
          openWorkOrderCount: 1,
        },
      ],
    }),
  ]);
  assert.equal(view.assetImpactCount, 1);
  assert.equal(view.attentionCount, 1);
  assert.equal(view.interventions[0]?.spaceName, "Main Kitchen");
});

test("untyped configuration is not an operational exception", () => {
  const view = presentDashboardWorkspace([
    state({ spaceId: "kitchen", name: "Main Kitchen", ot: "unassigned" }),
  ]);
  assert.equal(view.configurationCount, 1);
  assert.equal(view.attentionCount, 0);
});

test("adapter does not query or recalculate domain truth", () => {
  const src = readFileSync(join(import.meta.dirname, "from-runtime-state.ts"), "utf8");
  assert.equal(src.includes("from \"@/lib/prisma\""), false);
  assert.equal(src.includes("ScheduleEntry"), false);
  assert.equal(src.includes("computeReadinessBatch"), false);
  assert.equal(src.includes("evaluateCoverageSlots"), false);
  assert.equal(src.includes("loadRuntimeLocationState"), false);
});
