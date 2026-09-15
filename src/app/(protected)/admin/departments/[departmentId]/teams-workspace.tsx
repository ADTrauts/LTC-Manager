"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  archiveDepartmentTeamAction,
  createDepartmentTeamAction,
  updateDepartmentTeamAction,
} from "@/app/(protected)/admin/departments/[departmentId]/team-actions";
import { Button } from "@/components/design-system/Button";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Select, TextArea, TextInput } from "@/components/design-system/Field";
import { Drawer } from "@/components/drawer";
import { RoomPicker } from "@/components/operational-cycles/room-picker";
import { departmentAdminHref } from "@/lib/department-administration";
import type {
  DepartmentTeamView,
  TeamCatalog,
  TeamEmployeeOption,
} from "@/lib/department-teams";

type Props = {
  departmentId: string;
  departmentName: string;
  teams: DepartmentTeamView[];
  catalog: TeamCatalog;
  employees: TeamEmployeeOption[];
  canManage: boolean;
  selectedTeamId: string | null;
};

function managerSelect(
  employees: TeamEmployeeOption[],
  value: string | null,
  currentLabel?: string | null,
) {
  const onRoster = employees.filter((e) => e.onRoster);
  const currentMissing = Boolean(value && !employees.some((e) => e.id === value));
  return (
    <Select
      name="managerEmployeeId"
      label="Team Manager"
      defaultValue={value ?? ""}
      data-testid="team-manager-select"
    >
      <option value="">Not assigned</option>
      {currentMissing && value ? (
        <option value={value}>{currentLabel ?? "Current manager"} (not on Department roster)</option>
      ) : null}
      {onRoster.map((e) => (
        <option key={e.id} value={e.id}>
          {e.lastName}, {e.firstName}
        </option>
      ))}
    </Select>
  );
}

