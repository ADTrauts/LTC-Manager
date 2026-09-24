/**
 * Facility Structure bulk import — parse, validate, and plan create-only hierarchy writes.
 * Writes go through canonical Unit (optional BUILDING / FLOOR / NEIGHBORHOOD) + UnitSpace models.
 */

import { SpaceType, UnitHierarchyRole, type UnitType } from "@prisma/client";

import {
  FLOOR_INTERNAL_UNIT_TYPE,
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
  resolveBuilderNodeDisplayKind,
} from "@/lib/facility-builder/builder-display";
import {
  CUSTOM_SPACE_PRESET_KEY,
  SPACE_TYPE_PRESETS,
  resolveSpaceTypeFromPreset,
  type ResolvedSpaceTypeInput,
} from "@/lib/facility-builder/space-type-presets";
import { nextAppendDisplayOrder, nextAppendSortOrder } from "@/lib/facility-builder/builder-setup";

import {
  cellAt,
  mapHeadersWithAliases,
  normalizeHeaderKey,
  readCsvText,
  rowsToCsv,
} from "./csv";
import {
  emptyBulkImportCounts,
  type BulkImportCounts,
  type BulkImportFieldError,
  type BulkImportRowIssue,
  type BulkImportRowStatus,
} from "./types";

export const FACILITY_STRUCTURE_TEMPLATE_VERSION = "2026-09-16-a";

/**
 * User-facing Facility Structure CSV headers.
 * Internal UnitSpace domain remains unchanged; `locationName` / `locationType` are import UX terms.
 * `building` is optional — empty means Floor sits at the facility root (typical LTC).
 */
export const FACILITY_STRUCTURE_CSV_HEADERS = [
  "building",
  "floor",
  "neighborhood",
  "locationName",
  "locationType",
  "roomNumber",
  "code",
  "description",
  "department",
  "customTypeLabel",
] as const;

export type FacilityStructureField = (typeof FACILITY_STRUCTURE_CSV_HEADERS)[number];

/** Readable Location Type values shown in templates / help (from Facility Builder presets). */
export const FACILITY_LOCATION_TYPE_LABELS = SPACE_TYPE_PRESETS.filter(
  (p) => !p.requiresCustomLabel,
).map((p) => p.label);

const HEADER_ALIASES: Record<string, FacilityStructureField> = {
  building: "building",
  level0: "building",
  level_0: "building",
  floor: "floor",
  level1: "floor",
  level_1: "floor",
  neighborhood: "neighborhood",
  unit: "neighborhood",
  neighborhood_unit: "neighborhood",
  level2: "neighborhood",
  level_2: "neighborhood",
  // Canonical user-facing headers
  locationname: "locationName",
  location_name: "locationName",
  locationtype: "locationType",
  location_type: "locationType",
  // Backward-compatible aliases (parser only — not product terminology)
  space: "locationName",
  room: "locationName",
  room_space: "locationName",
  level3: "locationName",
  level_3: "locationName",
  spacetype: "locationType",
  space_type: "locationType",
  type: "locationType",
  roomnumber: "roomNumber",
  room_number: "roomNumber",
  code: "code",
  description: "description",
  department: "department",
  department_responsibility: "department",
  ownership: "department",
  customtypelabel: "customTypeLabel",
  custom_type_label: "customTypeLabel",
  custom_label: "customTypeLabel",
};

export const FACILITY_STRUCTURE_CSV_TEMPLATE = rowsToCsv(
  [...FACILITY_STRUCTURE_CSV_HEADERS],
  [
    ["", "Floor 1", "1A - Naval Park", "Room 101", "Resident Room", "101", "", "", "", ""],
    ["", "Floor 1", "1A - Naval Park", "Room 102", "Resident Room", "102", "", "", "", ""],
    ["", "Floor 1", "1A - Naval Park", "Servery", "Servery", "", "", "", "Dietary", ""],
    ["", "Floor 1", "1A - Naval Park", "Dining Room", "Dining Room", "", "", "", "", ""],
    ["", "Floor 1", "1A - Naval Park", "Clean Utility", "Utility Room", "", "", "", "", ""],
  ],
);

/** Row intent derived from which hierarchy fields are filled. */
export type FacilityStructureRowIntent = "floor" | "neighborhood" | "location";

export type ExistingUnitSnapshot = {
  id: string;
  name: string;
  hierarchyRole: UnitHierarchyRole | null;
  parentUnitId: string | null;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
};

