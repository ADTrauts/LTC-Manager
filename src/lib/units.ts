import { unstable_noStore as noStore } from "next/cache";

import type { AppJwtPayload } from "@/lib/auth";
import { getEmployeeAllowedUnitIdSet } from "@/lib/employee-units";
import { operationalUnitWhere } from "@/lib/facility-builder/operational-visibility";
import { prisma } from "@/lib/prisma";

export type SidebarUnit = {
  id: string;
  name: string;
  unitType: string | null;
};

export async function getActiveSidebarUnits(facilityId: string): Promise<SidebarUnit[]> {
  noStore();

  try {
    return await prisma.unit.findMany({
      where: operationalUnitWhere(facilityId, { isActive: true }),
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, unitType: true },
    });
  } catch {
    return [];
  }
}

/** Email (`user`) sessions see all active units; PIN (`employee`) sessions may be limited by `EmployeeUnitAccess`. */
export async function getSidebarUnitsForSession(session: AppJwtPayload): Promise<SidebarUnit[]> {
  noStore();

  const base = await getActiveSidebarUnits(session.facilityId);
  if (session.authKind !== "employee") {
    return base;
  }

  const allowed = await getEmployeeAllowedUnitIdSet(session.uid);
  if (allowed === null) {
    return base;
  }

  const filtered = base.filter((u) => allowed.has(u.id));
  const activeId = session.activeUnitId;
  if (activeId && !filtered.some((u) => u.id === activeId)) {
    const extra = base.find((u) => u.id === activeId);
    if (extra) {
      return [...filtered, extra];
    }
  }
  return filtered;
}