function TeamRoomFields({
  catalog,
  selectedIds,
  onChange,
}: {
  catalog: TeamCatalog;
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [roomTypeId, setRoomTypeId] = useState("");
  return (
    <div className="space-y-2" data-testid="team-room-picker">
      {catalog.roomTypes.length > 0 ? (
        <label className="block text-xs font-medium text-zinc-700">
          Filter by Room Type
          <select
            value={roomTypeId}
            onChange={(event) => setRoomTypeId(event.target.value)}
            className="mt-1 block min-h-10 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            data-testid="team-room-type-filter"
          >
            <option value="">All rooms</option>
            {catalog.roomTypes.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <RoomPicker
        locations={catalog.locations}
        selectedIds={selectedIds}
        onChange={onChange}
        name="spaceIds"
        filter={roomTypeId ? { facilityRoomTypeId: roomTypeId } : undefined}
        emptyMessage="No Rooms are assigned to this Department yet."
      />
    </div>
  );
}

function TeamFormFields({
  catalog,
  employees,
  defaults,
  editingLocations,
  onToggleLocations,
  alwaysShowLocations = false,
}: {
  catalog: TeamCatalog;
  employees: TeamEmployeeOption[];
  defaults?: {
    displayName: string;
    description: string | null;
    managerEmployeeId: string | null;
    managerLabel: string | null;
    spaceIds: string[];
  };
  editingLocations: boolean;
  onToggleLocations: () => void;
  alwaysShowLocations?: boolean;
}) {
  const [spaceIds, setSpaceIds] = useState<string[]>(defaults?.spaceIds ?? []);
  const showPicker = alwaysShowLocations || editingLocations;
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-xs font-medium text-zinc-500">About</h3>
        <TextInput
          name="displayName"
          label="Name"
          required
          maxLength={80}
          defaultValue={defaults?.displayName ?? ""}
          data-testid="team-name-input"
        />
        <TextArea
          name="description"
          label="Description"
          maxLength={500}
          rows={2}
          defaultValue={defaults?.description ?? ""}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-zinc-500">Team Manager</h3>
        {managerSelect(
          employees,
          defaults?.managerEmployeeId ?? null,
          defaults?.managerLabel ?? null,
        )}
        <p className="text-xs text-zinc-500">
          Accountability for this Team. Does not automatically grant membership.
        </p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-zinc-500">Locations</h3>
        <p className="text-sm text-zinc-700">
          {spaceIds.length} {spaceIds.length === 1 ? "Room" : "Rooms"} selected
        </p>
        {!showPicker
          ? spaceIds.map((id) => <input key={id} type="hidden" name="spaceIds" value={id} />)
          : null}
        {!alwaysShowLocations ? (
          <Button type="button" variant="secondary" size="compact" onClick={onToggleLocations}>
            {editingLocations ? "Hide location picker" : "Edit locations"}
          </Button>
        ) : null}
        {showPicker ? (
          <div className="mt-2 max-h-[min(50vh,24rem)] overflow-y-auto rounded-md border border-zinc-200 p-2">
            <TeamRoomFields catalog={catalog} selectedIds={spaceIds} onChange={setSpaceIds} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function TeamsWorkspace({
  departmentId,
  departmentName,
  teams,
  catalog,
  employees,
  canManage,
  selectedTeamId,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingLocations, setEditingLocations] = useState(false);
  const selected = teams.find((team) => team.id === selectedTeamId) ?? null;

  function openTeam(teamId: string | null) {
    setEditingLocations(false);
    const href = teamId
      ? `${departmentAdminHref(departmentId, "teams")}&team=${encodeURIComponent(teamId)}`
      : departmentAdminHref(departmentId, "teams");
    router.push(href);
  }

  return (
    <div className="max-w-5xl space-y-3" data-testid="department-teams-panel">
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="department-teams-header"
      >
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Teams</h2>
          <p className="text-sm text-zinc-600">How {departmentName} is organizationally divided.</p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="compact"
            className="self-start shrink-0"
            onClick={() => {
              setAdding(true);
              openTeam(null);
            }}
            data-testid="add-team"
          >
            + Add Team
          </Button>
        ) : null}
      </div>

      {teams.length === 0 && !adding ? (
        <EmptyState
          title="Teams are optional"
          description="Use Teams when different managers or supervisors are responsible for different parts of the Department."
          action={
            canManage ? (
              <Button type="button" onClick={() => setAdding(true)} data-testid="add-team-empty">
                + Add Team
              </Button>
            ) : undefined
          }
          data-testid="department-teams-empty"
        />
      ) : null}

      {teams.length > 0 ? (
        <ul className="divide-y divide-zinc-100" data-testid="team-list">
          {teams.map((team) => (
            <li key={team.id}>
              <button
                type="button"
                onClick={() => openTeam(team.id)}
                className={`flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-zinc-50 ${
                  selectedTeamId === team.id ? "bg-amber-50/60" : ""
                }`}
                data-testid="team-row"
                aria-current={selectedTeamId === team.id ? "true" : undefined}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">
                    {team.displayName}
                  </span>
                  <span className="block text-xs text-zinc-600">
                    {team.roomCount} {team.roomCount === 1 ? "location" : "locations"}
                    {" · "}
                    {team.activeMemberCount}{" "}
                    {team.activeMemberCount === 1 ? "person" : "people"}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {team.managerLabel
                      ? `Manager: ${team.managerLabel}`
                      : "Manager not assigned"}
                  </span>
                </span>
                <span className="shrink-0 text-zinc-400" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Drawer
        open={adding && canManage}
        onClose={() => setAdding(false)}
        title="Add Team"
        size="lg"
        data-testid="add-team-form"
      >
        <DepartmentAdminActionForm
          action={createDepartmentTeamAction}
          onSuccess={() => setAdding(false)}
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <TeamFormFields
            catalog={catalog}
            employees={employees}
            editingLocations
            alwaysShowLocations
            onToggleLocations={() => undefined}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit">Create Team</Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </DepartmentAdminActionForm>
      </Drawer>

      <Drawer
        open={Boolean(selected)}
        onClose={() => openTeam(null)}
        title={selected?.displayName ?? "Team"}
        closeLabel="Back to Teams"
        size="lg"
        data-testid="team-editor"
      >
        {selected ? (
          <div className="space-y-5">
            {canManage ? (
              <>
                <DepartmentAdminActionForm action={updateDepartmentTeamAction}>
                  <input type="hidden" name="teamId" value={selected.id} />
                  <TeamFormFields
                    catalog={catalog}
                    employees={employees}
                    editingLocations={editingLocations}
                    onToggleLocations={() => setEditingLocations((v) => !v)}
                    defaults={{
                      displayName: selected.displayName,
                      description: selected.description,
                      managerEmployeeId: selected.managerEmployeeId,
                      managerLabel: selected.managerLabel,
                      spaceIds: selected.rooms.map((room) => room.spaceId),
                    }}
                  />
                  <div className="mt-4">
                    <Button type="submit">Save Team</Button>
                  </div>
                </DepartmentAdminActionForm>

                <section className="border-t border-zinc-100 pt-4">
                  <h3 className="text-xs font-medium text-zinc-500">People</h3>
                  <p className="mt-1 text-sm text-zinc-800">
                    {selected.activeMemberCount} active{" "}
                    {selected.activeMemberCount === 1 ? "employee" : "employees"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Assign membership in Employee Builder.
                  </p>
                  <Link
                    href={`/employees?dept=${encodeURIComponent(departmentId)}&team=${encodeURIComponent(selected.id)}`}
                    className="mt-2 inline-flex text-sm font-medium text-zinc-800 underline-offset-2 hover:underline"
                  >
                    View employees
                  </Link>
                </section>

                <details className="border-t border-zinc-100 pt-4">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500">More</summary>
                  <DepartmentAdminActionForm
                    action={archiveDepartmentTeamAction}
                    onSuccess={() => openTeam(null)}
                    className="mt-3"
                  >
                    <input type="hidden" name="teamId" value={selected.id} />
                    <input type="hidden" name="departmentId" value={departmentId} />
                    <Button type="submit" variant="destructive" size="compact" data-testid="team-archive">
                      Archive Team
                    </Button>
                  </DepartmentAdminActionForm>
                </details>
              </>
            ) : (
              <p className="text-sm text-zinc-600">View only.</p>
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
