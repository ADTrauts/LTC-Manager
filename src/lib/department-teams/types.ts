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
};

export type TeamCatalog = {
  locations: CycleScopeLocationOption[];
  roomTypes: Array<{ key: string; label: string }>;
};
