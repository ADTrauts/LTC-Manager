import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpaceType, UnitHierarchyRole } from "@prisma/client";

import { requireBulkImportAuthority } from "./authority";
import {
  FACILITY_STRUCTURE_CSV_HEADERS,
  FACILITY_STRUCTURE_CSV_TEMPLATE,
  finalizeFacilityPlanConfirmability,
  formatFacilityLocationPreviewMeta,
  orderedFacilityCreatePlan,
  parseFacilityStructureCsv,
  planFacilityStructureImport,
  resolveFacilityStructureRowIntent,
  type FacilityStructureCatalog,
} from "./facility-structure";

function emptyCatalog(
  overrides?: Partial<FacilityStructureCatalog>,
): FacilityStructureCatalog {
  return {
    units: [],
    spaces: [],
    departments: [
      { id: "dept-dietary", name: "Dietary", key: "DIETARY", isActive: true },
      { id: "dept-plant", name: "Plant", key: "PLANT", isActive: true },
    ],
    ...overrides,
  };
}

describe("facility structure CSV parse", () => {
  it("parses new locationName / locationType template headers and example rows", () => {
    const parsed = parseFacilityStructureCsv(FACILITY_STRUCTURE_CSV_TEMPLATE);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.rows.length, 5);
    assert.deepEqual(parsed.headers, [...FACILITY_STRUCTURE_CSV_HEADERS]);
    assert.ok(parsed.headers.includes("locationName"));
    assert.ok(parsed.headers.includes("locationType"));
    assert.equal(
      (parsed.headers as string[]).includes("space"),
      false,
    );
    assert.equal(
      (parsed.headers as string[]).includes("spaceType"),
      false,
    );
    assert.ok(parsed.headers.includes("building"));
    assert.equal(parsed.rows[0]!.building, "");
    assert.equal(parsed.rows[0]!.floor, "Floor 1");
    assert.equal(parsed.rows[0]!.neighborhood, "1A - Naval Park");
    assert.equal(parsed.rows[0]!.locationName, "Room 101");
    assert.equal(parsed.rows[0]!.locationTypeRaw, "Resident Room");
    assert.equal(parsed.rows[0]!.roomNumber, "101");
    assert.equal(parsed.rows[2]!.locationName, "Servery");
    assert.equal(parsed.rows[2]!.roomNumber, "");
  });

  it("accepts legacy space / spaceType header aliases", () => {
    const csv = `floor,neighborhood,space,spaceType,roomNumber
Floor 1,1A,Room 101,Resident Room,101
Floor 1,1A,Servery,Servery,
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.rows[0]!.locationName, "Room 101");
    assert.equal(parsed.rows[0]!.locationTypeRaw, "Resident Room");
    assert.equal(parsed.rows[1]!.locationName, "Servery");
    assert.equal(parsed.rows[1]!.roomNumber, "");
  });

  it("rejects files missing floor column", () => {
    const parsed = parseFacilityStructureCsv("name,type\nA,B\n");
    assert.equal(parsed.ok, false);
  });
});

describe("facility structure row intent", () => {
  it("derives floor / neighborhood / location intents", () => {
    assert.equal(
      resolveFacilityStructureRowIntent({ neighborhood: "", locationName: "" }),
      "floor",
    );
    assert.equal(
      resolveFacilityStructureRowIntent({
        neighborhood: "1A",
        locationName: "",
      }),
      "neighborhood",
    );
    assert.equal(
      resolveFacilityStructureRowIntent({
        neighborhood: "1A",
        locationName: "Servery",
      }),
      "location",
    );
  });
});

describe("facility structure plan", () => {
  it("creates parents once for repeated names and plans deterministic order", () => {
    const csv = `floor,neighborhood,locationName,locationType
Floor 1,1A - Naval Park,Room 101,Resident Room
Floor 1,1A - Naval Park,Room 102,Resident Room
Floor 1,1B - Lighthouse,Room 103,Resident Room
Floor 2,2A - MLK,Servery,Servery
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, emptyCatalog()),
    );
    assert.equal(plan.floorsToCreate, 2);
    assert.equal(plan.neighborhoodsToCreate, 3);
    assert.equal(plan.spacesToCreate, 4);
    assert.equal(plan.canConfirm, true);
    const ordered = orderedFacilityCreatePlan(plan);
    assert.deepEqual(
      ordered.floors.map((f) => f.name),
      ["Floor 1", "Floor 2"],
    );
    assert.ok(ordered.neighborhoods.every((n) => n.floorKey));
  });

  it("allows Floor-only and Floor+Neighborhood hierarchy rows", () => {
    const csv = `floor,neighborhood,locationName,locationType,roomNumber
Floor 1,,,,
Floor 1,1A - Naval Park,,,
Floor 1,1A - Naval Park,Servery,Servery,
Floor 1,1A - Naval Park,Room 101,Resident Room,101
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, emptyCatalog()),
    );
    assert.equal(plan.counts.invalidRows, 0);
    assert.equal(plan.floorsToCreate, 1);
    assert.equal(plan.neighborhoodsToCreate, 1);
    assert.equal(plan.spacesToCreate, 2);
    assert.equal(plan.rows[0]!.intent, "floor");
    assert.equal(plan.rows[1]!.intent, "neighborhood");
    assert.equal(plan.rows[2]!.intent, "location");
    assert.equal(plan.createOps.spaces.find((s) => s.name === "Servery")?.roomNumber, null);
    assert.equal(plan.createOps.spaces.find((s) => s.name === "Room 101")?.roomNumber, "101");
    assert.equal(plan.canConfirm, true);
  });

  it("treats roomNumber as optional for Servery, Dining Room, Office, and Resident Room", () => {
    const csv = `floor,neighborhood,locationName,locationType,roomNumber
Floor 1,1A,Servery,Servery,
Floor 1,1A,Dining Room,Dining Room,
Floor 1,1A,Dietitian Office,Office,
Floor 1,1A,Room 105,Resident Room,
Floor 1,1A,Room 106,Resident Room,106
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, emptyCatalog()),
    );
    assert.equal(plan.counts.invalidRows, 0);
    assert.equal(plan.spacesToCreate, 5);
    assert.ok(plan.createOps.spaces.every((s) => s.name !== ""));
    assert.equal(
      plan.createOps.spaces.find((s) => s.name === "Room 105")?.roomNumber,
      null,
    );
    assert.equal(
      plan.createOps.spaces.find((s) => s.name === "Room 106")?.roomNumber,
      "106",
    );
  });

  it("rejects locationType / roomNumber without locationName and unknown locationType", () => {
    const csv = `floor,neighborhood,locationName,locationType,roomNumber
Floor 1,1A,,Servery,
Floor 1,1A,,,101
Floor 1,1A,Room 1,Not A Real Type,
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, emptyCatalog());
    assert.ok(plan.counts.invalidRows >= 3);
    assert.ok(plan.issues.some((i) => i.field === "locationType"));
    assert.ok(plan.issues.some((i) => i.field === "roomNumber"));
    assert.ok(plan.issues.some((i) => /Unknown Location Type/i.test(i.message)));
    assert.ok(plan.issues.every((i) => i.field !== "space" && i.field !== "spaceType"));
  });

  it("reuses existing exact hierarchy and is idempotent for duplicate file rows", () => {
    const catalog = emptyCatalog({
      units: [
        {
          id: "f1",
          name: "Floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 100,
          description: null,
        },
        {
          id: "n1",
          name: "1A - Naval Park",
          hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
          parentUnitId: "f1",
          isActive: true,
          displayOrder: 100,
          description: null,
        },
      ],
      spaces: [
        {
          id: "s1",
          unitId: "n1",
          name: "Room 101",
          spaceType: SpaceType.PATIENT_ROOM,
          customTypeLabel: "Resident Room",
          roomNumber: "101",
          code: null,
          description: null,
          isActive: true,
          sortOrder: 100,
        },
      ],
    });
    const csv = `floor,neighborhood,locationName,locationType,roomNumber
Floor 1,1A - Naval Park,Room 101,Resident Room,101
Floor 1,1A - Naval Park,Room 101,Resident Room,101
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, catalog),
    );
    assert.equal(plan.floorsToCreate, 0);
    assert.equal(plan.neighborhoodsToCreate, 0);
    assert.equal(plan.spacesToCreate, 0);
    assert.equal(plan.spacesReused, 1);
    assert.ok(plan.rows.some((r) => r.status === "skip"));
    assert.equal(plan.counts.invalidRows, 0);
    assert.equal(plan.canConfirm, true);
  });

  it("rejects missing floor and invalid location type on location rows", () => {
    const csv = `floor,neighborhood,locationName,locationType
,1A,Room 1,Resident Room
Floor 1,,Room 1,Resident Room
Floor 1,1A,Room 1,Not A Real Type
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, emptyCatalog());
    assert.ok(plan.counts.invalidRows >= 3);
    assert.ok(plan.issues.some((i) => i.field === "floor"));
    assert.ok(plan.issues.some((i) => i.field === "neighborhood"));
    assert.ok(plan.issues.some((i) => i.field === "locationType"));
  });

  it("rejects ambiguous floor and inactive / staged parents", () => {
    const catalog = emptyCatalog({
      units: [
        {
          id: "f1",
          name: "Floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 100,
          description: null,
        },
        {
          id: "f1b",
          name: "floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 110,
          description: null,
        },
        {
          id: "staged",
          name: "Park Wing",
          hierarchyRole: UnitHierarchyRole.STAGED,
          parentUnitId: null,
          isActive: true,
          displayOrder: 100,
          description: null,
        },
        {
          id: "inactive",
          name: "Floor 9",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: false,
          displayOrder: 100,
          description: null,
        },
      ],
    });
    const csv = `floor,neighborhood,locationName,locationType
Floor 1,Park Wing,Room 1,Resident Room
Floor 9,Ghost,Room 1,Resident Room
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, catalog);
    assert.ok(plan.counts.invalidRows >= 2);
    assert.ok(plan.issues.some((i) => /Ambiguous floor/i.test(i.message)));
    assert.ok(plan.issues.some((i) => /staging|inactive/i.test(i.message)));
  });

  it("does not silently overwrite existing location type (conflict)", () => {
    const catalog = emptyCatalog({
      units: [
        {
          id: "f1",
          name: "Floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 100,
          description: null,
        },
        {
          id: "n1",
          name: "1A",
          hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
          parentUnitId: "f1",
          isActive: true,
          displayOrder: 100,
          description: null,
        },
      ],
      spaces: [
        {
          id: "s1",
          unitId: "n1",
          name: "Room 101",
          spaceType: SpaceType.PATIENT_ROOM,
          customTypeLabel: "Resident Room",
          roomNumber: null,
          code: null,
          description: null,
          isActive: true,
          sortOrder: 100,
        },
      ],
    });
    const csv = `floor,neighborhood,locationName,locationType
Floor 1,1A,Room 101,Servery
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, catalog);
    assert.equal(plan.counts.conflictCount, 1);
    assert.equal(plan.spacesToCreate, 0);
    assert.equal(plan.canConfirm, false);
  });

  it("rejects unknown department", () => {
    const csv = `floor,neighborhood,locationName,locationType,department
Floor 1,1A,Room 101,Resident Room,NotADept
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, emptyCatalog());
    assert.ok(plan.issues.some((i) => i.field === "department"));
  });

  it("allows the same Neighborhood name under a different Floor (sibling uniqueness)", () => {
    const catalog = emptyCatalog({
      units: [
        {
          id: "f1",
          name: "Floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 100,
          description: null,
        },
        {
          id: "f2",
          name: "Floor 2",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
          displayOrder: 110,
          description: null,
        },
        {
          id: "n1",
          name: "1A - Naval Park",
          hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
          parentUnitId: "f1",
          isActive: true,
          displayOrder: 100,
          description: null,
        },
      ],
    });
    const csv = `floor,neighborhood,locationName,locationType
Floor 2,1A - Naval Park,Room 201,Resident Room
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, catalog);
    assert.equal(plan.counts.invalidRows, 0);
    assert.equal(plan.neighborhoodsToCreate, 1);
    assert.equal(plan.rows[0]!.existingNeighborhoodId, null);
    assert.notEqual(plan.rows[0]!.existingFloorId, "f1");
  });

  it("preview meta uses Location Type and optional Room Number without UnitSpace jargon", () => {
    assert.equal(
      formatFacilityLocationPreviewMeta("Resident Room", "101"),
      "Resident Room · #101",
    );
    assert.equal(formatFacilityLocationPreviewMeta("Servery", null), "Servery");

    const csv = `floor,neighborhood,locationName,locationType,roomNumber
Floor 1,1A,Room 101,Resident Room,101
Floor 1,1A,Servery,Servery,
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planFacilityStructureImport(parsed.rows, emptyCatalog());
    const nbh = plan.hierarchyPreview[0]?.neighborhoods[0];
    assert.ok(nbh);
    assert.ok(nbh.locations.some((l) => l.name === "Room 101" && l.metaLine.includes("#101")));
    assert.ok(nbh.locations.some((l) => l.name === "Servery" && l.metaLine === "Servery"));
    assert.equal(nbh.locationTotal, 2);
  });
});

