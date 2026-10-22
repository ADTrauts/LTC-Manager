import assert from "node:assert/strict";
import test from "node:test";

import type { SupervisorAssetExceptionItem } from "@/lib/asset-operations/load-runtime-assets";
import type { FacilitySession } from "@/lib/auth";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import type { PmRunBoardCounts } from "@/lib/preventive-maintenance/run-board";
import type { RuntimeException, RuntimeLocationState } from "@/lib/runtime-location-state";
import type { CallDownData } from "@/lib/todays-work/call-down";

import {
  ATTENTION_SEVERITY_TONE,
  mergeAttentionItems,
  scopeAttentionToViewer,
  type DashboardAttentionItem,
} from "./attention";
import {
  attentionFromAssetExceptions,
  attentionFromCoverage,
  attentionFromMenus,
  attentionFromPlantPm,
  attentionFromPlantRequests,
  attentionFromRecords,
  attentionFromRuntimeLocations,
} from "./attention-mappers";

const FN = "dept-fn";
const EVS = "dept-evs";

function exception(source: RuntimeException["source"], state: string, label = `${source} ${state}`): RuntimeException {
  return {
    source,
    state,
    label,
    href: null,
    location: { kind: "SPACE", spaceId: "s", unitId: "u", departmentId: FN, facilityId: "fac-1" },
    operationalContext: { cycleStableKey: null, operationalTypeKey: null },
  };
}

function location(input: {
  spaceId: string;
  departmentId?: string;
  unitId?: string | null;
  pace?: "ready" | "on_time" | "at_risk" | "idle";
  wrong?: RuntimeException[];
  need?: { teamName: string; state: "COVERED" | "UNCOVERED" | "AT_RISK" | "NOT_APPLICABLE" }[];
  coverage?: "evaluated" | "feature_disabled";
  evidence?: Partial<RuntimeLocationState["evidence"]["items"][number]>[];
}): RuntimeLocationState {
  return {
    identity: {
      location: {
        kind: "SPACE",
        spaceId: input.spaceId,
        unitId: input.unitId === undefined ? "unit-1" : input.unitId,
        departmentId: input.departmentId ?? FN,
        facilityId: "fac-1",
      },
      displayName: `Room ${input.spaceId}`,
    },
    coverage: { availability: input.coverage ?? "evaluated", planLifecycle: null, slots: [] },
    evidence: {
      items: (input.evidence ?? []).map((item, index) => ({
        requirementKey: `req-${input.spaceId}-${index}`,
        attachmentId: "att",
        catalogStableKey: "cat",
        displayName: `Record ${index}`,
        productState: "DUE",
        cycleStableKey: null,
        window: { start: null, end: null },
        recordId: null,
        href: null,
        needsSupervisorReview: false,
        ...item,
      })),
    },
    answers: {
      pace: input.pace ?? "at_risk",
      wrong: input.wrong ?? [],
      happening: { state: "active", label: "Lunch · Service" },
      responsible: {
        teams: [],
        assigned: [],
        need: (input.need ?? []).map((row) => ({
          teamId: null,
          requiredCount: 1,
          filledCount: 0,
          cycleStableKey: null,
          ...row,
        })),
      },
    },
  } as unknown as RuntimeLocationState;
}

test("severity → design-system tone is one table", () => {
  assert.deepEqual(ATTENTION_SEVERITY_TONE, { act_now: "blocked", due_soon: "warning", watch: "neutral" });
});

