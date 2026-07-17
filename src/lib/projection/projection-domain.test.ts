import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EXPERIENCE_REGISTRY_VERSION,
  getExperience,
  requireExperience,
} from "@/lib/experiences";

import {
  DIETARY_GOLDEN_PROJECTION,
  EVS_GOLDEN_PROJECTION,
  FACILITY_OVERVIEW_GOLDEN_PROJECTION,
  PERMISSION_NARROWED_PROJECTION,
  PLANT_GOLDEN_PROJECTION,
  PROJECTION_GOLDEN_FIXTURES,
} from "./fixtures";
import type { ProjectionSnapshot } from "./types";
import {
  assertProjectionSnapshotValid,
  validateProjectionSnapshot,
} from "./validation";

function mutableSnapshot(snapshot: ProjectionSnapshot): ProjectionSnapshot {
  return structuredClone(snapshot);
}

function issueCodes(snapshot: ProjectionSnapshot): string[] {
  return validateProjectionSnapshot(snapshot).map((issue) => issue.code);
}

describe("Projection Runtime Foundation — golden fixtures", () => {
  it("validates every golden fixture", () => {
    for (const snapshot of PROJECTION_GOLDEN_FIXTURES) {
      assert.deepEqual(
        validateProjectionSnapshot(snapshot),
        [],
        snapshot.metadata.fixtureName,
      );
      assert.doesNotThrow(() => assertProjectionSnapshotValid(snapshot));
    }
  });

  it("models department snapshots through Areas → Experiences", () => {
    assert.deepEqual(
      DIETARY_GOLDEN_PROJECTION.areas.map((area) => area.areaKey),
      ["dietary_service", "dietary_food_safety"],
    );
    assert.deepEqual(
      DIETARY_GOLDEN_PROJECTION.experiences.map(
        (experience) => experience.reference.experienceKey,
      ),
      ["MEAL_SERVICE", "TEMPERATURE_MONITORING"],
    );
    assert.deepEqual(
      EVS_GOLDEN_PROJECTION.areas.map((area) => area.areaKey),
      ["evs_cleaning", "evs_room_status"],
    );
    assert.deepEqual(
      PLANT_GOLDEN_PROJECTION.areas.map((area) => area.areaKey),
      ["plant_assets", "plant_work_orders", "plant_preventive_maintenance"],
    );
  });

  it("uses Experience Registry contract object references, not duplicated contracts", () => {
    for (const snapshot of [
      DIETARY_GOLDEN_PROJECTION,
      EVS_GOLDEN_PROJECTION,
      PLANT_GOLDEN_PROJECTION,
    ]) {
      for (const projected of snapshot.experiences) {
        const registryExperience = requireExperience(
          projected.reference.experienceKey,
        );
        assert.equal(projected.contracts.source, "EXPERIENCE_REGISTRY");
        assert.equal(projected.contracts.registryVersion, EXPERIENCE_REGISTRY_VERSION);
        assert.equal(projected.contracts.contracts, registryExperience.contracts);
      }
    }
  });

  it("keeps Facility Overview as labeled department composition", () => {
    assert.equal(
      FACILITY_OVERVIEW_GOLDEN_PROJECTION.context.request.lens.mode,
      "FACILITY",
    );
    assert.equal(FACILITY_OVERVIEW_GOLDEN_PROJECTION.areas.length, 0);
    assert.equal(FACILITY_OVERVIEW_GOLDEN_PROJECTION.experiences.length, 0);
    assert.deepEqual(
      FACILITY_OVERVIEW_GOLDEN_PROJECTION.facilityOverview?.departmentSnapshots.map(
        (snapshot) =>
          snapshot.context.request.lens.mode === "DEPARTMENT"
            ? snapshot.context.request.lens.departmentKey
            : "FACILITY",
      ),
      ["DIETARY", "EVS", "PLANT"],
    );
  });

  it("models Plant policy without fake room assignments", () => {
    assert.equal(PLANT_GOLDEN_PROJECTION.plantPolicy?.applied, true);
    assert.equal(
      PLANT_GOLDEN_PROJECTION.plantPolicy?.kind,
      "PLANT_FACILITY_WIDE_MAINTENANCE",
    );
    assert.equal(PLANT_GOLDEN_PROJECTION.plantPolicy?.createsRoomAssignments, false);
    assert.ok(
      PLANT_GOLDEN_PROJECTION.experiences.every(
        (experience) => experience.reference.departmentKey === "PLANT",
      ),
    );
  });

  it("models permission-narrowed snapshots without widening scope", () => {
    assert.equal(
      PERMISSION_NARROWED_PROJECTION.context.request.accessClass.key,
      "pin-servery-only",
    );
    assert.deepEqual(
      PERMISSION_NARROWED_PROJECTION.experiences.map(
        (experience) => experience.reference.experienceKey,
      ),
      ["MEAL_SERVICE"],
    );
    assert.deepEqual(PERMISSION_NARROWED_PROJECTION.locations.actionableIds, [
      "loc:servery",
    ]);
  });
});

