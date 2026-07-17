/**
 * Wave 15E — Projection Shadow parity tests.
 *
 * Report-only. Does not cut over surfaces or mutate Projection/legacy loaders.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
} from "./fixtures";
import type { ProjectionSnapshot } from "./types";

import {
  adaptLegacyEligibilityToShadowView,
  adaptProjectionSnapshotToShadowView,
  compareProjectionSnapshotsForShadow,
  compareShadowViews,
  formatShadowParityLog,
  type LegacyShadowInput,
} from "./shadow";

const FACILITY_ID = "facility_maplewood";
const UNIT_ID = "unit_kensington";
const SERVERY_SPACE = "space_kensington_servery";
const RESIDENT_SPACE = "space_resident_101";

function dietaryLegacy(options?: {
  capabilities?: readonly string[];
  lockedUnitId?: string;
  allowedUnitIds?: readonly string[] | "ALL";
}): LegacyShadowInput {
  return {
    facilityId: FACILITY_ID,
    lensKey: "department:DIETARY",
    departmentKeys: ["DIETARY"],
    sidebarUnitIds: [UNIT_ID, "unit_ground_floor"],
    allowedUnitIds: options?.allowedUnitIds ?? "ALL",
    lockedUnitId: options?.lockedUnitId,
    rooms: [
      {
        roomId: SERVERY_SPACE,
        locationId: "loc:servery",
        unitId: UNIT_ID,
        departmentId: "dept_dietary",
        departmentKey: "DIETARY",
        capabilities: options?.capabilities ?? [
          "MEAL_SERVICE",
          "FOOD_SAFETY",
        ],
        isActive: true,
        isPlaced: true,
      },
    ],
  };
}

function mutateSnapshot(
  snapshot: ProjectionSnapshot,
  mutate: (draft: ProjectionSnapshot) => void,
): ProjectionSnapshot {
  const draft = structuredClone(snapshot) as ProjectionSnapshot;
  mutate(draft);
  return draft;
}

describe("Projection Shadow — adapters", () => {
  it("adapts Dietary golden Projection into a comparable view", () => {
    const view = adaptProjectionSnapshotToShadowView(DIETARY_GOLDEN_PROJECTION);
    assert.equal(view.source, "PROJECTION");
    assert.equal(view.lensKey, "department:DIETARY");
    assert.ok(view.experiences.some((e) => e.experienceKey === "MEAL_SERVICE"));
    assert.ok(view.roomIds.includes(SERVERY_SPACE));
  });

  it("adapts legacy Dietary capabilities into Experiences via compatibility", () => {
    const view = adaptLegacyEligibilityToShadowView(dietaryLegacy());
    assert.deepEqual(
      view.experiences.map((e) => e.experienceKey).sort(),
      ["MEAL_SERVICE", "TEMPERATURE_MONITORING"],
    );
    assert.ok(view.areas.some((area) => area.areaKey === "dietary_service"));
  });

  it("narrows legacy rooms by PIN locked unit", () => {
    const view = adaptLegacyEligibilityToShadowView(
      dietaryLegacy({ lockedUnitId: "other_unit", allowedUnitIds: ["other_unit"] }),
    );
    assert.deepEqual(view.experiences, []);
    assert.deepEqual(view.roomIds, []);
  });
});

describe("Projection Shadow — golden parity", () => {
  it("reports perfect parity for identical snapshots", () => {
    for (const snapshot of [
      DIETARY_GOLDEN_PROJECTION,
      EVS_GOLDEN_PROJECTION,
      PLANT_GOLDEN_PROJECTION,
      PERMISSION_NARROWED_PROJECTION,
      FACILITY_OVERVIEW_GOLDEN_PROJECTION,
    ]) {
      const report = compareProjectionSnapshotsForShadow({
        legacySnapshot: snapshot,
        projectionSnapshot: snapshot,
      });
      assert.equal(report.ok, true, snapshot.metadata.fixtureName);
      assert.equal(report.metrics.mismatchCount, 0, snapshot.metadata.fixtureName);
      assert.equal(report.metrics.parityPercent, 100, snapshot.metadata.fixtureName);
    }
  });

  it("classifies experience mismatches when Projection is broader", () => {
    const broader = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      const meal = draft.experiences[0]!;
      draft.experiences = [
        ...draft.experiences,
        {
          ...meal,
          id: "dept_dietary:PRODUCTION",
          reference: {
            ...meal.reference,
            experienceKey: "PRODUCTION",
            areaKey: "dietary_service",
          },
          label: "Production",
          queryScopeId: "dept_dietary:PRODUCTION:scope",
        },
      ];
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "EXPERIENCE_MISMATCH" &&
          mismatch.severity === "ERROR",
      ),
    );
  });

  it("classifies missing rooms as warnings when Projection is narrower", () => {
    const narrower = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      draft.locations.actionableIds = [];
      draft.experiences = draft.experiences.map((experience) => ({
        ...experience,
        reference: { ...experience.reference, locationIds: [] },
      }));
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: narrower,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "MISSING_ROOM" && mismatch.severity === "WARNING",
      ),
    );
  });

  it("classifies permission broadening as critical", () => {
    const broader = mutateSnapshot(PERMISSION_NARROWED_PROJECTION, (draft) => {
      draft.experiences = draft.experiences.map((experience) => ({
        ...experience,
        permissions: {
          ...experience.permissions,
          allowedActionKeys: [
            ...experience.permissions.allowedActionKeys,
            "meal_service.submit",
          ],
        },
      }));
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: PERMISSION_NARROWED_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "PERMISSION_MISMATCH" &&
          mismatch.severity === "CRITICAL",
      ),
    );
    assert.equal(report.ok, false);
  });

  it("classifies ordering mismatches as info", () => {
    const reordered = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      draft.areas = draft.areas.map((area, index) =>
        index === 0 ? { ...area, order: 999 } : area,
      );
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: reordered,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "ORDERING_MISMATCH" && mismatch.severity === "INFO",
      ),
    );
  });

  it("classifies Plant coverage differences as warnings", () => {
    const withoutPlant = mutateSnapshot(PLANT_GOLDEN_PROJECTION, (draft) => {
      draft.plantPolicy = {
        applied: false,
        createsRoomAssignments: false,
        coveredLocationIds: [],
      };
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: withoutPlant,
      projectionSnapshot: PLANT_GOLDEN_PROJECTION,
    });
    assert.ok(
      report.mismatches.some((mismatch) => mismatch.kind === "PLANT_MISMATCH"),
    );
  });

  it("classifies scope broadening as critical", () => {
    const broader = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      const scopes = { ...draft.queryScopes.byExperience };
      for (const [id, scope] of Object.entries(scopes)) {
        scopes[id] = {
          ...scope,
          spaceIds: [...scope.spaceIds, "space_extra"],
          unitIds: [...scope.unitIds, "unit_extra"],
        };
      }
      draft.queryScopes = { ...draft.queryScopes, byExperience: scopes };
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "SCOPE_MISMATCH" &&
          mismatch.severity === "CRITICAL",
      ),
    );
  });
});

describe("Projection Shadow — legacy vs Projection", () => {
  it("compares Dietary legacy capabilities to Dietary golden Projection", () => {
    const legacy = adaptLegacyEligibilityToShadowView(dietaryLegacy());
    const projection = adaptProjectionSnapshotToShadowView(
      DIETARY_GOLDEN_PROJECTION,
    );
    const report = compareShadowViews(legacy, projection);
    assert.ok(report.metrics.comparedSlotCount > 0);
    assert.ok(
      report.projection.experiences.some(
        (experience) => experience.experienceKey === "MEAL_SERVICE",
      ),
    );
    // Sidebar units appear as unit:* locations in legacy; Projection tree may
    // include facility/floor/neighborhood ids — expect location diffs.
    assert.ok(typeof report.metrics.parityPercent === "number");
  });

  it("flags Plant Projection coverage against assignment-only legacy", () => {
    const legacy = adaptLegacyEligibilityToShadowView({
      facilityId: FACILITY_ID,
      lensKey: "department:PLANT",
      departmentKeys: ["PLANT"],
      sidebarUnitIds: [UNIT_ID],
      plantApplied: false,
      plantCoveredLocationIds: [],
      rooms: [
        {
          roomId: RESIDENT_SPACE,
          locationId: "loc:resident_101",
          unitId: UNIT_ID,
          departmentId: "dept_plant",
          departmentKey: "PLANT",
          capabilities: ["REPAIRS"],
          isActive: true,
          isPlaced: true,
        },
      ],
    });
    const projection = adaptProjectionSnapshotToShadowView(PLANT_GOLDEN_PROJECTION);
    const report = compareShadowViews(legacy, projection);
    assert.ok(
      report.mismatches.some((mismatch) => mismatch.kind === "PLANT_MISMATCH"),
    );
  });

  it("preserves Facility Overview department composition in Projection view", () => {
    const view = adaptProjectionSnapshotToShadowView(
      FACILITY_OVERVIEW_GOLDEN_PROJECTION,
    );
    assert.equal(view.lensKey, "facility");
    assert.deepEqual(view.departmentKeys, ["DIETARY", "EVS", "PLANT"]);
    assert.ok(view.experiences.length > 0);
  });

  it("emits structured parity logs without analytics payloads", () => {
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: DIETARY_GOLDEN_PROJECTION,
    });
    const log = formatShadowParityLog(report);
    assert.equal(log.event, "projection.shadow.parity");
    assert.equal(log.ok, true);
    assert.equal("userId" in log, false);
  });

  it("classifies empty department legacy as narrow Projection-safe warnings", () => {
    const legacy = adaptLegacyEligibilityToShadowView({
      facilityId: FACILITY_ID,
      lensKey: "department:DIETARY",
      departmentKeys: ["DIETARY"],
      sidebarUnitIds: [UNIT_ID],
      rooms: [],
    });
    const projection = adaptProjectionSnapshotToShadowView(
      DIETARY_GOLDEN_PROJECTION,
    );
    const report = compareShadowViews(legacy, projection);
    assert.ok(
      report.mismatches.some(
        (mismatch) => mismatch.kind === "EXPERIENCE_MISMATCH",
      ),
    );
  });
});
