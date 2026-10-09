import type { Prisma, PrismaClient } from "@prisma/client";

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
  const departmentId = input.departmentId.trim();
  const facilityId = input.facilityId.trim();
  if (!departmentId) {
    throw new Error("Partner Assets require one Department.");
  }
  if (!facilityId) {
    throw new Error("Partner Assets require a Facility.");
  }

  const rows = await input.client.asset.findMany({
    where: {
      departmentId,
      status: { not: "RETIRED" },
      unit: { facilityId },
    },
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
