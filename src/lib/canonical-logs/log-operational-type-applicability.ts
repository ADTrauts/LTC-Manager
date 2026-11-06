/**
 * Canonical Log → Operational Type applicability.
 *
 * WHERE: department-scoped DepartmentRoomArchetype.key.
 * WHEN: existing Attachment timing / Operational Cycle selections.
 *
 * Does not invent OT from physical Room Type or Unit.unitType.
 * Does not copy Attachment rows onto locations.
 */

import type { LogAttachmentTarget } from "@/lib/logs-architecture/types";
import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";
import type { LogRequirement } from "@/lib/logs-architecture/types";

import type { OverlayProvenanceSource } from "@/lib/department-administration/effective-location-program";

export type LocationLogApplicabilitySource =
  | "OPERATIONAL_TYPE_DEFAULT"
  | "EXPLICIT_LOCATION"
  | "DEPARTMENT_WIDE"
  | "UNIT"
  | "FACILITY"
  | "ASSET";

export type LocationLogMatchContext = {
  facilityId: string;
  departmentId: string;
  spaceId: string;
  unitId: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
};

export type LocationLogAttachmentRow = {
  id: string;
  departmentId: string;
  catalogStableKey: string;
  catalogVersion: number;
  label: string;
  targetKind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT" | "FACILITY" | "OPERATIONAL_TYPE";
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey: string | null;
  assetId: string | null;
  assetName?: string | null;
  status: "ACTIVE" | "INACTIVE" | "RETIRED";
};

export type LocationLogMatch = {
  attachment: LocationLogAttachmentRow;
  source: LocationLogApplicabilitySource;
  detail: string;
};

export function operationalTypeAssignId(departmentId: string, operationalTypeKey: string): string {
  return `${departmentId}:${operationalTypeKey}`;
}

export function parseOperationalTypeAssignId(
  id: string,
): { departmentId: string; operationalTypeKey: string } | null {
  const split = id.indexOf(":");
  if (split <= 0) return null;
  const departmentId = id.slice(0, split).trim();
  const operationalTypeKey = id.slice(split + 1).trim();
  if (!departmentId || !operationalTypeKey) return null;
  return { departmentId, operationalTypeKey };
}

export function describeLogApplicability(input: {
  source: LocationLogApplicabilitySource;
  operationalTypeName?: string | null;
  assetName?: string | null;
}): string {
  switch (input.source) {
    case "OPERATIONAL_TYPE_DEFAULT":
      return input.operationalTypeName?.trim()
        ? `Inherited from Operational Type: ${input.operationalTypeName.trim()}`
        : "Inherited from Operational Type";
    case "EXPLICIT_LOCATION":
      return "Applied directly to this location";
    case "DEPARTMENT_WIDE":
      return "Department-wide requirement";
    case "UNIT":
      return "Applied to this unit";
    case "FACILITY":
      return "Facility-wide requirement";
    case "ASSET":
      return input.assetName?.trim()
        ? `Asset requirement: ${input.assetName.trim()}`
        : "Asset requirement";
  }
}

export function matchLogAttachmentToLocation(
  attachment: LocationLogAttachmentRow,
  context: LocationLogMatchContext,
): LocationLogMatch | null {
  if (attachment.status === "RETIRED") return null;
  if (attachment.departmentId !== context.departmentId) return null;

  switch (attachment.targetKind) {
    case "OPERATIONAL_TYPE": {
      const attachedKey = attachment.operationalTypeKey?.trim() || "";
      const locationKey = context.operationalTypeKey?.trim() || "";
      if (!attachedKey || !locationKey) return null;
      if (attachedKey !== locationKey) return null;
      return {
        attachment,
        source: "OPERATIONAL_TYPE_DEFAULT",
        detail: describeLogApplicability({
          source: "OPERATIONAL_TYPE_DEFAULT",
          operationalTypeName: context.operationalTypeName,
        }),
      };
    }
    case "SPACE":
      if (!attachment.spaceId || attachment.spaceId !== context.spaceId) return null;
      return {
        attachment,
        source: "EXPLICIT_LOCATION",
        detail: describeLogApplicability({ source: "EXPLICIT_LOCATION" }),
      };
    case "UNIT":
      if (!attachment.unitId || !context.unitId || attachment.unitId !== context.unitId) {
        return null;
      }
      return {
        attachment,
        source: "UNIT",
        detail: describeLogApplicability({ source: "UNIT" }),
      };
    case "DEPARTMENT":
      if (attachment.targetDepartmentId !== context.departmentId) return null;
      return {
        attachment,
        source: "DEPARTMENT_WIDE",
        detail: describeLogApplicability({ source: "DEPARTMENT_WIDE" }),
      };
    case "FACILITY":
      return {
        attachment,
        source: "FACILITY",
        detail: describeLogApplicability({ source: "FACILITY" }),
      };
    case "ASSET":
      return null;
  }
}

