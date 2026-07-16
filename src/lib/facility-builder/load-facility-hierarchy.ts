import { prisma } from "@/lib/prisma";
import type { UnitType, SpaceType, UnitDepartmentKind, UnitHierarchyRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeptResponsibilityView = {
  id: string;
  kind: UnitDepartmentKind;
  capabilities: string[];
  riskLevel: string | null;
  cleaningFrequency: string | null;
  inspectionFrequency: string | null;
  department: { id: string; key: string; name: string };
};

export type SpaceView = {
  id: string;
  name: string;
  spaceType: SpaceType;
  code: string | null;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  responsibilities: SpaceResponsibilityView[];
};

export type SpaceResponsibilityView = {
  id: string;
  capabilities: string[];
  department: { id: string; key: string; name: string };
};

export type UnitHierarchyNode = {
  id: string;
  name: string;
  unitType: UnitType;
  hierarchyRole: UnitHierarchyRole | null;
  parentUnitId: string | null;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
  departmentResponsibilities: DeptResponsibilityView[];
  childSpaces: SpaceView[];
  childUnits: UnitHierarchyNode[];
};

export type FacilityHierarchy = {
  facilityId: string;
  facilityName: string;
  units: UnitHierarchyNode[];
  departments: { id: string; key: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadFacilityHierarchy(
  facilityId: string,
): Promise<FacilityHierarchy> {
  const [facility, flatUnits, departments] = await Promise.all([
    prisma.facility.findUniqueOrThrow({
      where: { id: facilityId },
      select: { id: true, displayName: true },
    }),
    prisma.unit.findMany({
      where: { facilityId },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        unitType: true,
        hierarchyRole: true,
        parentUnitId: true,
        isActive: true,
        displayOrder: true,
        description: true,
        departmentResponsibilities: {
          orderBy: { department: { sortOrder: "asc" } },
          select: {
            id: true,
            kind: true,
            capabilities: true,
            riskLevel: true,
            cleaningFrequency: true,
            inspectionFrequency: true,
            department: { select: { id: true, key: true, name: true } },
          },
        },
        childSpaces: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            spaceType: true,
            code: true,
            isActive: true,
            sortOrder: true,
            description: true,
            responsibilities: {
              orderBy: { department: { sortOrder: "asc" } },
              select: {
                id: true,
                capabilities: true,
                department: { select: { id: true, key: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, key: true, name: true },
    }),
  ]);

  const units = buildHierarchy(flatUnits);

  return {
    facilityId: facility.id,
    facilityName: facility.displayName,
    units,
    departments,
  };
}

// ---------------------------------------------------------------------------
// Hierarchy builder — turns flat list into tree
// ---------------------------------------------------------------------------

type FlatUnit = Omit<UnitHierarchyNode, "childUnits">;

function buildHierarchy(flatUnits: FlatUnit[]): UnitHierarchyNode[] {
  const byId = new Map<string, UnitHierarchyNode>();
  for (const u of flatUnits) {
    byId.set(u.id, { ...u, childUnits: [] });
  }

  const roots: UnitHierarchyNode[] = [];

  for (const node of byId.values()) {
    if (node.parentUnitId && byId.has(node.parentUnitId)) {
      byId.get(node.parentUnitId)!.childUnits.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Check if setting `parentUnitId` on `unitId` would create a cycle.
 * Walks ancestors from `parentUnitId` and returns true if `unitId` is found.
 */
export function wouldCreateCycle(
  unitId: string,
  parentUnitId: string,
  allUnits: { id: string; parentUnitId: string | null }[],
): boolean {
  if (unitId === parentUnitId) return true;
  const byId = new Map(allUnits.map((u) => [u.id, u]));
  let current = parentUnitId;
  const visited = new Set<string>();
  while (current) {
    if (current === unitId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = byId.get(current)?.parentUnitId ?? "";
  }
  return false;
}

/**
 * Resolve effective capabilities for a department at a UnitSpace.
 * Per 05_RESPONSIBILITY_INHERITANCE_RULES.md:
 * - Explicit UnitSpaceResponsibility → use its capabilities
 * - Otherwise inherit from parent Unit
 * - Empty capabilities = legacy full access
 */
export function resolveEffectiveCapabilities(
  departmentId: string,
  spaceResponsibilities: { departmentId: string; capabilities: string[] }[],
  unitResponsibilities: { department: { id: string }; capabilities: string[] }[],
): { capabilities: string[]; source: "direct" | "inherited" } | null {
  const explicit = spaceResponsibilities.find(
    (r) => r.departmentId === departmentId,
  );
  if (explicit) {
    return { capabilities: explicit.capabilities, source: "direct" };
  }

  const inherited = unitResponsibilities.find(
    (r) => r.department.id === departmentId,
  );
  if (inherited) {
    return { capabilities: inherited.capabilities, source: "inherited" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Well-known capability keys
// ---------------------------------------------------------------------------

export const CAPABILITY_KEYS = [
  "SERVICE_OPERATIONS",
  "SERVICE_LOGS",
  "MEAL_SERVICE",
  "FOOD_SAFETY",
  "CLEANING",
  "ROOM_STATUS",
  "BUILDING_MAINTENANCE",
  "ASSET_MANAGEMENT",
  "INSPECTIONS",
  "REPAIRS",
  "KNOWLEDGE",
  "WORK_QUEUE",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  SERVICE_OPERATIONS: "Service operations",
  SERVICE_LOGS: "Service logs",
  MEAL_SERVICE: "Meal service",
  FOOD_SAFETY: "Food safety",
  CLEANING: "Cleaning",
  ROOM_STATUS: "Room status",
  BUILDING_MAINTENANCE: "Building maintenance",
  ASSET_MANAGEMENT: "Asset management",
  INSPECTIONS: "Inspections",
  REPAIRS: "Repairs",
  KNOWLEDGE: "Knowledge",
  WORK_QUEUE: "Work queue",
};
