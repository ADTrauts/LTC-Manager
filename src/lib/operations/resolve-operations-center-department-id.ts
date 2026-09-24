import type { PrismaClient } from "@prisma/client";

/** Stable scope key used before OperationDefinition rows exist for a facility. */
export function legacyOperationsCenterDepartmentId(facilityId: string): string {
  return `legacy:${facilityId}:dietary`;
}

export async function resolveOperationsCenterDepartmentId(
  prisma: PrismaClient,
  facilityId: string,
): Promise<string> {
  const definition = await prisma.operationDefinition.findFirst({
    where: { facilityId, isActive: true },
    select: { departmentId: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return definition?.departmentId ?? legacyOperationsCenterDepartmentId(facilityId);
}
