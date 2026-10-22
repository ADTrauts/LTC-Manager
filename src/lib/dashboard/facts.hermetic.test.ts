import assert from "node:assert/strict";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import { TRIAGE_ELIGIBLE_STATUSES } from "@/lib/operational-requests/types";

import { createDashboardFactPack, scopeDepartmentIdsFor, type DashboardFactSources } from "./facts";
import type { DashboardScope, DashboardViewer } from "./viewer/types";

const FN = { id: "dept-fn", key: "DIETARY", name: "Food & Nutrition", sortOrder: 1 };
const PLANT = { id: "dept-plant", key: "PLANT", name: "Plant Operations", sortOrder: 2 };
const NOW = new Date("2026-10-20T16:00:00.000Z");

function viewer(scope: DashboardScope | null, departments = [FN, PLANT]): DashboardViewer {
  return {
    facilityId: "fac-1",
    facilityTimezone: "America/New_York",
    serviceDate: "2026-10-20",
    session: { facilityId: "fac-1", role: "MANAGER", authKind: "user", uid: "u1" } as FacilitySession,
    role: "MANAGER",
    authority: "FACILITY_ADMINISTRATOR",
    employeeId: null,
    layoutOwner: null,
    ledDepartmentIds: [],
    departments,
    scopeDepartmentIds: departments.map((row) => row.id),
    departmentAccess: Object.fromEntries(departments.map((row) => [row.id, "MANAGE" as const])),
    operators: {},
    scope,
    availableScopes: scope ? [scope] : [],
    notices: [],
    canCustomize: false,
    routeFlags: { todaysWorkEnabled: true },
  };
}

type Recorded = { name: string; args: unknown[] };

function fakeSources(options: { canTriage?: boolean; view?: boolean } = {}) {
  const calls: Recorded[] = [];
  const record =
    <T,>(name: string, result: T) =>
    async (...args: unknown[]) => {
      calls.push({ name, args });
      return result;
    };
  const sources = {
    now: () => NOW,
    loadLocationsView: record("loadLocationsView", options.view === false ? { view: null } : { view: { departmentSnapshots: [] } }),
    collectActionableLandingSpaces: (() => ({
      refs: [
        { spaceId: "room-1", departmentId: FN.id, unitId: "u1" },
        { spaceId: "room-2", departmentId: FN.id, unitId: "u1" },
        { spaceId: "room-9", departmentId: "dept-elsewhere", unitId: "u9" },
        { spaceId: "shop", departmentId: PLANT.id, unitId: "u2" },
      ],
      ancestry: [],
    })) as unknown,
    loadRuntimeLocationStates: (async (input: { spaceRefs: { spaceId: string }[] }) => {
      calls.push({ name: "loadRuntimeLocationStates", args: [input] });
      return { states: input.spaceRefs.map((ref) => ({ spaceId: ref.spaceId })), stats: {} };
    }) as unknown,
    loadDepartmentRunPresentation: record("loadDepartmentRunPresentation", { presentation: true }),
    loadGmCycleSummary: record("loadGmCycleSummary", null),
    loadTodaysExpectedWork: record("loadTodaysExpectedWork", { expected: true }),
    loadSupervisorDailyCoverage: record("loadSupervisorDailyCoverage", {}),
    loadPresenceCallOffs: record("loadPresenceCallOffs", { items: [], summary: { total: 0, open: 0, covered: 0 }, dateIso: "2026-10-20" }),
    loadSupervisorAssetExceptions: record("loadSupervisorAssetExceptions", []),
    listWorkOrders: record("listWorkOrders", []),
    loadPmRunBoard: record("loadPmRunBoard", {}),
    resolvePlantOperationsAuthority: record("resolvePlantOperationsAuthority", { canTriage: options.canTriage ?? false }),
    listPlantTriageQueue: record("listPlantTriageQueue", []),
    loadFacilityRunLogRequirements: record("loadFacilityRunLogRequirements", { requirements: [{ requirementKey: "r1" }] }),
    loadWorkspaceNonOperationalExtras: record("loadWorkspaceNonOperationalExtras", { activity: {} }),
    db: {} as never,
  } as unknown as Partial<DashboardFactSources>;
  const count = (name: string) => calls.filter((call) => call.name === name).length;
  const argsOf = (name: string) => calls.find((call) => call.name === name)?.args;
  return { sources, calls, count, argsOf };
}

test("scope Departments: Facility covers all, Department and Team cover one, no scope covers none", () => {
  assert.deepEqual(scopeDepartmentIdsFor(viewer({ kind: "FACILITY" })), [FN.id, PLANT.id]);
  assert.deepEqual(scopeDepartmentIdsFor(viewer({ kind: "DEPARTMENT", departmentId: PLANT.id })), [PLANT.id]);
  assert.deepEqual(
    scopeDepartmentIdsFor(viewer({ kind: "TEAM", departmentId: FN.id, teamIds: [], roomIds: [] })),
    [FN.id],
  );
  assert.deepEqual(scopeDepartmentIdsFor(viewer(null)), []);
  assert.deepEqual(scopeDepartmentIdsFor(viewer({ kind: "DEPARTMENT", departmentId: "dept-forged" })), []);
});

