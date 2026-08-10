/**
 * Asset bulk import executor — uses canonical createAsset when asset ops is enabled
 * (INITIAL status history included). Legacy path writes Asset rows only.
 * Does not create issues, repairs, evidence, or work orders.
 */

import { randomBytes } from "node:crypto";
import type { AssetStatus, Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { createAsset } from "@/lib/asset-operations/asset-service";
import type { AssetOperationalStatus } from "@/lib/asset-operations";
import { isDietaryAssetOperationsEnabled } from "@/lib/feature-flags";

import {
  planAssetImport,
  parseAssetImportCsv,
  type AssetImportCatalog,
  type AssetImportPlan,
  type AssetImportRowPlan,
} from "./asset-import";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

async function nextAssetCode(client: DbClient): Promise<string> {
  const count = await client.asset.count();
  let candidate = `A-${String(count + 1).padStart(5, "0")}`;
  for (let i = 0; i < 8; i += 1) {
    const clash = await client.asset.findFirst({
      where: { assetCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `A-${String(count + 1 + i + 1).padStart(5, "0")}`;
  }
  return `A-${cuidLike().slice(1, 9).toUpperCase()}`;
}

async function resolveDefaultDepartment(
  client: DbClient,
  unitId: string,
  facilityId: string,
): Promise<string | null> {
  const rows = await client.unitDepartmentResponsibility.findMany({
    where: { unitId, unit: { facilityId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, departmentId: true, department: { select: { key: true } } },
  });
  const plantPrimary = rows.find((r) => r.kind === "PRIMARY" && r.department.key === "PLANT");
  if (plantPrimary) return plantPrimary.departmentId;
  const anyPrimary = rows.find((r) => r.kind === "PRIMARY");
  return anyPrimary?.departmentId ?? null;
}

export async function loadAssetImportCatalog(
  client: DbClient,
  facilityId: string,
): Promise<AssetImportCatalog> {
  const [units, spaces, departments, assets] = await Promise.all([
    client.unit.findMany({
      where: { facilityId },
      select: {
        id: true,
        name: true,
        hierarchyRole: true,
        parentUnitId: true,
        isActive: true,
      },
    }),
    client.unitSpace.findMany({
      where: { facilityId },
      select: { id: true, unitId: true, name: true, isActive: true },
    }),
    client.department.findMany({
      where: { facilityId },
      select: { id: true, name: true, key: true, isActive: true },
    }),
    client.asset.findMany({
      where: { unit: { facilityId } },
      select: {
        id: true,
        assetCode: true,
        name: true,
        equipmentType: true,
        serialNumber: true,
        facilityAssetNumber: true,
        unitId: true,
        spaceId: true,
        status: true,
      },
    }),
  ]);
  return {
    units,
    spaces,
    departments,
    assets,
    assetOpsEnabled: isDietaryAssetOperationsEnabled(),
  };
}

export function buildAssetImportPlanFromCsv(
  text: string,
  catalog: AssetImportCatalog,
  fileName: string | null,
): { ok: true; plan: AssetImportPlan } | { ok: false; error: string } {
  const parsed = parseAssetImportCsv(text, fileName);
  if (!parsed.ok) return parsed;
  const plan = planAssetImport(parsed.rows, catalog, parsed.fileName);
  return { ok: true, plan };
}

export type AssetImportExecuteResult = {
  createdCount: number;
  skippedCount: number;
};

function isLiveDuplicate(catalog: AssetImportCatalog, row: AssetImportRowPlan): boolean {
  if (row.assetCode) {
    if (
      catalog.assets.some(
        (a) => a.assetCode.toLowerCase() === row.assetCode!.toLowerCase(),
      )
    ) {
      return true;
    }
  }
  if (row.serialNumber) {
    if (
      catalog.assets.some(
        (a) =>
          a.serialNumber &&
          a.serialNumber.toLowerCase() === row.serialNumber!.toLowerCase(),
      )
    ) {
      return true;
    }
  }
  if (row.facilityAssetNumber) {
    if (
      catalog.assets.some(
        (a) =>
          a.facilityAssetNumber &&
          a.facilityAssetNumber.toLowerCase() === row.facilityAssetNumber!.toLowerCase(),
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Create assets for confirmed plan rows inside one DB transaction.
 */
export async function executeAssetImportPlan(
  session: AppJwtPayload,
  facilityId: string,
  plan: AssetImportPlan,
  client: PrismaClient,
): Promise<AssetImportExecuteResult> {
  if (!plan.canConfirm || plan.counts.invalidRows > 0) {
    throw new Error("Import plan has validation errors and cannot be confirmed.");
  }

  const createRows = plan.rows.filter((r) => r.action === "create" && r.status === "create");
  let createdCount = 0;
  let skippedCount = plan.rows.filter((r) => r.action === "skip").length;
  const assetOpsEnabled = isDietaryAssetOperationsEnabled();

  await client.$transaction(
    async (tx) => {
    const live = await loadAssetImportCatalog(tx, facilityId);

    for (const row of createRows) {
      if (!row.unitId || !row.statusValue) {
        throw new Error(`Row ${row.rowNumber}: missing resolved location or status.`);
      }
      if (isLiveDuplicate(live, row)) {
        skippedCount += 1;
        continue;
      }

      let departmentId = row.departmentId;
      if (!departmentId) {
        departmentId = await resolveDefaultDepartment(tx, row.unitId, facilityId);
      }
      if (!departmentId) {
        throw new Error(
          `Row ${row.rowNumber}: no responsible department. Set department in the CSV or configure unit responsibility.`,
        );
      }

      if (assetOpsEnabled) {
        const created = await createAsset(session, {
          client: tx,
          facilityId,
          departmentId,
          unitId: row.unitId,
          spaceId: row.spaceId,
          assetCode: row.assetCode,
          name: row.name,
          equipmentType: row.equipmentType,
          manufacturer: row.manufacturer,
          model: row.model,
          serialNumber: row.serialNumber,
          facilityAssetNumber: row.facilityAssetNumber,
          description: row.description,
          notes: row.notes,
          criticality: row.criticality,
          status: row.statusValue as AssetOperationalStatus,
        });
        live.assets.push({
          id: created.id,
          assetCode: created.assetCode,
          name: created.name,
          equipmentType: created.equipmentType,
          serialNumber: created.serialNumber,
          facilityAssetNumber: created.facilityAssetNumber,
          unitId: created.unitId,
          spaceId: created.spaceId,
          status: created.status,
        });
      } else {
        const assetCode = row.assetCode?.trim() || (await nextAssetCode(tx));
        const created = await tx.asset.create({
          data: {
            assetCode,
            name: row.name,
            equipmentType: row.equipmentType,
            unitId: row.unitId,
            spaceId: row.spaceId,
            departmentId,
            manufacturer: row.manufacturer,
            model: row.model,
            serialNumber: row.serialNumber,
            facilityAssetNumber: row.facilityAssetNumber,
            description: row.description,
            notes: row.notes,
            status: row.statusValue as AssetStatus,
            criticality: row.criticality,
          },
        });
        live.assets.push({
          id: created.id,
          assetCode: created.assetCode,
          name: created.name,
          equipmentType: created.equipmentType,
          serialNumber: created.serialNumber,
          facilityAssetNumber: created.facilityAssetNumber,
          unitId: created.unitId,
          spaceId: created.spaceId,
          status: created.status,
        });
      }
      createdCount += 1;
    }
  },
    { timeout: 180_000, maxWait: 30_000 },
  );

  return { createdCount, skippedCount };
}
