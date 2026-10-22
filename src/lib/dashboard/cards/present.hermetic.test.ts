import assert from "node:assert/strict";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import type { RuntimeLocationState } from "@/lib/runtime-location-state";
import type { CallDownData } from "@/lib/todays-work/call-down";
import { emptyPmRunBoardCounts } from "@/lib/preventive-maintenance/run-board";

import type { DashboardViewer } from "../viewer/types";

import { selectShortcuts } from "./load";
import {
  presentCallOffs,
  presentCoverage,
  presentDepartmentSetup,
  presentExpectedWork,
  presentGlance,
  presentPm,
  presentRecords,
  presentShiftNow,
} from "./present";

const FN = "dept-fn";

function location(spaceId: string, uncovered: boolean): RuntimeLocationState {
  return {
    identity: {
      location: { kind: "SPACE", spaceId, unitId: "unit-1", departmentId: FN, facilityId: "fac-1" },
      displayName: `Room ${spaceId}`,
    },
    coverage: { availability: "evaluated", planLifecycle: null, slots: [] },
    answers: {
      responsible: {
        need: uncovered ? [{ state: "UNCOVERED" }] : [{ state: "COVERED" }],
      },
    },
  } as unknown as RuntimeLocationState;
}

function callOff(name: string | null): CallDownData {
  return {
    dateIso: "2026-10-21",
    summary: { total: name ? 1 : 0, open: name ? 1 : 0, covered: 0 },
    items: name
      ? [
          {
            id: "call-1",
            employeeName: name,
            templateKey: "call-off",
            templateLabel: "Call-off",
            reason: "Call-off",
            reasonDetails: null,
            oldUnitId: null,
            oldUnitName: null,
            newUnitId: "unit-1",
            newUnitName: "Unit",
            mealType: null,
            status: "open",
            statusLabel: "Open",
            changedAt: new Date("2026-10-21T12:00:00.000Z"),
            staffingHref: "/staffing?date=2026-10-21",
            coverageHref: "/staffing/assignments",
          },
        ]
      : [],
  };
}

const coverageBase = {
  departmentIds: [FN],
  coverage: [],
  team: false,
} as const;

test("coverage counts gaps and keeps names off the summary", () => {
  const full = presentCoverage({
    ...coverageBase,
    states: [location("a", true)],
    callOffs: [callOff("Ada Lovelace")],
    mode: "full",
  });
  assert.equal(full.state, "ready");
  if (full.state !== "ready") return;
  assert.equal(full.model.metrics[0]?.value, 1);
  assert.equal(full.model.lines.some((row) => row.title === "Ada Lovelace"), true);

  const counted = presentCoverage({
    ...coverageBase,
    states: [location("a", true)],
    callOffs: [callOff("Ada Lovelace")],
    mode: "summary",
  });
  assert.equal(counted.state, "ready");
  if (counted.state !== "ready") return;
  assert.deepEqual(
    counted.model.metrics.map((row) => row.label),
    ["Coverage gaps", "Call-offs not covered"],
  );
  assert.equal(JSON.stringify(counted.model).includes("Ada"), false);

  const clear = presentCoverage({
    ...coverageBase,
    states: [location("a", false)],
    callOffs: [callOff(null)],
    mode: "full",
  });
  assert.equal(clear.state, "quiet");
});

test("call-offs name who is out, and a covered day is quiet", () => {
  const open = presentCallOffs({ callOffs: [callOff("Ada Lovelace")] });
  assert.equal(open.state, "ready");
  if (open.state === "ready") assert.equal(open.model.lines[0]?.title, "Ada Lovelace");
  assert.equal(presentCallOffs({ callOffs: [callOff(null)] }).state, "quiet");
});

test("shift now reports the rhythm as on track or late", () => {
  const onTrack = presentShiftNow({
    presentation: {
      currentOperations: [{ cycleLabel: "Breakfast", phaseLabel: "Service", windowLabel: null, parentLabel: "Breakfast", phases: [], cycleStableKeys: [] }],
      nextOperation: null,
      keyTimeSummaries: [],
      overdueIncompleteCount: 0,
    } as unknown as Parameters<typeof presentShiftNow>[0]["presentation"],
    states: [],
    mode: "summary",
  });
  assert.equal(onTrack.state, "ready");
  if (onTrack.state === "ready") assert.equal(onTrack.model.metrics[0]?.value, "On track");

  const late = presentShiftNow({
    presentation: {
      currentOperations: [],
      nextOperation: null,
      keyTimeSummaries: [],
      overdueIncompleteCount: 2,
    } as unknown as Parameters<typeof presentShiftNow>[0]["presentation"],
    states: [],
    mode: "summary",
  });
  assert.equal(late.state, "ready");
  if (late.state === "ready") assert.equal(late.model.metrics[0]?.value, "Late");
});

