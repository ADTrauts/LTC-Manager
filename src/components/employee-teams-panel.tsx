"use client";

import { useState } from "react";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  archiveDepartmentTeamAction,
  createDepartmentTeamAction,
  updateDepartmentTeamAction,
} from "@/app/(protected)/admin/departments/[departmentId]/team-actions";
import { Button } from "@/components/design-system/Button";
import { Select, TextArea, TextInput } from "@/components/design-system/Field";
import { RoomPicker } from "@/components/operational-cycles/room-picker";
import type { DepartmentTeamView, TeamEmployeeOption, TeamCatalog } from "@/lib/department-teams";

type Props = {
  departmentId: string;
  departmentName: string;
  teams: DepartmentTeamView[];
  employees: TeamEmployeeOption[];
  canManage: boolean;
  catalog: TeamCatalog;
};

function TeamRooms({ catalog, initialIds }: { catalog: TeamCatalog; initialIds: string[] }) {
  const [ids, setIds] = useState(initialIds);
  return (
    <fieldset className="space-y-2" data-testid="team-room-membership">
      <legend className="text-sm font-medium">Normal rooms</legend>
      <p className="text-xs text-zinc-600">Choose explicit rooms for this Team's normal view. This does not grant access or configure staffing.</p>
      <RoomPicker locations={catalog.locations} selectedIds={ids} onChange={setIds} name="spaceIds" />
    </fieldset>
  );
}

function leadSelect(
  employees: TeamEmployeeOption[],
  value: string | null,
  currentLabel?: string | null,
) {
  const onRoster = employees.filter((employee) => employee.onRoster);
  const currentMissing = Boolean(value && !employees.some((employee) => employee.id === value));
  return (
    <Select name="managerEmployeeId" label="Team lead" defaultValue={value ?? ""}>
      <option value="">Not assigned</option>
      {currentMissing && value ? (
        <option value={value}>{currentLabel ?? "Current lead"} (not on Department roster)</option>
      ) : null}
      {onRoster.map((employee) => (
        <option key={employee.id} value={employee.id}>
          {employee.lastName}, {employee.firstName}
        </option>
      ))}
    </Select>
  );
}

export function EmployeeTeamsPanel({
  departmentId,
  departmentName,
  teams,
  employees,
  canManage,
  catalog,
}: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <section
      id="department-teams"
      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
      data-testid="employee-teams-panel"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-zinc-900">Teams</h2>
          <p className="text-sm text-zinc-600">
            Teams for {departmentName}. One employee has one primary Team in this Department.
            Membership is edited on the employee record. A Team lead is not a platform manager.
          </p>
        </div>
        {canManage ? (
          <Button type="button" size="compact" onClick={() => setAdding(true)} data-testid="add-team">
            + Add Team
          </Button>
        ) : null}
      </div>

      {adding && canManage ? (
        <DepartmentAdminActionForm
          action={createDepartmentTeamAction}
          onSuccess={() => setAdding(false)}
          className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <TextInput name="displayName" label="Name" required maxLength={80} data-testid="team-name-input" />
          <TextArea name="description" label="Description" maxLength={500} rows={2} />
          {leadSelect(employees, null)}
          <TeamRooms catalog={catalog} initialIds={[]} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Create Team</Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </DepartmentAdminActionForm>
      ) : null}

      {teams.length === 0 ? (
        <p className="text-sm text-zinc-500">No Teams yet. Teams are optional.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {teams.map((team) => (
            <li key={team.id} className="space-y-3 py-3" data-testid="employee-team-row">
              {canManage ? (
                <DepartmentAdminActionForm action={updateDepartmentTeamAction} className="space-y-3">
                  <input type="hidden" name="teamId" value={team.id} />
                  <TextInput
                    name="displayName"
                    label="Name"
                    required
                    maxLength={80}
                    defaultValue={team.displayName}
                  />
                  <TextArea
                    name="description"
                    label="Description"
                    maxLength={500}
                    rows={2}
                    defaultValue={team.description ?? ""}
                  />
                  {leadSelect(employees, team.managerEmployeeId, team.managerLabel)}
                  <TeamRooms catalog={catalog} initialIds={team.rooms.map(room => room.spaceId)} />
                  <Button type="submit" size="compact" variant="secondary">
                    Save Team
                  </Button>
                </DepartmentAdminActionForm>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{team.displayName}</p>
                  <p className="text-xs text-zinc-600">
                    {team.managerLabel ? `Lead: ${team.managerLabel}` : "No lead assigned"}
                  </p>
                </div>
              )}
              <p className="text-sm text-zinc-700">
                {team.rooms.length} normal rooms ·{" "}
                {team.activeMemberCount} active{" "}
                {team.activeMemberCount === 1 ? "employee" : "employees"}.{" "}
                <a
                  className="font-medium underline-offset-2 hover:underline"
                  href={`/employees?dept=${encodeURIComponent(departmentId)}&team=${encodeURIComponent(team.id)}`}
                >
                  View members
                </a>
              </p>
              {canManage ? (
                <DepartmentAdminActionForm action={archiveDepartmentTeamAction}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="departmentId" value={departmentId} />
                  <Button type="submit" variant="destructive" size="compact">
                    Archive Team
                  </Button>
                </DepartmentAdminActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
