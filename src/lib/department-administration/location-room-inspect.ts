/**
 * Director-facing room inspect for Department Locations.
 * Projects a Location Program into the modal: same attachments, plus add-log UI.
 */

import {
  composeLocationProgram,
  formatNeedSummary,
  type ComposeLocationProgramInput,
  type LocationProgram,
  type LocationProgramAsset,
  type LocationProgramCycle,
  type LocationProgramLog,
  type LocationProgramNeedGrain,
  type LocationProgramProvenance,
  type LocationProgramTeam,
} from "./location-program";

export type LocationRoomNeedGrain = LocationProgramNeedGrain;
export type LocationRoomProvenance = LocationProgramProvenance;
export type LocationRoomTeamInspect = LocationProgramTeam;
export type LocationRoomCycleInspect = LocationProgramCycle;
export type LocationRoomCycleTeamInspect = LocationProgramCycle["teams"][number];

export type LocationRoomLogInspect = LocationProgramLog & {
  canRemove: boolean;
  canSuppress: boolean;
  canRestore: boolean;
};

export type LocationRoomAssetInspect = LocationProgramAsset & {
  href: string;
};

export type LocationRoomInspectView = {
  spaceId: string;
  name: string;
  place: string;
  facilityTypeLabel: string | null;
  facilityRoomTypeId: string | null;
  departmentId: string;
  departmentName: string;
  responsible: boolean;
  teams: LocationRoomTeamInspect[];
  cycles: LocationRoomCycleInspect[];
  logs: LocationRoomLogInspect[];
  assets: LocationRoomAssetInspect[];
  addLogHref: string | null;
  catalogOptions: Array<{ stableKey: string; name: string }>;
};

export type ComposeLocationRoomInspectInput = ComposeLocationProgramInput & {
  catalogOptions: readonly { stableKey: string; name: string }[];
  logsEnabled: boolean;
};

export { formatNeedSummary };

function inspectLog(log: LocationProgramLog): LocationRoomLogInspect {
  return {
    ...log,
    canRemove: log.kind === "ROOM",
    canSuppress: log.kind === "TYPE_DEFAULT" && !log.suppressed,
    canRestore: log.kind === "TYPE_DEFAULT" && log.suppressed,
  };
}

export function toLocationRoomInspect(
  program: LocationProgram,
  extras: {
    catalogOptions: readonly { stableKey: string; name: string }[];
    logsEnabled: boolean;
  },
): LocationRoomInspectView {
  const spaceId = program.location.spaceId;
  return {
    spaceId,
    name: program.location.name,
    place: program.location.place,
    facilityTypeLabel: program.location.facilityTypeLabel,
    facilityRoomTypeId: program.location.facilityRoomTypeId,
    departmentId: program.department.id,
    departmentName: program.department.name,
    responsible: program.location.responsible,
    teams: program.teams,
    cycles: program.cycles,
    logs: program.logs.map(inspectLog),
    assets: program.assets.map((asset) => ({
      ...asset,
      href: `/assets/${asset.id}`,
    })),
    addLogHref: extras.logsEnabled
      ? `/build/logs/attach?targetKind=SPACE&targetId=${encodeURIComponent(spaceId)}&departmentId=${encodeURIComponent(program.department.id)}&returnTo=${encodeURIComponent(`/admin/departments/${program.department.id}?tab=locations`)}`
      : null,
    catalogOptions: [...extras.catalogOptions].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function composeLocationRoomInspect(
  input: ComposeLocationRoomInspectInput,
): LocationRoomInspectView {
  const { catalogOptions, logsEnabled, ...programInput } = input;
  return toLocationRoomInspect(composeLocationProgram(programInput), {
    catalogOptions,
    logsEnabled,
  });
}
