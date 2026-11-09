/**
 * Resolve which coverage expectation items apply to a location / cycle.
 *
 * Forward targeting (Phase 2D-5):
 * 1. Explicit spaceId → match that Space only
 * 2. Explicit unitId (no spaceId) → match Spaces in that Unit
 *
 * Legacy OT keys remain for historical compatibility when neither space nor unit is set.
 * Room Type and Department responsibility never invent Coverage.
 */

import type {
  CoverageCycleRef,
  CoverageExpectationItemInput,
  CoverageLocationContext,
  CoverageProvenanceSource,
  ResolvedCoverageExpectation,
} from "./types";

export function describeCoverageApplicability(input: {
  source: CoverageProvenanceSource;
  operationalTypeName?: string | null;
}): string {
  if (input.source === "OPERATIONAL_TYPE_DEFAULT") {
    return input.operationalTypeName?.trim()
      ? `Inherited from Operational Type: ${input.operationalTypeName.trim()}`
      : "Inherited from Operational Type";
  }
  return "Applied directly to this location";
}

export function matchCoverageItemToLocation(
  item: CoverageExpectationItemInput,
  context: CoverageLocationContext,
): CoverageProvenanceSource | null {
  const spaceId = item.spaceId?.trim() || "";
  if (spaceId) {
    return spaceId === context.spaceId ? "EXPLICIT_LOCATION" : null;
  }

  const otKeys = item.applicableOperationalTypeKeys.map((key) => key.trim()).filter(Boolean);
  // Forward Unit-wide: empty OT keys, unitId set. Expands to each Space in that Unit
  // for the space-grained episode system. Do not combine with OT keys.
  if (item.unitId) {
    if (otKeys.length > 0) return null;
    if (context.unitId && item.unitId === context.unitId) {
      return "EXPLICIT_LOCATION";
    }
    return null;
  }

  // Historical compatibility only: OT keys with no explicit Space or Unit.
  if (otKeys.length > 0) {
    const locationKey = context.operationalTypeKey?.trim() || "";
    if (locationKey && otKeys.includes(locationKey)) {
      return "OPERATIONAL_TYPE_DEFAULT";
    }
  }
  return null;
}

export function itemTargetsCycle(
  item: CoverageExpectationItemInput,
  cycleStableKey: string | null | undefined,
): boolean {
  const cycleKeys = item.applicableOperationalCycleStableKeys
    .map((key) => key.trim())
    .filter(Boolean);
  if (cycleKeys.length === 0) return true;
  if (!cycleStableKey?.trim()) return false;
  return cycleKeys.includes(cycleStableKey.trim());
}

export function resolveCoverageExpectationsForLocation(input: {
  items: readonly CoverageExpectationItemInput[];
  context: CoverageLocationContext;
  cycles: readonly CoverageCycleRef[];
  /** When set, only that cycle's slots are returned. */
  cycleStableKey?: string | null;
}): ResolvedCoverageExpectation[] {
  const cycles =
    input.cycleStableKey != null && input.cycleStableKey !== ""
      ? input.cycles.filter((cycle) => cycle.stableKey === input.cycleStableKey)
      : input.cycles;

  const resolved: ResolvedCoverageExpectation[] = [];

  for (const item of input.items) {
    const source = matchCoverageItemToLocation(item, input.context);
    if (!source) continue;

    const cycleKeys = item.applicableOperationalCycleStableKeys
      .map((key) => key.trim())
      .filter(Boolean);

    if (cycleKeys.length === 0) {
      resolved.push(toResolved(item, source, input.context, null));
      continue;
    }

    const targeted = (cycles.length > 0 ? cycles : input.cycles).filter((cycle) =>
      cycleKeys.includes(cycle.stableKey),
    );
    for (const cycle of targeted) {
      resolved.push(toResolved(item, source, input.context, cycle));
    }
  }

  return dedupeResolvedExpectations(resolved);
}

function toResolved(
  item: CoverageExpectationItemInput,
  source: CoverageProvenanceSource,
  context: CoverageLocationContext,
  cycle: CoverageCycleRef | null,
): ResolvedCoverageExpectation {
  return {
    id: cycle ? `${item.id}:${cycle.stableKey}` : item.id,
    templateId: item.templateId,
    templateStableKey: item.templateStableKey,
    templateVersion: item.templateVersion,
    templateStatus: item.templateStatus,
    effectiveFrom: item.effectiveFrom,
    effectiveTo: item.effectiveTo,
    roleKey: item.roleKey,
    roleLabel: item.roleLabel,
    requiredCount: item.requiredCount,
    cycleStableKey: cycle?.stableKey ?? null,
    cycleLabel: cycle?.label ?? null,
    operationalTypeKey:
      source === "OPERATIONAL_TYPE_DEFAULT" ? context.operationalTypeKey : null,
    operationalTypeName:
      source === "OPERATIONAL_TYPE_DEFAULT" ? context.operationalTypeName : null,
    unitId: item.unitId,
    spaceId: item.spaceId?.trim() || null,
    provenance: source,
    detail: describeCoverageApplicability({
      source,
      operationalTypeName: context.operationalTypeName,
    }),
  };
}

export function dedupeResolvedExpectations(
  rows: readonly ResolvedCoverageExpectation[],
): ResolvedCoverageExpectation[] {
  const seen = new Set<string>();
  const out: ResolvedCoverageExpectation[] = [];
  for (const row of rows) {
    const key = `${row.templateId}:${row.roleKey}:${row.cycleStableKey ?? ""}:${row.provenance}:${row.spaceId ?? ""}:${row.unitId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => {
    const cycle = (a.cycleLabel ?? "").localeCompare(b.cycleLabel ?? "");
    if (cycle !== 0) return cycle;
    return a.roleLabel.localeCompare(b.roleLabel);
  });
}

/**
 * Forward Coverage authoring no longer accepts Operational Type / Location Function keys.
 * Historical rows may still carry them for compatibility matching only.
 */
export function validateCoverageOperationalTypeKeys(input: {
  submittedKeys: readonly string[];
  allowedKeys?: ReadonlySet<string>;
}): string[] {
  const unique = [...new Set(input.submittedKeys.map((key) => key.trim()).filter(Boolean))];
  if (unique.length > 0) {
    throw new Error(
      "Coverage no longer targets Operational Types. Choose the Unit or rooms this coverage need applies to.",
    );
  }
  void input.allowedKeys;
  return [];
}

/** Forward items must target exactly one of: a Space, or a Unit (not both). */
export function validateCoverageLocationTarget(input: {
  spaceId?: string | null;
  unitId?: string | null;
}): { spaceId: string | null; unitId: string | null } {
  const spaceId = input.spaceId?.trim() || null;
  const unitId = input.unitId?.trim() || null;
  if (spaceId && unitId) {
    throw new Error("Choose either a specific Space or a Unit-wide target, not both.");
  }
  if (!spaceId && !unitId) {
    throw new Error("Choose a Unit or a specific Space for this coverage need.");
  }
  return { spaceId, unitId };
}

export function validateCoverageCycleStableKeys(input: {
  submittedKeys: readonly string[];
  allowedKeys: ReadonlySet<string>;
}): string[] {
  const unique = [...new Set(input.submittedKeys.map((key) => key.trim()).filter(Boolean))];
  const invalid = unique.filter((key) => !input.allowedKeys.has(key));
  if (invalid.length > 0) {
    throw new Error("Coverage Operational Cycles must belong to this Department.");
  }
  return unique;
}
