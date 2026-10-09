import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { loadPartnerAssetDetail, loadPartnerAssets } from "@/lib/asset-operations/load-partner-assets";
import { canPartner, PARTNER_CAPABILITIES } from "@/lib/partner-user-access";
import { partnerShellReturnPath } from "@/lib/partner-operational-context";

type Row = {
  id: string;
  name: string;
  assetCode: string;
  facilityAssetNumber: string | null;
  equipmentType: string;
  status: "OPERATIONAL" | "RETIRED";
  criticality: string;
  serialNumber: string | null;
  departmentId: string | null;
  unit: { facilityId: string; name: string };
  space: { name: string } | null;
};

function asset(partial: Partial<Row> & Pick<Row, "id" | "name" | "departmentId">): Row {
  return {
    assetCode: partial.id.toUpperCase(),
    facilityAssetNumber: null,
    equipmentType: "Equipment",
    status: "OPERATIONAL",
    criticality: "ROUTINE",
    serialNumber: null,
    unit: { facilityId: "terrace", name: "Naval Park" },
    space: { name: "Servery" },
    ...partial,
  };
}

function clientFor(rows: Row[]) {
  return {
    asset: {
      findMany: async (args: { where: { departmentId: string; status: { not: string }; unit: { facilityId: string } } }) => {
        const where = args.where;
        assert.equal("OR" in where, false);
        return rows.filter(
          (row) =>
            row.departmentId === where.departmentId &&
            row.status !== where.status.not &&
            row.unit.facilityId === where.unit.facilityId,
        );
      },
    },
  };
}

test("partner asset capability is read-only", () => {
  for (const role of ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const) {
    assert.equal(canPartner(role, "assets.read"), true);
  }
  assert.equal(PARTNER_CAPABILITIES.includes("assets.update" as never), false);
  assert.equal(partnerShellReturnPath("/partner/assets"), "/partner/assets");
  const departmentSwitch = readFileSync(
    join(process.cwd(), "src/components/partner/partner-department-switch.tsx"),
    "utf8",
  );
  assert.match(departmentSwitch, /pathname\.startsWith\("\/partner\/assets"\)/);
  assert.match(departmentSwitch, /\? "\/partner\/assets"/);
  assert.equal(partnerShellReturnPath("/assets"), "/partner");
});

