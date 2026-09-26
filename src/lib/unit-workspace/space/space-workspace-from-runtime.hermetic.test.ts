/**
 * Phase 6E — SPACE workspace presentation from Runtime Location State.
 * Pure adapter. No Prisma. No ScheduleEntry. No Neighborhood workspace.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { emptyLocationProgram } from "@/lib/department-administration/location-program";
import {
  DEFERRED_READINESS,
  withRuntimeLocationAnswers,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";

import { presentExceptionFirstLocationCard } from "@/lib/locations/exception-first";

import {
  departmentLocationsConfigureHref,
  formatLocalHhMm,
  presentSpaceWorkspace,
  resolveSpaceWorkspaceViewer,
  spaceWorkspaceEvidenceAnchorId,
  spaceWorkspaceHashSection,
} from "./from-runtime-state";
import {
  SPACE_COVERAGE_UNAVAILABLE_LABEL,
  SPACE_NO_ACTIVE_OPERATION_LABEL,
  SPACE_UNTYPED_LABEL,
} from "./types";

const NEXT_AT = new Date("2026-08-17T12:30:00.000Z");

function location(spaceId: string, unitId = "unit-1a") {
  return {
    kind: "SPACE" as const,
    spaceId,
    unitId,
    departmentId: "dept-1",
    facilityId: "fac-1",
  };
}

function slot(partial: {
  roleKey?: string;
  roleLabel?: string;
  required?: number;
  filled?: number;
  state?: RuntimeLocationState["coverage"]["slots"][number]["state"];
  assignmentId?: string;
  employeeId?: string | null;
  employeeDisplayName?: string | null;
}): RuntimeLocationState["coverage"]["slots"][number] {
  const filled = partial.filled ?? 1;
  const assignmentId = partial.assignmentId ?? "oa-1";
  return {
    expectationId: `exp-${partial.roleKey ?? "SERVER"}`,
    templateStableKey: "cov",
    templateVersion: 1,
    roleKey: partial.roleKey ?? "SERVER",
    roleLabel: partial.roleLabel ?? "Server",
    requiredCount: partial.required ?? 1,
    filledCount: filled,
    state: partial.state ?? "COVERED",
    cycleStableKey: "breakfast",
    assignmentIds: filled > 0 ? [assignmentId] : [],
    assignmentRefs:
      filled > 0
        ? [
            {
              assignmentId,
              employeeId: partial.employeeId ?? null,
              employeeDisplayName: partial.employeeDisplayName ?? null,
            },
          ]
        : [],
  };
}

function evidenceItem(partial: {
  key: string;
  name?: string;
  state: RuntimeLocationState["evidence"]["items"][number]["productState"];
  recordId?: string | null;
  href?: string | null;
  review?: boolean;
}): RuntimeLocationState["evidence"]["items"][number] {
  return {
    requirementKey: partial.key,
    attachmentId: `att-${partial.key}`,
    catalogStableKey: "food_temperature_log",
    displayName: partial.name ?? partial.key,
    productState: partial.state,
    cycleStableKey: "breakfast",
    window: { start: "08:00", end: "09:00" },
    recordId: partial.recordId ?? null,
    href: partial.href ?? (partial.recordId ? `/staffing/logs/records/${partial.recordId}` : null),
    needsSupervisorReview: partial.review ?? false,
  };
}

function state(partial: {
  spaceId?: string;
  name?: string;
  ot?: "assigned" | "unassigned";
  otName?: string;
  cycle?: string | null;
  cycleLabel?: string;
  upcoming?: boolean;
  coverageAvailability?: RuntimeLocationState["coverage"]["availability"];
  slots?: RuntimeLocationState["coverage"]["slots"];
  exceptions?: RuntimeLocationState["exceptions"];
  evidenceItems?: RuntimeLocationState["evidence"]["items"];
  overdue?: string[];
  dueNow?: string[];
  upcomingKeys?: string[];
  completed?: string[];
  needsReview?: string[];
  correctiveOpen?: string[];
  assets?: RuntimeLocationState["assets"]["assets"];
  issues?: RuntimeLocationState["assets"]["openIssues"];
  milestones?: RuntimeLocationState["milestones"]["items"];
  changes?: RuntimeLocationState["changes"];
  nextLabel?: string | null;
}): RuntimeLocationState {
  const loc = location(partial.spaceId ?? "servery-a");
  const assigned = (partial.ot ?? "assigned") === "assigned";
  const items = partial.evidenceItems ?? [];
  return withRuntimeLocationAnswers({
    identity: {
      location: loc,
      displayName: partial.name ?? "Naval Park Servery",
      hierarchy: {
        facilityName: "Harbor",
        departmentName: "Dietary",
        floorName: "Floor 3",
        neighborhoodName: "1A Naval Park",
        unitName: "1A Naval Park",
        spaceName: partial.name ?? "Naval Park Servery",
      },
      physical: { roomTypeKey: "servery", roomTypeLabel: "Servery" },
    },
    program: {
      locationProgram: assigned
        ? {
            ...emptyLocationProgram({
              departmentId: loc.departmentId,
              departmentName: "Dietary",
              spaceId: loc.spaceId,
              name: partial.name ?? "Naval Park Servery",
            }),
            teams: [
              {
                id: "t1",
                name: "Servery AM",
                provenance: { source: "TEAM_ROOM_MEMBERSHIP", detail: "Works this room" },
              },
            ],
          }
        : emptyLocationProgram({
            departmentId: loc.departmentId,
            departmentName: "Dietary",
            spaceId: loc.spaceId,
            name: partial.name ?? "Naval Park Servery",
          }),
      operationalType: {
        state: assigned ? "assigned" : "unassigned",
        key: assigned ? "SERVERY" : null,
        name: assigned ? (partial.otName ?? "Servery") : null,
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
      upcoming:
        partial.cycle || partial.upcoming === false
          ? null
          : {
              cycleStableKey: "lunch",
              label: "Lunch",
              startsAt: "2026-08-17T15:00:00.000Z",
              minutesUntil: 150,
            },
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
      upcoming: partial.upcomingKeys ?? [],
      completed: partial.completed ?? [],
      overdue: partial.overdue ?? [],
      needsReview: partial.needsReview ?? [],
      correctiveOpen: partial.correctiveOpen ?? [],
      items,
    },
    assets: {
      assets: partial.assets ?? [],
      openIssues: partial.issues ?? [],
      issuesAffectingOperation: (partial.issues ?? []).filter(
        (issue) =>
          issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
      ),
    },
    milestones: { items: partial.milestones ?? [] },
    readiness: DEFERRED_READINESS,
    changes: partial.changes ?? [],
    exceptions: partial.exceptions ?? [],
    next:
      partial.nextLabel === null
        ? null
        : {
            kind: "evidence_window",
            at: NEXT_AT,
            label: partial.nextLabel ?? "Food Temperature",
            sourceId: "food-temp",
          },
    asOf: {
      now: new Date("2026-08-17T11:00:00.000Z"),
      operationalDateKey: "2026-08-17",
      timezone: "UTC",
    },
  });
}

const supervisor = resolveSpaceWorkspaceViewer({
  role: "SUPERVISOR",
  authMethod: "PASSWORD",
  authKind: "user",
  uid: "user-1",
});
const manager = resolveSpaceWorkspaceViewer({
  role: "MANAGER",
  authMethod: "PASSWORD",
  authKind: "user",
  uid: "user-2",
});
const employee = resolveSpaceWorkspaceViewer({
  role: "STAFF",
  authMethod: "PASSWORD",
  authKind: "user",
  uid: "user-3",
});
const pinEmployee = resolveSpaceWorkspaceViewer({
  role: "STAFF",
  authMethod: "QUICK_PIN",
  authKind: "employee",
  uid: "emp-1",
});

test("healthy Servery: active operation, no exceptions, next, coverage, milestones", () => {
  const view = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      slots: [slot({ employeeDisplayName: "Jordan Lee" })],
      upcomingKeys: ["food-temp"],
      completed: ["tray-count"],
      evidenceItems: [
        evidenceItem({ key: "food-temp", name: "Food Temperature", state: "UPCOMING" }),
        evidenceItem({
          key: "tray-count",
          name: "Tray Count",
          state: "COMPLETED",
          recordId: "rec-1",
        }),
      ],
      milestones: [
        {
          kind: "KEY_TIME",
          label: "Food leaves Main Kitchen",
          cycleStableKey: "kt-1",
          timing: {
            configured: "07:35",
            adjusted: "07:40",
            expectedToday: "07:40",
            actual: "07:41",
            recordedAt: new Date("2026-08-17T11:41:00.000Z"),
          },
          statusKey: "completed_on_time",
          canonical: true,
        },
        {
          kind: "SERVERY_READY",
          label: "Servery Ready",
          cycleStableKey: "breakfast",
          timing: {
            configured: null,
            adjusted: null,
            expectedToday: null,
            actual: "07:43",
            recordedAt: new Date("2026-08-17T11:43:00.000Z"),
          },
          statusKey: "completed_on_time",
          canonical: false,
        },
        {
          kind: "MEAL_SERVICE_STARTED",
          label: "Meal Service Started",
          cycleStableKey: "breakfast",
          timing: {
            configured: null,
            adjusted: null,
            expectedToday: null,
            actual: "08:04",
            recordedAt: new Date("2026-08-17T12:04:00.000Z"),
          },
          statusKey: "completed_on_time",
          canonical: false,
        },
      ],
    }),
    { viewer: supervisor },
  );

  assert.equal(view.operation.label, "Breakfast");
  assert.equal(view.exceptions.length, 0);
  assert.equal(view.next?.label, "Food Temperature");
  assert.equal(view.next?.timeLabel, "12:30 PM");
  assert.equal(view.coverage.slots[0]?.coverageLabel, "Covered");
  assert.equal(view.coverage.slots[0]?.assignedSummary, "Jordan Lee");
  assert.deepEqual(
    view.evidence.groups.map((group) => group.id),
    ["upcoming", "completed_today"],
  );
  assert.equal(view.milestones.items.length, 3);
  assert.equal(view.milestones.items[0]?.timing.configured, "7:35 AM");
  assert.equal(view.milestones.items[0]?.timing.adjusted, "7:40 AM");
  assert.equal(view.milestones.items[0]?.timing.actual, "7:41 AM");
  assert.equal(view.milestones.showServeryControls, true);
  assert.ok(!JSON.stringify(view.milestones).includes("canonical"));
  assert.ok(!JSON.stringify(view).toLowerCase().includes("healthy"));
  assert.ok(!JSON.stringify(view).toLowerCase().includes("readiness"));
});

test("exception Servery exposes factual exceptions without a health score", () => {
  const view = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      cycleLabel: "Breakfast",
      slots: [slot({ filled: 0, state: "UNCOVERED" })],
      overdue: ["food-temp"],
      evidenceItems: [
        evidenceItem({ key: "food-temp", name: "Food Temperature", state: "OVERDUE" }),
      ],
      issues: [
        {
          issueId: "iss-1",
          assetId: "asset-1",
          impact: "EQUIPMENT_UNAVAILABLE",
          summary: "Door seal damaged",
          href: "/asset-issues/iss-1",
        },
      ],
      exceptions: [
        {
          source: "coverage",
          state: "UNCOVERED",
          location: location("servery-a"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "SERVER uncovered",
          href: null,
        },
        {
          source: "evidence",
          state: "OVERDUE",
          location: location("servery-a"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Food Temperature overdue",
          href: null,
        },
        {
          source: "asset_issue",
          state: "EQUIPMENT_UNAVAILABLE",
          location: location("servery-a"),
          operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
          label: "Refrigerator unavailable",
          href: "/asset-issues/iss-1",
        },
      ],
    }),
    { viewer: supervisor },
  );

  assert.deepEqual(
    view.exceptions.map((row) => row.label),
    ["SERVER uncovered", "Food Temperature overdue", "Refrigerator unavailable"],
  );
  assert.equal(view.coverage.slots[0]?.coverageLabel, "Uncovered");
  assert.equal(view.evidence.groups[0]?.id, "needs_attention");
  assert.ok(!JSON.stringify(view).toLowerCase().includes("unhealthy"));
  assert.ok(!JSON.stringify(view).includes("score"));
});

test("Retail: retail operation and evidence, no Servery milestones", () => {
  const view = presentSpaceWorkspace(
    state({
      spaceId: "retail",
      name: "Retail Cafe",
      otName: "Retail",
      cycle: "retail_service",
      cycleLabel: "Retail Service",
      slots: [slot({ roleKey: "CASHIER", roleLabel: "Cashier" })],
      dueNow: ["cash-count"],
      evidenceItems: [evidenceItem({ key: "cash-count", name: "Cash Count", state: "DUE" })],
      milestones: [
        {
          kind: "KEY_TIME",
          label: "Open register",
          cycleStableKey: "retail_service",
          timing: {
            configured: "07:00",
            adjusted: null,
            expectedToday: "07:00",
            actual: null,
            recordedAt: null,
          },
          statusKey: "due",
          canonical: true,
        },
      ],
    }),
    { viewer: supervisor },
  );

  assert.equal(view.operation.label, "Retail Service");
  assert.equal(view.milestones.items.some((row) => row.kind === "SERVERY_READY"), false);
  assert.equal(view.milestones.items.some((row) => row.kind === "MEAL_SERVICE_STARTED"), false);
  assert.equal(view.milestones.showServeryControls, false);
  assert.ok(!JSON.stringify(view).toLowerCase().includes("trayline"));
  assert.ok(!JSON.stringify(view).toLowerCase().includes("tray line"));
});

test("Main Kitchen: multiple coverage slots and assets, no Servery assumptions", () => {
  const view = presentSpaceWorkspace(
    state({
      spaceId: "kitchen",
      name: "Main Kitchen",
      otName: "Main Kitchen",
      cycle: "breakfast_production",
      cycleLabel: "Breakfast Production",
      slots: [
        slot({ roleKey: "COOK", roleLabel: "Cook", required: 2, filled: 1, state: "AT_RISK" }),
        slot({
          roleKey: "DISH",
          roleLabel: "Dish",
          assignmentId: "oa-2",
          employeeDisplayName: "Pat Kim",
        }),
      ],
      assets: [
        {
          assetId: "oven-1",
          name: "Combi Oven",
          status: "OPERATIONAL",
          openIssueCount: 0,
          openWorkOrderCount: 0,
        },
        {
          assetId: "kett-1",
          name: "Steam Kettle",
          status: "DEGRADED",
          openIssueCount: 1,
          openWorkOrderCount: 1,
        },
      ],
      milestones: [
        {
          kind: "KEY_TIME",
          label: "Tray line start",
          cycleStableKey: "kt-1",
          timing: {
            configured: "07:20",
            adjusted: null,
            expectedToday: "07:20",
            actual: null,
            recordedAt: null,
          },
          statusKey: "due",
          canonical: true,
        },
      ],
    }),
    { viewer: supervisor },
  );

  assert.equal(view.coverage.slots.length, 2);
  assert.equal(view.coverage.slots[0]?.coverageLabel, "At risk");
  assert.equal(view.coverage.slots[0]?.assignedSummary, "1 assigned");
  assert.equal(view.assets.items.length, 2);
  assert.equal(view.milestones.showServeryControls, false);
  assert.equal(view.identity.breadcrumbs.some((row) => row.grain === "floor"), true);
});

test("no active operation stays calm and can show upcoming", () => {
  const view = presentSpaceWorkspace(state({ cycle: null }), { viewer: supervisor });
  assert.equal(view.operation.state, "NONE");
  assert.equal(view.operation.label, SPACE_NO_ACTIVE_OPERATION_LABEL);
  assert.match(view.operation.upcomingLabel ?? "", /Lunch/);
  assert.ok(!view.operation.label.toLowerCase().includes("closed"));
  assert.ok(!view.operation.label.toLowerCase().includes("failed"));
});

test("OA disabled shows Coverage unavailable and hides slot failure copy", () => {
  const view = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      coverageAvailability: "feature_disabled",
      slots: [slot({ filled: 0, state: "UNCOVERED" })],
    }),
    { viewer: supervisor },
  );
  assert.equal(view.coverage.unavailable, true);
  assert.equal(view.coverage.showSlotDetail, false);
  assert.equal(view.coverage.slots.length, 0);
  assert.equal(SPACE_COVERAGE_UNAVAILABLE_LABEL, "Coverage unavailable");
});

test("no published expectations is quiet, not uncovered", () => {
  const view = presentSpaceWorkspace(
    state({ cycle: "breakfast", coverageAvailability: "evaluated", slots: [] }),
    { viewer: supervisor },
  );
  assert.equal(view.coverage.noExpectation, true);
  assert.equal(view.coverage.slots.length, 0);
});

test("untyped SPACE is a configuration condition with Manager configure link", () => {
  const view = presentSpaceWorkspace(state({ ot: "unassigned" }), { viewer: manager });
  assert.equal(view.identity.untyped, true);
  assert.equal(view.operation.label, SPACE_UNTYPED_LABEL);
  assert.equal(view.configureHref, departmentLocationsConfigureHref("dept-1"));
  assert.ok(!view.configureHref?.includes("/admin/facility"));
  const employeeView = presentSpaceWorkspace(state({ ot: "unassigned" }), { viewer: employee });
  assert.equal(employeeView.configureHref, null);
});

test("coverage: evaluated, partial, names when present, count fallback, no ScheduleEntry", () => {
  const named = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      slots: [slot({ employeeId: "emp-1", employeeDisplayName: "Jordan Lee" })],
    }),
    { viewer: supervisor },
  );
  assert.equal(named.coverage.slots[0]?.assignedSummary, "Jordan Lee");

  const fallback = presentSpaceWorkspace(
    state({ cycle: "breakfast", slots: [slot({})] }),
    { viewer: supervisor },
  );
  assert.equal(fallback.coverage.slots[0]?.assignedSummary, "1 assigned");

  const src = readFileSync(join(import.meta.dirname, "from-runtime-state.ts"), "utf8");
  assert.equal(src.includes("ScheduleEntry"), false);
  assert.equal(src.includes("from \"@/lib/prisma\""), false);
});

test("evidence groups, actions, and deep-link focus", () => {
  const view = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      overdue: ["overdue-log"],
      dueNow: ["due-log"],
      upcomingKeys: ["soon-log"],
      completed: ["done-log"],
      correctiveOpen: ["overdue-log"],
      evidenceItems: [
        evidenceItem({ key: "overdue-log", name: "Food Temperature", state: "OVERDUE" }),
        evidenceItem({ key: "due-log", name: "Hand Hygiene", state: "DUE" }),
        evidenceItem({ key: "soon-log", name: "Cooling", state: "UPCOMING" }),
        evidenceItem({
          key: "done-log",
          name: "Sanitizer",
          state: "COMPLETED",
          recordId: "rec-9",
        }),
      ],
    }),
    { viewer: supervisor, evidenceFocusKey: "due-log" },
  );

  const byId = Object.fromEntries(view.evidence.groups.map((group) => [group.id, group]));
  assert.equal(byId.needs_attention?.items[0]?.displayName, "Food Temperature");
  assert.equal(byId.due_now?.items[0]?.actionLabel, "Start log");
  assert.match(byId.due_now?.items[0]?.href ?? "", /\/staffing\/logs\/open/);
  assert.equal(byId.completed_today?.items[0]?.href, "/staffing/logs/records/rec-9");
  assert.equal(byId.due_now?.items[0]?.focused, true);
  assert.equal(spaceWorkspaceEvidenceAnchorId("due-log"), "evidence-item-due-log");
  assert.equal(view.focusSectionId, "evidence");
});

test("assets: operational, degraded, non-impact issue, and explicit impact exceptions", () => {
  const view = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      assets: [
        {
          assetId: "ref-1",
          name: "Refrigerator #3",
          status: "DEGRADED",
          openIssueCount: 1,
          openWorkOrderCount: 1,
        },
        {
          assetId: "mixer-1",
          name: "Mixer",
          status: "OPERATIONAL",
          openIssueCount: 1,
          openWorkOrderCount: 0,
        },
      ],
      issues: [
        {
          issueId: "iss-risk",
          assetId: "ref-1",
          impact: "SERVICE_AT_RISK",
          summary: "Door seal damaged",
          href: "/asset-issues/iss-risk",
        },
        {
          issueId: "iss-quiet",
          assetId: "mixer-1",
          impact: "NO_IMMEDIATE_IMPACT",
          summary: "Cosmetic scratch",
          href: "/asset-issues/iss-quiet",
        },
      ],
    }),
    { viewer: supervisor },
  );

  const fridge = view.assets.items.find((row) => row.assetId === "ref-1");
  const mixer = view.assets.items.find((row) => row.assetId === "mixer-1");
  assert.equal(fridge?.statusLabel, "Degraded");
  assert.equal(fridge?.issues[0]?.operationalException, true);
  assert.equal(fridge?.issues[0]?.impactLabel, "Service at risk");
  assert.equal(mixer?.issues[0]?.operationalException, false);
  assert.equal(mixer?.openWorkOrderCount, 0);
});

test("Today omits when empty and renders RLS changes only", () => {
  const empty = presentSpaceWorkspace(state({ cycle: "breakfast" }), { viewer: supervisor });
  assert.equal(empty.today.items.length, 0);
  assert.equal(empty.sections.find((row) => row.id === "today")?.present, false);

  const populated = presentSpaceWorkspace(
    state({
      cycle: "breakfast",
      changes: [
        {
          kind: "KEY_TIME_ADJUSTED",
          sourceId: "kt",
          at: new Date("2026-08-17T11:35:00.000Z"),
          detail: "Breakfast key time adjusted +5 min",
          doesNotRewriteBuild: true,
        },
        {
          kind: "SERVERY_READY",
          sourceId: "ready",
          at: new Date("2026-08-17T11:43:00.000Z"),
          detail: "Servery Ready",
          doesNotRewriteBuild: true,
        },
      ],
    }),
    { viewer: supervisor },
  );
  assert.equal(populated.today.items.length, 2);
  assert.equal(populated.recentChanges.length, 2);
  assert.equal(populated.today.items[0]?.detail, "Breakfast key time adjusted +5 min");
});

test("role density: employee/PIN, supervisor, manager", () => {
  const rls = state({
    ot: "unassigned",
    cycle: "breakfast",
    slots: [
      slot({ employeeId: "emp-1", employeeDisplayName: "Jordan Lee" }),
      slot({
        roleKey: "COOK",
        roleLabel: "Cook",
        assignmentId: "oa-2",
        employeeId: "emp-9",
        employeeDisplayName: "Other Person",
      }),
    ],
    completed: ["done-log"],
    evidenceItems: [
      evidenceItem({
        key: "done-log",
        name: "Sanitizer",
        state: "COMPLETED",
        recordId: "rec-9",
      }),
    ],
  });

  const pin = presentSpaceWorkspace(rls, { viewer: pinEmployee });
  assert.equal(pin.coverage.slots.length, 1);
  assert.equal(pin.coverage.slots[0]?.roleLabel, "Server");
  assert.equal(pin.configureHref, null);
  assert.equal(pin.evidence.logBookHref, null);
  assert.equal(pin.evidence.groups[0]?.items[0]?.href, null);
  assert.deepEqual(pin.sectionOrder[1], "evidence");

  const sup = presentSpaceWorkspace(rls, { viewer: supervisor });
  assert.equal(sup.coverage.slots.length, 2);
  assert.equal(sup.configureHref, null);
  assert.ok(sup.evidence.logBookHref);

  const mgr = presentSpaceWorkspace(rls, { viewer: manager });
  assert.ok(mgr.configureHref);
  assert.ok(mgr.managerLinks.buildHref);
});

test("unitTab=logs is a retired focus, not a new tab architecture", () => {
  const view = presentSpaceWorkspace(state({ cycle: "breakfast" }), {
    viewer: supervisor,
    unitTab: "logs",
  });
  assert.equal(view.retiredLogsTab, true);
  assert.equal(view.focusSectionId, "evidence");
});

test("formatLocalHhMm does not collapse adjusted over configured", () => {
  assert.equal(formatLocalHhMm("07:35"), "7:35 AM");
  assert.equal(formatLocalHhMm("07:40"), "7:40 AM");
  assert.notEqual(formatLocalHhMm("07:35"), formatLocalHhMm("07:40"));
});

test("workspace answers are the Locations card sentences", () => {
  const rls = state({
    cycle: "breakfast",
    cycleLabel: "Breakfast",
    slots: [slot({ filled: 0, state: "UNCOVERED", roleLabel: "Server" })],
    overdue: ["food-temp"],
    evidenceItems: [
      evidenceItem({ key: "food-temp", name: "Food Temperature", state: "OVERDUE" }),
    ],
    exceptions: [
      {
        source: "coverage",
        state: "UNCOVERED",
        location: location("servery-a"),
        operationalContext: { cycleStableKey: "breakfast", operationalTypeKey: "SERVERY" },
        label: "SERVER uncovered",
        href: null,
      },
    ],
  });
  const view = presentSpaceWorkspace(rls, { viewer: supervisor });
  const card = presentExceptionFirstLocationCard(rls);
  assert.deepEqual(view.card, card);
  assert.equal(view.card.happeningLabel, card.happeningLabel);
  assert.equal(view.card.cycleLabel, card.cycleLabel);
  assert.equal(view.card.responsibleLabel, card.responsibleLabel);
  assert.equal(view.card.evidenceLabel, card.evidenceLabel);
  assert.equal(view.card.nextLabel, card.nextLabel);
  assert.deepEqual(view.card.wrongLabels, card.wrongLabels);
  assert.equal(view.identity.place, card.place);
  assert.equal("operationalTypeName" in view.identity, false);
});

test("hash deep links land on the matching section without a second reconstruction", () => {
  assert.equal(spaceWorkspaceHashSection("#coverage"), "coverage");
  assert.equal(spaceWorkspaceHashSection("#evidence"), "evidence");
  assert.equal(spaceWorkspaceHashSection("#assets"), "assets");
  assert.equal(spaceWorkspaceHashSection("#milestones"), "milestones");
  assert.equal(spaceWorkspaceHashSection("#overview"), null);

  const view = presentSpaceWorkspace(state({ cycle: null }), {
    viewer: supervisor,
    hash: "#assets",
  });
  assert.equal(view.focusSectionId, "assets");
  assert.equal(view.sections.find((row) => row.id === "coverage")?.present, true);
  assert.equal(view.sections.find((row) => row.id === "evidence")?.present, true);
  assert.equal(view.sections.find((row) => row.id === "assets")?.present, true);
  assert.equal(view.sections.find((row) => row.id === "milestones")?.present, true);
});