describe("bulk import authority", () => {
  it("denies Quick PIN and frontline STAFF", () => {
    assert.throws(
      () =>
        requireBulkImportAuthority(
          {
            uid: "u1",
            authKind: "user",
            authMethod: "QUICK_PIN",
            role: "MANAGER",
            name: "M",
            email: "m@example.com",
            facilityId: "f1",
          } as never,
          "MANAGER",
        ),
      /Quick PIN/i,
    );
    assert.throws(
      () =>
        requireBulkImportAuthority(
          {
            uid: "u1",
            authKind: "user",
            authMethod: "PASSWORD",
            role: "STAFF",
            name: "S",
            email: "s@example.com",
            facilityId: "f1",
          } as never,
          "MANAGER",
        ),
      /Insufficient/i,
    );
  });

  it("allows Manager password sessions", () => {
    assert.doesNotThrow(() =>
      requireBulkImportAuthority(
        {
          uid: "u1",
          authKind: "user",
          authMethod: "PASSWORD",
          role: "MANAGER",
          name: "M",
          email: "m@example.com",
          facilityId: "f1",
        } as never,
        "MANAGER",
      ),
    );
  });
});

describe("optional Building column", () => {
  it("nests Floor 1 under each building so sibling names do not collide", () => {
    const csv = `building,floor,neighborhood,locationName,locationType
Science Hall,Floor 1,Labs,Lab A,Office
Dining Hall,Floor 1,Kitchen,Servery,Servery
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, emptyCatalog()),
    );
    assert.equal(plan.counts.invalidRows, 0);
    assert.equal(plan.buildingsToCreate, 2);
    assert.equal(plan.floorsToCreate, 2);
    assert.equal(plan.neighborhoodsToCreate, 2);
    assert.equal(plan.spacesToCreate, 2);
    const ordered = orderedFacilityCreatePlan(plan);
    assert.deepEqual(
      ordered.buildings.map((b) => b.name).sort(),
      ["Dining Hall", "Science Hall"],
    );
    assert.equal(ordered.floors.filter((f) => f.name === "Floor 1").length, 2);
    assert.notEqual(ordered.floors[0]!.key, ordered.floors[1]!.key);
    assert.equal(plan.canConfirm, true);
  });

  it("omitting building still creates floors at the facility root", () => {
    const csv = `building,floor,neighborhood,locationName,locationType
,Floor 1,1A,Room 101,Resident Room
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(parsed.rows, emptyCatalog()),
    );
    assert.equal(plan.buildingsToCreate, 0);
    assert.equal(plan.floorsToCreate, 1);
    assert.equal(plan.createOps.floors[0]!.buildingKey, "");
    assert.equal(plan.hierarchyPreview[0]!.name, "Floor 1");
  });

  it("does not reuse a root Floor when the same name is created under a new Building", () => {
    const csv = `building,floor,neighborhood,locationName,locationType
Science Hall,Floor 1,Labs,Lab A,Office
`;
    const parsed = parseFacilityStructureCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = finalizeFacilityPlanConfirmability(
      planFacilityStructureImport(
        parsed.rows,
        emptyCatalog({
          units: [
            {
              id: "floor-root-1",
              name: "Floor 1",
              hierarchyRole: UnitHierarchyRole.FLOOR,
              parentUnitId: null,
              isActive: true,
              displayOrder: 100,
              description: null,
            },
          ],
        }),
      ),
    );
    assert.equal(plan.buildingsToCreate, 1);
    assert.equal(plan.floorsToCreate, 1);
    assert.equal(plan.floorsReused, 0);
  });
});
