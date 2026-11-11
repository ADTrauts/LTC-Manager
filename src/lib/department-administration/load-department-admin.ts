/**
 * Department Administration view loader.
 * Facility Builder hierarchy plus Department responsibility. No profile.
 */

import {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  locationCoverageSummary,
  type DepartmentActionableLocation,
  type DepartmentLocationFloorGroup,
} from "@/lib/department-administration/department-locations";
import {
  loadFacilityHierarchy,
  type FacilityHierarchy,
} from "@/lib/facility-builder/load-facility-hierarchy";
import { prisma } from "@/lib/prisma";

export type DepartmentAdminView = {
  department: { id: string; key: string; name: string; isActive: boolean };
  facilityId: string;
  vocabulary: FacilityHierarchy["vocabulary"];
  /** Actionable locations from Facility Builder (neighborhoods + rooms; no floors). */
  locations: DepartmentActionableLocation[];
  /** Hierarchy-first grouping for the Locations tab. */
  locationHierarchy: DepartmentLocationFloorGroup[];
  locationCoverage: ReturnType<typeof locationCoverageSummary>;
};

export async function loadDepartmentAdminView(input: {
  facilityId: string;
  departmentId: string;
}): Promise<DepartmentAdminView | null> {
  return loadDepartmentLocationsView(input);
}

export async function loadDepartmentLocationsView(input: {
  facilityId: string;
  departmentId: string;
}): Promise<DepartmentAdminView | null> {
  const department = await prisma.department.findFirst({
    where: {
      id: input.departmentId,
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, key: true, name: true, isActive: true },
  });
  if (!department) return null;

  const hierarchy = await loadFacilityHierarchy(input.facilityId);
  const locations = collectDepartmentActionableLocations({
    departmentId: department.id,
    units: hierarchy.units,
    roomTypes: hierarchy.roomTypes,
  });

  return {
    department,
    facilityId: input.facilityId,
    vocabulary: hierarchy.vocabulary,
    locations,
    locationHierarchy: groupLocationsByPhysicalHierarchy(locations),
    locationCoverage: locationCoverageSummary(locations),
  };
}
