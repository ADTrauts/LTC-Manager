/**
 * Environmental Services — Dashboard release gate (contract §Release gate, items 2, 3, 5, 6, 7).
 * Item 4 (two-Department isolation) is the EVS subtest in `dashboard-foundation.db.test.ts`.
 * EVS is AVAILABLE as of November 24, 2026. This gate locks the Dashboard declaration.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AppRole } from "@/lib/access";
import type { AuthKind, FacilitySession } from "@/lib/auth";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import { getDepartmentProduct } from "@/lib/department-products/registry";
import { buildEvsDefaultCyclePlans } from "@/lib/operational-cycles/defaults";
import { describeKeyTimeStatus } from "@/lib/operational-cycles/key-time-day-expectation";
import { authorizeRoute, type RouteFeatureFlags } from "@/lib/route-registry/authorize";
import {
  deriveRuntimeExceptions,
  type RuntimeException,
  type RuntimeLocationState,
} from "@/lib/runtime-location-state";
import type { CallDownData } from "@/lib/todays-work/call-down";

import { attentionFromCoverage, attentionFromRecords, attentionFromRuntimeLocations } from "./attention-mappers";
import {
  deriveDepartmentDashboardCapabilities,
  NOT_CONFIGURED_MESSAGES,
  type DepartmentCapabilityFacts,
} from "./capabilities";
import { listEligibleCards, type DashboardCapabilityMap } from "./cards/eligibility";
import { selectDashboardDepartments, type DashboardDepartmentCatalog } from "./viewer";
import type {
  DashboardAuthority,
  DashboardDepartmentAccessMode,
  DashboardScope,
  DashboardViewer,
} from "./viewer/types";

const EVS = { id: "dept-evs", key: "EVS", name: "Environmental Services", sortOrder: 1 };
const FN = { id: "dept-fn", key: "DIETARY", name: "Food & Nutrition", sortOrder: 2 };

const ALL_FLAGS: RouteFeatureFlags = {
  dietaryOperationalEvidenceEnabled: true,
  dietaryWorkPlansEnabled: true,
  canonicalLogsEnabled: true,
};

const DECLARED = [
  "coverage.planned",
  "cycles.published",
  "locations.runtime",
  "maintenance.shared",
  "people.roster",
  "records.canonical",
];

function facts(overrides: Partial<DepartmentCapabilityFacts> = {}): DepartmentCapabilityFacts {
  return {
    departmentId: EVS.id,
    departmentKey: EVS.key,
    plantRuntimeEnabled: false,
    hasRuntimeLocations: true,
    hasPublishedCycles: true,
    hasPublishedWorkPlans: true,
    hasCoveragePlan: true,
    hasRoster: true,
    recordEngine: "CANONICAL",
    hasPlantRequestRoute: false,
    hasMenuApplicability: true,
    ...overrides,
  };
}

const UNCONFIGURED: Partial<DepartmentCapabilityFacts> = {
  hasRuntimeLocations: false,
  hasPublishedCycles: false,
  hasCoveragePlan: false,
  hasRoster: true,
};

function capabilityMap(input: Partial<DepartmentCapabilityFacts> = {}): DashboardCapabilityMap {
  return new Map([[EVS.id, deriveDepartmentDashboardCapabilities(facts(input))]]);
}

function viewer(input: {
  role: AppRole;
  authority: DashboardAuthority;
  scope: DashboardScope | null;
  access?: DashboardDepartmentAccessMode;
  authKind?: AuthKind;
}): DashboardViewer {
  const session = {
    uid: "viewer",
    authKind: input.authKind ?? "harbor_staff",
    scopeKind: "facility",
    facilityId: "fac-1",
    role: input.role,
  } as FacilitySession;
  return {
    facilityId: "fac-1",
    facilityTimezone: "America/New_York",
    serviceDate: "2026-11-23",
    session,
    role: input.role,
    authority: input.authority,
    employeeId: null,
    layoutOwner: { kind: "USER", userId: "viewer" },
    ledDepartmentIds: input.authority === "DEPARTMENT_LEADER" ? [EVS.id] : [],
    departments: [EVS],
    scopeDepartmentIds: [EVS.id],
    departmentAccess: { [EVS.id]: input.access ?? "MANAGE" },
    operators: {},
    scope: input.scope,
    availableScopes: input.scope ? [input.scope] : [],
    notices: [],
    canCustomize: true,
    routeFlags: ALL_FLAGS,
  };
}

const evsScope: DashboardScope = { kind: "DEPARTMENT", departmentId: EVS.id };
const facilityScope: DashboardScope = { kind: "FACILITY" };
const ids = (rows: { card: { id: string } }[]) => rows.map((row) => row.card.id).sort();

const BANDS: { role: AppRole; authority: DashboardAuthority }[] = [
  { role: "SUPERVISOR", authority: "SUPERVISOR" },
  { role: "SUPERVISOR", authority: "DEPARTMENT_LEADER" },
  { role: "MANAGER", authority: "MANAGER" },
  { role: "GM", authority: "DEPARTMENT_LEADER" },
  { role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR" },
];

test("R7: EVS is AVAILABLE and reaches customer Dashboards when installed", () => {
  assert.equal(getDepartmentProduct("EVS")?.status, "AVAILABLE");
  const catalog: DashboardDepartmentCatalog = {
    departments: [
      { ...EVS, isActive: true, showInEmployeeApp: true },
      { ...FN, isActive: true, showInEmployeeApp: true },
    ],
    entitlements: [],
    billingStatus: "UNMANAGED",
    entitlementsEnforced: false,
  };
  const select = (authKind: AuthKind) =>
    selectDashboardDepartments({ authKind, catalog, plantRuntimeEnabled: false }).map((row) => row.id);
  assert.deepEqual(select("user"), [EVS.id, FN.id]);
  assert.deepEqual(select("harbor_staff"), [EVS.id, FN.id]);
});

test("capabilities: EVS produces exactly its declared set", () => {
  const result = deriveDepartmentDashboardCapabilities(facts());
  assert.equal(result.productKey, "EVS");
  assert.deepEqual([...result.has].sort(), DECLARED);
  assert.deepEqual(result.notConfigured, []);
  for (const absent of ["work.expected", "meal.milestones", "menus", "plant.maintenance", "plant.requests.filed"]) {
    assert.equal(result.has.has(absent as never), false, absent);
  }
});

test("capabilities: EVS files requests to Plant only through a route and Plant runtime", () => {
  assert.equal(deriveDepartmentDashboardCapabilities(facts({ hasPlantRequestRoute: true })).has.has("plant.requests.filed"), false);
  assert.equal(
    deriveDepartmentDashboardCapabilities(facts({ hasPlantRequestRoute: true, plantRuntimeEnabled: true })).has.has(
      "plant.requests.filed",
    ),
    true,
  );
});

test("capabilities: failed sources fail closed; canonical logs off reports legacy Records", () => {
  const failed = deriveDepartmentDashboardCapabilities(
    facts({
      hasRuntimeLocations: null,
      hasPublishedCycles: null,
      hasCoveragePlan: null,
      hasRoster: null,
      recordEngine: null,
      hasMenuApplicability: null,
    }),
  );
  assert.deepEqual([...failed.has], ["maintenance.shared"]);
  assert.deepEqual(failed.notConfigured, []);

  const legacy = deriveDepartmentDashboardCapabilities(facts({ recordEngine: "LEGACY" }));
  assert.equal(legacy.has.has("records.canonical"), false);
  assert.deepEqual(legacy.notConfigured, [
    { capability: "records.legacy", message: NOT_CONFIGURED_MESSAGES["records.legacy"] },
  ]);
});

function evsLocation(input: {
  spaceId: string;
  pace?: "ready" | "on_time" | "at_risk" | "idle";
  wrong?: RuntimeException[];
  need?: { teamName: string; state: "COVERED" | "UNCOVERED" | "AT_RISK" }[];
  evidence?: { requirementKey: string; productState: string }[];
}): RuntimeLocationState {
  return {
    identity: {
      location: { kind: "SPACE", spaceId: input.spaceId, unitId: "unit-1", departmentId: EVS.id, facilityId: "fac-1" },
      displayName: `Room ${input.spaceId}`,
    },
    coverage: { availability: "evaluated", planLifecycle: null, slots: [] },
    evidence: {
      items: (input.evidence ?? []).map((item) => ({
        attachmentId: "att",
        catalogStableKey: "evs_room_cleaning_checklist",
        displayName: "Room cleaning checklist",
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
      happening: { state: "active", label: "Morning Operations · Cleaning" },
      responsible: {
        teams: [],
        assigned: [],
        need: (input.need ?? []).map((row) => ({ teamId: null, requiredCount: 1, filledCount: 0, cycleStableKey: null, ...row })),
      },
    },
  } as unknown as RuntimeLocationState;
}

function keyPointState(statusKey: string): Parameters<typeof deriveRuntimeExceptions>[0] {
  return {
    identity: {
      location: { kind: "SPACE", spaceId: "room-1", unitId: "unit-1", departmentId: EVS.id, facilityId: "fac-1" },
    },
    program: { operationalType: { key: null } },
    operation: { current: { cycleStableKey: "morning_routine" } },
    coverage: { availability: "feature_disabled", slots: [] },
    evidence: { items: [] },
    assets: { assets: [], openIssues: [], issuesAffectingOperation: [] },
    milestones: {
      items: [{ kind: "KEY_TIME", label: "Area ready", cycleStableKey: "morning_routine_area_ready", statusKey, canonical: true }],
    },
  } as unknown as Parameters<typeof deriveRuntimeExceptions>[0];
}

test("attention: the starter's Key Points only become overdue when tracking is REQUIRED", () => {
  const plans = buildEvsDefaultCyclePlans();
  const opened = plans.find((plan) => plan.stableKey === "morning_routine_shift_opened")!;
  const ready = plans.find((plan) => plan.stableKey === "morning_routine_area_ready")!;
  const late = "23:59";
  assert.notEqual(
    describeKeyTimeStatus({ configuredDueLocal: opened.dueLocals![0]!, nowLocalHhMm: late, occurrenceTracking: opened.occurrenceTracking }).key,
    "overdue",
    "Shift opened is NONE: no invented overdue",
  );
  assert.equal(
    describeKeyTimeStatus({ configuredDueLocal: ready.dueLocals![0]!, nowLocalHhMm: late, occurrenceTracking: ready.occurrenceTracking }).key,
    "overdue",
  );
});

test("attention: an overdue REQUIRED Key Point acts now and belongs to EVS", () => {
  const exceptions = deriveRuntimeExceptions(keyPointState("overdue"));
  assert.deepEqual(
    exceptions.map((row) => [row.source, row.state, row.location.departmentId]),
    [["milestone", "overdue", EVS.id]],
  );
  assert.deepEqual(deriveRuntimeExceptions(keyPointState("upcoming")), []);

  const [item] = attentionFromRuntimeLocations([evsLocation({ spaceId: "room-1", wrong: exceptions })]);
  assert.equal(item!.severity, "act_now");
  assert.equal(item!.departmentId, EVS.id);
  assert.equal(item!.source, "location");
});

test("attention: EVS coverage gaps and call-offs carry the EVS departmentId", () => {
  const callDowns: CallDownData = { items: [], summary: { total: 1, open: 1, covered: 0 }, dateIso: "2026-11-23" };
  const items = attentionFromCoverage({
    departmentId: EVS.id,
    states: [
      evsLocation({ spaceId: "a", need: [{ teamName: "Housekeepers", state: "UNCOVERED" }] }),
      evsLocation({ spaceId: "b", need: [{ teamName: "Floor care", state: "AT_RISK" }] }),
      evsLocation({ spaceId: "c", need: [{ teamName: "Housekeepers", state: "COVERED" }] }),
    ],
    callDowns,
  });
  assert.deepEqual(
    items.map((row) => [row.id, row.severity, row.departmentId]),
    [
      ["coverage:a", "act_now", EVS.id],
      ["coverage:b", "due_soon", EVS.id],
      [`coverage:call_offs:${EVS.id}`, "act_now", EVS.id],
    ],
  );
});

test("attention: EVS Records map by product state; another Department's Records are left out", () => {
  const requirement = (overrides: Partial<RunLogRequirementView>) =>
    ({
      requirementKey: "req",
      attachmentId: "att",
      departmentId: EVS.id,
      displayName: "Area inspection",
      targetLabel: "North Wing",
      productState: "OVERDUE",
      openHref: "/logs/canonical/req",
      viewRecordHref: null,
      windowEndsAt: "2026-11-23T14:30:00.000Z",
      ...overrides,
    }) as RunLogRequirementView;
  const states = [evsLocation({ spaceId: "a", evidence: [{ requirementKey: "room", productState: "DUE" }] })];
  const requirements = [
    requirement({ requirementKey: "inspection" }),
    requirement({ requirementKey: "fn-temp", departmentId: FN.id }),
  ];
  assert.deepEqual(attentionFromRecords({ departmentId: EVS.id, engine: "LEGACY", states, requirements }), []);
  const items = attentionFromRecords({ departmentId: EVS.id, engine: "CANONICAL", states, requirements });
  assert.deepEqual(
    items.map((row) => [row.id, row.severity]),
    [
      ["records:room", "due_soon"],
      ["records:inspection", "act_now"],
    ],
  );
  assert.ok(items.every((row) => row.departmentId === EVS.id));
});

test("drill-downs: every eligible EVS card link opens for each band, scope and access mode", () => {
  const scopes: DashboardScope[] = [evsScope, facilityScope];
  let checked = 0;
  for (const band of BANDS) {
    for (const scope of scopes) {
      for (const access of ["MANAGE", "VIEW"] as const) {
        const subject = viewer({ ...band, scope, access });
        for (const row of listEligibleCards(subject, capabilityMap())) {
          const hrefs = [
            ...(row.drillDown ? [row.drillDown.href] : []),
            ...row.card.drillDowns(scope.kind === "FACILITY" ? null : EVS.id).flatMap((link) =>
              row.card.drillDownRequired ? [link.href, ...(link.viewHref ? [link.viewHref] : [])] : [],
            ),
          ];
          for (const href of hrefs) {
            const decision = authorizeRoute({
              pathname: href.split(/[?#]/)[0]!,
              role: band.role,
              sessionScope: "facility",
              authKind: "user",
              featureFlags: ALL_FLAGS,
            });
            assert.equal(decision.outcome, "ALLOW", `${band.role}/${band.authority} ${scope.kind} ${access} ${row.card.id} ${href}`);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked > 40);
});

test("drill-downs: a configured EVS shows the rhythm cards and no product cards it does not own", () => {
  const leader = ids(listEligibleCards(viewer({ role: "GM", authority: "DEPARTMENT_LEADER", scope: evsScope }), capabilityMap()));
  for (const id of ["attention", "coverage", "handoff", "rounds", "shift_now", "timeline", "records_due", "maintenance_open"]) {
    assert.ok(leader.includes(id), id);
  }
  for (const id of ["menu_today", "pm_due", "request_triage", "expected_work", "requests_filed"]) {
    assert.equal(leader.includes(id), false, id);
  }
});

test("calm state: an installed, unconfigured EVS shows setup reasons to leaders only", () => {
  const unconfigured = capabilityMap(UNCONFIGURED);
  assert.deepEqual(
    unconfigured.get(EVS.id)!.notConfigured.map((row) => row.capability),
    ["locations.runtime", "cycles.published", "coverage.planned"],
  );

  const leader = listEligibleCards(viewer({ role: "GM", authority: "DEPARTMENT_LEADER", scope: evsScope }), unconfigured);
  const setupForms = leader.filter((row) => row.form === "not_configured");
  assert.deepEqual(
    setupForms.map((row) => [row.card.id, row.notConfigured!.capability]).sort(),
    [
      ["coverage", "coverage.planned"],
      ["handoff", "locations.runtime"],
      ["rounds", "locations.runtime"],
      ["shift_now", "cycles.published"],
      ["team_comparison", "locations.runtime"],
      ["timeline", "cycles.published"],
    ],
  );
  assert.ok(setupForms.every((row) => row.canFix));

  for (const band of [
    { role: "MANAGER" as const, authority: "MANAGER" as const },
    { role: "SUPERVISOR" as const, authority: "SUPERVISOR" as const },
  ]) {
    const rows = listEligibleCards(viewer({ ...band, scope: evsScope }), unconfigured);
    assert.equal(rows.some((row) => row.form === "not_configured"), false, band.role);
    for (const id of ["coverage", "handoff", "rounds", "shift_now", "timeline"]) {
      assert.equal(ids(rows).includes(id), false, `${band.role} sees no empty ${id}`);
    }
  }
});

test("access modes: Facility Administrator in View gets no change actions on EVS cards", () => {
  const rows = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: evsScope, access: "VIEW" }),
    capabilityMap(),
  );
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(row.accessMode, "VIEW", row.card.id);
    assert.equal(row.actionsAllowed, false, row.card.id);
    assert.equal(row.canFix, false, row.card.id);
    if (row.drillDown) assert.equal(row.drillDown.intent, "view", row.card.id);
  }
});

test("access modes: a vendor-run EVS in Summary renders summary models only, with no links", () => {
  const rows = listEligibleCards(
    viewer({ role: "FACILITY_ADMINISTRATOR", authority: "FACILITY_ADMINISTRATOR", scope: evsScope, access: "SUMMARY" }),
    capabilityMap(),
  );
  assert.deepEqual(ids(rows), ["coverage", "department_setup", "records_due", "shift_now", "timeline"]);
  for (const row of rows) {
    assert.equal(row.form, "summary", row.card.id);
    assert.equal(row.drillDown, null, row.card.id);
    assert.equal(row.actionsAllowed, false, row.card.id);
  }
});
