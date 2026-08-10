/**
 * Facility Structure bulk import — parse, validate, and plan create-only hierarchy writes.
 * Writes go through canonical Unit (FLOOR / NEIGHBORHOOD) + UnitSpace models.
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

export const FACILITY_STRUCTURE_TEMPLATE_VERSION = "2026-08-09";

export const FACILITY_STRUCTURE_CSV_HEADERS = [
  "floor",
  "neighborhood",
  "space",
  "spaceType",
  "roomNumber",
  "code",
  "description",
  "department",
  "customTypeLabel",
] as const;

export type FacilityStructureField = (typeof FACILITY_STRUCTURE_CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, FacilityStructureField> = {
  floor: "floor",
  level1: "floor",
  level_1: "floor",
  neighborhood: "neighborhood",
  unit: "neighborhood",
  neighborhood_unit: "neighborhood",
  level2: "neighborhood",
  level_2: "neighborhood",
  space: "space",
  room: "space",
  room_space: "space",
  level3: "space",
  level_3: "space",
  spacetype: "spaceType",
  space_type: "spaceType",
  type: "spaceType",
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
    [
      "Floor 1",
      "1A - Naval Park",
      "Room 101",
      "Resident Room",
      "101",
      "",
      "",
      "Dietary",
      "",
    ],
    [
      "Floor 1",
      "1A - Naval Park",
      "Servery",
      "Servery",
      "",
      "",
      "Neighborhood servery",
      "Dietary",
      "",
    ],
  ],
);

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
  floor: string;
  neighborhood: string;
  space: string;
  spaceTypeRaw: string;
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
  floorKey: string;
  neighborhoodKey: string;
  spaceKey: string;
  floorName: string;
  neighborhoodName: string;
  spaceName: string;
  resolvedType: ResolvedSpaceTypeInput | null;
  roomNumber: string | null;
  code: string | null;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  floorAction: "create" | "reuse" | "none";
  neighborhoodAction: "create" | "reuse" | "none";
  spaceAction: "create" | "reuse" | "skip" | "none";
  existingFloorId: string | null;
  existingNeighborhoodId: string | null;
  existingSpaceId: string | null;
  messages: string[];
  errors: BulkImportFieldError[];
  cells: string[];
};

export type FacilityHierarchyPreviewNode = {
  name: string;
  action: "create" | "reuse";
  neighborhoods: Array<{
    name: string;
    action: "create" | "reuse";
    spaceCounts: Record<string, number>;
    spaceTotal: number;
  }>;
};

export type FacilityStructureImportPlan = {
  fileName: string | null;
  counts: BulkImportCounts;
  rows: FacilityStructureRowPlan[];
  issues: BulkImportRowIssue[];
  hierarchyPreview: FacilityHierarchyPreviewNode[];
  floorsToCreate: number;
  neighborhoodsToCreate: number;
  spacesToCreate: number;
  floorsReused: number;
  neighborhoodsReused: number;
  spacesReused: number;
  canConfirm: boolean;
  createOps: FacilityStructureCreateOps;
};

export type FacilityStructureCreateOps = {
  floors: Array<{ key: string; name: string }>;
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
      reason: "Space type is required.",
      suggestion: `Use one of: ${SPACE_TYPE_PRESETS.filter((p) => !p.requiresCustomLabel)
        .map((p) => p.label)
        .join(", ")}`,
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
        reason: err instanceof Error ? err.message : "Invalid space type.",
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
        reason: err instanceof Error ? err.message : "Invalid space type.",
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
        suggestion: "Provide customTypeLabel when spaceType is Other / Custom.",
      };
    }
  }

  return {
    ok: false,
    reason: `Unknown space type "${trimmed}".`,
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
  const required: FacilityStructureField[] = ["floor", "neighborhood", "space", "spaceType"];
  const present = new Set(colMap.values());
  const missing = required.filter((f) => !present.has(f));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${missing.join(", ")}. Download the Facility Structure template.`,
    };
  }

  const rows: ParsedFacilityStructureRow[] = read.rows.map((cells, idx) => ({
    rowNumber: idx + 2,
    floor: cellAt(cells, colMap, "floor"),
    neighborhood: cellAt(cells, colMap, "neighborhood"),
    space: cellAt(cells, colMap, "space"),
    spaceTypeRaw: cellAt(cells, colMap, "spaceType"),
    roomNumber: cellAt(cells, colMap, "roomNumber"),
    code: cellAt(cells, colMap, "code"),
    description: cellAt(cells, colMap, "description"),
    department: cellAt(cells, colMap, "department"),
    customTypeLabel: cellAt(cells, colMap, "customTypeLabel"),
    cells: FACILITY_STRUCTURE_CSV_HEADERS.map((h) => cellAt(cells, colMap, h)),
  }));

  return { ok: true, rows, headers: [...FACILITY_STRUCTURE_CSV_HEADERS], fileName: read.fileName };
}

function findUnitsByName(
  catalog: FacilityStructureCatalog,
  name: string,
): ExistingUnitSnapshot[] {
  const key = normKey(name);
  return catalog.units.filter((u) => normKey(u.name) === key);
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
 */