test("expected work counts late and due items", () => {
  const result = presentExpectedWork({
    workCapabilityEnabled: true,
    hasPublishedWorkPlans: true,
    currentGroups: [
      {
        operationLabel: "Breakfast",
        windowLabel: null,
        cycleStableKeys: [],
        locations: [
          {
            unitId: "u",
            locationName: "Servery",
            plans: [
              {
                workPlanId: "p",
                workPlanName: "Open",
                assignmentLabel: null,
                items: [
                  {
                    occurrenceKey: "late",
                    workItemKey: "w",
                    label: "Open the line",
                    state: "PAST_DUE_NOT_CONFIRMED",
                    completed: false,
                    statusLabel: null,
                    evidenceRequired: false,
                    canConfirm: false,
                    facilityId: "fac",
                    departmentId: FN,
                    unitId: "u",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    otherWork: [],
    upcoming: null,
    configureHref: null,
    configureLabel: null,
  });
  assert.equal(result.state, "ready");
  if (result.state === "ready") {
    assert.equal(result.model.metrics[0]?.value, 1);
    assert.equal(result.model.lines[0]?.title, "Open the line");
  }
});

test("records summary is counts, and a clear day is quiet", () => {
  const clear = presentRecords({ departmentIds: [FN], states: [], requirements: [], mode: "full" });
  assert.equal(clear.state, "quiet");
  const summary = presentRecords({ departmentIds: [FN], states: [], requirements: [], mode: "summary" });
  assert.equal(summary.state, "ready");
  if (summary.state === "ready") assert.equal(summary.model.metrics[0]?.label, "Overdue");
});

test("preventive maintenance with no published plans is not configured", () => {
  const result = presentPm({ counts: emptyPmRunBoardCounts(), publishedPlanCount: 0 });
  assert.equal(result.state, "not_configured");
});

test("department setup summary is complete or not, without the reasons", () => {
  const open = presentDepartmentSetup({
    reasons: [{ capability: "cycles.published", message: "No Operating Rhythm is published." }],
    mode: "summary",
  });
  assert.equal(open.state, "ready");
  if (open.state === "ready") {
    assert.equal(open.model.metrics[0]?.value, "Not complete");
    assert.equal(JSON.stringify(open.model).includes("Operating Rhythm"), false);
  }
  assert.equal(presentDepartmentSetup({ reasons: [], mode: "full" }).state, "quiet");
});

test("a vendor-run glance row keeps the operator name off the summary", () => {
  const result = presentGlance([
    {
      departmentId: FN,
      name: "Food & Nutrition",
      access: "SUMMARY",
      operatingModel: "VENDOR_RUN",
      operatorName: "Metz",
      attention: 1,
      coverageGaps: 0,
      overdueRecords: 2,
      openWorkOrders: 0,
      openRequests: 1,
    },
  ]);
  assert.equal(result.state, "ready");
  if (result.state !== "ready") return;
  const detail = result.model.lines[0]?.detail ?? "";
  assert.match(detail, /Vendor-run/);
  assert.equal(detail.includes("Metz"), false);
  assert.match(detail, /2 overdue Records/);
  assert.equal(result.model.lines[0]?.href, null);

  const managed = presentGlance([
    {
      departmentId: "dept-evs",
      name: "Environmental Services",
      access: "VIEW",
      operatingModel: "SELF_OPERATED",
      operatorName: null,
      attention: 0,
      coverageGaps: 0,
      overdueRecords: 0,
      openWorkOrders: 0,
      openRequests: 0,
    },
  ]);
  assert.equal(managed.state, "ready");
  if (managed.state === "ready") {
    assert.equal(managed.model.lines[0]?.href, "/dashboard?scope=department:dept-evs");
  }
});

function viewer(access: "MANAGE" | "VIEW"): DashboardViewer {
  return {
    facilityId: "fac-1",
    facilityTimezone: "America/New_York",
    serviceDate: "2026-10-21",
    session: { facilityId: "fac-1", role: "MANAGER", authKind: "user", uid: "u1" } as FacilitySession,
    role: "MANAGER",
    authority: "MANAGER",
    employeeId: null,
    layoutOwner: null,
    ledDepartmentIds: [],
    departments: [{ id: FN, key: "DIETARY", name: "Food & Nutrition", sortOrder: 1 }],
    scopeDepartmentIds: [FN],
    departmentAccess: { [FN]: access },
    operators: {},
    scope: { kind: "DEPARTMENT", departmentId: FN },
    availableScopes: [],
    notices: [],
    canCustomize: false,
    routeFlags: { todaysWorkEnabled: true },
  } as DashboardViewer;
}

test("shortcuts drop legacy actions, and view mode drops write actions", () => {
  const manage = selectShortcuts(viewer("MANAGE")).map((action) => action.id);
  assert.equal(manage.includes("new-inspection"), false);
  assert.equal(manage.includes("operations-center"), false);
  assert.equal(manage.includes("report-issue"), true);
  const view = selectShortcuts(viewer("VIEW")).map((action) => action.id);
  assert.equal(view.includes("report-issue"), false);
});
