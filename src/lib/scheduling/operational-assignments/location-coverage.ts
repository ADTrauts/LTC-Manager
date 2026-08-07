/**
 * Phase 11C — EVS location Assignment coverage projection.
 * Independent from Work completion and from Dietary role×unit coverage.
 */

import type { PrismaClient } from "@prisma/client";

import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { responsibilityWindowsOverlap } from "@/lib/scheduling/operational-assignments/responsibility-window";

export type LocationCoverageState =
  | "COVERED"
  | "AT_RISK"
  | "UNCOVERED"
  | "OVERLAPPING"
  | "NOT_REQUIRED"
  | "NOT_CONFIGURED";

export type LocationCoverageRow = {
  unitSpaceId: string;
  unitId: string | null;
  unitName: string | null;
  floorUnitId: string | null;
  floorName: string | null;
  label: string;
  roomNumber: string | null;
  state: LocationCoverageState;
  employeeIds: string[];
  employeeLabels: string[];
  assignmentIds: string[];
  zoneIds: string[];
};

export type LocationCoverageSummary = {
  covered: number;
  atRisk: number;
  uncovered: number;
  overlapping: number;
  notRequired: number;
  notConfigured: number;
  totalRequired: number;
  rows: LocationCoverageRow[];
};

type AssignmentSlice = {
  id: string;
  employeeId: string;
  employeeLabel: string;
  unitId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  hasCallDown: boolean;
  sourceZoneId: string | null;
  locationSpaceIds: string[];
};

/**
 * Build Room/Space Assignment coverage for a department operational date.
 * Required locations = active UnitSpaces under Units with department responsibility
 * (or direct UnitSpaceResponsibility). Work completion does not affect state.
 */
