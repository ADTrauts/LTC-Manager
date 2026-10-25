import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { isDepartmentEngineEnabledForFacility } from "@/lib/department-operations";

import {
  deriveDepartmentDashboardCapabilities,
  isDashboardEngineAdmitted,
  NOT_CONFIGURED_MESSAGES,
  resolveDepartmentDashboardCapabilities,
  type DepartmentCapabilityFacts,
} from "./capabilities";

const ENGINE_FLAGS = [
  "DIETARY_OPERATIONAL_CYCLES_ENABLED",
  "DIETARY_WORK_PLANS_ENABLED",
  "DIETARY_ASSET_OPERATIONS_ENABLED",
  "EVS_OPERATIONS_ENABLED",
  "PLANT_OPERATIONS_ENABLED",
] as const;

function withEnv<T>(values: Partial<Record<(typeof ENGINE_FLAGS)[number], string>>, run: () => T): T {
  const previous = new Map(ENGINE_FLAGS.map((key) => [key, process.env[key]]));
  for (const key of ENGINE_FLAGS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function facts(departmentKey: string, overrides: Partial<DepartmentCapabilityFacts> = {}): DepartmentCapabilityFacts {
  return {
    departmentId: `dept-${departmentKey.toLowerCase()}`,
    departmentKey,
    plantRuntimeEnabled: false,
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

const allMissing = {
  hasRuntimeLocations: false,
  hasPublishedCycles: false,
  hasPublishedWorkPlans: false,
  hasCoveragePlan: false,
  hasRoster: false,
  recordEngine: "LEGACY",
  hasPlantRequestRoute: false,
  hasMenuApplicability: false,
} as const;

const sorted = (values: Iterable<string>) => [...values].sort();

test("Food & Nutrition: configured capabilities and no setup reasons", () => {
  withEnv({}, () => {
    const result = deriveDepartmentDashboardCapabilities(facts("DIETARY", { plantRuntimeEnabled: true }));
    assert.equal(result.productKey, "HEALTHCARE_FOOD_NUTRITION");
    assert.deepEqual(
      sorted(result.has),
      sorted([
        "locations.runtime",
        "cycles.published",
        "work.expected",
        "coverage.planned",
        "people.roster",
        "records.canonical",
        "plant.requests.filed",
        "menus",
        "meal.milestones",
        "maintenance.shared",
      ]),
    );
    assert.deepEqual(result.notConfigured, []);
  });
});

test("Food & Nutrition: every declared setup step reports the contract wording", () => {
  withEnv({}, () => {
    const result = deriveDepartmentDashboardCapabilities(facts("DIETARY", allMissing));
    assert.deepEqual(result.notConfigured, [
      { capability: "locations.runtime", message: "No locations are assigned to this Department." },
      { capability: "cycles.published", message: "No Operating Rhythm is published." },
      { capability: "work.expected", message: "No Work Plans are published." },
      { capability: "coverage.planned", message: "No coverage plan is set." },
      { capability: "menus", message: "No Menu is assigned to this Department's locations." },
      { capability: "records.legacy", message: "This Department still uses legacy Records." },
    ]);
    assert.ok(result.has.has("records.legacy"));
    assert.equal(result.has.has("records.canonical"), false);
  });
});

test("retired env switches cannot hide an admitted engine", () => {
  withEnv({ DIETARY_OPERATIONAL_CYCLES_ENABLED: "false", DIETARY_WORK_PLANS_ENABLED: "false" }, () => {
    const configured = deriveDepartmentDashboardCapabilities(facts("DIETARY"));
    assert.equal(configured.has.has("cycles.published"), true);
    assert.equal(configured.has.has("work.expected"), true);
    const missing = deriveDepartmentDashboardCapabilities(facts("DIETARY", allMissing));
    const reasons = missing.notConfigured.map((row) => row.capability);
    assert.equal(reasons.includes("cycles.published"), true);
    assert.equal(reasons.includes("work.expected"), true);
  });
});

test("fail closed: a failed source contributes no capability and no reason", () => {
  withEnv({}, () => {
    const result = deriveDepartmentDashboardCapabilities(
      facts("DIETARY", {
        hasRuntimeLocations: null,
        hasPublishedCycles: null,
        hasPublishedWorkPlans: null,
        hasCoveragePlan: null,
        hasRoster: null,
        recordEngine: null,
        hasPlantRequestRoute: null,
        hasMenuApplicability: null,
      }),
    );
    assert.deepEqual(sorted(result.has), ["maintenance.shared", "meal.milestones"]);
    assert.deepEqual(result.notConfigured, []);
  });
});

test("Plant: maintenance follows Plant runtime; a disabled Plant says so", () => {
  withEnv({}, () => {
    const off = deriveDepartmentDashboardCapabilities(facts("PLANT", { plantRuntimeEnabled: false }));
    assert.equal(off.productKey, "PLANT");
    assert.equal(off.has.has("plant.maintenance"), false);
    assert.equal(off.has.has("maintenance.shared"), false);
    assert.equal(off.has.has("cycles.published"), false);
    assert.equal(off.has.has("plant.requests.filed"), false);
    assert.deepEqual(off.notConfigured, [
      { capability: "plant.maintenance", message: NOT_CONFIGURED_MESSAGES["plant.maintenance"] },
    ]);

    const on = deriveDepartmentDashboardCapabilities(facts("PLANT", { plantRuntimeEnabled: true }));
    for (const capability of ["plant.maintenance", "maintenance.shared", "cycles.published", "work.expected"]) {
      assert.ok(on.has.has(capability as never), capability);
    }
    assert.equal(on.has.has("menus"), false, "Plant offers no Menus");
    assert.equal(on.has.has("meal.milestones"), false);
    assert.deepEqual(on.notConfigured, []);
  });
});

test("custom Department: shared engines admitted, people and Work setup steps only", () => {
  withEnv({}, () => {
    const configured = deriveDepartmentDashboardCapabilities(facts("ACTIVITIES"));
    assert.equal(configured.productKey, null);
    for (const capability of ["locations.runtime", "cycles.published", "work.expected", "maintenance.shared"]) {
      assert.ok(configured.has.has(capability as never), capability);
    }
    assert.equal(configured.has.has("menus"), false);
    assert.equal(configured.has.has("meal.milestones"), false);
    assert.equal(configured.has.has("plant.maintenance"), false);

    const missing = deriveDepartmentDashboardCapabilities(facts("ACTIVITIES", allMissing));
    assert.deepEqual(
      missing.notConfigured.map((row) => row.capability),
      ["work.expected", "coverage.planned", "people.roster", "records.legacy"],
    );
  });
});

test("EVS engines stay admitted without a release flag", () => {
  const missing = deriveDepartmentDashboardCapabilities(facts("EVS", allMissing));
  assert.equal(missing.productKey, "EVS");
  assert.equal(missing.has.has("cycles.published"), false);
  assert.equal(missing.has.has("maintenance.shared"), true);
  assert.deepEqual(missing.notConfigured.map((row) => row.capability), ["records.legacy"]);
  assert.ok(deriveDepartmentDashboardCapabilities(facts("EVS")).has.has("cycles.published"));
});

test("engine admission matches isDepartmentEngineEnabledForFacility for every key and flag setting", async () => {
  const settings: Partial<Record<(typeof ENGINE_FLAGS)[number], string>>[] = [
    {},
    {
      DIETARY_OPERATIONAL_CYCLES_ENABLED: "false",
      DIETARY_WORK_PLANS_ENABLED: "false",
      DIETARY_ASSET_OPERATIONS_ENABLED: "true",
      EVS_OPERATIONS_ENABLED: "true",
    },
  ];
  for (const values of settings) {
    for (const key of ["DIETARY", "EVS", "ACTIVITIES"]) {
      for (const feature of ["cycles", "workPlans", "asset"] as const) {
        const expected = await withEnv(values, () => isDepartmentEngineEnabledForFacility("fac-1", feature, key));
        assert.equal(
          withEnv(values, () => isDashboardEngineAdmitted(feature, key, false)),
          expected,
          `${key} ${feature} ${JSON.stringify(values)}`,
        );
      }
    }
  }
  for (const plantRuntimeEnabled of [true, false]) {
    for (const feature of ["cycles", "workPlans", "asset"] as const) {
      assert.equal(isDashboardEngineAdmitted(feature, "PLANT", plantRuntimeEnabled), plantRuntimeEnabled);
    }
  }
});

type Call = { model: string; where: unknown };

function fakeCapabilityDb(options: { failing?: string } = {}) {
  const calls: Call[] = [];
  function model(name: string, rows: unknown[]) {
    return {
      findMany: async (args: { where: unknown }) => {
        calls.push({ model: name, where: args.where });
        if (options.failing === name) throw new Error(`${name} unavailable`);
        return rows;
      },
    };
  }
  const db = {
    unitSpaceResponsibility: model("unitSpaceResponsibility", [{ departmentId: "dept-fn" }, { departmentId: "dept-act" }]),
    departmentOperationalCycle: model("departmentOperationalCycle", [
      { departmentId: "dept-fn", applicableDaysOfWeek: [2] },
      { departmentId: "dept-act", applicableDaysOfWeek: [0, 6] },
    ]),
    departmentWorkPlan: model("departmentWorkPlan", [
      { departmentId: "dept-act", weekdays: [] },
      { departmentId: "dept-fn", weekdays: [3] },
    ]),
    operationalAssignmentTemplate: model("operationalAssignmentTemplate", [{ departmentId: "dept-fn" }]),
    operationalAssignment: model("operationalAssignment", [{ departmentId: "dept-act" }]),
    department: model("department", [
      { id: "dept-fn", _count: { employeesAsPrimary: 4, employeeDepartments: 0 } },
      { id: "dept-act", _count: { employeesAsPrimary: 0, employeeDepartments: 0 } },
      { id: "dept-plant", _count: { employeesAsPrimary: 0, employeeDepartments: 2 } },
    ]),
    recordEngineRollout: model("recordEngineRollout", [
      { facilityId: "fac-1", departmentId: "dept-fn", mode: "CANONICAL", effectiveFromServiceDate: "2026-10-01" },
      { facilityId: "fac-1", departmentId: "dept-act", mode: "CANONICAL", effectiveFromServiceDate: "2026-11-01" },
    ]),
    departmentRequestRoute: model("departmentRequestRoute", [{ requestingDepartmentId: "dept-fn" }]),
    menu: model("menu", [{ departmentId: "dept-fn" }]),
  };
  return { db: db as unknown as PrismaClient, calls };
}

const viewer = {
  facilityId: "fac-1",
  serviceDate: "2026-10-20",
  session: { facilityId: "fac-1", role: "FACILITY_ADMINISTRATOR", authKind: "user" } as FacilitySession,
  departments: [
    { id: "dept-fn", key: "DIETARY", name: "Food & Nutrition", sortOrder: 1 },
    { id: "dept-plant", key: "PLANT", name: "Plant Operations", sortOrder: 2 },
    { id: "dept-act", key: "ACTIVITIES", name: "Activities", sortOrder: 3 },
  ],
};

test("resolver: one query per source for every Department, derived per service date", async () => {
  const { db, calls } = fakeCapabilityDb();
  const result = await withEnv({}, () =>
    resolveDepartmentDashboardCapabilities(viewer, {
      db,
      plantRuntimeEnabled: true,
      canonicalLogsEnabled: true,
      operationalAssignmentsEnabled: true,
    }),
  );
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(call.model, (counts.get(call.model) ?? 0) + 1);
  for (const [name, count] of counts) assert.equal(count, 1, name);
  const menuCall = calls.find((call) => call.model === "menu")!;
  assert.deepEqual((menuCall.where as { departmentId: unknown }).departmentId, { in: ["dept-fn"] });

  const fn = result.get("dept-fn")!;
  assert.ok(fn.has.has("cycles.published"), "Tuesday cycle applies");
  assert.equal(fn.has.has("work.expected"), false, "Wednesday-only Work Plan does not");
  assert.ok(fn.has.has("records.canonical"));
  assert.ok(fn.has.has("plant.requests.filed"));
  assert.ok(fn.has.has("menus"));

  const activities = result.get("dept-act")!;
  assert.equal(activities.has.has("cycles.published"), false, "weekend cycle");
  assert.ok(activities.has.has("work.expected"), "every-day Work Plan");
  assert.ok(activities.has.has("coverage.planned"), "today's assignment counts as a coverage plan");
  assert.ok(activities.has.has("records.canonical"), "a Department with no rollout row uses the forward engine");
  assert.deepEqual(
    activities.notConfigured.map((row) => row.capability),
    ["people.roster"],
  );

  const plant = result.get("dept-plant")!;
  assert.ok(plant.has.has("plant.maintenance"));
  assert.ok(plant.has.has("people.roster"), "additional-Department members count");
});

test("resolver: a failing source fails closed for that capability only", async () => {
  const { db } = fakeCapabilityDb({ failing: "departmentWorkPlan" });
  const result = await withEnv({}, () =>
    resolveDepartmentDashboardCapabilities(viewer, {
      db,
      plantRuntimeEnabled: false,
      canonicalLogsEnabled: true,
      operationalAssignmentsEnabled: false,
    }),
  );
  const activities = result.get("dept-act")!;
  assert.equal(activities.has.has("work.expected"), false);
  assert.equal(activities.notConfigured.some((row) => row.capability === "work.expected"), false);
  assert.ok(activities.has.has("locations.runtime"));
  assert.equal(activities.has.has("coverage.planned"), false, "assignments are not read when that flag is off");
  assert.equal(result.get("dept-fn")!.has.has("plant.requests.filed"), false, "Plant runtime off");
});

test("resolver: Plant request routes are not read when Plant runtime is off", async () => {
  const { db, calls } = fakeCapabilityDb();
  await withEnv({}, () =>
    resolveDepartmentDashboardCapabilities(viewer, {
      db,
      plantRuntimeEnabled: false,
      canonicalLogsEnabled: false,
      operationalAssignmentsEnabled: false,
    }),
  );
  assert.equal(calls.some((call) => call.model === "departmentRequestRoute"), false);
  assert.equal(calls.some((call) => call.model === "operationalAssignment"), false);
});
