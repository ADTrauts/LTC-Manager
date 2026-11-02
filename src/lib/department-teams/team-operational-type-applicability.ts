/**
 * Retired. A Team does not match a room by membership or Location Function.
 * These functions stay so older imports fail closed instead of expanding scope.
 */

import type { OverlayProvenanceSource } from "@/lib/department-administration/effective-location-program";

export type TeamApplicabilitySource = "OPERATIONAL_TYPE_DEFAULT" | "EXPLICIT_LOCATION";

export type TeamLocationMatchContext = {
  departmentId: string;
  spaceId: string;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
};

export type TeamApplicabilityRow = {
  id: string;
  departmentId: string;
  displayName: string;
  status: "ACTIVE" | "ARCHIVED";
  applicableOperationalTypeKeys: readonly string[];
  explicitSpaceIds: readonly string[];
};

export type TeamLocationMatch = {
  team: TeamApplicabilityRow;
  source: TeamApplicabilitySource;
  detail: string;
};

export function describeTeamApplicability(input: {
  source: TeamApplicabilitySource;
  operationalTypeName?: string | null;
}): string {
  if (input.source === "OPERATIONAL_TYPE_DEFAULT") {
    return input.operationalTypeName?.trim()
      ? `Inherited from Operational Type: ${input.operationalTypeName.trim()}`
      : "Inherited from Operational Type";
  }
  return "Applied directly to this location";
}

export function overlaySourceFromTeamMatch(
  source: TeamApplicabilitySource,
): OverlayProvenanceSource {
  return source === "OPERATIONAL_TYPE_DEFAULT"
    ? "OPERATIONAL_TYPE_DEFAULT"
    : "EXPLICIT_LOCATION";
}

export function matchTeamToLocation(
  _team: TeamApplicabilityRow,
  _context: TeamLocationMatchContext,
): TeamLocationMatch[] {
  return [];
}

export function dedupeTeamLocationMatches(
  matches: readonly TeamLocationMatch[],
): TeamLocationMatch[] {
  const byTeam = new Map<string, TeamLocationMatch[]>();
  for (const match of matches) {
    const list = byTeam.get(match.team.id) ?? [];
    list.push(match);
    byTeam.set(match.team.id, list);
  }

  const out: TeamLocationMatch[] = [];
  for (const group of byTeam.values()) {
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
      detail:
        extras.length > 0 ? `${primary.detail}. Also ${lcFirst(extras.join("; "))}` : primary.detail,
    });
  }
  return out.sort((a, b) => a.team.displayName.localeCompare(b.team.displayName));
}

function sourceRank(source: TeamApplicabilitySource): number {
  return source === "EXPLICIT_LOCATION" ? 0 : 1;
}

function lcFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** A Team does not own rooms, including rooms classified by Location Function. */
export function configuredTeamSpaceIds(_input: {
  explicitSpaceIds: readonly string[];
  applicableOperationalTypeKeys: readonly string[];
  runtimeAssignments: ReadonlyMap<string, { key: string }>;
}): string[] {
  return [];
}

export function validateTeamOperationalTypeKeys(input: {
  submittedKeys: readonly string[];
  allowedKeys: ReadonlySet<string>;
}): string[] {
  const unique = [...new Set(input.submittedKeys.map((key) => key.trim()).filter(Boolean))];
  if (unique.length > 0) {
    throw new Error("A Team does not use Location Function.");
  }
  return [];
}