export type ExistingSpaceSnapshot = {
  id: string;
  unitId: string | null;
  name: string;
  spaceType: SpaceType;
  customTypeLabel: string | null;
  roomNumber: string | null;
  code: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ExistingDepartmentSnapshot = {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
};

export type FacilityStructureCatalog = {
  units: ExistingUnitSnapshot[];
  spaces: ExistingSpaceSnapshot[];
  departments: ExistingDepartmentSnapshot[];
};

export type ParsedFacilityStructureRow = {
  rowNumber: number;
  building: string;
  floor: string;
  neighborhood: string;
  /** User-facing Location Name; maps to UnitSpace.name internally. */
  locationName: string;
  /** User-facing Location Type raw value; maps to SpaceType presets internally. */
  locationTypeRaw: string;
  roomNumber: string;
  code: string;
  description: string;
  department: string;
  customTypeLabel: string;
  cells: string[];
};

export type FacilityStructureRowPlan = {
  rowNumber: number;
  status: BulkImportRowStatus;
  intent: FacilityStructureRowIntent;
  buildingKey: string;
  floorKey: string;
  neighborhoodKey: string;
  spaceKey: string;
  buildingName: string;
  floorName: string;
  neighborhoodName: string;
  /** UnitSpace.name (user-facing Location Name). */
  spaceName: string;
  resolvedType: ResolvedSpaceTypeInput | null;
  roomNumber: string | null;
  code: string | null;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  buildingAction: "create" | "reuse" | "none";
  floorAction: "create" | "reuse" | "none";
  neighborhoodAction: "create" | "reuse" | "none";
  spaceAction: "create" | "reuse" | "skip" | "none";
  existingBuildingId: string | null;
  existingFloorId: string | null;
  existingNeighborhoodId: string | null;
  existingSpaceId: string | null;
  messages: string[];
  errors: BulkImportFieldError[];
  cells: string[];
};

export type FacilityHierarchyPreviewLocation = {
  name: string;
  typeLabel: string;
  roomNumber: string | null;
  action: "create" | "reuse" | "skip";
  /** Secondary line, e.g. "Resident Room · #101" or "Servery". */
  metaLine: string;
};

export type FacilityHierarchyPreviewNode = {
  name: string;
  action: "create" | "reuse";
  neighborhoods: Array<{
    name: string;
    action: "create" | "reuse";
    /** @deprecated Prefer locationCounts — kept for wizard compatibility. */
    spaceCounts: Record<string, number>;
    spaceTotal: number;
    locationCounts: Record<string, number>;
    locationTotal: number;
    locations: FacilityHierarchyPreviewLocation[];
  }>;
};

export function formatFacilityLocationPreviewMeta(
  typeLabel: string,
  roomNumber: string | null,
): string {
  const type = typeLabel.trim() || "Location";
  const room = roomNumber?.trim();
  if (room) return `${type} · #${room}`;
  return type;
}

export type FacilityStructureImportPlan = {
  fileName: string | null;
  counts: BulkImportCounts;
  rows: FacilityStructureRowPlan[];
  issues: BulkImportRowIssue[];
  hierarchyPreview: FacilityHierarchyPreviewNode[];
  buildingsToCreate: number;
  floorsToCreate: number;
  neighborhoodsToCreate: number;
  spacesToCreate: number;
  buildingsReused: number;
  floorsReused: number;
  neighborhoodsReused: number;
  spacesReused: number;
  canConfirm: boolean;
  createOps: FacilityStructureCreateOps;
};

export type FacilityStructureCreateOps = {
  buildings: Array<{ key: string; name: string }>;
  floors: Array<{ key: string; name: string; buildingKey: string }>;
  neighborhoods: Array<{ key: string; name: string; floorKey: string }>;
  spaces: Array<{
    key: string;
    neighborhoodKey: string;
    name: string;
    spaceType: SpaceType;
    customTypeLabel: string | null;
    roomNumber: string | null;
    code: string | null;
    description: string | null;
    departmentId: string | null;
  }>;
};

function normKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function resolveSpaceTypeLabel(raw: string, customTypeLabel: string): {
  ok: true;
  value: ResolvedSpaceTypeInput;
} | { ok: false; reason: string; suggestion?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: "Location Type is required when creating a location.",
      suggestion: `Use one of: ${FACILITY_LOCATION_TYPE_LABELS.join(", ")}`,
    };
  }

  const presetByKey = SPACE_TYPE_PRESETS.find(
    (p) => p.key === normalizeHeaderKey(trimmed) || p.key === trimmed.toLowerCase().replace(/\s+/g, "_"),
  );
  if (presetByKey) {
    try {
      return {
        ok: true,
        value: resolveSpaceTypeFromPreset({
          presetKey: presetByKey.key,
          customTypeLabel,
        }),
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Invalid Location Type.",
      };
    }
  }

  const byLabel = SPACE_TYPE_PRESETS.find(
    (p) => p.label.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byLabel) {
    try {
      return {
        ok: true,
        value: resolveSpaceTypeFromPreset({
          presetKey: byLabel.key,
          customTypeLabel,
        }),
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Invalid Location Type.",
      };
    }
  }

  // Allow canonical enum only as a clear alias (still map through presets).
  const enumMatch = (Object.values(SpaceType) as string[]).find(
    (v) => v === trimmed.toUpperCase(),
  );
  if (enumMatch) {
    const preset = SPACE_TYPE_PRESETS.find(
      (p) => !p.requiresCustomLabel && p.canonicalType === enumMatch,
    );
    if (preset) {
      return {
        ok: true,
        value: resolveSpaceTypeFromPreset({
          presetKey: preset.key,
          customTypeLabel,
        }),
      };
    }
  }

  if (trimmed.toLowerCase() === "other" || trimmed.toLowerCase() === "custom") {
    try {
      return {
        ok: true,
        value: resolveSpaceTypeFromPreset({
          presetKey: CUSTOM_SPACE_PRESET_KEY,
          customTypeLabel,
        }),
      };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "Custom type label is required.",
        suggestion: "Provide customTypeLabel when Location Type is Other / Custom.",
      };
    }
  }

  return {
    ok: false,
    reason: `Unknown Location Type "${trimmed}".`,
    suggestion: `Accepted values include: ${SPACE_TYPE_PRESETS.map((p) => p.label).join(", ")}`,
  };
}

