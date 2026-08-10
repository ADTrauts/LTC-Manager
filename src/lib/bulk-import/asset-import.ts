/**
 * Asset bulk import — parse, validate, plan create-only Asset registry rows.
 * Location resolution uses canonical Floor → Neighborhood → Space hierarchy.
 */

import type { AssetCriticality, AssetStatus, UnitHierarchyRole } from "@prisma/client";

import { ASSET_CRITICALITY_VALUES, isAssetCriticality } from "@/lib/asset-criticality";
import type { AssetOperationalStatus } from "@/lib/asset-operations";
import {
  resolveBuilderNodeDisplayKind,
  type HierarchyRoleValue,
} from "@/lib/facility-builder/builder-display";

import { cellAt, mapHeadersWithAliases, readCsvText, rowsToCsv } from "./csv";
import {
  emptyBulkImportCounts,
  type BulkImportCounts,
  type BulkImportFieldError,
  type BulkImportRowIssue,
  type BulkImportRowStatus,
} from "./types";

export const ASSET_IMPORT_TEMPLATE_VERSION = "2026-08-09";

export const ASSET_CSV_HEADERS = [
  "name",
  "equipmentType",
  "floor",
  "neighborhood",
  "space",
  "assetCode",
  "manufacturer",
  "model",
  "serialNumber",
  "facilityAssetNumber",
  "status",
  "department",
  "criticality",
  "notes",
  "description",
] as const;