export function planFacilityStructureImport(
  parsedRows: ParsedFacilityStructureRow[],
  catalog: FacilityStructureCatalog,
  fileName: string | null = null,
): FacilityStructureImportPlan {
  const counts = emptyBulkImportCounts(parsedRows.length);
  const rows: FacilityStructureRowPlan[] = [];
  const issues: BulkImportRowIssue[] = [];

  const plannedFloors = new Map<string, { name: string; action: "create" | "reuse"; id: string | null }>();
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
    let floorAction: FacilityStructureRowPlan["floorAction"] = "none";
    let neighborhoodAction: FacilityStructureRowPlan["neighborhoodAction"] = "none";
    let spaceAction: FacilityStructureRowPlan["spaceAction"] = "none";
    let existingFloorId: string | null = null;
    let existingNeighborhoodId: string | null = null;
    let existingSpaceId: string | null = null;

    if (!raw.floor) {
      errors.push({
        row: raw.rowNumber,
        field: "floor",
        value: "",
        reason: "Floor is required.",
        suggestion: "Provide the Floor name (e.g. Floor 1).",
      });
    }
    if (!raw.neighborhood) {
      errors.push({
        row: raw.rowNumber,
        field: "neighborhood",
        value: "",
        reason: "Neighborhood / Unit is required.",
      });
    }
    if (!raw.space) {
      errors.push({
        row: raw.rowNumber,
        field: "space",
        value: "",
        reason: "Room / Space is required.",
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
    if (raw.space.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "space",
        value: raw.space,
        reason: "Space name must be 120 characters or fewer.",
      });
    }
    if (raw.roomNumber.length > 32) {
      errors.push({
        row: raw.rowNumber,
        field: "roomNumber",
        value: raw.roomNumber,
        reason: "Room number must be 32 characters or fewer.",
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

    const typeResolved = resolveSpaceTypeLabel(raw.spaceTypeRaw, raw.customTypeLabel);
    if (!typeResolved.ok) {
      errors.push({
        row: raw.rowNumber,
        field: "spaceType",
        value: raw.spaceTypeRaw,
        reason: typeResolved.reason,
        suggestion: typeResolved.suggestion,
      });
    } else {
      resolvedType = typeResolved.value;
    }

    if (raw.department) {
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
    }

    const floorKey = normKey(raw.floor);
    const neighborhoodKey = normKey(raw.neighborhood);
    const spaceKey = `${neighborhoodKey}::${normKey(raw.space)}`;

    if (errors.length === 0) {
      // Floor resolution
      const plannedFloor = plannedFloors.get(floorKey);
      if (plannedFloor) {
        floorAction = plannedFloor.action;
        existingFloorId = plannedFloor.id;
      } else {
        const matches = findUnitsByName(catalog, raw.floor);
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
              action: "reuse",
              id: match.id,
            });
            messages.push(`Reusing existing Floor "${match.name}".`);
          }
        } else {
          floorAction = "create";
          plannedFloors.set(floorKey, {
            name: raw.floor.trim(),
            action: "create",
            id: null,
          });
        }
      }

      // Neighborhood resolution (facility-wide unique names)
      if (errors.length === 0) {
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
          }
        } else {
          const matches = findUnitsByName(catalog, raw.neighborhood);
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
            }
          } else {
            neighborhoodAction = "create";
            plannedNeighborhoods.set(neighborhoodKey, {
              name: raw.neighborhood.trim(),
              floorKey,
              action: "create",
              id: null,
            });
          }
        }
      }

      // Space resolution
      if (errors.length === 0 && resolvedType) {
        if (fileSpaceKeys.has(spaceKey)) {
          spaceAction = "skip";
          status = "skip";
          messages.push("Duplicate row in file — space already planned; will not create twice.");
          plannedSpaces.set(spaceKey, plannedSpaces.get(spaceKey) ?? {
            name: raw.space.trim(),
            neighborhoodKey,
            action: "skip",
            id: null,
            typeLabel: raw.spaceTypeRaw,
          });
        } else {
          fileSpaceKeys.add(spaceKey);
          const parentId = existingNeighborhoodId;
          const existingSpaces = catalog.spaces.filter(
            (s) =>
              normKey(s.name) === normKey(raw.space) &&
              (parentId ? s.unitId === parentId : false),
          );

          // Also detect same name under planned-new neighborhood as new create
          if (neighborhoodAction === "reuse" && parentId) {
            if (existingSpaces.length > 1) {
              errors.push({
                row: raw.rowNumber,
                field: "space",
                value: raw.space,
                reason: `Ambiguous space "${raw.space}" under this neighborhood.`,
              });
            } else if (existingSpaces.length === 1) {
              const existing = existingSpaces[0]!;
              if (!existing.isActive) {
                errors.push({
                  row: raw.rowNumber,
                  field: "space",
                  value: raw.space,
                  reason: `Space "${existing.name}" is inactive.`,
                });
              } else if (spaceTypeConflicts(existing, resolvedType)) {
                status = "conflict";
                errors.push({
                  row: raw.rowNumber,
                  field: "spaceType",
                  value: raw.spaceTypeRaw,
                  reason: `Space "${existing.name}" already exists with a different type. Import will not overwrite.`,
                  suggestion: "Change the type in Facility Builder, or use a different space name.",
                });
              } else {
                // Optional field differences → warning, still reuse
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
                    "Existing space reused; optional fields differ and will not be overwritten.",
                  );
                } else {
                  messages.push(`Reusing existing Space "${existing.name}".`);
                }
                plannedSpaces.set(spaceKey, {
                  name: existing.name,
                  neighborhoodKey,
                  action: "reuse",
                  id: existing.id,
                  typeLabel: raw.spaceTypeRaw,
                });
              }
            } else {
              spaceAction = "create";
              plannedSpaces.set(spaceKey, {
                name: raw.space.trim(),
                neighborhoodKey,
                action: "create",
                id: null,
                typeLabel: raw.spaceTypeRaw,
              });
            }
          } else if (neighborhoodAction === "create") {
            spaceAction = "create";
            plannedSpaces.set(spaceKey, {
              name: raw.space.trim(),
              neighborhoodKey,
              action: "create",
              id: null,
              typeLabel: raw.spaceTypeRaw,
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
    } else if (spaceAction === "create") {
      status = "create";
    }

    rows.push({
      rowNumber: raw.rowNumber,
      status,
      floorKey,
      neighborhoodKey,
      spaceKey,
      floorName: raw.floor.trim(),
      neighborhoodName: raw.neighborhood.trim(),
      spaceName: raw.space.trim(),
      resolvedType,
      roomNumber: raw.roomNumber || null,
      code: raw.code || null,
      description: raw.description || null,
      departmentId,
      departmentName,
      floorAction,
      neighborhoodAction,
      spaceAction,
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
    floors: [...plannedFloors.entries()]
      .filter(([, v]) => v.action === "create")
      .map(([key, v]) => ({ key, name: v.name })),
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
      // Only first create per spaceKey
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

  const floorsToCreate = createOps.floors.length;
  const neighborhoodsToCreate = createOps.neighborhoods.length;
  const spacesToCreate = createOps.spaces.length;
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
    floorsToCreate,
    neighborhoodsToCreate,
    spacesToCreate,
    floorsReused,
    neighborhoodsReused,
    spacesReused,
    canConfirm: false,
    createOps,
  };
}

function buildHierarchyPreview(
  rows: FacilityStructureRowPlan[],
  plannedFloors: Map<string, { name: string; action: "create" | "reuse"; id: string | null }>,
  plannedNeighborhoods: Map<
    string,
    { name: string; floorKey: string; action: "create" | "reuse"; id: string | null }
  >,
): FacilityHierarchyPreviewNode[] {
  const floorNodes = new Map<string, FacilityHierarchyPreviewNode>();

  for (const [floorKey, floor] of plannedFloors.entries()) {
    floorNodes.set(floorKey, {
      name: floor.name,
      action: floor.action,
      neighborhoods: [],
    });
  }

  for (const [nbhKey, nbh] of plannedNeighborhoods.entries()) {
    const floor = floorNodes.get(nbh.floorKey);
    if (!floor) continue;
    const spaceCounts: Record<string, number> = {};
    let spaceTotal = 0;
    for (const row of rows) {
      if (row.neighborhoodKey !== nbhKey) continue;
      if (row.status === "invalid" || row.status === "conflict") continue;
      if (row.spaceAction === "none") continue;
      const label =
        row.resolvedType?.customTypeLabel ||
        SPACE_TYPE_PRESETS.find((p) => p.canonicalType === row.resolvedType?.spaceType)?.label ||
        "Space";
      spaceCounts[label] = (spaceCounts[label] ?? 0) + (row.spaceAction === "skip" ? 0 : 1);
      if (row.spaceAction !== "skip") spaceTotal += 1;
    }
    // Deduplicate counts for skip duplicates — recount unique spaces from planned set
    const uniqueLabels: Record<string, number> = {};
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.neighborhoodKey !== nbhKey) continue;
      if (row.status === "invalid" || row.status === "conflict") continue;
      if (seen.has(row.spaceKey)) continue;
      seen.add(row.spaceKey);
      const label =
        row.resolvedType?.customTypeLabel ||
        SPACE_TYPE_PRESETS.find((p) => p.canonicalType === row.resolvedType?.spaceType)?.label ||
        "Space";
      uniqueLabels[label] = (uniqueLabels[label] ?? 0) + 1;
    }
    floor.neighborhoods.push({
      name: nbh.name,
      action: nbh.action,
      spaceCounts: uniqueLabels,
      spaceTotal: Object.values(uniqueLabels).reduce((a, b) => a + b, 0),
    });
    void spaceCounts;
    void spaceTotal;
  }

  return [...floorNodes.values()];
}

/** Adjust canConfirm: allow confirm when there is work OR idempotent all-reuse with no invalids. */
export function finalizeFacilityPlanConfirmability(
  plan: FacilityStructureImportPlan,
): FacilityStructureImportPlan {
  const work =
    plan.floorsToCreate + plan.neighborhoodsToCreate + plan.spacesToCreate;
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
    floors: [...plan.createOps.floors].sort((a, b) => a.name.localeCompare(b.name)),
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