export function parseFacilityStructureCsv(text: string, fileName?: string | null): {
  ok: true;
  rows: ParsedFacilityStructureRow[];
  headers: string[];
  fileName: string | null;
} | { ok: false; error: string } {
  const read = readCsvText(text, { fileName });
  if (!read.ok) return read;

  const colMap = mapHeadersWithAliases(read.headers, HEADER_ALIASES);
  const present = new Set(colMap.values());
  if (!present.has("floor")) {
    return {
      ok: false,
      error:
        "Missing required column: floor. Download the Facility Structure template (Location Name / Location Type).",
    };
  }

  const rows: ParsedFacilityStructureRow[] = read.rows.map((cells, idx) => ({
    rowNumber: idx + 2,
    building: cellAt(cells, colMap, "building"),
    floor: cellAt(cells, colMap, "floor"),
    neighborhood: cellAt(cells, colMap, "neighborhood"),
    locationName: cellAt(cells, colMap, "locationName"),
    locationTypeRaw: cellAt(cells, colMap, "locationType"),
    roomNumber: cellAt(cells, colMap, "roomNumber"),
    code: cellAt(cells, colMap, "code"),
    description: cellAt(cells, colMap, "description"),
    department: cellAt(cells, colMap, "department"),
    customTypeLabel: cellAt(cells, colMap, "customTypeLabel"),
    cells: FACILITY_STRUCTURE_CSV_HEADERS.map((h) => cellAt(cells, colMap, h)),
  }));

  return { ok: true, rows, headers: [...FACILITY_STRUCTURE_CSV_HEADERS], fileName: read.fileName };
}

export function resolveFacilityStructureRowIntent(row: {
  neighborhood: string;
  locationName: string;
}): FacilityStructureRowIntent {
  if (row.locationName.trim()) return "location";
  if (row.neighborhood.trim()) return "neighborhood";
  return "floor";
}

function findUnitsByName(
  catalog: FacilityStructureCatalog,
  name: string,
): ExistingUnitSnapshot[] {
  const key = normKey(name);
  return catalog.units.filter((u) => normKey(u.name) === key);
}

function findBuildingMatches(
  catalog: FacilityStructureCatalog,
  name: string,
): ExistingUnitSnapshot[] {
  return findUnitsByName(catalog, name).filter(
    (u) => resolveBuilderNodeDisplayKind(u) === "building",
  );
}

function findFloorMatches(
  catalog: FacilityStructureCatalog,
  floorName: string,
  buildingId: string | null,
): ExistingUnitSnapshot[] {
  return findUnitsByName(catalog, floorName).filter((u) => {
    if (resolveBuilderNodeDisplayKind(u) !== "floor") return false;
    return (u.parentUnitId ?? null) === buildingId;
  });
}

function findDepartment(
  catalog: FacilityStructureCatalog,
  raw: string,
):
  | { ok: true; department: ExistingDepartmentSnapshot | null }
  | { ok: false; reason: string; suggestion?: string } {
  if (!raw.trim()) return { ok: true, department: null };
  const key = normKey(raw);
  const matches = catalog.departments.filter(
    (d) => d.isActive && (normKey(d.name) === key || normKey(d.key) === key),
  );
  if (matches.length === 0) {
    return {
      ok: false,
      reason: `Unknown department "${raw.trim()}".`,
      suggestion: "Use an active department name or key from Department Builder.",
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `Ambiguous department "${raw.trim()}" matches ${matches.length} departments.`,
    };
  }
  return { ok: true, department: matches[0]! };
}

function spaceTypeConflicts(
  existing: ExistingSpaceSnapshot,
  resolved: ResolvedSpaceTypeInput,
): boolean {
  if (existing.spaceType !== resolved.spaceType) return true;
  const a = (existing.customTypeLabel ?? "").trim().toLowerCase();
  const b = (resolved.customTypeLabel ?? "").trim().toLowerCase();
  if (a && b && a !== b) return true;
  return false;
}

/**
 * Validate CSV rows against a preloaded facility catalog (batch-loaded; no N+1).
 * Supports optional Building, Floor-only, Floor+Neighborhood, and location rows.
 */