test("runtime locations: at-risk locations only, severity by the RLS exception rank", () => {
  const items = attentionFromRuntimeLocations([
    location({ spaceId: "uncovered", wrong: [exception("coverage", "UNCOVERED")] }),
    location({ spaceId: "equipment", wrong: [exception("asset_issue", "EQUIPMENT_UNAVAILABLE")] }),
    location({ spaceId: "overdue", wrong: [exception("evidence", "OVERDUE")] }),
    location({ spaceId: "other", wrong: [exception("runtime_delay", "late")] }),
    location({ spaceId: "late", wrong: [] }),
    location({ spaceId: "fine", pace: "on_time", wrong: [exception("coverage", "UNCOVERED")] }),
    location({ spaceId: "evs", departmentId: EVS, wrong: [exception("coverage", "AT_RISK")] }),
  ]);
  const bySpace = new Map(items.map((item) => [item.locationId, item]));
  assert.equal(bySpace.has("fine"), false);
  assert.equal(bySpace.get("uncovered")!.severity, "act_now");
  assert.equal(bySpace.get("equipment")!.severity, "act_now");
  assert.equal(bySpace.get("overdue")!.severity, "act_now");
  assert.equal(bySpace.get("other")!.severity, "watch");
  assert.equal(bySpace.get("late")!.severity, "due_soon");
  assert.equal(bySpace.get("evs")!.departmentId, EVS);
  assert.equal(bySpace.get("uncovered")!.id, "location:uncovered");
  assert.equal(bySpace.get("uncovered")!.href, "/unit/unit-1?space=uncovered#coverage");
  assert.equal(bySpace.get("late")!.detail, "Lunch · Service");
  assert.equal(
    attentionFromRuntimeLocations([location({ spaceId: "orphan", unitId: null })])[0]!.href,
    "/units",
  );
});

const callDowns = (open: number): CallDownData => ({
  items: [],
  summary: { total: open, open, covered: 0 },
  dateIso: "2026-10-20",
});

test("coverage: uncovered acts now, at risk is due soon, call-offs belong to the Department", () => {
  const items = attentionFromCoverage({
    departmentId: FN,
    states: [
      location({ spaceId: "a", need: [{ teamName: "Cooks", state: "UNCOVERED" }, { teamName: "Aides", state: "AT_RISK" }] }),
      location({ spaceId: "b", need: [{ teamName: "Aides", state: "AT_RISK" }] }),
      location({ spaceId: "c", need: [{ teamName: "Aides", state: "COVERED" }] }),
      location({ spaceId: "d", coverage: "feature_disabled", need: [{ teamName: "Aides", state: "UNCOVERED" }] }),
      location({ spaceId: "e", departmentId: EVS, need: [{ teamName: "Housekeepers", state: "UNCOVERED" }] }),
    ],
    callDowns: callDowns(2),
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.severity, item.departmentId]),
    [
      ["coverage:a", "act_now", FN],
      ["coverage:b", "due_soon", FN],
      [`coverage:call_offs:${FN}`, "act_now", FN],
    ],
  );
  assert.equal(items[0]!.detail, "1 role uncovered · 1 role at risk");
  assert.equal(items[2]!.title, "2 call-offs not covered");
  assert.equal(items[2]!.href, "/staffing?date=2026-10-20");
  assert.equal(attentionFromCoverage({ departmentId: FN, states: [], callDowns: callDowns(0) }).length, 0);
});

function requirement(overrides: Partial<RunLogRequirementView>): RunLogRequirementView {
  return {
    requirementKey: "req-x",
    attachmentId: "att",
    departmentId: FN,
    displayName: "Freezer temperature",
    targetLabel: "Main kitchen",
    productState: "DUE",
    openHref: "/logs/canonical/req-x",
    viewRecordHref: null,
    windowEndsAt: "2026-10-20T16:00:00.000Z",
    ...overrides,
  } as RunLogRequirementView;
}

