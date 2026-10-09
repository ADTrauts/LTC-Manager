import type { Prisma, PrismaClient } from "@prisma/client";

import { partnerAssetWhere } from "@/lib/asset-operations/partner-asset-where";

type Db = PrismaClient | Prisma.TransactionClient;

export type PartnerAssetListItem = {
  id: string;
  name: string;
  assetCode: string;
  facilityAssetNumber: string | null;
  equipmentType: string;
  status: string;
  criticality: string;
  serialNumber: string | null;
  unitName: string;
  roomName: string | null;
};

/**
 * Current non-retired Assets for one Facility Department.
 * Authorization is Asset.departmentId plus the Unit's Facility.
 * A null Department is not a match. Location responsibility is not consulted.
 */
export async function loadPartnerAssets(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
}): Promise<PartnerAssetListItem[]> {
  const rows = await input.client.asset.findMany({
    where: partnerAssetWhere({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
    }),
    orderBy: [{ name: "asc" }, { assetCode: "asc" }],
    select: {
      id: true,
      name: true,
      assetCode: true,
      facilityAssetNumber: true,
      equipmentType: true,
      status: true,
      criticality: true,
      serialNumber: true,
      unit: { select: { name: true } },
      space: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    assetCode: row.assetCode,
    facilityAssetNumber: row.facilityAssetNumber,
    equipmentType: row.equipmentType,
    status: row.status,
    criticality: row.criticality,
    serialNumber: row.serialNumber,
    unitName: row.unit.name,
    roomName: row.space?.name ?? null,
  }));
}

export type PartnerAssetDetail = {
  id: string;
  name: string;
  assetCode: string;
  facilityAssetNumber: string | null;
  equipmentType: string;
  status: string;
  criticality: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  unitName: string;
  roomName: string | null;
  roomNumber: string | null;
};

/**
 * One non-retired Asset in the active Facility Department.
 * A miss is null. Wrong Department, wrong Facility, null Department, and retired
 * Assets all miss the same query.
 */
export async function loadPartnerAssetDetail(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  assetId: string;
}): Promise<PartnerAssetDetail | null> {
  const assetId = input.assetId.trim();
  if (!assetId) return null;

  const row = await input.client.asset.findFirst({
    where: {
      id: assetId,
      ...partnerAssetWhere({
        facilityId: input.facilityId,
        departmentId: input.departmentId,
      }),
    },
    select: {
      id: true,
      name: true,
      assetCode: true,
      facilityAssetNumber: true,
      equipmentType: true,
      status: true,
      criticality: true,
      manufacturer: true,
      model: true,
      serialNumber: true,
      unit: { select: { name: true } },
      space: { select: { name: true, roomNumber: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    assetCode: row.assetCode,
    facilityAssetNumber: row.facilityAssetNumber,
    equipmentType: row.equipmentType,
    status: row.status,
    criticality: row.criticality,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serialNumber,
    unitName: row.unit.name,
    roomName: row.space?.name ?? null,
    roomNumber: row.space?.roomNumber ?? null,
  };
}
