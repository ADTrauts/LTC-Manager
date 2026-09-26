import type { CycleScopeLocationOption } from "@/lib/operational-cycles/cycle-scope";

export type TeamEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  onRoster: boolean;
};

export type TeamRoomView = {
  spaceId: string;
  name: string;
  displayName: string;
  floorName: string | null;
  neighborhoodName: string | null;
  roomTypeLabel: string | null;
};

export type TeamCycleNeedGrain = "TOTAL" | "PER_ROOM";

export type TeamCycleChildView = {
  id: string;
  stableKey: string;
  label: string;
  nodeKind: "PERIOD" | "KEY_TIME";
  startLocal: string | null;
  endLocal: string | null;
};

export type TeamCycleView = {
  id: string;
  cycleStableKey: string;
  cycleId: string | null;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  applicableDaysOfWeek: number[];
  status: "DRAFT" | "PUBLISHED" | "RETIRED" | "MISSING";
  requiredCount: number | null;
  grain: TeamCycleNeedGrain;
  children: TeamCycleChildView[];
};

export type DepartmentCycleOption = {
  stableKey: string;
  label: string;
  startLocal: string | null;
  endLocal: string | null;
  status: "DRAFT" | "PUBLISHED";
};

export type DepartmentTeamView = {
  id: string;
  facilityId: string;
  departmentId: string;
  displayName: string;
  description: string | null;
  displayOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  archivedAt: string | null;
  managerEmployeeId: string | null;
  managerLabel: string | null;
  roomCount: number;
  activeMemberCount: number;
  rooms: TeamRoomView[];
  applicableOperationalTypeKeys: string[];
  cycles: TeamCycleView[];
};

export type TeamOperationalTypeOption = {
  key: string;
  name: string;
};

export type TeamCatalog = {
  locations: CycleScopeLocationOption[];
  roomTypes: Array<{ key: string; label: string }>;
  operationalTypes: TeamOperationalTypeOption[];
};