export function overlaySourceFromLogMatch(
  source: LocationLogApplicabilitySource,
): OverlayProvenanceSource {
  switch (source) {
    case "OPERATIONAL_TYPE_DEFAULT":
      return "OPERATIONAL_TYPE_DEFAULT";
    case "EXPLICIT_LOCATION":
      return "EXPLICIT_LOCATION";
    case "DEPARTMENT_WIDE":
      return "DEPARTMENT_WIDE";
    case "UNIT":
    case "FACILITY":
    case "ASSET":
      return "EXPLICIT_APPLICABILITY";
  }
}

export function dedupeLocationLogMatches(matches: readonly LocationLogMatch[]): LocationLogMatch[] {
  const byCatalog = new Map<string, LocationLogMatch[]>();
  for (const match of matches) {
    const key = match.attachment.catalogStableKey;
    const list = byCatalog.get(key) ?? [];
    list.push(match);
    byCatalog.set(key, list);
  }

  const out: LocationLogMatch[] = [];
  for (const group of byCatalog.values()) {
    const ranked = [...group].sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
    const primary = ranked[0]!;
    if (ranked.length === 1) {
      out.push(primary);
      continue;
    }
    const extras = ranked
      .slice(1)
      .map((row) => row.detail)
      .filter((detail, index, all) => all.indexOf(detail) === index);
    out.push({
      ...primary,
      detail: extras.length > 0 ? `${primary.detail}. Also ${lcFirst(extras.join("; "))}` : primary.detail,
    });
  }
  return out;
}

function sourceRank(source: LocationLogApplicabilitySource): number {
  switch (source) {
    case "EXPLICIT_LOCATION":
      return 0;
    case "OPERATIONAL_TYPE_DEFAULT":
      return 1;
    case "UNIT":
      return 2;
    case "DEPARTMENT_WIDE":
      return 3;
    case "FACILITY":
      return 4;
    case "ASSET":
      return 5;
  }
}

function lcFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function spaceIdForLogTarget(target: LogAttachmentTarget): string | null {
  if (target.kind === "SPACE") return target.spaceId;
  if (target.kind === "OPERATIONAL_TYPE") return target.resolvedSpaceId?.trim() || null;
  return null;
}

export function locationRequirementDedupeKey(input: {
  catalogStableKey: string;
  scheduleKind: string;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  spaceId: string;
}): string {
  return [
    input.catalogStableKey,
    input.scheduleKind,
    input.cycleStableKey ?? "",
    input.windowStartLocal ?? "",
    input.windowEndLocal ?? "",
    input.spaceId,
  ].join("|");
}

export function preferDedupedLogRequirement<
  T extends { target: LogAttachmentTarget; recordId: string | null },
>(a: T, b: T): T {
  if (a.recordId && !b.recordId) return a;
  if (b.recordId && !a.recordId) return b;
  if (a.target.kind === "SPACE" && b.target.kind !== "SPACE") return a;
  if (b.target.kind === "SPACE" && a.target.kind !== "SPACE") return b;
  return a;
}

export function dedupeLocationLogRequirements<T extends LogRequirement>(
  requirements: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  const passthrough: T[] = [];
  for (const requirement of requirements) {
    const spaceId = spaceIdForLogTarget(requirement.target);
    if (!spaceId) {
      passthrough.push(requirement);
      continue;
    }
    const key = locationRequirementDedupeKey({
      catalogStableKey: requirement.catalogStableKey,
      scheduleKind: requirement.scheduleKind,
      cycleStableKey: requirement.cycleStableKey,
      windowStartLocal: requirement.windowStartLocal,
      windowEndLocal: requirement.windowEndLocal,
      spaceId,
    });
    const existing = byKey.get(key);
    byKey.set(key, existing ? preferDedupedLogRequirement(existing, requirement) : requirement);
  }
  return [...byKey.values(), ...passthrough];
}

export function bindOperationalTypeRequirementToSpace(
  requirement: LogRequirement,
  spaceId: string,
): LogRequirement {
  if (requirement.target.kind !== "OPERATIONAL_TYPE") return requirement;
  const target: LogAttachmentTarget = {
    ...requirement.target,
    resolvedSpaceId: spaceId,
  };
  return {
    ...requirement,
    target,
    requirementKey: buildLogRequirementKey({
      attachmentStableKey: requirement.attachmentStableKey,
      catalogStableKey: requirement.catalogStableKey,
      scheduleKind: requirement.scheduleKind,
      cycleStableKey: requirement.cycleStableKey,
      windowStartLocal: requirement.windowStartLocal,
      windowEndLocal: requirement.windowEndLocal,
      target,
      operationalDateKey: requirement.operationalDateKey,
    }),
  };
}

export function expandOperationalTypeSpaces<T extends { key: string }>(
  assignments: ReadonlyMap<string, T>,
  operationalTypeKey: string | null,
): string[] {
  const wanted = operationalTypeKey?.trim() || "";
  if (!wanted) return [];
  const spaceIds: string[] = [];
  for (const [spaceId, assignment] of assignments) {
    if (assignment.key.trim() === wanted) spaceIds.push(spaceId);
  }
  return spaceIds;
}