test("records: legacy Records produce nothing; canonical states map by product state", () => {
  const states = [
    location({
      spaceId: "a",
      evidence: [
        { productState: "OVERDUE", requirementKey: "r1" },
        { productState: "DUE", requirementKey: "r2" },
        { productState: "COMPLETED_WITH_EXCEPTION", requirementKey: "r3" },
        { productState: "COMPLETED", requirementKey: "r4", needsSupervisorReview: true },
        { productState: "COMPLETED", requirementKey: "r5" },
        { productState: "UPCOMING", requirementKey: "r6" },
      ],
    }),
    location({ spaceId: "b", departmentId: EVS, evidence: [{ productState: "OVERDUE", requirementKey: "evs" }] }),
  ];
  const requirements = [
    requirement({ requirementKey: "r1", productState: "OVERDUE" }),
    requirement({ requirementKey: "unit-level", productState: "OVERDUE" }),
    requirement({ requirementKey: "evs-level", departmentId: EVS, productState: "OVERDUE" }),
    requirement({ requirementKey: "setup", productState: "NEEDS_SETUP" }),
  ];
  assert.deepEqual(attentionFromRecords({ departmentId: FN, engine: "LEGACY", states, requirements }), []);

  const items = attentionFromRecords({ departmentId: FN, engine: "CANONICAL", states, requirements });
  assert.deepEqual(
    items.map((item) => [item.id, item.severity, item.locationId]),
    [
      ["records:r1", "act_now", "a"],
      ["records:r2", "due_soon", "a"],
      ["records:r3", "watch", "a"],
      ["records:r4", "watch", "a"],
      ["records:unit-level", "act_now", null],
    ],
  );
  assert.ok(items.every((item) => item.departmentId === FN));
  assert.equal(items.at(-1)!.dueAt, "2026-10-20T16:00:00.000Z");
  assert.equal(items[0]!.href, "/unit/unit-1?space=a#evidence");
});

function assetItem(overrides: Partial<SupervisorAssetExceptionItem>): SupervisorAssetExceptionItem {
  return {
    group: "Asset",
    status: "Reported · Walk-in cooler",
    temporal: "Current",
    unitId: "unit-1",
    unitName: "Main kitchen",
    sourceHref: "/asset-issues/i1",
    availableActions: [],
    sortRank: 1,
    ...overrides,
  };
}

test("asset exceptions: temporal state maps to severity, ids are stable per source", () => {
  const items = attentionFromAssetExceptions({
    departmentId: FN,
    items: [
      assetItem({ temporal: "Late", issueId: "i1", workOrderId: "w1" }),
      assetItem({ temporal: "NotConfirmed", workOrderId: "w2", sourceHref: "/repairs/w2" }),
      assetItem({ temporal: "Current", group: "Equipment", assetId: "a1", sourceHref: "/assets/a1" }),
    ],
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.severity, item.departmentId, item.locationId, item.href]),
    [
      ["maintenance:issue:i1", "act_now", FN, "unit-1", "/asset-issues/i1"],
      ["maintenance:work_order:w2", "due_soon", FN, "unit-1", "/repairs/w2"],
      ["maintenance:asset:a1", "watch", FN, "unit-1", "/assets/a1"],
    ],
  );
});

test("Plant PM: overdue acts now, due today is due soon, unassigned is watch", () => {
  const counts: PmRunBoardCounts = {
    overdue: 2,
    dueToday: 1,
    dueSoon: 5,
    unassigned: 3,
    needsConfiguration: 0,
    completed: 0,
    skipped: 0,
    projected: 0,
  } as PmRunBoardCounts;
  const items = attentionFromPlantPm({ departmentId: "dept-plant", counts });
  assert.deepEqual(
    items.map((item) => [item.id, item.severity, item.title]),
    [
      ["plant_pm:overdue:dept-plant", "act_now", "2 preventive maintenance tasks overdue"],
      ["plant_pm:due_today:dept-plant", "due_soon", "1 preventive maintenance task due today"],
      ["plant_pm:unassigned:dept-plant", "watch", "3 preventive maintenance tasks unassigned"],
    ],
  );
  assert.deepEqual(
    attentionFromPlantPm({ departmentId: "dept-plant", counts: { ...counts, overdue: 0, dueToday: 0, unassigned: 0 } }),
    [],
  );
});

test("Plant requests: untriaged only, severity by priority, owned by Plant", () => {
  const base = {
    requestCode: "REQ-1",
    summary: "Dish machine leaking",
    requestingDepartment: { name: "Food & Nutrition" },
    unit: { id: "unit-1", name: "Main kitchen" },
    space: null,
  };
  const items = attentionFromPlantRequests({
    plantDepartmentId: "dept-plant",
    requests: [
      { ...base, id: "q1", status: "REPORTED", priority: "EMERGENCY" },
      { ...base, id: "q2", status: "ACKNOWLEDGED", priority: "URGENT" },
      { ...base, id: "q3", status: "REOPENED", priority: "HIGH" },
      { ...base, id: "q4", status: "UNDER_REVIEW", priority: "LOW" },
      { ...base, id: "q5", status: "WORK_ASSIGNED", priority: "EMERGENCY" },
      { ...base, id: "q6", status: "CLOSED", priority: "EMERGENCY" },
    ],
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.severity]),
    [
      ["plant_request:q1", "act_now"],
      ["plant_request:q2", "act_now"],
      ["plant_request:q3", "due_soon"],
      ["plant_request:q4", "watch"],
    ],
  );
  assert.ok(items.every((item) => item.departmentId === "dept-plant" && item.href === "/repairs"));
  assert.equal(items[0]!.detail, "Food & Nutrition · Main kitchen");
});

