/**
 * Location Program — composed read model for one department room.
 *
 * Attachments plus provenance. Not Experiences, not Role, not named employees.
 * Not persisted. Runtime Location State reads this object for today.
 */

export type LocationProgramNeedGrain = "TOTAL" | "PER_ROOM";

export type LocationProgramProvenance = {
  source:
    | "TEAM_ROOM_MEMBERSHIP"
    | "TEAM_CYCLE"
    | "CYCLE_PLACEMENT"
    | "ROOM_LOG"
    | "ASSET_LOG"
    | "FACILITY_TYPE_DEFAULT";
  detail: string;
};

export type LocationProgramTeam = {
  id: string;
  name: string;
  provenance: LocationProgramProvenance;
};

export type LocationProgramCycleTeam = {
  teamId: string;
  teamName: string;
  requiredCount: number | null;
  grain: LocationProgramNeedGrain;
  provenance: LocationProgramProvenance;
};

export type LocationProgramCycle = {
  cycleStableKey: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  teams: LocationProgramCycleTeam[];
  provenance: LocationProgramProvenance;
};

export type LocationProgramLog = {
  id: string;
  label: string;
  kind: "ROOM" | "ASSET" | "TYPE_DEFAULT";
  assetName: string | null;
  defaultId: string | null;
  attachmentId: string | null;
  suppressed: boolean;
  provenance: LocationProgramProvenance;
};

export type LocationProgramAsset = {
  id: string;
  name: string;
  code: string | null;
};

export type LocationProgram = {
  department: { id: string; name: string };
  location: {
    spaceId: string;
    name: string;
    place: string;
    neighborhoodName: string | null;
    floorName: string | null;
    facilityTypeLabel: string | null;
    facilityRoomTypeId: string | null;
    responsible: boolean;
  };
  teams: LocationProgramTeam[];
  cycles: LocationProgramCycle[];
  logs: LocationProgramLog[];
  assets: LocationProgramAsset[];
};

export type ComposeLocationProgramInput = {
  departmentId: string;
  departmentName: string;
  location: {
    spaceId: string;
    name: string;
    neighborhoodName: string | null;
    floorName: string | null;
    facilityTypeLabel: string | null;
    facilityRoomTypeId: string | null;
    responsible: boolean;
  };
  teams: readonly {
    id: string;
    name: string;
    spaceIds: readonly string[];
  }[];
  teamCycles: readonly {
    teamId: string;
    cycleStableKey: string;
    label: string;
    startLocal: string | null;
    endLocal: string | null;
    requiredCount: number | null;
    grain: LocationProgramNeedGrain;
  }[];
  cyclePlacements: readonly {
    cycleStableKey: string;
    label: string;
    startLocal: string | null;
    endLocal: string | null;
    spaceIds: readonly string[];
  }[];
  spaceLogs: readonly { id: string; label: string }[];
  assetLogs: readonly { id: string; label: string; assetName: string }[];
  typeDefaults: readonly {
    id: string;
    label: string;
    facilityRoomTypeId: string;
    typeLabel: string;
  }[];
  suppressions: readonly { defaultId: string; spaceId: string }[];
  assets: readonly { id: string; name: string; code: string | null }[];
};

export function formatNeedSummary(
  requiredCount: number | null,
  grain: LocationProgramNeedGrain,
): string {
  if (requiredCount == null) return "No staffing need";
  return grain === "PER_ROOM"
    ? `${requiredCount} per room`
    : `${requiredCount} total`;
}

export function emptyLocationProgram(input: {
  departmentId: string;
  departmentName: string;
  spaceId: string;
  name: string;
  neighborhoodName?: string | null;
  floorName?: string | null;
  facilityTypeLabel?: string | null;
  facilityRoomTypeId?: string | null;
}): LocationProgram {
  const place = [input.neighborhoodName, input.floorName].filter(Boolean).join(" · ");
  return {
    department: { id: input.departmentId, name: input.departmentName },
    location: {
      spaceId: input.spaceId,
      name: input.name,
      place,
      neighborhoodName: input.neighborhoodName ?? null,
      floorName: input.floorName ?? null,
      facilityTypeLabel: input.facilityTypeLabel ?? null,
      facilityRoomTypeId: input.facilityRoomTypeId ?? null,
      responsible: true,
    },
    teams: [],
    cycles: [],
    logs: [],
    assets: [],
  };
}

/** Teams, cycles, unsuppressed logs, or assets — Facility type alone is not a program. */
export function locationProgramIsAttached(
  program: LocationProgram | null | undefined,
): boolean {
  if (!program) return false;
  return (
    program.teams.length > 0 ||
    program.cycles.length > 0 ||
    program.logs.some((log) => !log.suppressed) ||
    program.assets.length > 0
  );
}

