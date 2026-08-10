/**
 * Scale / replay SQL-backed certification for Facility + Asset bulk imports.
 * Opt in via BULK_IMPORT_TEST_DATABASE_URL (or VERIFY_DATABASE_URL / ASSET_OPERATIONS_TEST_DATABASE_URL).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { rowsToCsv } from "@/lib/bulk-import/csv";
import {
  FACILITY_STRUCTURE_CSV_HEADERS,
} from "@/lib/bulk-import/facility-structure";
import {
  buildFacilityStructurePlanFromCsv,
  executeFacilityStructurePlan,
  loadFacilityStructureCatalog,
} from "@/lib/bulk-import/facility-structure-execute";
import { ASSET_CSV_HEADERS } from "@/lib/bulk-import/asset-import";
import {
  buildAssetImportPlanFromCsv,
  executeAssetImportPlan,
  loadAssetImportCatalog,
} from "@/lib/bulk-import/asset-import-execute";

const databaseUrl =
  process.env.BULK_IMPORT_TEST_DATABASE_URL ||
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set BULK_IMPORT_TEST_DATABASE_URL (disposable migrated DB) to run scale import tests";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: "user",
    authMethod: "PASSWORD",
    role: overrides.role,
    name: overrides.name ?? "Bulk Import Tester",
    email: overrides.email ?? "bulk-import@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

function buildFacilityCsv(): string {
  const rows: string[][] = [];
  const floors = ["Floor 1", "Floor 2", "Floor 3", "Floor 4"];
  let spaceCount = 0;
  let nbhCount = 0;
  for (let fi = 0; fi < floors.length; fi++) {
    const floor = floors[fi]!;
    const neighborhoodsOnFloor = fi === 0 ? 5 : 4; // 5+4+4+4 = 17
    for (let ni = 0; ni < neighborhoodsOnFloor; ni++) {
      nbhCount += 1;
      const nbh = `${fi + 1}${String.fromCharCode(65 + ni)} - Wing ${nbhCount}`;
      const rooms = fi === 0 && ni === 0 ? 20 : 12; // plenty of rooms → 200+
      for (let ri = 1; ri <= rooms; ri++) {
        spaceCount += 1;
        rows.push([
          floor,
          nbh,
          `Room ${fi + 1}${String.fromCharCode(65 + ni)}${String(ri).padStart(2, "0")}`,
          "Resident Room",
          String(100 + spaceCount),
          "",
          "",
          "Dietary",
          "",
        ]);
      }
      // one servery per neighborhood
      spaceCount += 1;
      rows.push([
        floor,
        nbh,
        "Servery",
        "Servery",
        "",
        "",
        "",
        "Dietary",
        "",
      ]);
    }
  }
  assert.ok(nbhCount >= 17, `expected >=17 neighborhoods, got ${nbhCount}`);
  assert.ok(spaceCount >= 200, `expected >=200 spaces, got ${spaceCount}`);
  return rowsToCsv([...FACILITY_STRUCTURE_CSV_HEADERS], rows);
}

test(
  "bulk import scale: facility 4 floors / 17+ units / 200+ spaces + asset 250 + replay",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    try {
      const facility = await prisma.facility.findFirst({
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      assert.ok(facility, "facility required");

      const dietary = await prisma.department.findFirst({
        where: { facilityId: facility.id, key: "DIETARY", isActive: true },
        select: { id: true },
      });
      assert.ok(dietary, "Dietary department required");

      const manager = await prisma.user.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          role: { key: { in: ["MANAGER", "FACILITY_ADMINISTRATOR", "GM"] } },
        },
        include: { role: { select: { key: true } } },
      });
      assert.ok(manager, "manager-class user required");

      // Isolate: create a disposable sub-hierarchy via unique floor prefix
      const prefix = `BI-${Date.now().toString(36)}`;
      const facilityCsvRaw = buildFacilityCsv();
      // Prefix floor AND neighborhood names for isolation (unit names are facility-unique).
      const facilityCsv = facilityCsvRaw
        .split("\n")
        .map((line, idx) => {
          if (idx === 0 || !line.trim()) return line;
          const cells = line.split(",");
          if (cells.length < 2) return line;
          cells[0] = `${prefix} ${cells[0]}`;
          cells[1] = `${prefix} ${cells[1]}`;
          return cells.join(",");
        })
        .join("\n");

      const catalog1 = await loadFacilityStructureCatalog(prisma, facility.id);
      const plan1 = buildFacilityStructurePlanFromCsv(facilityCsv, catalog1, "scale-facility.csv");
      assert.ok(plan1.ok, plan1.ok ? "" : plan1.error);
      if (!plan1.ok) return;
      assert.equal(plan1.plan.counts.invalidRows, 0, JSON.stringify(plan1.plan.issues.slice(0, 5)));
      assert.ok(plan1.plan.floorsToCreate >= 4);
      assert.ok(plan1.plan.neighborhoodsToCreate >= 17);
      assert.ok(plan1.plan.spacesToCreate >= 200);

      const exec1 = await executeFacilityStructurePlan(prisma, facility.id, plan1.plan);
      assert.equal(exec1.floorsCreated, plan1.plan.floorsToCreate);
      assert.equal(exec1.neighborhoodsCreated, plan1.plan.neighborhoodsToCreate);
      assert.equal(exec1.spacesCreated, plan1.plan.spacesToCreate);

      // Parent relationships
      const floors = await prisma.unit.findMany({
        where: {
          facilityId: facility.id,
          name: { startsWith: `${prefix} Floor` },
          hierarchyRole: "FLOOR",
        },
        select: { id: true, parentUnitId: true },
      });
      assert.equal(floors.length, 4);
      assert.ok(floors.every((f) => f.parentUnitId === null));

      const neighborhoods = await prisma.unit.findMany({
        where: {
          facilityId: facility.id,
          parentUnitId: { in: floors.map((f) => f.id) },
          hierarchyRole: "NEIGHBORHOOD",
        },
        select: { id: true, parentUnitId: true, name: true },
      });
      assert.ok(neighborhoods.length >= 17);

      const spaces = await prisma.unitSpace.findMany({
        where: { facilityId: facility.id, unitId: { in: neighborhoods.map((n) => n.id) } },
        select: { id: true, unitId: true },
      });
      assert.ok(spaces.length >= 200);
      assert.ok(spaces.every((s) => s.unitId != null));

      // Replay — no duplicates
      const catalog2 = await loadFacilityStructureCatalog(prisma, facility.id);
      const plan2 = buildFacilityStructurePlanFromCsv(facilityCsv, catalog2, "scale-facility.csv");
      assert.ok(plan2.ok);
      if (!plan2.ok) return;
      assert.equal(plan2.plan.floorsToCreate, 0);
      assert.equal(plan2.plan.neighborhoodsToCreate, 0);
      assert.equal(plan2.plan.spacesToCreate, 0);
      const exec2 = await executeFacilityStructurePlan(prisma, facility.id, plan2.plan);
      assert.equal(exec2.floorsCreated, 0);
      assert.equal(exec2.neighborhoodsCreated, 0);
      assert.equal(exec2.spacesCreated, 0);

      const spaceCountAfter = await prisma.unitSpace.count({
        where: { facilityId: facility.id, unitId: { in: neighborhoods.map((n) => n.id) } },
      });
      assert.equal(spaceCountAfter, spaces.length);

      // Asset import — 250 assets across multiple spaces
      const assetRows: string[][] = [];
      const nbhSample = neighborhoods.slice(0, 10);
      const spacesByUnit = new Map<string, string[]>();
      for (const s of await prisma.unitSpace.findMany({
        where: { unitId: { in: nbhSample.map((n) => n.id) } },
        select: { id: true, unitId: true, name: true },
      })) {
        if (!s.unitId) continue;
        const list = spacesByUnit.get(s.unitId) ?? [];
        list.push(s.name);
        spacesByUnit.set(s.unitId, list);
      }

      const floorByNbh = new Map(
        (
          await prisma.unit.findMany({
            where: { id: { in: nbhSample.map((n) => n.id) } },
            select: { id: true, name: true, parentUnit: { select: { name: true } } },
          })
        ).map((n) => [n.id, { nbh: n.name, floor: n.parentUnit?.name ?? "" }]),
      );

      for (let i = 0; i < 250; i++) {
        const nbh = nbhSample[i % nbhSample.length]!;
        const loc = floorByNbh.get(nbh.id)!;
        const spaceNames = spacesByUnit.get(nbh.id) ?? [];
        const spaceName = spaceNames[i % Math.max(1, spaceNames.length)] ?? "";
        assetRows.push([
          `Bulk Asset ${prefix} ${i + 1}`,
          "Equipment",
          loc.floor,
          loc.nbh,
          spaceName,
          `BI-${prefix}-${String(i + 1).padStart(4, "0")}`,
          "Acme",
          "M1",
          `SN-${prefix}-${i + 1}`,
          "",
          "OPERATIONAL",
          "Dietary",
          "ROUTINE",
          "",
          "",
        ]);
      }
      const assetCsv = rowsToCsv([...ASSET_CSV_HEADERS], assetRows);

      const assetCatalog1 = await loadAssetImportCatalog(prisma, facility.id);
      const assetPlan1 = buildAssetImportPlanFromCsv(assetCsv, assetCatalog1, "scale-assets.csv");
      assert.ok(assetPlan1.ok, assetPlan1.ok ? "" : assetPlan1.error);
      if (!assetPlan1.ok) return;
      assert.equal(assetPlan1.plan.counts.invalidRows, 0, JSON.stringify(assetPlan1.plan.issues.slice(0, 5)));
      assert.ok(assetPlan1.plan.createCount >= 250);

      const actor = session({
        facilityId: facility.id,
        role: manager.role.key as AppJwtPayload["role"],
        uid: manager.id,
        email: manager.email,
        name: manager.displayName,
        primaryDepartmentId: dietary.id,
      });

      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";
      const assetExec1 = await executeAssetImportPlan(
        actor,
        facility.id,
        assetPlan1.plan,
        prisma,
      );
      assert.equal(assetExec1.createdCount, 250);

      const createdAssets = await prisma.asset.count({
        where: {
          unit: { facilityId: facility.id },
          assetCode: { startsWith: `BI-${prefix}-` },
        },
      });
      assert.equal(createdAssets, 250);

      const withSpace = await prisma.asset.count({
        where: {
          unit: { facilityId: facility.id },
          assetCode: { startsWith: `BI-${prefix}-` },
          spaceId: { not: null },
        },
      });
      assert.ok(withSpace > 0);

      // No accidental issues/repairs/evidence for these assets
      const assetIds = (
        await prisma.asset.findMany({
          where: { assetCode: { startsWith: `BI-${prefix}-` } },
          select: { id: true },
        })
      ).map((a) => a.id);
      const [issues, repairs] = await Promise.all([
        prisma.assetIssue.count({ where: { assetId: { in: assetIds } } }),
        prisma.repair.count({ where: { assetId: { in: assetIds } } }).catch(() => 0),
      ]);
      assert.equal(issues, 0);
      assert.equal(repairs, 0);

      // Replay assets — all skipped
      const assetCatalog2 = await loadAssetImportCatalog(prisma, facility.id);
      const assetPlan2 = buildAssetImportPlanFromCsv(assetCsv, assetCatalog2, "scale-assets.csv");
      assert.ok(assetPlan2.ok);
      if (!assetPlan2.ok) return;
      assert.equal(assetPlan2.plan.createCount, 0);
      assert.ok(assetPlan2.plan.skipCount >= 250);
      const assetExec2 = await executeAssetImportPlan(
        actor,
        facility.id,
        assetPlan2.plan,
        prisma,
      );
      assert.equal(assetExec2.createdCount, 0);

      const createdAssetsAfter = await prisma.asset.count({
        where: {
          unit: { facilityId: facility.id },
          assetCode: { startsWith: `BI-${prefix}-` },
        },
      });
      assert.equal(createdAssetsAfter, 250);
    } finally {
      await prisma.$disconnect();
    }
  },
);
