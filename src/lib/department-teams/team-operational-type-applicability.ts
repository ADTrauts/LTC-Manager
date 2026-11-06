/**
 * Department Team → Operational Type applicability.
 *
 * Answers: which configured Teams normally operate in this kind of location?
 * Does not create employee assignments, coverage, or OperationalAssignment rows.
 * Does not copy DepartmentTeamRoomMembership onto rooms.
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
  team: TeamApplicabilityRow,
  context: TeamLocationMatchContext,
): TeamLocationMatch[] {
  if (team.status !== "ACTIVE") return [];
  if (team.departmentId !== context.departmentId) return [];

  const matches: TeamLocationMatch[] = [];
  if (team.explicitSpaceIds.includes(context.spaceId)) {
    matches.push({
      team,
      source: "EXPLICIT_LOCATION",
      detail: describeTeamApplicability({ source: "EXPLICIT_LOCATION" }),
    });
  }

  const locationKey = context.operationalTypeKey?.trim() || "";
  if (
    locationKey &&
    team.applicableOperationalTypeKeys.some((key) => key.trim() === locationKey)
  ) {
    matches.push({
      team,
      source: "OPERATIONAL_TYPE_DEFAULT",
      detail: describeTeamApplicability({
        source: "OPERATIONAL_TYPE_DEFAULT",
        operationalTypeName: context.operationalTypeName,
      }),
    });
  }

  return matches;
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

/** Configured rooms for a team: explicit membership ∪ runtime-effective OT rooms. */
export function configuredTeamSpaceIds(input: {
  explicitSpaceIds: readonly string[];
  applicableOperationalTypeKeys: readonly string[];
  runtimeAssignments: ReadonlyMap<string, { key: string }>;
}): string[] {
  const wanted = new Set(
    input.applicableOperationalTypeKeys.map((key) => key.trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const spaceId of input.explicitSpaceIds) {
    if (!spaceId || seen.has(spaceId)) continue;
    seen.add(spaceId);
    ids.push(spaceId);
  }
  if (wanted.size === 0) return ids;
  for (const [spaceId, assignment] of input.runtimeAssignments) {
    if (!assignment.key.trim() || !wanted.has(assignment.key.trim())) continue;
    if (seen.has(spaceId)) continue;
    seen.add(spaceId);
    ids.push(spaceId);
  }
  return ids;
}

export function validateTeamOperationalTypeKeys(input: {
  submittedKeys: readonly string[];
  allowedKeys: ReadonlySet<string>;
}): string[] {
  const unique = [...new Set(input.submittedKeys.map((key) => key.trim()).filter(Boolean))];
  const invalid = unique.filter((key) => !input.allowedKeys.has(key));
  if (invalid.length > 0) {
    throw new Error("Team Operational Types must belong to this Department.");
  }
  return unique;
}
