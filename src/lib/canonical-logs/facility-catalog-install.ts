/**
 * Facility-wide install of a published Harbor Catalog LOG/CHECKLIST.
 * Place (attach / type default) is local. Existing placements count as installed.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { loadPublishedCatalogByStableKey } from "./catalog-service";

type Db = PrismaClient | Prisma.TransactionClient;

export type FacilityCatalogInstallRow = {
  id: string;
  facilityId: string;
  catalogStableKey: string;
  catalogDefinitionId: string;
  catalogVersion: number;
  installedAt: Date;
};

export function filterCatalogCardsToInstalled<T extends { stableKey: string }>(
  cards: readonly T[],
  installedStableKeys: readonly string[],
): T[] {
  const installed = new Set(installedStableKeys);
  return cards.filter((card) => installed.has(card.stableKey));
}

export async function listInstalledCatalogStableKeys(
  client: Db,
  facilityId: string,
): Promise<string[]> {
  const rows = await client.facilityCatalogInstall.findMany({
    where: { facilityId },
    select: { catalogStableKey: true },
    orderBy: { catalogStableKey: "asc" },
  });
  return rows.map((row) => row.catalogStableKey);
}

export async function isCatalogInstalled(
  client: Db,
  facilityId: string,
  catalogStableKey: string,
): Promise<boolean> {
  const row = await client.facilityCatalogInstall.findUnique({
    where: {
      facilityId_catalogStableKey: { facilityId, catalogStableKey },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function listFacilityCatalogInstallCounts(
  client: Db,
): Promise<Map<string, number>> {
  const rows = await client.facilityCatalogInstall.groupBy({
    by: ["catalogStableKey"],
    _count: { facilityId: true },
  });
  return new Map(rows.map((row) => [row.catalogStableKey, row._count.facilityId]));
}

export async function ensureFacilityCatalogInstall(
  client: Db,
  input: {
    facilityId: string;
    catalogDefinitionId: string;
    catalogStableKey: string;
    catalogVersion: number;
  },
): Promise<{ created: boolean; id: string }> {
  const existing = await client.facilityCatalogInstall.findUnique({
    where: {
      facilityId_catalogStableKey: {
        facilityId: input.facilityId,
        catalogStableKey: input.catalogStableKey,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  try {
    const row = await client.facilityCatalogInstall.create({
      data: {
        facilityId: input.facilityId,
        catalogDefinitionId: input.catalogDefinitionId,
        catalogStableKey: input.catalogStableKey,
        catalogVersion: input.catalogVersion,
      },
      select: { id: true },
    });
    return { created: true, id: row.id };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const again = await client.facilityCatalogInstall.findUnique({
        where: {
          facilityId_catalogStableKey: {
            facilityId: input.facilityId,
            catalogStableKey: input.catalogStableKey,
          },
        },
        select: { id: true },
      });
      if (again) return { created: false, id: again.id };
    }
    throw error;
  }
}

export async function installPublishedCatalog(
  client: Db,
  input: { facilityId: string; catalogStableKey: string },
): Promise<{ created: boolean; id: string; catalogStableKey: string }> {
  const catalog = await loadPublishedCatalogByStableKey(client, input.catalogStableKey);
  if (!catalog) throw new Error("Catalog log not found.");
  if (
    catalog.purposeType !== "LOG" &&
    catalog.purposeType !== "CHECKLIST" &&
    catalog.purposeType !== "INSPECTION" &&
    catalog.purposeType !== "PROCEDURE"
  ) {
    throw new Error("Only published Harbor catalog items can be installed.");
  }
  const result = await ensureFacilityCatalogInstall(client, {
    facilityId: input.facilityId,
    catalogDefinitionId: catalog.id,
    catalogStableKey: catalog.stableKey,
    catalogVersion: catalog.version,
  });
  return { ...result, catalogStableKey: catalog.stableKey };
}
