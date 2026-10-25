/**
 * Wave 15F — `/units` (Locations zone) data loader.
 *
 * Unit visibility comes only from Projection.
 */

import type { FacilitySession } from "@/lib/auth";
import { loadDepartmentVisibility, visibleDepartmentIdList } from "@/lib/department-authority/visibility";
import { loadCustomerOperableDepartments } from "@/lib/department-products";
import { prisma } from "@/lib/prisma";

import { loadLocationsView, type LoadLocationsViewOptions } from "./load-locations";
import type { LocationsViewModel } from "./types";

export type UnitsPageUnitRow = {
  id: string;
  name: string;
  unitType: import("@prisma/client").UnitType;
  parentUnitId: string | null;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
  mealTimes: { mealType: import("@prisma/client").MealType; scheduledTime: string }[];
  departmentResponsibilities: {
    id: string;
    kind: import("@prisma/client").UnitDepartmentKind;
    riskLevel: string | null;
    cleaningFrequency: string | null;
    inspectionFrequency: string | null;
    department: { id: string; key: string; name: string };
  }[];
};

export type UnitsPageData = {
  units: UnitsPageUnitRow[];
  parentOptions: { id: string; name: string }[];
  departments: { id: string; key: string; name: string }[];
  locationsView: LocationsViewModel | null;
  projectionEnabled: boolean;
  projectionError: string | null;
};

function unitSelect(visibleIds: readonly string[] | null) {
  return {
  id: true,
  name: true,
  unitType: true,
  parentUnitId: true,
  isActive: true,
  displayOrder: true,
  description: true,
  mealTimes: {
    where: { isActive: true },
    select: { mealType: true, scheduledTime: true },
  },
  departmentResponsibilities: {
    ...(visibleIds ? { where: { departmentId: { in: [...visibleIds] } } } : {}),
    select: {
      id: true,
      kind: true,
      riskLevel: true,
      cleaningFrequency: true,
      inspectionFrequency: true,
      department: { select: { id: true, key: true, name: true } },
    },
  },
  };
}

/** Collect Unit ids from a Locations view (adapter already dedupes). */
export function collectProjectedUnitIds(
  view: LocationsViewModel | null,
): readonly string[] {
  return view?.projectedUnitIds ?? [];
}

async function loadSupportingData(
  facilityId: string,
  visibleIds: readonly string[] | null,
) {
  const departments = await loadCustomerOperableDepartments(prisma, facilityId).then((rows) =>
    rows
      .filter((row) => !visibleIds || visibleIds.includes(row.id))
      .map((row) => ({ id: row.id, key: row.key, name: row.name })),
  );

  return { departments };
}

/**
 * Load Locations zone page data.
 * Projection path: one runtime resolve, then Prisma only for projected Unit ids.
 * No second eligibility pass.
 */
export async function loadUnitsPageData(
  session: FacilitySession,
  options: LoadLocationsViewOptions = {},
): Promise<UnitsPageData> {
  const facilityId = session.facilityId;
  const visibleIds = visibleDepartmentIdList(
    await loadDepartmentVisibility(prisma, session, facilityId),
  );

  const loaded = await loadLocationsView(session, options);
  const projectedIds = collectProjectedUnitIds(loaded.view);

  const units =
    projectedIds.length === 0
      ? []
      : await prisma.unit.findMany({
          where: visibleIds
            ? {
                facilityId,
                id: { in: [...projectedIds] },
                OR: [
                  { departmentResponsibilities: { some: { departmentId: { in: [...visibleIds] } } } },
                  {
                    childSpaces: {
                      some: { responsibilities: { some: { departmentId: { in: [...visibleIds] } } } },
                    },
                  },
                ],
              }
            : {
                facilityId,
                id: { in: [...projectedIds] },
              },
          orderBy: { displayOrder: "asc" },
          select: unitSelect(visibleIds),
        });

  // Preserve Projection order preference when ids exist; fall back to displayOrder.
  const orderIndex = new Map(projectedIds.map((id, i) => [id, i]));
  units.sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.displayOrder - b.displayOrder;
  });

  const support = await loadSupportingData(facilityId, visibleIds);

  return {
    units,
    parentOptions: units.map((unit) => ({ id: unit.id, name: unit.name })),
    departments: support.departments,
    locationsView: loaded.view,
    projectionEnabled: true,
    projectionError: loaded.error,
  };
}
