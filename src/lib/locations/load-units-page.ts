/**
 * Wave 15F — `/units` (Locations zone) data loader.
 *
 * When Projection cutover is enabled: unit visibility comes only from Projection.
 * When disabled: legacy operationalUnitWhere (rollback path only).
 */

import type { AppJwtPayload } from "@/lib/auth";
import { operationalUnitWhere } from "@/lib/facility-builder/operational-visibility";
import { isProjectionLocationsEnabled } from "@/lib/feature-flags";
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
  templates: { id: string; name: string }[];
  logAssignments: {
    id: string;
    unitId: string;
    isActive: boolean;
    recurrence: string;
    mealType: string | null;
    timesPerDay: number;
    template: { name: string };
  }[];
  locationsView: LocationsViewModel | null;
  projectionEnabled: boolean;
  projectionError: string | null;
};

const unitSelect = {
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
    select: {
      id: true,
      kind: true,
      riskLevel: true,
      cleaningFrequency: true,
      inspectionFrequency: true,
      department: { select: { id: true, key: true, name: true } },
    },
  },
} as const;

/** Collect Unit ids from a Locations view (adapter already dedupes). */
export function collectProjectedUnitIds(
  view: LocationsViewModel | null,
): readonly string[] {
  return view?.projectedUnitIds ?? [];
}

async function loadSupportingData(facilityId: string, unitIds: readonly string[]) {
  const idList = [...unitIds];
  const [templates, departments, logAssignments] = await Promise.all([
    prisma.logTemplate.findMany({
      where: { facilityId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, key: true, name: true },
    }),
    idList.length === 0
      ? Promise.resolve([])
      : prisma.logAssignment.findMany({
          where: { unitId: { in: idList } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            unitId: true,
            isActive: true,
            recurrence: true,
            mealType: true,
            timesPerDay: true,
            template: { select: { name: true } },
          },
        }),
  ]);

  return { templates, departments, logAssignments };
}

/**
 * Load Locations zone page data.
 * Projection path: one runtime resolve, then Prisma only for projected Unit ids.
 * No second eligibility pass.
 */
export async function loadUnitsPageData(
  session: AppJwtPayload,
  options: LoadLocationsViewOptions & {
    includeTemplates?: boolean;
  } = {},
): Promise<UnitsPageData> {
  const facilityId = session.facilityId;
  const includeTemplates = options.includeTemplates ?? true;

  if (!isProjectionLocationsEnabled()) {
    const units = await prisma.unit.findMany({
      where: operationalUnitWhere(facilityId),
      orderBy: { displayOrder: "asc" },
      select: unitSelect,
    });
    const support = await loadSupportingData(
      facilityId,
      units.map((u) => u.id),
    );
    return {
      units,
      parentOptions: units.map((unit) => ({ id: unit.id, name: unit.name })),
      departments: support.departments,
      templates: includeTemplates ? support.templates : [],
      logAssignments: support.logAssignments,
      locationsView: null,
      projectionEnabled: false,
      projectionError: null,
    };
  }

  const loaded = await loadLocationsView(session, options);
  const projectedIds = collectProjectedUnitIds(loaded.view);

  const units =
    projectedIds.length === 0
      ? []
      : await prisma.unit.findMany({
          where: {
            facilityId,
            id: { in: [...projectedIds] },
          },
          orderBy: { displayOrder: "asc" },
          select: unitSelect,
        });

  // Preserve Projection order preference when ids exist; fall back to displayOrder.
  const orderIndex = new Map(projectedIds.map((id, i) => [id, i]));
  units.sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.displayOrder - b.displayOrder;
  });

  const support = await loadSupportingData(
    facilityId,
    units.map((u) => u.id),
  );

  return {
    units,
    parentOptions: units.map((unit) => ({ id: unit.id, name: unit.name })),
    departments: support.departments,
    templates: includeTemplates ? support.templates : [],
    logAssignments: support.logAssignments,
    locationsView: loaded.view,
    projectionEnabled: true,
    projectionError: loaded.error,
  };
}