test("menus: applicability attention is watch, one item per Menu", () => {
  const items = attentionFromMenus({
    departmentId: FN,
    menus: [
      {
        menuId: "m1",
        name: "Fall cycle",
        attention: [
          { code: "ACTIVE_WITHOUT_LOCATIONS", message: "Active Menu has no locations." },
          { code: "PERIOD_MISSING", message: "Lunch has no Menu period." },
        ],
      },
      { menuId: "m2", name: "Holiday", attention: [] },
    ],
  });
  assert.deepEqual(items, [
    {
      id: "menus:m1",
      source: "menus",
      severity: "watch",
      departmentId: FN,
      locationId: null,
      title: "Fall cycle",
      detail: "Active Menu has no locations. (+1 more)",
      dueAt: null,
      href: "/menus/m1",
    },
  ]);
});

function item(overrides: Partial<DashboardAttentionItem> & Pick<DashboardAttentionItem, "id">): DashboardAttentionItem {
  return {
    source: "location",
    severity: "watch",
    departmentId: FN,
    locationId: null,
    title: overrides.id,
    detail: null,
    dueAt: null,
    href: "/units",
    ...overrides,
  };
}

test("merge: duplicates collapse, location-bound coverage and Records fold into the location, sorted", () => {
  const merged = mergeAttentionItems(
    [
      item({ id: "location:a", locationId: "a", severity: "act_now", title: "Room A" }),
      item({ id: "location:a", locationId: "a", severity: "watch", title: "duplicate" }),
    ],
    [
      item({ id: "coverage:a", source: "coverage", locationId: "a", severity: "act_now" }),
      item({ id: "coverage:b", source: "coverage", locationId: "b", severity: "due_soon", title: "Room B" }),
      item({ id: "coverage:call_offs:dept-fn", source: "coverage", severity: "act_now", title: "2 call-offs not covered" }),
    ],
    [
      item({ id: "records:r1", source: "records", locationId: "a", severity: "act_now" }),
      item({ id: "records:r2", source: "records", severity: "due_soon", dueAt: "2026-10-20T15:00:00.000Z", title: "Z later" }),
      item({ id: "records:r3", source: "records", severity: "due_soon", dueAt: "2026-10-20T14:00:00.000Z", title: "Z earlier" }),
      item({ id: "maintenance:issue:1", source: "maintenance", locationId: "a", severity: "watch", title: "Cooler" }),
    ],
  );
  assert.deepEqual(
    merged.map((row) => row.id),
    [
      "coverage:call_offs:dept-fn",
      "location:a",
      "records:r3",
      "records:r2",
      "coverage:b",
      "maintenance:issue:1",
    ],
  );
  assert.equal(merged.find((row) => row.id === "location:a")!.title, "Room A");
});

test("scope: items outside the viewer's Departments or behind a closed route are dropped", () => {
  const viewer = {
    scopeDepartmentIds: [FN],
    role: "SUPERVISOR" as const,
    session: { authKind: "user" } as FacilitySession,
    routeFlags: { todaysWorkEnabled: false },
  };
  const kept = scopeAttentionToViewer(viewer, [
    item({ id: "location:a", href: "/unit/u1?space=a" }),
    item({ id: "location:evs", departmentId: EVS }),
    item({ id: "handoff", href: "/today/handoffs" }),
    item({ id: "builder", href: "/build/departments/dept-fn" }),
    item({ id: "relative", href: "units" }),
  ]);
  assert.deepEqual(kept.map((row) => row.id), ["location:a"]);
});
