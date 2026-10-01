import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import {
  deriveFacilityDepartmentCatalog,
  type FacilityDepartmentCatalogItem,
} from "./facility-catalog";

type CatalogDbClient = PrismaClient | Prisma.TransactionClient;

export async function loadFacilityDepartmentCatalog(
  prisma: CatalogDbClient,
  facilityId: string,
): Promise<FacilityDepartmentCatalogItem[]> {
  const [departments, entitlements] = await Promise.all([
    prisma.department.findMany({
      where: { facilityId },
      select: { id: true, key: true, isActive: true },
    }),
    prisma.facilityDepartmentEntitlement.findMany({
      where: { facilityId },
      select: { departmentKey: true, status: true },
    }),
  ]);

  return deriveFacilityDepartmentCatalog({ departments, entitlements });
}