/**
 * Run Record Location Function projection.
 * Same department, same ACTIVE profile, same functionKey → same room set
 * as Cycles, Work, and Audit.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";
import {
  assignmentsFromBindings,
  operationalTypeKeysForSpaces,
  selectProfileIdForOperationalTypes,
  type OperationalTypeBindingRow,
} from "@/lib/operational-cycles/load-operational-type-targets";
import {
  historicalOtAssignmentsFromBindings,
  selectHistoricalProfileForServiceDate,
} from "@/lib/operational-review/historical-operational-type";
import type { ReviewOtBindingFact, ReviewProfileFact } from "@/lib/operational-review/types";

import {
  bindOperationalTypeRequirementToSpace,
  expandOperationalTypeSpaces,
  matchLogAttachmentToLocation,
  type LocationLogAttachmentRow,
} from "./log-operational-type-applicability";

const FOOD = "food_service_area";
const SUPPORT = "service_support";

function binding(spaceId: string, key: string, name: string): OperationalTypeBindingRow {
  return { unitSpaceId: spaceId, archetype: { key, name, isActive: true } };
}

function roomsFor(rows: readonly OperationalTypeBindingRow[], functionKey: string): string[] {
  return expandOperationalTypeSpaces(assignmentsFromBindings(rows), functionKey).sort();
}

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("A. a bound room receives the Location Function requirement", () => {
  const assignments = assignmentsFromBindings([
    binding("room-a", FOOD, "Food Service Area"),
  ]);
  assert.deepEqual(expandOperationalTypeSpaces(assignments, FOOD), ["room-a"]);
  assert.deepEqual(expandOperationalTypeSpaces(assignments, FOOD).includes("room-b"), false);
  assert.deepEqual(operationalTypeKeysForSpaces(assignments, ["room-a", "room-b"]), [FOOD]);

  const bound = bindOperationalTypeRequirementToSpace(
    {
      requirementKey: "unresolved",
      attachmentId: "att",
      attachmentStableKey: "att_temp",
      catalogStableKey: "cooler_temperature",
      catalogVersion: 1,
      catalogName: "Cooler",
      purposeType: "LOG",
      facilityId: "fac",
      departmentId: "dietary",
      operationalDateKey: "2026-10-01",
      timingSource: "DAILY_WINDOWS",
      scheduleKind: "FIXED_DAILY_WINDOW",
      cycleStableKey: null,
      cycleLabel: null,
      windowStartLocal: "05:00",
      windowEndLocal: "11:00",
      windowStartsAt: null,
      windowEndsAt: null,
      target: { kind: "OPERATIONAL_TYPE", operationalTypeKey: FOOD, resolvedSpaceId: null },
      productState: "DUE",
      productStateLabel: "Due",
      needsSupervisorReview: false,
      recordId: null,
      recordStatus: null,
      fields: [],
      instructions: null,
    },
    "room-a",
  );
  assert.equal(bound.target.kind === "OPERATIONAL_TYPE" && bound.target.resolvedSpaceId, "room-a");
  assert.match(bound.requirementKey, /room-a/);
  assert.match(bound.requirementKey, new RegExp(`ot:${FOOD}`));
});

test("B. no bound rooms yields zero Run requirements", () => {
  assert.deepEqual(roomsFor([], FOOD), []);
  const inactive = assignmentsFromBindings([
    { unitSpaceId: "room-a", archetype: { key: FOOD, name: "Food Service Area", isActive: false } },
  ]);
  assert.deepEqual(expandOperationalTypeSpaces(inactive, FOOD), []);
  const namedOnly = assignmentsFromBindings([
    binding("servery", SUPPORT, "Servery"),
  ]);
  assert.deepEqual(expandOperationalTypeSpaces(namedOnly, FOOD), []);
});

test("C. Build preview uses the working draft; Run uses the published profile", () => {
  const profiles = [
    { id: "published", status: "ACTIVE" as const },
    { id: "draft", status: "DRAFT" as const },
  ];
  assert.equal(selectProfileIdForOperationalTypes(profiles, "runtime"), "published");
  assert.equal(selectProfileIdForOperationalTypes(profiles, "working"), "draft");

  const publishedRooms = roomsFor([binding("room-a", FOOD, "Food Service Area")], FOOD);
  const draftRooms = roomsFor([binding("room-b", FOOD, "Food Service Area")], FOOD);
  assert.deepEqual(publishedRooms, ["room-a"]);
  assert.deepEqual(draftRooms, ["room-b"]);

  const afterPublish = [{ id: "draft", status: "ACTIVE" as const }];
  assert.equal(selectProfileIdForOperationalTypes(afterPublish, "runtime"), "draft");
  assert.deepEqual(draftRooms, ["room-b"]);
});

test("D. a Dietary requirement does not use an EVS binding on the same room", () => {
  const dietary = assignmentsFromBindings([binding("naval", FOOD, "Food Service Area")]);
  const evs = assignmentsFromBindings([binding("naval", SUPPORT, "Service / Support Area")]);
  assert.deepEqual(expandOperationalTypeSpaces(dietary, FOOD), ["naval"]);
  assert.deepEqual(expandOperationalTypeSpaces(evs, FOOD), []);
  assert.deepEqual(expandOperationalTypeSpaces(evs, SUPPORT), ["naval"]);

  const attachment: LocationLogAttachmentRow = {
    id: "att",
    departmentId: "dietary",
    catalogStableKey: "cooler_temperature",
    catalogVersion: 1,
    label: "Cooler",
    targetKind: "OPERATIONAL_TYPE",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: FOOD,
    assetId: null,
    status: "ACTIVE",
  };
  assert.equal(
    matchLogAttachmentToLocation(attachment, {
      facilityId: "fac",
      departmentId: "evs",
      spaceId: "naval",
      unitId: null,
      operationalTypeKey: FOOD,
      operationalTypeName: "Food Service Area",
    }),
    null,
  );
  assert.equal(
    matchLogAttachmentToLocation(attachment, {
      facilityId: "fac",
      departmentId: "dietary",
      spaceId: "naval",
      unitId: null,
      operationalTypeKey: SUPPORT,
      operationalTypeName: "Service / Support Area",
    }),
    null,
  );
  assert.ok(
    matchLogAttachmentToLocation(attachment, {
      facilityId: "fac",
      departmentId: "dietary",
      spaceId: "naval",
      unitId: null,
      operationalTypeKey: FOOD,
      operationalTypeName: "Food Service Area",
    }),
  );
});

test("E. today's Run room set matches Audit for the published profile", () => {
  const serviceDate = "2026-10-01";
  const profiles: ReviewProfileFact[] = [
    {
      id: "published",
      departmentId: "dietary",
      version: 2,
      status: "ACTIVE",
      activatedAt: new Date("2026-09-01T16:00:00.000Z"),
      retiredAt: null,
    },
    {
      id: "draft",
      departmentId: "dietary",
      version: 3,
      status: "DRAFT",
      activatedAt: null,
      retiredAt: null,
    },
  ];
  const selected = selectHistoricalProfileForServiceDate(profiles, {
    departmentId: "dietary",
    serviceDateKey: serviceDate,
    timezone: "America/New_York",
  });
  assert.equal(selected.status, "evaluated");
  if (selected.status !== "evaluated") return;
  assert.equal(selectProfileIdForOperationalTypes(profiles, "runtime"), selected.profile.id);
  assert.equal(selectProfileIdForOperationalTypes(profiles, "working"), "draft");

  const bindings: ReviewOtBindingFact[] = [
    {
      profileId: "published",
      spaceId: "room-a",
      operationalTypeKey: FOOD,
      operationalTypeName: "Food Service Area",
      archetypeIsActive: true,
    },
    {
      profileId: "published",
      spaceId: "room-b",
      operationalTypeKey: SUPPORT,
      operationalTypeName: "Service / Support Area",
      archetypeIsActive: true,
    },
    {
      profileId: "draft",
      spaceId: "room-b",
      operationalTypeKey: FOOD,
      operationalTypeName: "Food Service Area",
      archetypeIsActive: true,
    },
  ];
  const auditRooms = expandOperationalTypeSpaces(
    historicalOtAssignmentsFromBindings(bindings, selected.profile.id),
    FOOD,
  ).sort();
  const runRooms = roomsFor(
    bindings
      .filter((row) => row.profileId === "published")
      .map((row) => binding(row.spaceId, row.operationalTypeKey, row.operationalTypeName)),
    FOOD,
  );
  assert.deepEqual(runRooms, ["room-a"]);
  assert.deepEqual(auditRooms, runRooms);
});

test("F. explicit room and department requirements stay on their own targets", () => {
  const explicit = matchLogAttachmentToLocation(
    {
      id: "space-att",
      departmentId: "dietary",
      catalogStableKey: "cooler_temperature",
      catalogVersion: 1,
      label: "Cooler",
      targetKind: "SPACE",
      spaceId: "room-a",
      unitId: null,
      targetDepartmentId: null,
      operationalTypeKey: null,
      assetId: null,
      status: "ACTIVE",
    },
    {
      facilityId: "fac",
      departmentId: "dietary",
      spaceId: "room-a",
      unitId: null,
      operationalTypeKey: null,
      operationalTypeName: null,
    },
  );
  assert.equal(explicit?.source, "EXPLICIT_LOCATION");

  const departmentWide = matchLogAttachmentToLocation(
    {
      id: "dept-att",
      departmentId: "dietary",
      catalogStableKey: "cooler_temperature",
      catalogVersion: 1,
      label: "Cooler",
      targetKind: "DEPARTMENT",
      spaceId: null,
      unitId: null,
      targetDepartmentId: "dietary",
      operationalTypeKey: null,
      assetId: null,
      status: "ACTIVE",
    },
    {
      facilityId: "fac",
      departmentId: "dietary",
      spaceId: "room-a",
      unitId: null,
      operationalTypeKey: FOOD,
      operationalTypeName: "Food Service Area",
    },
  );
  assert.equal(departmentWide?.source, "DEPARTMENT_WIDE");

  const legacy = buildLogRequirementKey({
    attachmentStableKey: "att_cooler",
    catalogStableKey: "cooler_temperature",
    scheduleKind: "FIXED_DAILY_WINDOW",
    windowStartLocal: "05:00",
    windowEndLocal: "11:00",
    target: { kind: "OPERATIONAL_TYPE", operationalTypeKey: "servery", resolvedSpaceId: "3a" },
    operationalDateKey: "2026-09-21",
  });
  assert.match(legacy, /ot:servery/);
  assert.match(legacy, /3a/);

  const book = source("src/lib/canonical-logs/load-run-requirements.ts");
  const target = source("src/lib/canonical-logs/load-target-run-logs.ts");
  assert.match(book, /const spaceIds = \[null\]/);
  assert.match(target, /targetRunAttachmentWhere/);
  assert.match(target, /kind !== "SPACE"/);
});

test("Run, Cycles, Work, and Audit share the Location Function room filter", () => {
  const runRequirements = source("src/lib/canonical-logs/load-run-requirements.ts");
  const targetRun = source("src/lib/canonical-logs/load-target-run-logs.ts");
  const audit = source("src/lib/audit/audit-records.ts");
  const work = source("src/lib/department-work/load-runtime-work.ts");
  const cycles = source("src/lib/operational-cycles/load-supervisor-cycle-overview.ts");
  for (const text of [runRequirements, targetRun, work, cycles]) {
    assert.match(text, /loadSpaceOperationalTypeAssignments/);
    assert.match(text, /perspective:\s*"runtime"/);
    assert.doesNotMatch(text, /perspective:\s*"working"/);
  }
  assert.match(runRequirements, /expandOperationalTypeSpaces/);
  assert.match(targetRun, /expandOperationalTypeSpaces/);
  assert.match(audit, /expandOperationalTypeSpaces/);
  assert.match(audit, /selectHistoricalProfileForServiceDate/);
  assert.doesNotMatch(runRequirements, /unitType|spaceType/);
  assert.doesNotMatch(targetRun, /unitType|spaceType/);
});
