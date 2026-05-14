import { prisma } from "@/lib/prisma";

/** `null` = no explicit restriction (may use any active unit at the facility). */
export async function getEmployeeAllowedUnitIdSet(employeeId: string): Promise<Set<string> | null> {
  const rows = await prisma.employeeUnitAccess.findMany({
    where: { employeeId },
    select: { unitId: true },
  });
  if (rows.length === 0) return null;
  return new Set(rows.map((r) => r.unitId));
}

export async function isUnitAllowedForEmployee(
  employeeId: string,
  facilityId: string,
  unitId: string,
): Promise<boolean> {
  const allowed = await getEmployeeAllowedUnitIdSet(employeeId);
  if (allowed === null) {
    const u = await prisma.unit.findFirst({
      where: { id: unitId, facilityId, isActive: true },
      select: { id: true },
    });
    return !!u;
  }
  return allowed.has(unitId);
}

/** Initial `activeUnitId` after PIN login: primary if valid for access, else first allowed (or first facility unit). */
export async function resolveInitialActiveUnitIdForPinLogin(employee: {
  id: string;
  facilityId: string;
  primaryUnitId: string | null;
}): Promise<string | undefined> {
  const ordered = await prisma.unit.findMany({
    where: { facilityId: employee.facilityId, isActive: true },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  const orderIds = ordered.map((u) => u.id);

  const allowed = await getEmployeeAllowedUnitIdSet(employee.id);
  const pool = allowed === null ? orderIds : orderIds.filter((id) => allowed.has(id));

  if (pool.length === 0) return undefined;

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const scheduledUnitRows = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: employee.id,
      date: { gte: start, lt: end },
      unit: { facilityId: employee.facilityId, isActive: true },
    },
    orderBy: [{ createdAt: "desc" }],
    select: { unitId: true },
  });
  const scheduledUnitId = scheduledUnitRows.find((row) => pool.includes(row.unitId))?.unitId;
  if (scheduledUnitId) return scheduledUnitId;

  if (employee.primaryUnitId && pool.includes(employee.primaryUnitId)) {
    return employee.primaryUnitId;
  }
  return pool[0];
}
