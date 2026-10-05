/**
 * Facility-scoped Plant maintenance categories.
 * Product defaults, not a Work/Record/PM starter pack.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

import { DEFAULT_MAINTENANCE_CATEGORIES } from "./work-order-semantics";

type DbClient = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

export async function ensureDefaultMaintenanceCategories(
  facilityId: string,
  client: DbClient = prisma,
) {
  const existing = await client.maintenanceCategory.findMany({
    where: { facilityId },
    select: { key: true },
  });
  const have = new Set(existing.map((row) => row.key));
  const missing = DEFAULT_MAINTENANCE_CATEGORIES.filter((row) => !have.has(row.key));
  if (missing.length === 0) {
    return client.maintenanceCategory.findMany({
      where: { facilityId },
      orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
    });
  }
  await client.maintenanceCategory.createMany({
    data: missing.map((row) => ({
      id: cuidLike(),
      facilityId,
      key: row.key,
      label: row.label,
      sortOrder: row.sortOrder,
    })),
  });
  return client.maintenanceCategory.findMany({
    where: { facilityId },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
  });
}

export async function listMaintenanceCategories(
  facilityId: string,
  opts?: { includeArchived?: boolean; client?: DbClient },
) {
  const client = opts?.client ?? prisma;
  await ensureDefaultMaintenanceCategories(facilityId, client);
  return client.maintenanceCategory.findMany({
    where: {
      facilityId,
      ...(opts?.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { key: "asc" }],
  });
}

export async function archiveMaintenanceCategory(
  facilityId: string,
  categoryId: string,
  client: DbClient = prisma,
) {
  const category = await client.maintenanceCategory.findFirst({
    where: { id: categoryId, facilityId },
  });
  if (!category) throw new Error("Maintenance category not found.");
  if (category.archivedAt) return category;
  return client.maintenanceCategory.update({
    where: { id: category.id },
    data: { archivedAt: new Date() },
  });
}