export type AssetImportField = (typeof ASSET_CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, AssetImportField> = {
  name: "name",
  asset_name: "name",
  assetname: "name",
  equipmenttype: "equipmentType",
  equipment_type: "equipmentType",
  asset_type: "equipmentType",
  assettype: "equipmentType",
  type: "equipmentType",
  floor: "floor",
  neighborhood: "neighborhood",
  unit: "neighborhood",
  neighborhood_unit: "neighborhood",
  space: "space",
  room: "space",
  room_space: "space",
  assetcode: "assetCode",
  asset_code: "assetCode",
  asset_tag: "assetCode",
  assettag: "assetCode",
  manufacturer: "manufacturer",
  model: "model",
  serialnumber: "serialNumber",
  serial_number: "serialNumber",
  serial: "serialNumber",
  facilityassetnumber: "facilityAssetNumber",
  facility_asset_number: "facilityAssetNumber",
  internal_identifier: "facilityAssetNumber",
  status: "status",
  department: "department",
  criticality: "criticality",
  notes: "notes",
  description: "description",
};

export const ASSET_CSV_TEMPLATE = rowsToCsv(
  [...ASSET_CSV_HEADERS],
  [
    [
      "Walk-in Cooler",
      "Refrigerator",
      "Floor 1",
      "1A - Naval Park",
      "Servery",
      "TV-COOL-01",
      "True",
      "T-49",
      "SN-1001",
      "",
      "OPERATIONAL",
      "Dietary",
      "CRITICAL",
      "",
      "",
    ],
    [
      "Ice Machine",
      "Ice Maker",
      "Floor 1",
      "1A - Naval Park",
      "Servery",
      "",
      "Scotsman",
      "",
      "SN-1002",
      "",
      "OPERATIONAL",
      "Dietary",
      "IMPORTANT",
      "",
      "",
    ],
  ],
);

export type AssetLocationUnit = {
  id: string;
  name: string;
  hierarchyRole: HierarchyRoleValue | UnitHierarchyRole | null;
  parentUnitId: string | null;
  isActive: boolean;
};

export type AssetLocationSpace = {
  id: string;
  unitId: string | null;
  name: string;
  isActive: boolean;
};

export type AssetCatalogAsset = {
  id: string;
  assetCode: string;
  name: string;
  equipmentType: string;
  serialNumber: string | null;
  facilityAssetNumber: string | null;
  unitId: string;
  spaceId: string | null;
  status: string;
};

export type AssetImportCatalog = {
  units: AssetLocationUnit[];
  spaces: AssetLocationSpace[];
  departments: Array<{ id: string; name: string; key: string; isActive: boolean }>;
  assets: AssetCatalogAsset[];
  assetOpsEnabled: boolean;
};

export type ParsedAssetImportRow = {
  rowNumber: number;
  name: string;
  equipmentType: string;
  floor: string;
  neighborhood: string;
  space: string;
  assetCode: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  facilityAssetNumber: string;
  status: string;
  department: string;
  criticality: string;
  notes: string;
  description: string;
  cells: string[];
};

export type AssetImportRowPlan = {
  rowNumber: number;
  status: BulkImportRowStatus;
  name: string;
  equipmentType: string;
  floorName: string;
  neighborhoodName: string;
  spaceName: string;
  unitId: string | null;
  spaceId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  assetCode: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  facilityAssetNumber: string | null;
  statusValue: AssetOperationalStatus | AssetStatus | null;
  criticality: AssetCriticality;
  notes: string | null;
  description: string | null;
  existingAssetId: string | null;
  action: "create" | "skip" | "none";
  messages: string[];
  errors: BulkImportFieldError[];
  cells: string[];
};

export type AssetImportPlan = {
  fileName: string | null;
  counts: BulkImportCounts;
  rows: AssetImportRowPlan[];
  issues: BulkImportRowIssue[];
  createCount: number;
  skipCount: number;
  canConfirm: boolean;
};

function normKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const OPS_STATUSES = ["OPERATIONAL", "DEGRADED", "OUT_OF_SERVICE"] as const;
const LEGACY_STATUSES = ["ACTIVE", "OUT_OF_SERVICE"] as const;

function parseStatus(
  raw: string,
  assetOpsEnabled: boolean,
):
  | { ok: true; value: AssetOperationalStatus | AssetStatus }
  | { ok: false; reason: string; suggestion?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: true,
      value: assetOpsEnabled ? "OPERATIONAL" : ("ACTIVE" as AssetStatus),
    };
  }
  const upper = trimmed.toUpperCase();
  if (upper === "RETIRED") {
    return {
      ok: false,
      reason: "Cannot import assets as RETIRED. Create as OPERATIONAL/ACTIVE, then retire deliberately.",
    };
  }
  if (assetOpsEnabled) {
    if (upper === "ACTIVE") {
      return { ok: true, value: "OPERATIONAL" };
    }
    if ((OPS_STATUSES as readonly string[]).includes(upper)) {
      return { ok: true, value: upper as AssetOperationalStatus };
    }
    return {
      ok: false,
      reason: `Invalid status "${trimmed}".`,
      suggestion: `Accepted: ${OPS_STATUSES.join(", ")} (ACTIVE maps to OPERATIONAL).`,
    };
  }
  if ((LEGACY_STATUSES as readonly string[]).includes(upper)) {
    return { ok: true, value: upper as AssetStatus };
  }
  return {
    ok: false,
    reason: `Invalid status "${trimmed}".`,
    suggestion: `Accepted: ${LEGACY_STATUSES.join(", ")}.`,
  };
}

