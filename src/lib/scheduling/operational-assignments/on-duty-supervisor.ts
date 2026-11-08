import { getRolesForDepartment } from "@/lib/scheduling/assignment-roles";
import {
  facilityLocalDateToServiceDate,
  parseFacilityLocalScheduledStartOnDate,
  toServiceDateKey,
} from "@/lib/operational-time";

/**
 * Supervisory responsibility is an OperationalAssignment whose role is the
 * Department's supervisor-rounding responsibility. It is not the Supervisor
 * authority role, and it is not Plant on-call coverage.
 */
export function supervisoryResponsibilityRoleKey(departmentKey: string): string | null {
  const match = getRolesForDepartment(departmentKey).find((role) =>
    role.key.endsWith("_SUPERVISOR_ROUNDING"),
  );
  return match?.key ?? null;
}

export function isSupervisoryResponsibilityRole(roleKey: string): boolean {
  return roleKey.endsWith("_SUPERVISOR_ROUNDING");
}

export type OnDutySupervisorScope =
  | { kind: "department" }
  | { kind: "unit"; unitId: string }
  | { kind: "space"; spaceId: string };

export type OnDutySupervisorAssignment = {
  assignmentId: string;
  employeeId: string;
  scope: OnDutySupervisorScope;
  effectiveStart: Date;
  effectiveEnd: Date;
};

export type OnDutySupervisorResponsibility =
  | { status: "resolved"; assignments: OnDutySupervisorAssignment[] }
  | { status: "uncovered"; reason: "no_assignment" | "called_off" | "outside_window" | "outside_location" }
  | {
      status: "not_applicable";
      reason:
        | "department_not_in_facility"
        | "supervisory_responsibility_not_defined"
        | "on_call_coverage_not_defined"
        | "invalid_service_date";
    };

export type OnDutySupervisorCandidate = {
  assignmentId: string;
  employeeId: string;
  roleKey: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startsAt: Date | null;
  endsAt: Date | null;
  unitId: string | null;
  spaceIds: string[];
};

export type OnDutyLocationGraph = {
  parentByUnitId: ReadonlyMap<string, string | null>;
  unitIdBySpaceId: ReadonlyMap<string, string | null>;
};

const ACTIVE_STATUSES = new Set<OnDutySupervisorCandidate["status"]>(["PLANNED", "ACTIVE"]);

function nextServiceDateKey(serviceDate: string): string {
  const date = facilityLocalDateToServiceDate(serviceDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return toServiceDateKey(date);
}

export function serviceDateWindow(
  serviceDate: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  const start = parseFacilityLocalScheduledStartOnDate("00:00", serviceDate, timeZone);
  const end = parseFacilityLocalScheduledStartOnDate("00:00", nextServiceDateKey(serviceDate), timeZone);
  if (!start || !end) return null;
  return { start, end };
}

/** Inclusive start, exclusive end. Null bounds are the facility service date. */
export function responsibilityContainsInstant(
  startsAt: Date | null,
  endsAt: Date | null,
  at: Date,
  day: { start: Date; end: Date },
): boolean {
  const start = startsAt ?? day.start;
  const end = endsAt ?? day.end;
  return at.getTime() >= start.getTime() && at.getTime() < end.getTime();
}

function ancestorDistance(
  unitId: string,
  ancestorId: string,
  parentByUnitId: ReadonlyMap<string, string | null>,
): number | null {
  let current = parentByUnitId.get(unitId) ?? null;
  let distance = 1;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);
    if (current === ancestorId) return distance;
    current = parentByUnitId.get(current) ?? null;
    distance += 1;
    if (distance > 24) return null;
  }
  return null;
}

function locationSpecificity(
  candidate: OnDutySupervisorCandidate,
  query: { unitId: string | null; spaceId: string | null },
  graph: OnDutyLocationGraph,
): { score: number; scope: OnDutySupervisorScope } | null {
  const hasSpaces = candidate.spaceIds.length > 0;
  const targetUnit =
    query.unitId ?? (query.spaceId ? graph.unitIdBySpaceId.get(query.spaceId) ?? null : null);

  if (!query.spaceId && !query.unitId) {
    if (!hasSpaces && !candidate.unitId) return { score: 100, scope: { kind: "department" } };
    return null;
  }

  if (query.spaceId && hasSpaces && candidate.spaceIds.includes(query.spaceId)) {
    return { score: 400, scope: { kind: "space", spaceId: query.spaceId } };
  }

  if (hasSpaces) return null;

  if (candidate.unitId && targetUnit) {
    if (candidate.unitId === targetUnit) {
      return { score: 300, scope: { kind: "unit", unitId: candidate.unitId } };
    }
    const distance = ancestorDistance(targetUnit, candidate.unitId, graph.parentByUnitId);
    if (distance != null) {
      return { score: 300 - distance, scope: { kind: "unit", unitId: candidate.unitId } };
    }
  }

  if (!candidate.unitId) return { score: 100, scope: { kind: "department" } };
  return null;
}

export function selectOnDutySupervisors(input: {
  roleKey: string;
  at: Date;
  day: { start: Date; end: Date };
  unitId?: string | null;
  spaceId?: string | null;
  candidates: readonly OnDutySupervisorCandidate[];
  calledOffEmployeeIds: ReadonlySet<string>;
  graph: OnDutyLocationGraph;
}): OnDutySupervisorResponsibility {
  const query = { unitId: input.unitId ?? null, spaceId: input.spaceId ?? null };
  if (query.unitId && !input.graph.parentByUnitId.has(query.unitId)) {
    return { status: "uncovered", reason: "outside_location" };
  }
  if (query.spaceId && !input.graph.unitIdBySpaceId.has(query.spaceId)) {
    return { status: "uncovered", reason: "outside_location" };
  }

  const sameRole = input.candidates.filter(
    (candidate) => candidate.roleKey === input.roleKey && ACTIVE_STATUSES.has(candidate.status),
  );
  const inTime = sameRole.filter((candidate) =>
    responsibilityContainsInstant(candidate.startsAt, candidate.endsAt, input.at, input.day),
  );
  const located = inTime.flatMap((candidate) => {
    const match = locationSpecificity(candidate, query, input.graph);
    return match ? [{ candidate, match }] : [];
  });

  if (located.length === 0) {
    if (inTime.length > 0) return { status: "uncovered", reason: "outside_location" };
    if (sameRole.length > 0) return { status: "uncovered", reason: "outside_window" };
    return { status: "uncovered", reason: "no_assignment" };
  }

  const present = located.filter((row) => !input.calledOffEmployeeIds.has(row.candidate.employeeId));
  if (present.length === 0) return { status: "uncovered", reason: "called_off" };

  const best = Math.max(...present.map((row) => row.match.score));
  const winners = present
    .filter((row) => row.match.score === best)
    .sort((left, right) => (left.candidate.assignmentId < right.candidate.assignmentId ? -1 : 1));

  return {
    status: "resolved",
    assignments: winners.map((row) => ({
      assignmentId: row.candidate.assignmentId,
      employeeId: row.candidate.employeeId,
      scope: row.match.scope,
      effectiveStart: row.candidate.startsAt ?? input.day.start,
      effectiveEnd: row.candidate.endsAt ?? input.day.end,
    })),
  };
}