export function planFacilityStructureImport(
  parsedRows: ParsedFacilityStructureRow[],
  catalog: FacilityStructureCatalog,
  fileName: string | null = null,
): FacilityStructureImportPlan {
  const counts = emptyBulkImportCounts(parsedRows.length);
  const rows: FacilityStructureRowPlan[] = [];
  const issues: BulkImportRowIssue[] = [];

  const plannedBuildings = new Map<string, { name: string; action: "create" | "reuse"; id: string | null }>();
  const plannedFloors = new Map<
    string,
    { name: string; buildingKey: string; action: "create" | "reuse"; id: string | null }
  >();
  const plannedNeighborhoods = new Map<
    string,
    { name: string; floorKey: string; action: "create" | "reuse"; id: string | null }
  >();
  const plannedSpaces = new Map<
    string,
    {
      name: string;
      neighborhoodKey: string;
      action: "create" | "reuse" | "skip";
      id: string | null;
      typeLabel: string;
      roomNumber: string | null;
    }
  >();
  const fileSpaceKeys = new Set<string>();

  for (const raw of parsedRows) {
    const errors: BulkImportFieldError[] = [];
    const messages: string[] = [];
    let status: BulkImportRowStatus = "create";
    let resolvedType: ResolvedSpaceTypeInput | null = null;
    let departmentId: string | null = null;
    let departmentName: string | null = null;
    let buildingAction: FacilityStructureRowPlan["buildingAction"] = "none";
    let floorAction: FacilityStructureRowPlan["floorAction"] = "none";
    let neighborhoodAction: FacilityStructureRowPlan["neighborhoodAction"] = "none";
    let spaceAction: FacilityStructureRowPlan["spaceAction"] = "none";
    let existingBuildingId: string | null = null;
    let existingFloorId: string | null = null;
    let existingNeighborhoodId: string | null = null;
    let existingSpaceId: string | null = null;

    const intent = resolveFacilityStructureRowIntent(raw);
    const hasLocationName = Boolean(raw.locationName.trim());
    const hasLocationType = Boolean(raw.locationTypeRaw.trim());
    const hasRoomNumber = Boolean(raw.roomNumber.trim());
    const hasCustomTypeLabel = Boolean(raw.customTypeLabel.trim());
    const hasDepartment = Boolean(raw.department.trim());
    const hasCode = Boolean(raw.code.trim());
    const hasDescription = Boolean(raw.description.trim());

    if (raw.building.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "building",
        value: raw.building,
        reason: "Building name must be 120 characters or fewer.",
      });
    }
    if (!raw.floor.trim()) {
      errors.push({
        row: raw.rowNumber,
        field: "floor",
        value: "",
        reason: "Floor is required.",
        suggestion: "Provide the Floor name (e.g. Floor 1).",
      });
    }
    if (raw.floor.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "floor",
        value: raw.floor,
        reason: "Floor name must be 120 characters or fewer.",
      });
    }
    if (raw.neighborhood.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "neighborhood",
        value: raw.neighborhood,
        reason: "Neighborhood name must be 120 characters or fewer.",
      });
    }
    if (raw.locationName.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "locationName",
        value: raw.locationName,
        reason: "Location Name must be 120 characters or fewer.",
      });
    }
    if (raw.roomNumber.length > 32) {
      errors.push({
        row: raw.rowNumber,
        field: "roomNumber",
        value: raw.roomNumber,
        reason: "Room Number must be 32 characters or fewer.",
      });
    }
    if (raw.code.length > 20) {
      errors.push({
        row: raw.rowNumber,
        field: "code",
        value: raw.code,
        reason: "Code must be 20 characters or fewer.",
      });
    }
    if (raw.description.length > 500) {
      errors.push({
        row: raw.rowNumber,
        field: "description",
        value: raw.description.slice(0, 80),
        reason: "Description must be 500 characters or fewer.",
      });
    }

    // Cross-field hierarchy intent rules
    if (!hasLocationName) {
      if (hasLocationType) {
        errors.push({
          row: raw.rowNumber,
          field: "locationType",
          value: raw.locationTypeRaw,
          reason: "Location Type was provided without a Location Name.",
          suggestion:
            "Add a Location Name, or clear Location Type when the row only creates a Floor or Neighborhood.",
        });
      }
      if (hasRoomNumber) {
        errors.push({
          row: raw.rowNumber,
          field: "roomNumber",
          value: raw.roomNumber,
          reason: "Room Number was provided without a Location Name.",
          suggestion: "Room Number is optional metadata for a location — add a Location Name first.",
        });
      }
      if (hasCustomTypeLabel) {
        errors.push({
          row: raw.rowNumber,
          field: "customTypeLabel",
          value: raw.customTypeLabel,
          reason: "Custom type label was provided without a Location Name / Location Type.",
          suggestion: "Provide Location Name and Location Type when using customTypeLabel.",
        });
      }
      if (intent === "floor" && (hasDepartment || hasCode || hasDescription)) {
        errors.push({
          row: raw.rowNumber,
          field: hasDepartment ? "department" : hasCode ? "code" : "description",
          value: hasDepartment ? raw.department : hasCode ? raw.code : raw.description.slice(0, 80),
          reason:
            "Location-only fields (code, description, department) require a Location Name.",
          suggestion:
            "Leave those columns blank for Floor-only rows, or add Location Name and Location Type.",
        });
      }
    }

    if (intent === "location") {
      if (!raw.neighborhood.trim()) {
        errors.push({
          row: raw.rowNumber,
          field: "neighborhood",
          value: "",
          reason: "Neighborhood / Unit is required when creating a location.",
          suggestion:
            "Locations sit under a Neighborhood. Add the Neighborhood name, or remove Location Name for a Floor-only row.",
        });
      }
      const typeResolved = resolveSpaceTypeLabel(raw.locationTypeRaw, raw.customTypeLabel);
      if (!typeResolved.ok) {
        errors.push({
          row: raw.rowNumber,
          field: "locationType",
          value: raw.locationTypeRaw,
          reason: typeResolved.reason,
          suggestion: typeResolved.suggestion,
        });
      } else {
        resolvedType = typeResolved.value;
      }
    } else if (hasCustomTypeLabel && !hasLocationType) {
      errors.push({
        row: raw.rowNumber,
        field: "customTypeLabel",
        value: raw.customTypeLabel,
        reason: "Custom type label requires a Location Type.",
      });
    }

    if (hasDepartment && intent === "location") {
      const dept = findDepartment(catalog, raw.department);
      if (!dept.ok) {
        errors.push({
          row: raw.rowNumber,
          field: "department",
          value: raw.department,
          reason: dept.reason,
          suggestion: dept.suggestion,
        });
      } else if (dept.department) {
        departmentId = dept.department.id;
        departmentName = dept.department.name;
      }
    } else if (hasDepartment && intent === "neighborhood") {
      errors.push({
        row: raw.rowNumber,
        field: "department",
        value: raw.department,
        reason: "Department applies to locations, not Neighborhood-only rows.",
        suggestion: "Clear department, or add Location Name and Location Type.",
      });
    }

    const buildingKey = raw.building.trim() ? normKey(raw.building) : "";
    const floorKey = `${buildingKey}::${normKey(raw.floor)}`;
    const neighborhoodKey = raw.neighborhood.trim()
      ? `${floorKey}::${normKey(raw.neighborhood)}`
      : "";
    const spaceKey =
      intent === "location" && neighborhoodKey
        ? `${neighborhoodKey}::${normKey(raw.locationName)}`
        : "";

    if (errors.length === 0) {
      // Optional Building resolution
      if (buildingKey) {
        const plannedBuilding = plannedBuildings.get(buildingKey);
        if (plannedBuilding) {
          buildingAction = plannedBuilding.action;
          existingBuildingId = plannedBuilding.id;
        } else {
          const matches = findBuildingMatches(catalog, raw.building);
          if (matches.length > 1) {
            errors.push({
              row: raw.rowNumber,
              field: "building",
              value: raw.building,
              reason: `Ambiguous building name "${raw.building}" matches ${matches.length} units.`,
            });
          } else if (matches.length === 1) {
            const match = matches[0]!;
            if (!match.isActive) {
              errors.push({
                row: raw.rowNumber,
                field: "building",
                value: raw.building,
                reason: `Building "${match.name}" is inactive and cannot be used for import.`,
              });
            } else {
              buildingAction = "reuse";
              existingBuildingId = match.id;
              plannedBuildings.set(buildingKey, {
                name: match.name,
                action: "reuse",
                id: match.id,
              });
            }
          } else {
            const nameCollisions = findUnitsByName(catalog, raw.building).filter(
              (u) => resolveBuilderNodeDisplayKind(u) !== "building",
            );
            if (nameCollisions.length > 0) {
              errors.push({
                row: raw.rowNumber,
                field: "building",
                value: raw.building,
                reason: `Existing unit "${raw.building.trim()}" is not a Building.`,
                suggestion: "Use a distinct Building name.",
              });
            } else {
              buildingAction = "create";
              plannedBuildings.set(buildingKey, {
                name: raw.building.trim(),
                action: "create",
                id: null,
              });
            }
          }
        }
      }

      // Floor resolution (scoped to optional Building)
      if (errors.length === 0) {
      const plannedFloor = plannedFloors.get(floorKey);
      if (plannedFloor) {
        floorAction = plannedFloor.action;
        existingFloorId = plannedFloor.id;
        if (intent === "floor" && plannedFloor.action === "reuse") {
          status = "reuse";
          messages.push(`Reusing existing Floor "${plannedFloor.name}".`);
        } else if (intent === "floor" && plannedFloor.action === "create") {
          status = "reuse";
          messages.push(`Floor "${plannedFloor.name}" already planned earlier in this file.`);
        }
      } else if (buildingKey && !existingBuildingId) {
        floorAction = "create";
        plannedFloors.set(floorKey, {
          name: raw.floor.trim(),
          buildingKey,
          action: "create",
          id: null,
        });
        if (intent === "floor") {
          status = "create";
          messages.push(`Will create Floor "${raw.floor.trim()}".`);
        }
      } else {
        const matches = findFloorMatches(catalog, raw.floor, existingBuildingId);
        if (matches.length > 1) {
          errors.push({
            row: raw.rowNumber,
            field: "floor",
            value: raw.floor,
            reason: `Ambiguous floor name "${raw.floor}" matches ${matches.length} units.`,
            suggestion: "Rename conflicting units in Facility Builder, then re-import.",
          });
        } else if (matches.length === 1) {
          const match = matches[0]!;
          const kind = resolveBuilderNodeDisplayKind(match);
          if (kind !== "floor") {
            errors.push({
              row: raw.rowNumber,
              field: "floor",
              value: raw.floor,
              reason: `Existing unit "${match.name}" is not a Floor (found ${kind.replace("_", " ")}).`,
              suggestion: "Use a distinct Floor name or convert the existing unit deliberately in Builder.",
            });
          } else if (!match.isActive) {
            errors.push({
              row: raw.rowNumber,
              field: "floor",
              value: raw.floor,
              reason: `Floor "${match.name}" is inactive and cannot be used for import.`,
            });
          } else {
            floorAction = "reuse";
            existingFloorId = match.id;
            plannedFloors.set(floorKey, {
              name: match.name,
              buildingKey,
              action: "reuse",
              id: match.id,
            });
            messages.push(`Reusing existing Floor "${match.name}".`);
            if (intent === "floor") status = "reuse";
          }
        } else {
          floorAction = "create";
          plannedFloors.set(floorKey, {
            name: raw.floor.trim(),
            buildingKey,
            action: "create",
            id: null,
          });
          if (intent === "floor") {
            status = "create";
            messages.push(`Will create Floor "${raw.floor.trim()}".`);
          }
        }
      }
      }

      // Neighborhood resolution (when present)
      if (errors.length === 0 && (intent === "neighborhood" || intent === "location")) {
        const plannedNbh = plannedNeighborhoods.get(neighborhoodKey);
        if (plannedNbh) {
          if (plannedNbh.floorKey !== floorKey) {
            errors.push({
              row: raw.rowNumber,
              field: "neighborhood",
              value: raw.neighborhood,
              reason: `Neighborhood "${raw.neighborhood}" is already planned under a different Floor in this file.`,
            });
          } else {
            neighborhoodAction = plannedNbh.action;
            existingNeighborhoodId = plannedNbh.id;
            if (intent === "neighborhood") {
              status = plannedNbh.action === "reuse" ? "reuse" : "reuse";
              messages.push(
                plannedNbh.action === "reuse"
                  ? `Reusing existing Neighborhood "${plannedNbh.name}".`
                  : `Neighborhood "${plannedNbh.name}" already planned earlier in this file.`,
              );
            }
          }
        } else {
          const matches = findUnitsByName(catalog, raw.neighborhood).filter((u) => {
            if (resolveBuilderNodeDisplayKind(u) === "staged") return true;
            if (existingFloorId) return u.parentUnitId === existingFloorId;
            return u.parentUnitId == null;
          });
          if (matches.length > 1) {
            errors.push({
              row: raw.rowNumber,
              field: "neighborhood",
              value: raw.neighborhood,
              reason: `Ambiguous neighborhood name "${raw.neighborhood}".`,
            });
          } else if (matches.length === 1) {
            const match = matches[0]!;
            const kind = resolveBuilderNodeDisplayKind(match);
            if (kind === "staged") {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Neighborhood "${match.name}" exists in Undesignated staging and cannot be silently attached by import.`,
                suggestion: "Move it under the Floor in Facility Builder, or use a new name.",
              });
            } else if (kind !== "neighborhood" && kind !== "legacy_location") {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Existing unit "${match.name}" is a ${kind.replace("_", " ")}, not a Neighborhood/Unit.`,
              });
            } else if (!match.isActive) {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Neighborhood "${match.name}" is inactive.`,
              });
            } else if (
              existingFloorId &&
              match.parentUnitId &&
              match.parentUnitId !== existingFloorId
            ) {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Neighborhood "${match.name}" already exists under a different Floor. Imports do not move hierarchy.`,
              });
            } else if (floorAction === "create" && match.parentUnitId) {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Neighborhood "${match.name}" already exists, but Floor "${raw.floor}" is new — hierarchy conflict.`,
              });
            } else if (floorAction === "reuse" && !match.parentUnitId) {
              errors.push({
                row: raw.rowNumber,
                field: "neighborhood",
                value: raw.neighborhood,
                reason: `Neighborhood "${match.name}" has no Floor parent; import will not re-parent it.`,
              });
            } else {
              neighborhoodAction = "reuse";
              existingNeighborhoodId = match.id;
              plannedNeighborhoods.set(neighborhoodKey, {
                name: match.name,
                floorKey,
                action: "reuse",
                id: match.id,
              });
              messages.push(`Reusing existing Neighborhood "${match.name}".`);
              if (intent === "neighborhood") status = "reuse";
            }
          } else {
            neighborhoodAction = "create";
            plannedNeighborhoods.set(neighborhoodKey, {
              name: raw.neighborhood.trim(),
              floorKey,
              action: "create",
              id: null,
            });
            if (intent === "neighborhood") {
              status = "create";
              messages.push(`Will create Neighborhood "${raw.neighborhood.trim()}".`);
            }
          }
        }
      }

      // Location (UnitSpace) resolution
      if (errors.length === 0 && intent === "location" && resolvedType) {
        if (fileSpaceKeys.has(spaceKey)) {
          spaceAction = "skip";
          status = "skip";
          messages.push(
            "Duplicate row in file — location already planned; will not create twice.",
          );
          plannedSpaces.set(
            spaceKey,
            plannedSpaces.get(spaceKey) ?? {
              name: raw.locationName.trim(),
              neighborhoodKey,
              action: "skip",
              id: null,
              typeLabel: raw.locationTypeRaw,
              roomNumber: raw.roomNumber || null,
            },
          );
        } else {
          fileSpaceKeys.add(spaceKey);
          const parentId = existingNeighborhoodId;
          const existingSpaces = catalog.spaces.filter(
            (s) =>
              normKey(s.name) === normKey(raw.locationName) &&
              (parentId ? s.unitId === parentId : false),
          );

          if (neighborhoodAction === "reuse" && parentId) {
            if (existingSpaces.length > 1) {
              errors.push({
                row: raw.rowNumber,
                field: "locationName",
                value: raw.locationName,
                reason: `Ambiguous location "${raw.locationName}" under this neighborhood.`,
              });
            } else if (existingSpaces.length === 1) {
              const existing = existingSpaces[0]!;
              if (!existing.isActive) {
                errors.push({
                  row: raw.rowNumber,
                  field: "locationName",
                  value: raw.locationName,
                  reason: `Location "${existing.name}" is inactive.`,
                });
              } else if (spaceTypeConflicts(existing, resolvedType)) {
                status = "conflict";
                errors.push({
                  row: raw.rowNumber,
                  field: "locationType",
                  value: raw.locationTypeRaw,
                  reason: `Location "${existing.name}" already exists with a different type. Import will not overwrite.`,
                  suggestion:
                    "Change the type in Facility Builder, or use a different Location Name.",
                });
              } else {
                const optionalDiff =
                  (raw.roomNumber &&
                    (existing.roomNumber ?? "") !== raw.roomNumber) ||
                  (raw.code && (existing.code ?? "") !== raw.code) ||
                  (raw.description &&
                    (existing.description ?? "") !== raw.description);
                spaceAction = "reuse";
                existingSpaceId = existing.id;
                status = optionalDiff ? "warning" : "reuse";
                if (optionalDiff) {
                  messages.push(
                    "Existing location reused; optional fields differ and will not be overwritten.",
                  );
                } else {
                  messages.push(`Reusing existing location "${existing.name}".`);
                }
                plannedSpaces.set(spaceKey, {
                  name: existing.name,
                  neighborhoodKey,
                  action: "reuse",
                  id: existing.id,
                  typeLabel: raw.locationTypeRaw,
                  roomNumber: existing.roomNumber,
                });
              }
            } else {
              spaceAction = "create";
              plannedSpaces.set(spaceKey, {
                name: raw.locationName.trim(),
                neighborhoodKey,
                action: "create",
                id: null,
                typeLabel: raw.locationTypeRaw,
                roomNumber: raw.roomNumber || null,
              });
            }
          } else if (neighborhoodAction === "create") {
            spaceAction = "create";
            plannedSpaces.set(spaceKey, {
              name: raw.locationName.trim(),
              neighborhoodKey,
              action: "create",
              id: null,
              typeLabel: raw.locationTypeRaw,
              roomNumber: raw.roomNumber || null,
            });
          }
        }
      }
    }

    if (errors.length > 0) {
      if (status !== "conflict") status = "invalid";
      for (const err of errors) {
        issues.push({
          row: err.row,
          status,
          message: err.reason,
          field: err.field,
          value: err.value,
          suggestion: err.suggestion,
        });
      }
    } else if (status === "skip") {
      // already set
    } else if (status === "warning" || status === "reuse") {
      // ok
    } else if (spaceAction === "create" || floorAction === "create" || neighborhoodAction === "create" || buildingAction === "create") {
      status = "create";
    }

    rows.push({
      rowNumber: raw.rowNumber,
      status,
      intent,
      buildingKey,
      floorKey,
      neighborhoodKey,
      spaceKey,
      buildingName: raw.building.trim(),
      floorName: raw.floor.trim(),
      neighborhoodName: raw.neighborhood.trim(),
      spaceName: raw.locationName.trim(),
      resolvedType,
      roomNumber: raw.roomNumber || null,
      code: raw.code || null,
      description: raw.description || null,
      departmentId,
      departmentName,
      buildingAction,
      floorAction,
      neighborhoodAction,
      spaceAction,
      existingBuildingId,
      existingFloorId,
      existingNeighborhoodId,
      existingSpaceId,
      messages,
      errors,
      cells: raw.cells,
    });
  }

  // Counts
  for (const row of rows) {
    if (row.status === "invalid" || row.status === "conflict") {
      counts.invalidRows += 1;
      if (row.status === "conflict") counts.conflictCount += 1;
    } else if (row.status === "warning") {
      counts.warningRows += 1;
      counts.validRows += 1;
    } else if (row.status === "skip" || row.status === "reuse") {
      counts.skipCount += 1;
      counts.validRows += 1;
      if (row.status === "reuse") counts.reuseCount += 1;
    } else if (row.status === "create") {
      counts.validRows += 1;
      counts.createCount += 1;
    }
  }

  const createOps: FacilityStructureCreateOps = {
    buildings: [...plannedBuildings.entries()]
      .filter(([, v]) => v.action === "create")
      .map(([key, v]) => ({ key, name: v.name })),
    floors: [...plannedFloors.entries()]
      .filter(([, v]) => v.action === "create")
      .map(([key, v]) => ({ key, name: v.name, buildingKey: v.buildingKey })),
    neighborhoods: [...plannedNeighborhoods.entries()]
      .filter(([, v]) => v.action === "create")
      .map(([key, v]) => ({ key, name: v.name, floorKey: v.floorKey })),
    spaces: [],
  };

  for (const row of rows) {
    if (
      (row.status === "create" || row.status === "warning") &&
      row.spaceAction === "create" &&
      row.resolvedType
    ) {
      if (!createOps.spaces.some((s) => s.key === row.spaceKey)) {
        createOps.spaces.push({
          key: row.spaceKey,
          neighborhoodKey: row.neighborhoodKey,
          name: row.spaceName,
          spaceType: row.resolvedType.spaceType,
          customTypeLabel: row.resolvedType.customTypeLabel,
          roomNumber: row.roomNumber,
          code: row.code,
          description: row.description,
          departmentId: row.departmentId,
        });
      }
    }
  }

  const hierarchyPreview = buildHierarchyPreview(rows, plannedFloors, plannedNeighborhoods);

  const buildingsToCreate = createOps.buildings.length;
  const floorsToCreate = createOps.floors.length;
  const neighborhoodsToCreate = createOps.neighborhoods.length;
  const spacesToCreate = createOps.spaces.length;
  const buildingsReused = [...plannedBuildings.values()].filter((v) => v.action === "reuse").length;
  const floorsReused = [...plannedFloors.values()].filter((v) => v.action === "reuse").length;
  const neighborhoodsReused = [...plannedNeighborhoods.values()].filter(
    (v) => v.action === "reuse",
  ).length;
  const spacesReused = [...plannedSpaces.values()].filter((v) => v.action === "reuse").length;

  return {
    fileName,
    counts,
    rows,
    issues,
    hierarchyPreview,
    buildingsToCreate,
    floorsToCreate,
    neighborhoodsToCreate,
    spacesToCreate,
    buildingsReused,
    floorsReused,
    neighborhoodsReused,
    spacesReused,
    canConfirm: false,
    createOps,
  };
}

function locationTypeLabel(row: FacilityStructureRowPlan): string {
  return (
    row.resolvedType?.customTypeLabel ||
    SPACE_TYPE_PRESETS.find((p) => p.canonicalType === row.resolvedType?.spaceType)?.label ||
    "Location"
  );
}

function buildHierarchyPreview(
  rows: FacilityStructureRowPlan[],
  plannedFloors: Map<
    string,
    { name: string; buildingKey: string; action: "create" | "reuse"; id: string | null }
  >,
  plannedNeighborhoods: Map<
    string,
    { name: string; floorKey: string; action: "create" | "reuse"; id: string | null }
  >,
): FacilityHierarchyPreviewNode[] {
  const floorNodes = new Map<string, FacilityHierarchyPreviewNode>();

  for (const [floorKey, floor] of plannedFloors.entries()) {
    const sample = rows.find((r) => r.floorKey === floorKey);
    const buildingName = sample?.buildingName.trim();
    floorNodes.set(floorKey, {
      name: buildingName ? `${buildingName} / ${floor.name}` : floor.name,
      action: floor.action,
      neighborhoods: [],
    });
  }

  for (const [nbhKey, nbh] of plannedNeighborhoods.entries()) {
    const floor = floorNodes.get(nbh.floorKey);
    if (!floor) continue;

    const uniqueLabels: Record<string, number> = {};
    const locations: FacilityHierarchyPreviewLocation[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.neighborhoodKey !== nbhKey) continue;
      if (row.status === "invalid" || row.status === "conflict") continue;
      if (row.intent !== "location" || row.spaceAction === "none") continue;
      if (seen.has(row.spaceKey)) continue;
      seen.add(row.spaceKey);
      const typeLabel = locationTypeLabel(row);
      uniqueLabels[typeLabel] = (uniqueLabels[typeLabel] ?? 0) + 1;
      const action =
        row.spaceAction === "reuse" || row.spaceAction === "skip" || row.spaceAction === "create"
          ? row.spaceAction
          : "create";
      locations.push({
        name: row.spaceName,
        typeLabel,
        roomNumber: row.roomNumber,
        action,
        metaLine: formatFacilityLocationPreviewMeta(typeLabel, row.roomNumber),
      });
    }

    const locationTotal = Object.values(uniqueLabels).reduce((a, b) => a + b, 0);
    floor.neighborhoods.push({
      name: nbh.name,
      action: nbh.action,
      spaceCounts: uniqueLabels,
      spaceTotal: locationTotal,
      locationCounts: uniqueLabels,
      locationTotal,
      locations,
    });
  }

  // Floor-only rows: ensure floor appears even with no neighborhoods
  for (const [floorKey, floor] of plannedFloors.entries()) {
    if (!floorNodes.has(floorKey)) {
      floorNodes.set(floorKey, {
        name: floor.name,
        action: floor.action,
        neighborhoods: [],
      });
    }
  }

  return [...floorNodes.values()];
}

/** Adjust canConfirm: allow confirm when there is work OR idempotent all-reuse with no invalids. */
export function finalizeFacilityPlanConfirmability(
  plan: FacilityStructureImportPlan,
): FacilityStructureImportPlan {
  const work =
    plan.buildingsToCreate +
    plan.floorsToCreate +
      plan.neighborhoodsToCreate +
      plan.spacesToCreate;
  const canConfirm =
    plan.counts.invalidRows === 0 &&
    plan.counts.totalRows > 0 &&
    (work > 0 || plan.counts.validRows > 0);
  return { ...plan, canConfirm };
}

export type FacilityStructureExecuteContext = {
  facilityId: string;
  catalog: FacilityStructureCatalog;
};

/**
 * Deterministic parent-before-child create ops for transactional execution.
 * Pure planning helper used by the server executor.
 */
export function orderedFacilityCreatePlan(plan: FacilityStructureImportPlan): FacilityStructureCreateOps {
  return {
    buildings: [...plan.createOps.buildings].sort((a, b) => a.name.localeCompare(b.name)),
    floors: [...plan.createOps.floors].sort((a, b) => {
      const bcmp = a.buildingKey.localeCompare(b.buildingKey);
      return bcmp !== 0 ? bcmp : a.name.localeCompare(b.name);
    }),
    neighborhoods: [...plan.createOps.neighborhoods].sort((a, b) => {
      const floorCmp = a.floorKey.localeCompare(b.floorKey);
      return floorCmp !== 0 ? floorCmp : a.name.localeCompare(b.name);
    }),
    spaces: [...plan.createOps.spaces].sort((a, b) => {
      const n = a.neighborhoodKey.localeCompare(b.neighborhoodKey);
      return n !== 0 ? n : a.name.localeCompare(b.name);
    }),
  };
}

export {
  FLOOR_INTERNAL_UNIT_TYPE,
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
  nextAppendDisplayOrder,
  nextAppendSortOrder,
};

export type { UnitType };