export function parseAssetImportCsv(text: string, fileName?: string | null): {
  ok: true;
  rows: ParsedAssetImportRow[];
  headers: string[];
  fileName: string | null;
} | { ok: false; error: string } {
  const read = readCsvText(text, { fileName });
  if (!read.ok) return read;

  const colMap = mapHeadersWithAliases(read.headers, HEADER_ALIASES);
  const required: AssetImportField[] = ["name", "equipmentType", "floor", "neighborhood"];
  const present = new Set(colMap.values());
  const missing = required.filter((f) => !present.has(f));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${missing.join(", ")}. Download the Asset template.`,
    };
  }

  const rows: ParsedAssetImportRow[] = read.rows.map((cells, idx) => ({
    rowNumber: idx + 2,
    name: cellAt(cells, colMap, "name"),
    equipmentType: cellAt(cells, colMap, "equipmentType"),
    floor: cellAt(cells, colMap, "floor"),
    neighborhood: cellAt(cells, colMap, "neighborhood"),
    space: cellAt(cells, colMap, "space"),
    assetCode: cellAt(cells, colMap, "assetCode"),
    manufacturer: cellAt(cells, colMap, "manufacturer"),
    model: cellAt(cells, colMap, "model"),
    serialNumber: cellAt(cells, colMap, "serialNumber"),
    facilityAssetNumber: cellAt(cells, colMap, "facilityAssetNumber"),
    status: cellAt(cells, colMap, "status"),
    department: cellAt(cells, colMap, "department"),
    criticality: cellAt(cells, colMap, "criticality"),
    notes: cellAt(cells, colMap, "notes"),
    description: cellAt(cells, colMap, "description"),
    cells: ASSET_CSV_HEADERS.map((h) => cellAt(cells, colMap, h)),
  }));

  return { ok: true, rows, headers: [...ASSET_CSV_HEADERS], fileName: read.fileName };
}

function resolveLocation(
  catalog: AssetImportCatalog,
  floorName: string,
  neighborhoodName: string,
  spaceName: string,
):
  | { ok: true; unitId: string; spaceId: string | null; messages: string[] }
  | { ok: false; errors: BulkImportFieldError[] } {
  const errors: BulkImportFieldError[] = [];
  const messages: string[] = [];

  if (!floorName.trim()) {
    errors.push({
      row: 0,
      field: "floor",
      value: "",
      reason: "Floor is required for location matching.",
    });
  }
  if (!neighborhoodName.trim()) {
    errors.push({
      row: 0,
      field: "neighborhood",
      value: "",
      reason: "Neighborhood / Unit is required for location matching.",
    });
  }
  if (errors.length) return { ok: false, errors };

  const floors = catalog.units.filter(
    (u) =>
      normKey(u.name) === normKey(floorName) &&
      resolveBuilderNodeDisplayKind(u) === "floor",
  );
  if (floors.length === 0) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "floor",
          value: floorName,
          reason: `Floor "${floorName}" was not found.`,
          suggestion: "Import facility structure first, or use the exact Floor name from Facility Builder.",
        },
      ],
    };
  }
  if (floors.length > 1) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "floor",
          value: floorName,
          reason: `Ambiguous Floor "${floorName}".`,
        },
      ],
    };
  }
  const floor = floors[0]!;
  if (!floor.isActive) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "floor",
          value: floorName,
          reason: `Floor "${floor.name}" is inactive.`,
        },
      ],
    };
  }

  const neighborhoods = catalog.units.filter(
    (u) =>
      normKey(u.name) === normKey(neighborhoodName) &&
      u.parentUnitId === floor.id &&
      (resolveBuilderNodeDisplayKind(u) === "neighborhood" ||
        resolveBuilderNodeDisplayKind(u) === "legacy_location"),
  );
  if (neighborhoods.length === 0) {
    // Check if name exists elsewhere → clearer error
    const elsewhere = catalog.units.filter(
      (u) => normKey(u.name) === normKey(neighborhoodName),
    );
    if (elsewhere.length === 1 && elsewhere[0]!.parentUnitId !== floor.id) {
      return {
        ok: false,
        errors: [
          {
            row: 0,
            field: "neighborhood",
            value: neighborhoodName,
            reason: `Neighborhood "${neighborhoodName}" exists but not under Floor "${floor.name}".`,
          },
        ],
      };
    }
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "neighborhood",
          value: neighborhoodName,
          reason: `Neighborhood "${neighborhoodName}" was not found under Floor "${floor.name}".`,
          suggestion: "Never place assets at facility root when location matching fails.",
        },
      ],
    };
  }
  if (neighborhoods.length > 1) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "neighborhood",
          value: neighborhoodName,
          reason: `Ambiguous Neighborhood "${neighborhoodName}" under Floor "${floor.name}".`,
        },
      ],
    };
  }
  const neighborhood = neighborhoods[0]!;
  if (!neighborhood.isActive) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          field: "neighborhood",
          value: neighborhoodName,
          reason: `Neighborhood "${neighborhood.name}" is inactive.`,
        },
      ],
    };
  }

  let spaceId: string | null = null;
  if (spaceName.trim()) {
    const spaces = catalog.spaces.filter(
      (s) =>
        s.unitId === neighborhood.id && normKey(s.name) === normKey(spaceName),
    );
    if (spaces.length === 0) {
      return {
        ok: false,
        errors: [
          {
            row: 0,
            field: "space",
            value: spaceName,
            reason: `Space "${spaceName}" was not found under "${neighborhood.name}".`,
          },
        ],
      };
    }
    if (spaces.length > 1) {
      return {
        ok: false,
        errors: [
          {
            row: 0,
            field: "space",
            value: spaceName,
            reason: `Ambiguous Space "${spaceName}" under "${neighborhood.name}".`,
          },
        ],
      };
    }
    const space = spaces[0]!;
    if (!space.isActive) {
      return {
        ok: false,
        errors: [
          {
            row: 0,
            field: "space",
            value: spaceName,
            reason: `Space "${space.name}" is inactive.`,
          },
        ],
      };
    }
    spaceId = space.id;
    messages.push(`Resolved location ${floor.name} → ${neighborhood.name} → ${space.name}.`);
  } else {
    messages.push(`Resolved location ${floor.name} → ${neighborhood.name} (unit-level).`);
  }

  return { ok: true, unitId: neighborhood.id, spaceId, messages };
}

function findDuplicateAsset(
  catalog: AssetImportCatalog,
  row: ParsedAssetImportRow,
):
  | { kind: "skip"; asset: AssetCatalogAsset; reason: string }
  | { kind: "conflict"; reason: string; field: string; value: string }
  | null {
  if (row.assetCode.trim()) {
    const byCode = catalog.assets.filter(
      (a) => normKey(a.assetCode) === normKey(row.assetCode),
    );
    if (byCode.length === 1) {
      return {
        kind: "skip",
        asset: byCode[0]!,
        reason: `Existing asset with asset code "${byCode[0]!.assetCode}" — skip.`,
      };
    }
    if (byCode.length > 1) {
      return {
        kind: "conflict",
        reason: `Multiple assets share asset code "${row.assetCode}".`,
        field: "assetCode",
        value: row.assetCode,
      };
    }
  }

  if (row.facilityAssetNumber.trim()) {
    const byFan = catalog.assets.filter(
      (a) =>
        a.facilityAssetNumber &&
        normKey(a.facilityAssetNumber) === normKey(row.facilityAssetNumber),
    );
    if (byFan.length === 1) {
      const existing = byFan[0]!;
      if (
        row.assetCode.trim() &&
        normKey(existing.assetCode) !== normKey(row.assetCode)
      ) {
        return {
          kind: "conflict",
          reason: `Facility asset number "${row.facilityAssetNumber}" belongs to a different asset code.`,
          field: "facilityAssetNumber",
          value: row.facilityAssetNumber,
        };
      }
      return {
        kind: "skip",
        asset: existing,
        reason: `Existing asset with facility asset number "${row.facilityAssetNumber}" — skip.`,
      };
    }
    if (byFan.length > 1) {
      return {
        kind: "conflict",
        reason: `Multiple assets share facility asset number "${row.facilityAssetNumber}".`,
        field: "facilityAssetNumber",
        value: row.facilityAssetNumber,
      };
    }
  }

  if (row.serialNumber.trim()) {
    const bySerial = catalog.assets.filter(
      (a) =>
        a.serialNumber && normKey(a.serialNumber) === normKey(row.serialNumber),
    );
    if (bySerial.length === 1) {
      const existing = bySerial[0]!;
      if (
        normKey(existing.name) !== normKey(row.name) ||
        normKey(existing.equipmentType) !== normKey(row.equipmentType)
      ) {
        return {
          kind: "conflict",
          reason: `Serial number "${row.serialNumber}" matches an existing asset with a different name/type.`,
          field: "serialNumber",
          value: row.serialNumber,
        };
      }
      return {
        kind: "skip",
        asset: existing,
        reason: `Existing asset with serial number "${row.serialNumber}" — skip.`,
      };
    }
    if (bySerial.length > 1) {
      return {
        kind: "conflict",
        reason: `Multiple assets share serial number "${row.serialNumber}".`,
        field: "serialNumber",
        value: row.serialNumber,
      };
    }
  }

  return null;
}

export function planAssetImport(
  parsedRows: ParsedAssetImportRow[],
  catalog: AssetImportCatalog,
  fileName: string | null = null,
): AssetImportPlan {
  const counts = emptyBulkImportCounts(parsedRows.length);
  const rows: AssetImportRowPlan[] = [];
  const issues: BulkImportRowIssue[] = [];
  const seenCodes = new Set<string>();
  const seenSerials = new Set<string>();
  const seenFans = new Set<string>();

  for (const raw of parsedRows) {
    const errors: BulkImportFieldError[] = [];
    const messages: string[] = [];
    let status: BulkImportRowStatus = "create";
    let action: AssetImportRowPlan["action"] = "none";
    let unitId: string | null = null;
    let spaceId: string | null = null;
    let departmentId: string | null = null;
    let departmentName: string | null = null;
    let statusValue: AssetOperationalStatus | AssetStatus | null = null;
    let criticality: AssetCriticality = "ROUTINE";
    let existingAssetId: string | null = null;

    if (!raw.name || raw.name.length < 2) {
      errors.push({
        row: raw.rowNumber,
        field: "name",
        value: raw.name,
        reason: "Asset name is required (min 2 characters).",
      });
    } else if (raw.name.length > 120) {
      errors.push({
        row: raw.rowNumber,
        field: "name",
        value: raw.name,
        reason: "Asset name must be 120 characters or fewer.",
      });
    }

    if (!raw.equipmentType || raw.equipmentType.length < 2) {
      errors.push({
        row: raw.rowNumber,
        field: "equipmentType",
        value: raw.equipmentType,
        reason: "Equipment type is required (min 2 characters).",
      });
    } else if (raw.equipmentType.length > 80) {
      errors.push({
        row: raw.rowNumber,
        field: "equipmentType",
        value: raw.equipmentType,
        reason: "Equipment type must be 80 characters or fewer.",
      });
    }

    if (raw.assetCode && (raw.assetCode.length < 2 || raw.assetCode.length > 40)) {
      errors.push({
        row: raw.rowNumber,
        field: "assetCode",
        value: raw.assetCode,
        reason: "Asset code must be 2–40 characters when provided.",
      });
    }

    const statusParsed = parseStatus(raw.status, catalog.assetOpsEnabled);
    if (!statusParsed.ok) {
      errors.push({
        row: raw.rowNumber,
        field: "status",
        value: raw.status,
        reason: statusParsed.reason,
        suggestion: statusParsed.suggestion,
      });
    } else {
      statusValue = statusParsed.value;
    }

    if (raw.criticality.trim()) {
      const crit = raw.criticality.trim().toUpperCase();
      if (!isAssetCriticality(crit)) {
        errors.push({
          row: raw.rowNumber,
          field: "criticality",
          value: raw.criticality,
          reason: `Invalid criticality "${raw.criticality}".`,
          suggestion: `Accepted: ${ASSET_CRITICALITY_VALUES.join(", ")}.`,
        });
      } else {
        criticality = crit;
      }
    }

    if (raw.department.trim()) {
      const key = normKey(raw.department);
      const matches = catalog.departments.filter(
        (d) => d.isActive && (normKey(d.name) === key || normKey(d.key) === key),
      );
      if (matches.length === 0) {
        errors.push({
          row: raw.rowNumber,
          field: "department",
          value: raw.department,
          reason: `Unknown department "${raw.department}".`,
        });
      } else if (matches.length > 1) {
        errors.push({
          row: raw.rowNumber,
          field: "department",
          value: raw.department,
          reason: `Ambiguous department "${raw.department}".`,
        });
      } else {
        departmentId = matches[0]!.id;
        departmentName = matches[0]!.name;
      }
    }

    const location = resolveLocation(
      catalog,
      raw.floor,
      raw.neighborhood,
      raw.space,
    );
    if (!location.ok) {
      for (const err of location.errors) {
        errors.push({ ...err, row: raw.rowNumber });
      }
    } else {
      unitId = location.unitId;
      spaceId = location.spaceId;
      messages.push(...location.messages);
    }

    // In-file duplicates on stable ids
    if (raw.assetCode.trim()) {
      const k = normKey(raw.assetCode);
      if (seenCodes.has(k)) {
        status = "skip";
        action = "skip";
        messages.push("Duplicate asset code in file — skip.");
      } else {
        seenCodes.add(k);
      }
    }
    if (raw.serialNumber.trim()) {
      const k = normKey(raw.serialNumber);
      if (seenSerials.has(k) && status !== "skip") {
        status = "skip";
        action = "skip";
        messages.push("Duplicate serial number in file — skip.");
      } else {
        seenSerials.add(k);
      }
    }
    if (raw.facilityAssetNumber.trim()) {
      const k = normKey(raw.facilityAssetNumber);
      if (seenFans.has(k) && status !== "skip") {
        status = "skip";
        action = "skip";
        messages.push("Duplicate facility asset number in file — skip.");
      } else {
        seenFans.add(k);
      }
    }

    if (errors.length === 0 && status !== "skip") {
      const dup = findDuplicateAsset(catalog, raw);
      if (dup?.kind === "skip") {
        status = "skip";
        action = "skip";
        existingAssetId = dup.asset.id;
        messages.push(dup.reason);
      } else if (dup?.kind === "conflict") {
        status = "conflict";
        errors.push({
          row: raw.rowNumber,
          field: dup.field,
          value: dup.value,
          reason: dup.reason,
          suggestion: "Do not overwrite. Resolve in Asset Builder, then re-import.",
        });
      } else {
        status = "create";
        action = "create";
      }
    }

    if (errors.length > 0) {
      if (status !== "conflict") status = "invalid";
      action = "none";
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
    }

    rows.push({
      rowNumber: raw.rowNumber,
      status,
      name: raw.name.trim(),
      equipmentType: raw.equipmentType.trim(),
      floorName: raw.floor.trim(),
      neighborhoodName: raw.neighborhood.trim(),
      spaceName: raw.space.trim(),
      unitId,
      spaceId,
      departmentId,
      departmentName,
      assetCode: raw.assetCode.trim() || null,
      manufacturer: raw.manufacturer.trim() || null,
      model: raw.model.trim() || null,
      serialNumber: raw.serialNumber.trim() || null,
      facilityAssetNumber: raw.facilityAssetNumber.trim() || null,
      statusValue,
      criticality,
      notes: raw.notes.trim() || null,
      description: raw.description.trim() || null,
      existingAssetId,
      action,
      messages,
      errors,
      cells: raw.cells,
    });
  }

  let createCount = 0;
  let skipCount = 0;
  for (const row of rows) {
    if (row.status === "invalid" || row.status === "conflict") {
      counts.invalidRows += 1;
      if (row.status === "conflict") counts.conflictCount += 1;
    } else if (row.status === "skip" || row.status === "reuse") {
      counts.skipCount += 1;
      counts.validRows += 1;
      skipCount += 1;
    } else if (row.status === "warning") {
      counts.warningRows += 1;
      counts.validRows += 1;
    } else if (row.status === "create") {
      counts.validRows += 1;
      counts.createCount += 1;
      createCount += 1;
    }
  }

  return {
    fileName,
    counts,
    rows,
    issues,
    createCount,
    skipCount,
    canConfirm: counts.invalidRows === 0 && counts.totalRows > 0,
  };
}
