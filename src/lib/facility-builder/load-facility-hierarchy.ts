import { prisma } from "@/lib/prisma";
import type { UnitType, SpaceType, UnitDepartmentKind, UnitHierarchyRole } from "@prisma/client";
import {
  resolveFacilityVocabulary,
  type FacilityVocabulary,
} from "@/lib/facility-builder/facility-vocabulary";

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
  customTypeLabel: string | null;
  roomNumber: string | null;
  code: string | null;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  /** null = Undesignated staging (builder-only). */
  unitId: string | null;
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
  /** Resolved hierarchy terminology (presentation only; LTC default). */
  vocabulary: FacilityVocabulary;
  /** Placed Floors / nested neighborhoods / legacy (excludes STAGED). */
  units: UnitHierarchyNode[];
  /** Builder-only staged neighborhoods (Undesignated). */
  stagedUnits: UnitHierarchyNode[];
  /** Builder-only rooms with unitId = null (Undesignated). */
  undesignatedSpaces: SpaceView[];
  departments: { id: string; key: string; name: string }[];
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export async function loadFacilityHierarchy(
  facilityId: string,
): Promise<FacilityHierarchy> {
  const spaceSelect = {
    id: true,
    name: true,
    spaceType: true,
    customTypeLabel: true,
    roomNumber: true,
    code: true,
    isActive: true,
    sortOrder: true,
    description: true,
    unitId: true,
    responsibilities: {
      orderBy: { department: { sortOrder: "asc" as const } },
      select: {
        id: true,
        capabilities: true,
        department: { select: { id: true, key: true, name: true } },
      },
    },
  };

  const [facility, flatUnits, undesignatedSpaces, departments] = await Promise.all([
    prisma.facility.findUniqueOrThrow({
      where: { id: facilityId },
      select: {
        id: true,
        displayName: true,
        vocabularyProfile: true,
        vocabularyLevel1Label: true,
        vocabularyLevel2Label: true,
        vocabularyLevel3Label: true,
      },
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
          where: { unitId: { not: null } },
          orderBy: { sortOrder: "asc" },
          select: spaceSelect,
        },
      },
    }),
    prisma.unitSpace.findMany({
      where: { facilityId, unitId: null },
      orderBy: { sortOrder: "asc" },
      select: spaceSelect,
    }),
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, key: true, name: true },
    }),
  ]);

  const stagedFlat = flatUnits.filter((u) => u.hierarchyRole === "STAGED");
  const placedFlat = flatUnits.filter((u) => u.hierarchyRole !== "STAGED");
  const units = buildHierarchy(placedFlat);
  const stagedUnits = buildHierarchy(stagedFlat);

  return {
    facilityId: facility.id,
    facilityName: facility.displayName,
    vocabulary: resolveFacilityVocabulary(facility),
    units,
    stagedUnits,
    undesignatedSpaces,
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

export const ROOM_RESPONSIBILITY_HELP_TEXT =
  "Assign the departments responsible for operational work performed in this room.";

export const ROOM_RESPONSIBILITY_EMPTY_MESSAGE =
  "No operational responsibilities have been assigned.";

export const PLANT_FACILITY_WIDE_ACCESS_NOTE =
  "Plant Operations has facility-wide maintenance access.";

/**
 * Placeholder for Stage 3: facility-wide operational access policies.
 * Plant maintenance access should be represented by policy, not by copying
 * Plant responsibility rows to every room.
 */
export type FacilityOperationalAccessPolicy = {
  departmentKey: string;
  scope: "FACILITY_WIDE_PLACED_LOCATIONS";
  domains: readonly string[];
};

export const PLANT_MAINTENANCE_ACCESS_POLICY: FacilityOperationalAccessPolicy = {
  departmentKey: "PLANT",
  scope: "FACILITY_WIDE_PLACED_LOCATIONS",
  domains: ["BUILDING_MAINTENANCE", "ASSET_MANAGEMENT", "INSPECTIONS", "REPAIRS"],
};

export function formatRoomDisplayName(room: {
  name: string;
  roomNumber?: string | null;
}): string {
  const name = room.name.trim();
  const roomNumber = room.roomNumber?.trim();
  if (!roomNumber) return name;
  if (!name) return roomNumber;
  return `${roomNumber} • ${name}`;
}

/**
 * Resolve explicit room capabilities for a department at a UnitSpace.
 * Floors and neighborhoods are physical structure only; rooms do not inherit
 * department responsibilities from parent Units.
 */
export function resolveEffectiveCapabilities(
  departmentId: string,
  spaceResponsibilities: { departmentId: string; capabilities: string[] }[],
  unitResponsibilities: { department: { id: string }; capabilities: string[] }[] = [],
): { capabilities: string[]; source: "direct" } | null {
  void unitResponsibilities;
  const explicit = spaceResponsibilities.find(
    (r) => r.departmentId === departmentId,
  );
  if (explicit) {
    return { capabilities: explicit.capabilities, source: "direct" };
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
