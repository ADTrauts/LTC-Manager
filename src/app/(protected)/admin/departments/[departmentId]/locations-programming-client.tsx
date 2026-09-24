"use client";

import { useMemo, useState } from "react";

import {
  assignLocationOperationalTypeAction,
  clearLocationOperationalTypeAction,
  createLocationOperationalTypeAction,
  ensureLocationOperationalTypesAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { Drawer } from "@/components/drawer";
import { DepartmentLocationTree } from "@/components/location-tree";
import { StatusBadge } from "@/components/design-system";
import type { DepartmentAdminView } from "@/lib/department-administration";
import { groupRoomsByOperationalType } from "@/lib/department-administration/operational-type";
import type { EffectiveLocationProgram } from "@/lib/department-administration/effective-location-program";

type LocationView = "location" | "type";

type OperationalTypeOption = {
  id: string;
  key: string;
  name: string;
};

type Props = {
  view: DepartmentAdminView;
  canAuthorPatterns: boolean;
  operationalTypes: readonly OperationalTypeOption[];
  programs: Record<string, EffectiveLocationProgram>;
};

export function LocationsProgrammingClient({
  view,
  canAuthorPatterns,
  operationalTypes,
  programs,
}: Props) {
  const [lens, setLens] = useState<LocationView>("location");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  const rooms = useMemo(
    () => view.locations.filter((location) => location.kind === "room"),
    [view.locations],
  );
  const typeGroups = useMemo(() => groupRoomsByOperationalType(view.locations), [view.locations]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const program = selectedRoomId ? programs[selectedRoomId] ?? null : null;

  const floorLabel = view.vocabulary.level1.singular;
  const neighborhoodLabel = view.vocabulary.level2.singular;

  return (
    <div className="space-y-3" data-testid="department-locations-programming">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-xs font-medium">
          <button
            type="button"
            className={`rounded px-2.5 py-1 ${lens === "location" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"}`}
            onClick={() => setLens("location")}
            data-testid="locations-view-by-location"
          >
            By location
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 ${lens === "type" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600"}`}
            onClick={() => setLens("type")}
            data-testid="locations-view-by-type"
          >
            By Operational Type
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          {view.locationCoverage.roomCount} rooms · {view.locationCoverage.withPattern} with
          Operational Type
        </p>
        {view.workingProfileMeta?.status === "DRAFT" ? (
          <p className="text-xs text-zinc-500" data-testid="locations-draft-boundary">
            {view.profiles.some((profile) => profile.status === "ACTIVE")
              ? "You are editing a Draft. Today’s Run keeps the active Operational Types until this configuration is activated."
              : "These Operational Type assignments are Draft. Run uses them only after this configuration is activated."}
          </p>
        ) : null}
      </div>

      {canAuthorPatterns && operationalTypes.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-medium">No Operational Types yet</p>
          <p className="mt-1 text-xs">
            Prepare department Operational Types, then assign them to rooms. Dietary includes
            Servery, Retail, and Main Kitchen by default.
          </p>
          <DepartmentAdminActionForm
            action={ensureLocationOperationalTypesAction}
            className="mt-2"
          >
            <input type="hidden" name="departmentId" value={view.department.id} />
            <button type="submit" className="text-xs font-medium underline">
              Prepare Operational Types
            </button>
          </DepartmentAdminActionForm>
        </div>
      ) : null}

      {lens === "location" ? (
        <DepartmentLocationTree
          floors={view.locationHierarchy}
          floorLabel={floorLabel}
          neighborhoodLabel={neighborhoodLabel}
          selectedRoomId={selectedRoomId}
          onSelectRoom={(room) => setSelectedRoomId(room.id)}
        />
      ) : (
        <div className="space-y-3" data-testid="department-locations-by-type">
          {typeGroups.map((group) => (
            <section
              key={group.patternKey ?? "__none__"}
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
            >
              <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">{group.label}</h3>
                  <p className="text-xs text-zinc-500">
                    {group.rooms.length} location{group.rooms.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <a
                    href={`/admin/departments/${view.department.id}?tab=cycles`}
                    className="text-xs font-medium text-zinc-700 underline"
                  >
                    Manage Operational Cycles
                  </a>
                  <a href="/build/logs" className="text-xs font-medium text-zinc-700 underline">
                    Manage Logs
                  </a>
                  <a
                    href={`/admin/departments/${view.department.id}?tab=teams`}
                    className="text-xs font-medium text-zinc-700 underline"
                  >
                    Manage Teams
                  </a>
                  <a
                    href={`/admin/departments/${view.department.id}?tab=coverage`}
                    className="text-xs font-medium text-zinc-700 underline"
                  >
                    Manage Coverage
                  </a>
                </div>
              </header>
              <div className="border-b border-zinc-100 px-3 py-2" data-testid="type-group-cycles">
                <p className="text-xs font-medium text-zinc-700">Operational Cycles</p>
                {cyclesForOperationalTypeGroup(group.rooms, programs).length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    {group.patternKey
                      ? "No published cycles target this Operational Type."
                      : "Unassigned rooms do not inherit Operational Type cycles."}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {cyclesForOperationalTypeGroup(group.rooms, programs).map((cycle) => (
                      <li key={cycle.id} className="text-xs text-zinc-700">
                        {cycle.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-b border-zinc-100 px-3 py-2" data-testid="type-group-logs">
                <p className="text-xs font-medium text-zinc-700">Required Logs</p>
                {logsForOperationalTypeGroup(group.rooms, programs).length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    {group.patternKey
                      ? "No canonical logs target this Operational Type."
                      : "Unassigned rooms do not inherit Operational Type logs."}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {logsForOperationalTypeGroup(group.rooms, programs).map((log) => (
                      <li key={log.id} className="text-xs text-zinc-700">
                        {log.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-b border-zinc-100 px-3 py-2" data-testid="type-group-teams">
                <p className="text-xs font-medium text-zinc-700">Configured Teams</p>
                {teamsForOperationalTypeGroup(group.rooms, programs).length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    {group.patternKey
                      ? "No Teams target this Operational Type."
                      : "Unassigned rooms do not inherit Operational Type teams."}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {teamsForOperationalTypeGroup(group.rooms, programs).map((team) => (
                      <li key={team.id} className="text-xs text-zinc-700">
                        {team.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-b border-zinc-100 px-3 py-2" data-testid="type-group-coverage">
                <p className="text-xs font-medium text-zinc-700">Coverage Expectations</p>
                {coverageForOperationalTypeGroup(group.rooms, programs).length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-400">
                    {group.patternKey
                      ? "No Coverage Expectations target this Operational Type."
                      : "Unassigned rooms do not inherit Operational Type coverage."}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {coverageForOperationalTypeGroup(group.rooms, programs).map((row) => (
                      <li key={row.id} className="text-xs text-zinc-700">
                        {row.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ul>
                {group.rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                        selectedRoomId === room.id ? "bg-zinc-50" : ""
                      }`}
                      onClick={() => setSelectedRoomId(room.id)}
                    >
                      <span>
                        <span className="font-medium text-zinc-900">{room.displayName}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {[room.parentNeighborhoodName, room.floorName].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        Physical Type: {room.roomTypeLabel ?? "not assigned"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selectedRoom)}
        onClose={() => setSelectedRoomId(null)}
        title={selectedRoom?.displayName ?? "Location"}
        size="md"
        data-testid="location-program-inspector"
      >
        {selectedRoom && program ? (
          <LocationProgramInspector
            departmentId={view.department.id}
            departmentName={view.department.name}
            canAuthorPatterns={canAuthorPatterns}
            operationalTypes={operationalTypes}
            program={program}
          />
        ) : selectedRoom ? (
          <p className="text-sm text-zinc-600">
            This room is assigned to {view.department.name}. Open it again after the page
            refreshes to inspect configuration.
          </p>
        ) : null}
      </Drawer>
    </div>
  );
}

function LocationProgramInspector({
  departmentId,
  departmentName,
  canAuthorPatterns,
  operationalTypes,
  program,
}: {
  departmentId: string;
  departmentName: string;
  canAuthorPatterns: boolean;
  operationalTypes: readonly OperationalTypeOption[];
  program: EffectiveLocationProgram;
}) {
  const ot = program.operationalType;
  const assignedKey = ot.key ?? "";

  return (
    <div className="space-y-5 text-sm" data-testid="location-program-inspector-body">
      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Location</h3>
        <p className="font-medium text-zinc-900">{program.location.displayName}</p>
        <p className="text-xs text-zinc-500">
          {[program.location.neighborhoodName, program.location.floorName]
            .filter(Boolean)
            .join(" · ") || "Facility hierarchy"}
        </p>
        <p className="text-xs text-zinc-600">
          {departmentName} is responsible for this room via Facility Builder.
        </p>
      </section>

      <section className="space-y-2" data-testid="location-program-physical-type">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Physical Type
        </h3>
        <p className="text-zinc-800">{program.physical.roomTypeLabel ?? "Not assigned"}</p>
        <p className="text-xs text-zinc-500">
          Owned by Facility Builder. This is not the Operational Type.
        </p>
      </section>

      <section className="space-y-2" data-testid="location-program-operational-type">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Operational Type
        </h3>
        <p className="font-medium text-zinc-900">
          {ot.state === "assigned" && ot.name ? ot.name : "No Operational Type"}
        </p>
        <p className="text-xs text-zinc-500">
          {ot.provenance === "EXPLICIT_ASSIGNMENT"
            ? "Explicitly assigned to this room."
            : "Not assigned. Physical Type does not imply an Operational Type."}
        </p>

        {canAuthorPatterns ? (
          <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <DepartmentAdminActionForm
              action={assignLocationOperationalTypeAction}
              className="space-y-2"
            >
              <input type="hidden" name="departmentId" value={departmentId} />
              <input type="hidden" name="unitSpaceId" value={program.location.id} />
              <label className="block text-xs font-medium text-zinc-700">
                Assign Operational Type
                <select
                  name="archetypeKey"
                  required
                  defaultValue={assignedKey}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Select a type
                  </option>
                  {operationalTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                {ot.state === "assigned" ? "Change Operational Type" : "Assign Operational Type"}
              </button>
            </DepartmentAdminActionForm>

            {ot.state === "assigned" ? (
              <DepartmentAdminActionForm action={clearLocationOperationalTypeAction}>
                <input type="hidden" name="departmentId" value={departmentId} />
                <input type="hidden" name="unitSpaceId" value={program.location.id} />
                <button type="submit" className="text-xs font-medium text-zinc-700 underline">
                  Clear Operational Type
                </button>
              </DepartmentAdminActionForm>
            ) : null}

            <DepartmentAdminActionForm
              action={createLocationOperationalTypeAction}
              className="space-y-2 border-t border-zinc-200 pt-2"
            >
              <input type="hidden" name="departmentId" value={departmentId} />
              <label className="block text-xs font-medium text-zinc-700">
                Create Operational Type
                <input
                  name="name"
                  required
                  placeholder="Diet Office"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <button type="submit" className="text-xs font-medium text-zinc-800 underline">
                Add type
              </button>
            </DepartmentAdminActionForm>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Password authentication as Manager or above is required to assign Operational Types.
          </p>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-experiences">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Experiences
        </h3>
        {program.experiences.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No Experiences resolved for this room yet. Assign an Operational Type or activate
            department Experiences.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {program.experiences.map((experience) => (
              <li
                key={`${experience.areaKey}:${experience.experienceKey}`}
                className="flex items-start justify-between gap-2 px-3 py-2"
              >
                <span>
                  <span className="block font-medium text-zinc-900">{experience.label}</span>
                  <span className="text-xs text-zinc-500">{experience.areaName}</span>
                </span>
                <StatusBadge
                  variant={
                    experience.source === "ROOM_EXCEPTION"
                      ? "in_progress"
                      : experience.source === "ARCHETYPE"
                        ? "success"
                        : "neutral"
                  }
                >
                  {experience.source}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-overlays">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Current overlays
        </h3>
        <p className="text-xs text-zinc-500">
          Operational Cycles, canonical logs, configured Teams, and Coverage Expectations may
          inherit from this room’s Operational Type. Work plans and assets still apply only
          through their own Builders.
        </p>
        <OverlayList title="Operational Cycles" items={program.overlays.cycles} />
        <OverlayList title="Configured Teams" items={program.overlays.teams} />
        <CoverageExpectationInspector items={program.overlays.coverageExpectations} />
        <OverlayList title="Logs & Evidence" items={program.overlays.logAttachments} />
        <OverlayList title="Assets" items={program.overlays.assets} />
        <OverlayList title="Work plans" items={program.overlays.workPlans} />
        <a
          href={`/admin/departments/${departmentId}?tab=coverage`}
          className="inline-block text-xs font-medium text-zinc-700 underline"
        >
          Manage Coverage
        </a>
      </section>
    </div>
  );
}

function cyclesForOperationalTypeGroup(
  rooms: readonly { id: string }[],
  programs: Record<string, EffectiveLocationProgram>,
): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const program = programs[room.id];
    if (!program) continue;
    for (const cycle of program.overlays.cycles) {
      if (cycle.provenance.source !== "OPERATIONAL_TYPE_DEFAULT") continue;
      if (!seen.has(cycle.id)) seen.set(cycle.id, cycle.label);
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function logsForOperationalTypeGroup(
  rooms: readonly { id: string }[],
  programs: Record<string, EffectiveLocationProgram>,
): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const program = programs[room.id];
    if (!program) continue;
    for (const log of program.overlays.logAttachments) {
      if (log.provenance.source !== "OPERATIONAL_TYPE_DEFAULT") continue;
      if (!seen.has(log.id)) seen.set(log.id, log.label);
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function coverageForOperationalTypeGroup(
  rooms: readonly { id: string }[],
  programs: Record<string, EffectiveLocationProgram>,
): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const program = programs[room.id];
    if (!program) continue;
    for (const row of program.overlays.coverageExpectations) {
      if (row.provenance.source !== "OPERATIONAL_TYPE_DEFAULT") continue;
      const key = `${row.roleKey}:${row.requiredCount}:${row.cycleStableKey ?? ""}`;
      if (!seen.has(key)) seen.set(key, row.label);
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function teamsForOperationalTypeGroup(
  rooms: readonly { id: string }[],
  programs: Record<string, EffectiveLocationProgram>,
): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const program = programs[room.id];
    if (!program) continue;
    for (const team of program.overlays.teams) {
      if (team.provenance.source !== "OPERATIONAL_TYPE_DEFAULT") continue;
      if (!seen.has(team.id)) seen.set(team.id, team.label);
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function CoverageExpectationInspector({
  items,
}: {
  items: EffectiveLocationProgram["overlays"]["coverageExpectations"];
}) {
  const byCycle = new Map<string, EffectiveLocationProgram["overlays"]["coverageExpectations"][number][]>();
  for (const item of items) {
    const key = item.cycleLabel ?? "Anytime";
    const list = byCycle.get(key) ?? [];
    list.push(item);
    byCycle.set(key, list);
  }
  const groups = [...byCycle.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div data-testid="location-program-coverage-expectations">
      <p className="text-xs font-medium text-zinc-700">Staffing / Coverage Expectations</p>
      {groups.length === 0 ? (
        <p className="text-xs text-zinc-400">None currently applied to this location.</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {groups.map(([cycleLabel, rows]) => (
            <li key={cycleLabel}>
              <p className="text-xs font-medium text-zinc-800">{cycleLabel}</p>
              <ul className="mt-0.5 space-y-1">
                {rows.map((row) => (
                  <li key={row.id} className="text-xs text-zinc-700">
                    <span className="font-medium">{row.roleLabel}</span>
                    <span className="block text-zinc-500">Required: {row.requiredCount}</span>
                    <span className="block text-zinc-400">{row.provenance.detail}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OverlayList({
  title,
  items,
}: {
  title: string;
  items: EffectiveLocationProgram["overlays"]["cycles"];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-700">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-400">None currently applied to this location.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="text-xs text-zinc-700">
              {item.label}
              <span className="block text-zinc-400">{item.provenance.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