test("memo: each fact loads once per pack, and expected work reuses the run presentation", async () => {
  const fake = fakeSources();
  const pack = createDashboardFactPack(viewer({ kind: "DEPARTMENT", departmentId: FN.id }), fake.sources);
  assert.equal(pack.now, NOW);
  await Promise.all([pack.runPresentation(FN.id), pack.runPresentation(FN.id), pack.expectedWork(FN.id)]);
  await pack.expectedWork(FN.id);
  await Promise.all([pack.runtimeLocations(), pack.runtimeLocations()]);
  assert.equal(fake.count("loadDepartmentRunPresentation"), 1);
  assert.equal(fake.count("loadTodaysExpectedWork"), 1);
  assert.equal(fake.count("loadLocationsView"), 1);
  assert.deepEqual(
    (fake.argsOf("loadTodaysExpectedWork")![0] as { runPresentation: unknown }).runPresentation,
    { presentation: true },
  );

  const second = createDashboardFactPack(viewer({ kind: "DEPARTMENT", departmentId: FN.id }), fake.sources);
  await second.runPresentation(FN.id);
  assert.equal(fake.count("loadDepartmentRunPresentation"), 2, "a new request gets a new pack");
});

test("scope assertion: a Department outside the current scope is refused before any load", async () => {
  const fake = fakeSources();
  const pack = createDashboardFactPack(viewer({ kind: "DEPARTMENT", departmentId: FN.id }), fake.sources);
  for (const load of [
    () => pack.callOffs(PLANT.id),
    () => pack.pmBoard(PLANT.id),
    () => pack.triage(PLANT.id),
    () => pack.runLogRequirements("dept-elsewhere"),
  ]) {
    await assert.rejects(load, /outside the viewer's scope/);
  }
  assert.equal(fake.calls.length, 0);

  const facility = createDashboardFactPack(viewer({ kind: "FACILITY" }), fake.sources);
  await facility.callOffs(PLANT.id);
  assert.deepEqual(fake.argsOf("loadPresenceCallOffs"), ["fac-1", { departmentId: PLANT.id }]);
});

test("runtime locations: lens follows the scope; refs keep scope Departments, Team keeps its rooms", async () => {
  const facilityFake = fakeSources();
  const facilityStates = await createDashboardFactPack(viewer({ kind: "FACILITY" }), facilityFake.sources).runtimeLocations();
  assert.deepEqual((facilityFake.argsOf("loadLocationsView")![1] as { lensOverride: unknown }).lensOverride, {
    mode: "FACILITY",
  });
  assert.deepEqual(
    facilityStates.map((state) => (state as unknown as { spaceId: string }).spaceId),
    ["room-1", "room-2", "shop"],
  );
  const runtimeInput = facilityFake.argsOf("loadRuntimeLocationStates")![0] as { now: Date; facilityId: string };
  assert.equal(runtimeInput.now, NOW);
  assert.equal(runtimeInput.facilityId, "fac-1");

  const teamFake = fakeSources();
  const teamScope: DashboardScope = { kind: "TEAM", departmentId: FN.id, teamIds: ["t1"], roomIds: ["room-2"] };
  const teamPack = createDashboardFactPack(viewer(teamScope), teamFake.sources);
  const teamStates = await teamPack.runtimeLocations();
  assert.deepEqual((teamFake.argsOf("loadLocationsView")![1] as { lensOverride: unknown }).lensOverride, {
    mode: "DEPARTMENT",
    departmentId: FN.id,
    departmentKey: "DIETARY",
  });
  assert.deepEqual(teamStates.map((state) => (state as unknown as { spaceId: string }).spaceId), ["room-2"]);
  await teamPack.runPresentation(FN.id);
  const filter = (teamFake.argsOf("loadDepartmentRunPresentation")![0] as { spaceIdFilter?: ReadonlySet<string> })
    .spaceIdFilter;
  assert.deepEqual([...(filter ?? [])], ["room-2"]);

  const noView = fakeSources({ view: false });
  assert.deepEqual(await createDashboardFactPack(viewer({ kind: "FACILITY" }), noView.sources).runtimeLocations(), []);
  assert.equal(noView.count("loadRuntimeLocationStates"), 0);
});

test("triage: only viewers who can triage get the queue", async () => {
  const denied = fakeSources({ canTriage: false });
  assert.equal(await createDashboardFactPack(viewer({ kind: "FACILITY" }), denied.sources).triage(PLANT.id), null);
  assert.equal(denied.count("listPlantTriageQueue"), 0);

  const allowed = fakeSources({ canTriage: true });
  assert.deepEqual(await createDashboardFactPack(viewer({ kind: "FACILITY" }), allowed.sources).triage(PLANT.id), []);
  assert.deepEqual(allowed.argsOf("listPlantTriageQueue"), [
    { facilityId: "fac-1", plantDepartmentId: PLANT.id, status: TRIAGE_ELIGIBLE_STATUSES },
  ]);
});

test("recent activity and Records: scoped Departments, no legacy inspections", async () => {
  const fake = fakeSources();
  const pack = createDashboardFactPack(viewer({ kind: "DEPARTMENT", departmentId: FN.id }), fake.sources);
  await pack.recentActivity();
  assert.deepEqual(fake.argsOf("loadWorkspaceNonOperationalExtras"), [
    { facilityId: "fac-1", departmentIds: [FN.id], includeLegacyInspections: false },
  ]);
  assert.deepEqual(await pack.runLogRequirements(FN.id), [{ requirementKey: "r1" }]);
  const input = fake.argsOf("loadFacilityRunLogRequirements")![0] as { departmentId: string; now: Date };
  assert.equal(input.departmentId, FN.id);
  assert.equal(input.now, NOW);
});
