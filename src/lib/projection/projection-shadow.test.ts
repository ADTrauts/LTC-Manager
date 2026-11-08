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
          "TEMPERATURE_MONITORING",
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
    assert.equal("experiences" in view, false);
    assert.ok(view.roomIds.includes(SERVERY_SPACE));
  });

  it("adapts legacy Dietary rooms into the shadow view", () => {
    const view = adaptLegacyEligibilityToShadowView(dietaryLegacy());
    assert.deepEqual(view.roomIds, [SERVERY_SPACE]);
    assert.ok(view.locationIds.includes("loc:servery"));
    assert.equal("experiences" in view, false);
  });

  it("narrows legacy rooms by PIN locked unit", () => {
    const view = adaptLegacyEligibilityToShadowView(
      dietaryLegacy({ lockedUnitId: "other_unit", allowedUnitIds: ["other_unit"] }),
    );
    assert.deepEqual(view.roomIds, []);
    assert.deepEqual(view.actionableLocationIds, []);
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

  it("classifies an extra room as an error when Projection is broader", () => {
    const broader = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      const extraId = "loc:space_extra";
      draft.locations.byId[extraId] = {
        reference: { kind: "SPACE", spaceId: "space_extra" },
      } as (typeof draft.locations.byId)[string];
      draft.locations.actionableIds = [...draft.locations.actionableIds, extraId];
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.equal(report.ok, false);
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "EXTRA_ROOM" &&
          mismatch.severity === "ERROR",
      ),
    );
  });

  it("classifies missing rooms as warnings when Projection is narrower", () => {
    const narrower = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      draft.locations.actionableIds = [];
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

  it("classifies an extra location as an error when Projection is broader", () => {
    const broader = mutateSnapshot(PERMISSION_NARROWED_PROJECTION, (draft) => {
      draft.locations.byId["loc:unit_extra"] = {
        reference: { kind: "UNIT", unitId: "unit_extra" },
      } as (typeof draft.locations.byId)[string];
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: PERMISSION_NARROWED_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "EXTRA_LOCATION" &&
          mismatch.severity === "ERROR",
      ),
    );
    assert.equal(report.ok, false);
  });

  it("classifies revision mismatches as info", () => {
    const reordered = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      draft.context.identity.revision.hierarchyRevision = "hierarchy:changed";
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: reordered,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "REVISION_MISMATCH" && mismatch.severity === "INFO",
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

  it("classifies a broader location set as an error", () => {
    const broader = mutateSnapshot(DIETARY_GOLDEN_PROJECTION, (draft) => {
      draft.locations.byId["loc:unit_extra"] = {
        reference: { kind: "UNIT", unitId: "unit_extra" },
      } as (typeof draft.locations.byId)[string];
    });
    const report = compareProjectionSnapshotsForShadow({
      legacySnapshot: DIETARY_GOLDEN_PROJECTION,
      projectionSnapshot: broader,
    });
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "EXTRA_LOCATION" &&
          mismatch.severity === "ERROR",
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
    assert.equal("experiences" in report.projection, false);
    assert.ok(report.projection.roomIds.includes(SERVERY_SPACE));
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
          capabilities: ["WORK_ORDERS"],
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
    assert.ok(view.locationIds.length > 0);
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

  it("classifies empty legacy rooms as extra rooms on Projection", () => {
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
    assert.equal(report.ok, false);
    assert.ok(
      report.mismatches.some(
        (mismatch) =>
          mismatch.kind === "EXTRA_ROOM" && mismatch.severity === "ERROR",
      ),
    );
  });
});