export async function buildLocationCoverageSummary(
  client: PrismaClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDate: Date;
    /** Optional upcoming window for AT_RISK / upcoming uncovered projection. */
    now?: Date;
    upcomingWithinMs?: number;
    callOffEmployeeIds?: string[];
  },
): Promise<LocationCoverageSummary> {
  const now = input.now ?? new Date();
  const upcomingMs = input.upcomingWithinMs ?? 2 * 60 * 60 * 1000;
  const callOffSet = new Set(input.callOffEmployeeIds ?? []);

  const [unitResponsibilities, spaceResponsibilities, assignments] = await Promise.all([
    client.unitDepartmentResponsibility.findMany({
      where: { departmentId: input.departmentId },
      select: { unitId: true },
    }),
    client.unitSpaceResponsibility.findMany({
      where: { departmentId: input.departmentId },
      select: { spaceId: true },
    }),
    client.operationalAssignment.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        serviceDate: input.serviceDate,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        employeeId: true,
        unitId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        sourceZoneId: true,
        employee: { select: { firstName: true, lastName: true } },
        locations: { select: { unitSpaceId: true } },
      },
    }),
  ]);

  const responsibleUnitIds = new Set(unitResponsibilities.map((r) => r.unitId));
  const directSpaceIds = new Set(spaceResponsibilities.map((r) => r.spaceId));

  const spaces = await client.unitSpace.findMany({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      OR: [
        ...(responsibleUnitIds.size > 0 ? [{ unitId: { in: [...responsibleUnitIds] } }] : []),
        ...(directSpaceIds.size > 0 ? [{ id: { in: [...directSpaceIds] } }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      roomNumber: true,
      unitId: true,
      sortOrder: true,
      unit: {
        select: {
          id: true,
          name: true,
          parentUnitId: true,
          parentUnit: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }, { name: "asc" }],
  });

  if (spaces.length === 0 && responsibleUnitIds.size === 0 && directSpaceIds.size === 0) {
    return {
      covered: 0,
      atRisk: 0,
      uncovered: 0,
      overlapping: 0,
      notRequired: 0,
      notConfigured: 1,
      totalRequired: 0,
      rows: [],
    };
  }

  const slices: AssignmentSlice[] = [];
  for (const a of assignments) {
    let locationSpaceIds: string[];
    if (a.locations.length > 0) {
      locationSpaceIds = a.locations.map((l) => l.unitSpaceId);
    } else if (a.unitId) {
      locationSpaceIds = spaces.filter((s) => s.unitId === a.unitId).map((s) => s.id);
    } else {
      locationSpaceIds = [];
    }
    slices.push({
      id: a.id,
      employeeId: a.employeeId,
      employeeLabel: `${a.employee.firstName} ${a.employee.lastName}`.trim(),
      unitId: a.unitId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      hasCallDown: callOffSet.has(a.employeeId),
      sourceZoneId: a.sourceZoneId,
      locationSpaceIds,
    });
  }

  // Preload zone membership for filter tags on rows (optional).
  const zoneLinks = await client.departmentOperationalZoneLocation.findMany({
    where: {
      zone: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: { not: "RETIRED" },
      },
      unitSpaceId: { in: spaces.map((s) => s.id) },
    },
    select: { unitSpaceId: true, zoneId: true },
  });
  const zonesBySpace = new Map<string, string[]>();
  for (const link of zoneLinks) {
    const list = zonesBySpace.get(link.unitSpaceId) ?? [];
    list.push(link.zoneId);
    zonesBySpace.set(link.unitSpaceId, list);
  }

  let covered = 0;
  let atRisk = 0;
  let uncovered = 0;
  let overlapping = 0;
  const notRequired = 0;

  const rows: LocationCoverageRow[] = [];

  for (const space of spaces) {
    const covering = slices.filter((s) => s.locationSpaceIds.includes(space.id));
    const activeNow = covering.filter((s) =>
      windowCoversInstant(s.startsAt, s.endsAt, now),
    );
    const uniqueEmployees = new Set(covering.map((s) => s.employeeId));
    const overlappingPairs = hasOverlappingEmployeeWindows(covering);

    let state: LocationCoverageState;
    if (covering.length === 0) {
      // Upcoming uncovered: no assignment at all
      state = "UNCOVERED";
      uncovered++;
    } else if (overlappingPairs || uniqueEmployees.size > 1 && covering.some((a, i) =>
      covering.some((b, j) =>
        i < j &&
        a.employeeId !== b.employeeId &&
        responsibilityWindowsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt),
      ),
    )) {
      state = "OVERLAPPING";
      overlapping++;
    } else if (covering.some((s) => s.hasCallDown) || (activeNow.length === 0 && willBecomeUncoveredSoon(covering, now, upcomingMs))) {
      state = "AT_RISK";
      atRisk++;
    } else {
      state = "COVERED";
      covered++;
    }

    rows.push({
      unitSpaceId: space.id,
      unitId: space.unitId,
      unitName: space.unit?.name ?? null,
      floorUnitId: space.unit?.parentUnit?.id ?? space.unit?.id ?? null,
      floorName: space.unit?.parentUnit?.name ?? space.unit?.name ?? null,
      label: formatRoomDisplayName(space),
      roomNumber: space.roomNumber,
      state,
      employeeIds: [...uniqueEmployees],
      employeeLabels: [...new Set(covering.map((c) => c.employeeLabel))],
      assignmentIds: covering.map((c) => c.id),
      zoneIds: zonesBySpace.get(space.id) ?? [],
    });
  }

  return {
    covered,
    atRisk,
    uncovered,
    overlapping,
    notRequired,
    notConfigured: 0,
    totalRequired: rows.length,
    rows,
  };
}

function windowCoversInstant(startsAt: Date | null, endsAt: Date | null, now: Date): boolean {
  if (startsAt && now < startsAt) return false;
  if (endsAt && now > endsAt) return false;
  return true;
}

function willBecomeUncoveredSoon(
  covering: AssignmentSlice[],
  now: Date,
  upcomingMs: number,
): boolean {
  const horizon = new Date(now.getTime() + upcomingMs);
  const coveringAtHorizon = covering.filter((s) =>
    windowCoversInstant(s.startsAt, s.endsAt, horizon),
  );
  return coveringAtHorizon.length === 0;
}

function hasOverlappingEmployeeWindows(covering: AssignmentSlice[]): boolean {
  for (let i = 0; i < covering.length; i++) {
    for (let j = i + 1; j < covering.length; j++) {
      const a = covering[i]!;
      const b = covering[j]!;
      if (a.employeeId === b.employeeId) continue;
      if (responsibilityWindowsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt)) {
        return true;
      }
    }
  }
  return false;
}