describe("Projection Runtime Foundation — validation rules", () => {
  it("rejects duplicate ids", () => {
    const invalid = {
      ...mutableSnapshot(DIETARY_GOLDEN_PROJECTION),
      experiences: [
        ...DIETARY_GOLDEN_PROJECTION.experiences,
        DIETARY_GOLDEN_PROJECTION.experiences[0]!,
      ],
    };
    assert.ok(issueCodes(invalid).includes("DUPLICATE_ID"));
  });

  it("rejects missing identity", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.context.identity.key = "";
    assert.ok(issueCodes(invalid).includes("MISSING_IDENTITY"));
  });

  it("rejects unknown Experience keys", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.experiences = [
      {
        ...invalid.experiences[0]!,
        reference: {
          ...invalid.experiences[0]!.reference,
          experienceKey: "NOT_A_REAL_EXPERIENCE",
        },
      },
    ];
    assert.ok(issueCodes(invalid).includes("UNKNOWN_EXPERIENCE_KEY"));
  });

  it("rejects copied or invalid Experience contracts", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.experiences = [
      {
        ...invalid.experiences[0]!,
        contracts: {
          ...invalid.experiences[0]!.contracts,
          contracts: structuredClone(getExperience("MEAL_SERVICE")!.contracts),
        },
      },
    ];
    assert.ok(issueCodes(invalid).includes("MISSING_CONTRACT_REFERENCE"));
  });

  it("rejects invalid room references", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.locations.roots[0].children[0].children[0].children[0].reference.facilityId =
      "other_facility";
    assert.ok(issueCodes(invalid).includes("INVALID_LOCATION_REFERENCE"));
  });

  it("rejects invalid Area ordering", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.areas = [
      { ...invalid.areas[0]!, order: 20 },
      { ...invalid.areas[1]!, order: 10 },
    ];
    assert.ok(issueCodes(invalid).includes("INVALID_AREA_ORDERING"));
  });

  it("rejects invalid descriptors", () => {
    const invalid = {
      ...mutableSnapshot(DIETARY_GOLDEN_PROJECTION),
      descriptors: [
        ...DIETARY_GOLDEN_PROJECTION.descriptors,
        {
          id: "descriptor:bad",
          kind: "EXPERIENCE" as const,
          sourceId: "not-in-snapshot",
          label: "Bad descriptor",
        },
      ],
    };
    assert.ok(issueCodes(invalid).includes("INVALID_DESCRIPTOR"));
  });

  it("rejects missing query scopes", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.queryScopes = { byExperience: {}, byDomain: {} };
    assert.ok(issueCodes(invalid).includes("MISSING_QUERY_SCOPE"));
  });

  it("rejects circular Experience dependencies", () => {
    const invalid = mutableSnapshot(DIETARY_GOLDEN_PROJECTION);
    invalid.experiences = invalid.experiences.map(
      (experience: ProjectionSnapshot["experiences"][number]) => {
        if (experience.reference.experienceKey === "MEAL_SERVICE") {
          return {
            ...experience,
            reference: {
              ...experience.reference,
              dependencyExperienceKeys: ["TEMPERATURE_MONITORING"],
            },
          };
        }
        return {
          ...experience,
          reference: {
            ...experience.reference,
            dependencyExperienceKeys: ["MEAL_SERVICE"],
          },
        };
      },
    );
    assert.ok(issueCodes(invalid).includes("CIRCULAR_EXPERIENCE_DEPENDENCY"));
  });

  it("rejects Plant policy assignment copies", () => {
    const invalid = mutableSnapshot(PLANT_GOLDEN_PROJECTION);
    invalid.plantPolicy = {
      ...invalid.plantPolicy!,
      createsRoomAssignments: true,
    } as never;
    assert.ok(issueCodes(invalid).includes("PLANT_POLICY_ASSIGNMENT_COPY"));
  });

  it("rejects flattened Facility Overview snapshots", () => {
    const invalid = mutableSnapshot(FACILITY_OVERVIEW_GOLDEN_PROJECTION);
    invalid.experiences = DIETARY_GOLDEN_PROJECTION.experiences;
    assert.ok(issueCodes(invalid).includes("FACILITY_OVERVIEW_FLATTENED"));
  });
});