export function composeLocationProgram(
  input: ComposeLocationProgramInput,
): LocationProgram {
  const spaceId = input.location.spaceId;
  const place = [input.location.neighborhoodName, input.location.floorName]
    .filter(Boolean)
    .join(" · ");

  const teamsHere = input.teams.filter((team) => team.spaceIds.includes(spaceId));
  const teamIds = new Set(teamsHere.map((team) => team.id));
  const teamNameById = new Map(input.teams.map((team) => [team.id, team.name]));

  const teams: LocationProgramTeam[] = teamsHere
    .map((team) => ({
      id: team.id,
      name: team.name,
      provenance: {
        source: "TEAM_ROOM_MEMBERSHIP" as const,
        detail: "Works this room",
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cyclesByKey = new Map<string, LocationProgramCycle>();

  for (const row of input.teamCycles) {
    if (!teamIds.has(row.teamId)) continue;
    const teamName = teamNameById.get(row.teamId) ?? "Team";
    const teamRow: LocationProgramCycleTeam = {
      teamId: row.teamId,
      teamName,
      requiredCount: row.requiredCount,
      grain: row.grain,
      provenance: {
        source: "TEAM_CYCLE",
        detail: `From ${teamName}`,
      },
    };
    const existing = cyclesByKey.get(row.cycleStableKey);
    if (existing) {
      existing.teams.push(teamRow);
      continue;
    }
    cyclesByKey.set(row.cycleStableKey, {
      cycleStableKey: row.cycleStableKey,
      label: row.label,
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      teams: [teamRow],
      provenance: {
        source: "TEAM_CYCLE",
        detail: `From ${teamName}`,
      },
    });
  }

  for (const row of input.cyclePlacements) {
    if (!row.spaceIds.includes(spaceId)) continue;
    if (cyclesByKey.has(row.cycleStableKey)) continue;
    cyclesByKey.set(row.cycleStableKey, {
      cycleStableKey: row.cycleStableKey,
      label: row.label,
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      teams: [],
      provenance: {
        source: "CYCLE_PLACEMENT",
        detail: "Cycle placed on this room",
      },
    });
  }

  const cycles = [...cyclesByKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const cycle of cycles) {
    cycle.teams.sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  const suppressed = new Set(
    input.suppressions
      .filter((row) => row.spaceId === spaceId)
      .map((row) => row.defaultId),
  );
  const logs: LocationProgramLog[] = [];

  for (const row of input.spaceLogs) {
    logs.push({
      id: `room:${row.id}`,
      label: row.label,
      kind: "ROOM",
      assetName: null,
      defaultId: null,
      attachmentId: row.id,
      suppressed: false,
      provenance: { source: "ROOM_LOG", detail: "Added on this room" },
    });
  }

  for (const row of input.assetLogs) {
    logs.push({
      id: `asset:${row.id}`,
      label: row.label,
      kind: "ASSET",
      assetName: row.assetName,
      defaultId: null,
      attachmentId: row.id,
      suppressed: false,
      provenance: {
        source: "ASSET_LOG",
        detail: `On ${row.assetName}`,
      },
    });
  }

  if (input.location.facilityRoomTypeId) {
    for (const row of input.typeDefaults) {
      if (row.facilityRoomTypeId !== input.location.facilityRoomTypeId) continue;
      const isSuppressed = suppressed.has(row.id);
      logs.push({
        id: `type:${row.id}`,
        label: row.label,
        kind: "TYPE_DEFAULT",
        assetName: null,
        defaultId: row.id,
        attachmentId: null,
        suppressed: isSuppressed,
        provenance: {
          source: "FACILITY_TYPE_DEFAULT",
          detail: isSuppressed
            ? `Suppressed on this room · default for ${row.typeLabel}`
            : `Inherited from Facility type: ${row.typeLabel}`,
        },
      });
    }
  }

  return {
    department: { id: input.departmentId, name: input.departmentName },
    location: {
      spaceId,
      name: input.location.name,
      place,
      neighborhoodName: input.location.neighborhoodName,
      floorName: input.location.floorName,
      facilityTypeLabel: input.location.facilityTypeLabel,
      facilityRoomTypeId: input.location.facilityRoomTypeId,
      responsible: input.location.responsible,
    },
    teams,
    cycles,
    logs: logs.sort((a, b) => a.label.localeCompare(b.label)),
    assets: [...input.assets].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