test("partner asset loader stays off the internal null-department and profile paths", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/asset-operations/load-partner-assets.ts"), "utf8");
  assert.equal(source.includes("assetResponsibleDepartmentWhere"), false);
  assert.equal(source.includes("getAssetProfile"), false);
  for (const forbidden of ["repair", "assetIssue", "preventiveMaintenance", "statusHistory", "attachment", "vendor"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("shared room shows only the active department asset", async () => {
  const rows = [
    asset({ id: "cooler", name: "Cooler", departmentId: "food" }),
    asset({ id: "scrubber", name: "Floor Scrubber", departmentId: "evs", space: { name: "Servery" } }),
    asset({ id: "shelf", name: "Shelf", departmentId: null }),
    asset({
      id: "hp",
      name: "HighPointe Cooler",
      departmentId: "food",
      unit: { facilityId: "highpointe", name: "Kitchen" },
    }),
    asset({ id: "retired", name: "Old Brewer", departmentId: "food", status: "RETIRED" }),
    asset({
      id: "evs-room",
      name: "Food Cart",
      departmentId: "food",
      space: { name: "EVS Storage" },
    }),
  ];
  const food = await loadPartnerAssets({ client: clientFor(rows) as never, facilityId: "terrace", departmentId: "food" });
  const evs = await loadPartnerAssets({ client: clientFor(rows) as never, facilityId: "terrace", departmentId: "evs" });
  assert.deepEqual(food.map((row) => row.name).sort(), ["Cooler", "Food Cart"]);
  assert.equal(food.find((row) => row.name === "Food Cart")?.roomName, "EVS Storage");
  assert.deepEqual(evs.map((row) => row.name), ["Floor Scrubber"]);
  assert.equal(food.some((row) => row.name === "Shelf"), false);
  assert.equal(food.some((row) => row.name === "HighPointe Cooler"), false);
  assert.equal(food.some((row) => row.name === "Old Brewer"), false);
});

test("department reassignment and null removal follow the current row", async () => {
  const cooler = asset({ id: "cooler", name: "Cooler", departmentId: "food" });
  const rows = [cooler];
  const food = () => loadPartnerAssets({ client: clientFor(rows) as never, facilityId: "terrace", departmentId: "food" });
  const evs = () => loadPartnerAssets({ client: clientFor(rows) as never, facilityId: "terrace", departmentId: "evs" });
  assert.equal((await food()).length, 1);
  cooler.departmentId = "evs";
  assert.equal((await food()).length, 0);
  assert.equal((await evs())[0]?.name, "Cooler");
  cooler.departmentId = null;
  assert.equal((await food()).length, 0);
  assert.equal((await evs()).length, 0);
});

test("blank department fails closed", async () => {
  await assert.rejects(
    () => loadPartnerAssets({ client: { asset: { findMany: async () => [] } } as never, facilityId: "terrace", departmentId: " " }),
    /one Department/,
  );
});

type DetailRow = Row & {
  manufacturer: string | null;
  model: string | null;
  roomNumber: string | null;
};

function detailClient(rows: DetailRow[]) {
  return {
    asset: {
      findFirst: async (args: {
        where: { id: string; departmentId: string; status: { not: string }; unit: { facilityId: string } };
      }) => {
        const where = args.where;
        assert.equal("OR" in where, false);
        return (
          rows.find(
            (row) =>
              row.id === where.id &&
              row.departmentId === where.departmentId &&
              row.status !== where.status.not &&
              row.unit.facilityId === where.unit.facilityId,
          ) ?? null
        );
      },
    },
  };
}

function detailAsset(partial: Partial<DetailRow> & Pick<DetailRow, "id" | "name" | "departmentId">): DetailRow {
  return {
    ...asset(partial),
    manufacturer: partial.manufacturer ?? "True",
    model: partial.model ?? "T-49",
    roomNumber: partial.roomNumber ?? null,
    ...partial,
  };
}

test("partner asset detail allows only the active department asset", async () => {
  const rows = [
    detailAsset({ id: "cooler", name: "Cooler", departmentId: "food", space: { name: "EVS Storage" }, roomNumber: "101" }),
    detailAsset({ id: "scrubber", name: "Floor Scrubber", departmentId: "evs" }),
    detailAsset({ id: "shelf", name: "Shelf", departmentId: null }),
    detailAsset({
      id: "hp",
      name: "HighPointe Cooler",
      departmentId: "food",
      unit: { facilityId: "highpointe", name: "Kitchen" },
    }),
    detailAsset({ id: "retired", name: "Old Brewer", departmentId: "food", status: "RETIRED" }),
  ];
  const client = detailClient(rows) as never;
  const food = await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "food", assetId: "cooler" });
  assert.equal(food?.name, "Cooler");
  assert.equal(food?.roomName, "EVS Storage");
  assert.equal(food?.manufacturer, "True");
  assert.deepEqual(Object.keys(food ?? {}).sort(), [
    "assetCode",
    "criticality",
    "equipmentType",
    "facilityAssetNumber",
    "id",
    "manufacturer",
    "model",
    "name",
    "roomName",
    "roomNumber",
    "serialNumber",
    "status",
    "unitName",
  ]);
  for (const id of ["scrubber", "shelf", "hp", "retired", "missing"]) {
    assert.equal(
      await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "food", assetId: id }),
      null,
      id,
    );
  }
});

test("partner asset detail follows reassignment to another department or null", async () => {
  const cooler = detailAsset({ id: "cooler", name: "Cooler", departmentId: "food" });
  const client = detailClient([cooler]) as never;
  assert.equal(
    (await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "food", assetId: "cooler" }))?.name,
    "Cooler",
  );
  cooler.departmentId = "evs";
  assert.equal(
    await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "food", assetId: "cooler" }),
    null,
  );
  assert.equal(
    (await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "evs", assetId: "cooler" }))?.name,
    "Cooler",
  );
  cooler.departmentId = null;
  assert.equal(
    await loadPartnerAssetDetail({ client, facilityId: "terrace", departmentId: "evs", assetId: "cooler" }),
    null,
  );
});

test("partner asset list links only to the partner detail route", () => {
  const list = readFileSync(join(process.cwd(), "src/components/partner/partner-asset-list.tsx"), "utf8");
  const detail = readFileSync(join(process.cwd(), "src/components/partner/partner-asset-detail.tsx"), "utf8");
  const loader = readFileSync(join(process.cwd(), "src/lib/asset-operations/load-partner-assets.ts"), "utf8");
  assert.match(list, /\/partner\/assets\/\$\{asset\.id\}/);
  assert.equal(list.includes('href="/assets/'), false);
  assert.match(detail, /href="\/partner\/assets"/);
  for (const forbidden of ["getAssetProfile", "assetResponsibleDepartmentWhere", "repair", "assetIssue", "notes", "vendor"]) {
    assert.equal(loader.includes(forbidden), false, forbidden);
  }
});
