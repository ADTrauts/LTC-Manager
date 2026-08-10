import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnitHierarchyRole } from "@prisma/client";

import {
  ASSET_CSV_TEMPLATE,
  parseAssetImportCsv,
  planAssetImport,
  type AssetImportCatalog,
} from "./asset-import";
import { requireBulkImportAuthority } from "./authority";

function catalog(overrides?: Partial<AssetImportCatalog>): AssetImportCatalog {
  return {
    units: [
      {
        id: "f1",
        name: "Floor 1",
        hierarchyRole: UnitHierarchyRole.FLOOR,
        parentUnitId: null,
        isActive: true,
      },
      {
        id: "n1",
        name: "1A - Naval Park",
        hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
        parentUnitId: "f1",
        isActive: true,
      },
    ],
    spaces: [
      {
        id: "sp1",
        unitId: "n1",
        name: "Servery",
        isActive: true,
      },
    ],
    departments: [
      { id: "d1", name: "Dietary", key: "DIETARY", isActive: true },
    ],
    assets: [],
    assetOpsEnabled: true,
    ...overrides,
  };
}

describe("asset import CSV parse", () => {
  it("parses template", () => {
    const parsed = parseAssetImportCsv(ASSET_CSV_TEMPLATE);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.ok(parsed.rows.length >= 1);
    assert.equal(parsed.rows[0]!.name, "Walk-in Cooler");
  });
});

describe("asset import plan", () => {
  it("resolves human-readable locations and plans creates", () => {
    const csv = `name,equipmentType,floor,neighborhood,space,assetCode,department,status
Walk-in Cooler,Refrigerator,Floor 1,1A - Naval Park,Servery,TV-COOL-01,Dietary,OPERATIONAL
`;
    const parsed = parseAssetImportCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planAssetImport(parsed.rows, catalog());
    assert.equal(plan.createCount, 1);
    assert.equal(plan.rows[0]!.unitId, "n1");
    assert.equal(plan.rows[0]!.spaceId, "sp1");
    assert.equal(plan.canConfirm, true);
  });

  it("rejects missing / ambiguous / inactive locations", () => {
    const cat = catalog({
      units: [
        {
          id: "f1",
          name: "Floor 1",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: true,
        },
        {
          id: "f9",
          name: "Floor 9",
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          isActive: false,
        },
        {
          id: "n1",
          name: "1A - Naval Park",
          hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
          parentUnitId: "f1",
          isActive: true,
        },
      ],
    });
    const csv = `name,equipmentType,floor,neighborhood,space
A,Fridge,Missing Floor,1A - Naval Park,Servery
B,Fridge,Floor 9,1A - Naval Park,Servery
C,Fridge,Floor 1,Missing Nbh,Servery
D,Fridge,Floor 1,1A - Naval Park,Missing Space
`;
    const parsed = parseAssetImportCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planAssetImport(parsed.rows, cat);
    assert.ok(plan.counts.invalidRows >= 4);
    assert.ok(plan.issues.some((i) => /not found/i.test(i.message)));
    assert.ok(plan.issues.some((i) => /inactive/i.test(i.message)));
  });

  it("skips exact asset code / serial matches and conflicts on serial mismatch", () => {
    const cat = catalog({
      assets: [
        {
          id: "a1",
          assetCode: "TV-COOL-01",
          name: "Walk-in Cooler",
          equipmentType: "Refrigerator",
          serialNumber: "SN-1",
          facilityAssetNumber: null,
          unitId: "n1",
          spaceId: "sp1",
          status: "OPERATIONAL",
        },
        {
          id: "a2",
          assetCode: "OTHER",
          name: "Different",
          equipmentType: "Oven",
          serialNumber: "SN-CONFLICT",
          facilityAssetNumber: null,
          unitId: "n1",
          spaceId: null,
          status: "OPERATIONAL",
        },
      ],
    });
    const csv = `name,equipmentType,floor,neighborhood,space,assetCode,serialNumber
Walk-in Cooler,Refrigerator,Floor 1,1A - Naval Park,Servery,TV-COOL-01,
New Thing,Oven,Floor 1,1A - Naval Park,Servery,,SN-CONFLICT
`;
    const parsed = parseAssetImportCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planAssetImport(parsed.rows, cat);
    assert.equal(plan.rows[0]!.status, "skip");
    assert.equal(plan.rows[1]!.status, "conflict");
    assert.equal(plan.canConfirm, false);
  });

  it("rejects invalid asset status and department", () => {
    const csv = `name,equipmentType,floor,neighborhood,status,department
A,Fridge,Floor 1,1A - Naval Park,RETIRED,Dietary
B,Fridge,Floor 1,1A - Naval Park,OPERATIONAL,NoSuchDept
`;
    const parsed = parseAssetImportCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planAssetImport(parsed.rows, catalog());
    assert.ok(plan.issues.some((i) => i.field === "status"));
    assert.ok(plan.issues.some((i) => i.field === "department"));
  });

  it("same-file duplicate asset codes skip safely", () => {
    const csv = `name,equipmentType,floor,neighborhood,assetCode
Asset A,Fridge,Floor 1,1A - Naval Park,CODE-1
Asset B,Fridge,Floor 1,1A - Naval Park,CODE-1
`;
    const parsed = parseAssetImportCsv(csv);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const plan = planAssetImport(parsed.rows, catalog());
    assert.equal(plan.createCount, 1);
    assert.ok(plan.rows.some((r) => r.status === "skip"));
  });
});

describe("asset import authority", () => {
  it("requires SUPERVISOR+ and denies Quick PIN", () => {
    assert.throws(
      () =>
        requireBulkImportAuthority(
          {
            uid: "u",
            authKind: "user",
            authMethod: "PASSWORD",
            role: "STAFF",
            name: "S",
            email: "s@x.com",
            facilityId: "f",
          } as never,
          "SUPERVISOR",
        ),
      /Insufficient/i,
    );
    assert.throws(
      () =>
        requireBulkImportAuthority(
          {
            uid: "u",
            authKind: "user",
            authMethod: "QUICK_PIN",
            role: "MANAGER",
            name: "M",
            email: "m@x.com",
            facilityId: "f",
          } as never,
          "SUPERVISOR",
        ),
      /Quick PIN/i,
    );
  });
});
