import Link from "next/link";

import { isOperationalAssignmentsEnabled } from "@/lib/feature-flags";
import type { DepartmentWeekLocationCoverageProjection } from "@/lib/scheduling/department-week-location-coverage-projection";
import {
  scheduleWeekdayLongLabel,
  scheduleWeekdayShortLabel,
} from "@/lib/scheduling/schedule-week-range";

type Props = {
  projection: DepartmentWeekLocationCoverageProjection;
  canManage: boolean;
  anchorDate: string;
  readOnly?: boolean;
  floorFilter?: string | null;
  /** When false (default), only Floor summary rows show; Rooms expand via ?rooms=1. */
  showRooms?: boolean;
};

function statusClass(status: string): string {
  switch (status) {
    case "full":
      return "text-zinc-900";
    case "partial":
      return "text-amber-800";
    case "uncovered":
      return "text-rose-800";
    default:
      return "text-zinc-500";
  }
}

export function WeekLocationCoverageGrid({
  projection,
  canManage,
  anchorDate,
  readOnly = false,
  floorFilter,
  showRooms = false,
}: Props) {
  const oaEnabled = isOperationalAssignmentsEnabled();
  const week = projection.week;
  const floors = floorFilter
    ? projection.floors.filter((f) => f.floorUnitId === floorFilter || f.floorName === floorFilter)
    : projection.floors;

  if (!oaEnabled) {
    return (
      <article className="rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="week-location-grid">
        <h2 className="text-sm font-semibold text-amber-950">Location View</h2>
        <p className="mt-1 text-sm text-amber-900">
          Location coverage uses Daily Assignments. Enable Operational Assignments to see where
          coverage is planned across the week. Employee View still schedules Shifts.
        </p>
        <Link
          href={`/staffing?date=${anchorDate}&view=employee&mode=week`}
          className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:underline"
        >
          Back to Employee View
        </Link>
      </article>
    );
  }

  return (
    <div className="space-y-4" data-testid="week-location-grid">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{projection.departmentName}</h2>
        <p className="text-sm text-zinc-600">
          Where is coverage assigned this week? Derived from Daily Assignments — unit-less Shifts
          alone do not create location coverage.
        </p>
      </div>

      {projection.locationScopeNote ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {projection.locationScopeNote}
        </p>
      ) : null}

      {projection.emptyMessage ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-700">
          {projection.emptyMessage}
        </p>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="date" value={anchorDate} />
        <input type="hidden" name="view" value="location" />
        <input type="hidden" name="mode" value="week" />
        {showRooms ? <input type="hidden" name="rooms" value="1" /> : null}
        <label className="text-xs text-zinc-600">
          Floor
          <select
            name="floor"
            defaultValue={floorFilter ?? ""}
            className="mt-0.5 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All floors</option>
            {projection.floors.map((f) => (
              <option key={f.floorUnitId} value={f.floorUnitId}>
                {f.floorName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
        >
          Apply
        </button>
        <Link
          href={`/staffing?date=${anchorDate}&view=location&mode=week${floorFilter ? `&floor=${encodeURIComponent(floorFilter)}` : ""}${showRooms ? "" : "&rooms=1"}`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
        >
          {showRooms ? "Hide rooms" : "Show rooms"}
        </Link>
      </form>

      {floors.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 font-medium">Location</th>
                {week.days.map((day) => (
                  <th key={day} className="min-w-[7.5rem] px-2 py-2 font-medium">
                    <span className="block">{scheduleWeekdayShortLabel(day)}</span>
                    <span className="block font-normal normal-case text-zinc-400">{day.slice(5)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {floors.map((floor) => (
                <FloorRows
                  key={floor.floorUnitId}
                  floor={floor}
                  canManage={canManage && !readOnly}
                  showRooms={showRooms}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {projection.neighborhoods.length > 0 && !floorFilter ? (
        <details className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
            Neighborhood summaries ({projection.neighborhoods.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {projection.neighborhoods.map((n) => (
              <li key={n.neighborhoodUnitId} className="border-b border-zinc-100 pb-2">
                <p className="font-medium text-zinc-900">{n.neighborhoodName}</p>
                <p className="text-xs text-zinc-600">
                  {n.days
                    .map(
                      (d) =>
                        `${scheduleWeekdayShortLabel(d.serviceDate)}: ${d.cellLabel}${
                          d.hasAssignedUnscheduled ? " (assigned, not scheduled)" : ""
                        }`,
                    )
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function FloorRows({
  floor,
  canManage,
  showRooms,
}: {
  floor: DepartmentWeekLocationCoverageProjection["floors"][number];
  canManage: boolean;
  showRooms: boolean;
}) {
  return (
    <>
      <tr data-testid={`week-loc-floor-${floor.floorUnitId}`}>
        <td className="sticky left-0 z-10 bg-white px-3 py-2 align-top">
          <p className="font-semibold text-zinc-900">{floor.floorName}</p>
          <p className="text-xs text-zinc-500">{floor.rooms.length} rooms</p>
        </td>
        {floor.days.map((day) => (
          <LocationDayCell
            key={day.serviceDate}
            day={day}
            canManage={canManage}
            locationLabel={floor.floorName}
          />
        ))}
      </tr>
      {showRooms
        ? floor.rooms.map((room) => (
            <tr
              key={room.unitSpaceId}
              className="bg-zinc-50/80"
              data-testid={`week-loc-room-${room.unitSpaceId}`}
            >
              <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-1.5 pl-8 align-top text-zinc-700">
                {room.roomName}
              </td>
              {room.days.map((day) => (
                <LocationDayCell
                  key={day.serviceDate}
                  day={day}
                  canManage={canManage}
                  locationLabel={room.roomName}
                  compact
                />
              ))}
            </tr>
          ))
        : null}
    </>
  );
}

function LocationDayCell({
  day,
  canManage,
  locationLabel,
  compact = false,
}: {
  day: DepartmentWeekLocationCoverageProjection["floors"][number]["days"][number];
  canManage: boolean;
  locationLabel: string;
  compact?: boolean;
}) {
  const aria = `${locationLabel}, ${scheduleWeekdayLongLabel(day.serviceDate)}, ${day.cellLabel}${
    day.hasAssignedUnscheduled ? ", assigned not scheduled" : ""
  }`;
  return (
    <td className={`px-2 ${compact ? "py-1.5" : "py-2"} align-top`}>
      {canManage ? (
        <Link
          href={`/staffing/assignments?date=${day.serviceDate}`}
          className={`block hover:underline ${statusClass(day.status)} ${compact ? "text-xs" : "text-sm"}`}
          aria-label={`${aria}. Open Daily Assignments.`}
        >
          {day.cellLabel}
        </Link>
      ) : (
        <span className={`${statusClass(day.status)} ${compact ? "text-xs" : "text-sm"}`} aria-label={aria}>
          {day.cellLabel}
        </span>
      )}
      {day.hasAssignedUnscheduled ? (
        <p className="mt-0.5 text-[11px] font-medium text-amber-800">
          Assigned, not scheduled
          {day.assignedUnscheduledNames.length === 1
            ? `: ${day.assignedUnscheduledNames[0]}`
            : day.assignedUnscheduledNames.length > 1
              ? ` (${day.assignedUnscheduledNames.length})`
              : ""}
        </p>
      ) : null}
    </td>
  );
}
