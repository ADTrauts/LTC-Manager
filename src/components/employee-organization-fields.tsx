"use client";

import { useEffect, useMemo, useState } from "react";

import { JOB_ROLE_TIER_LABEL, type JobRoleTier } from "@/lib/department-job-roles";

export type OrganizationDepartmentOption = {
  id: string;
  name: string;
  showInEmployeeApp?: boolean;
};

export type OrganizationTeamOption = {
  id: string;
  displayName: string;
  departmentId: string;
};

export type OrganizationJobRoleOption = {
  id: string;
  displayName: string;
  departmentId: string;
  tier: JobRoleTier;
};

export type OrganizationTeamMembership = {
  teamId: string;
  isPrimary: boolean;
};

export type OrganizationJobRoleAssignment = {
  departmentId: string;
  jobRoleId: string;
};

/** Stable fingerprint so we rehydrate local select state after server-action refresh. */
function organizationStateKey(input: {
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
  jobTitleId: string | null;
  teamMemberships: OrganizationTeamMembership[];
  jobRoleAssignments: OrganizationJobRoleAssignment[];
}): string {
  const additional = [...input.additionalDepartmentIds].filter(Boolean).sort().join(",");
  const teams = [...input.teamMemberships]
    .map((row) => `${row.teamId}:${row.isPrimary ? "1" : "0"}`)
    .sort()
    .join("|");
  const roles = [...input.jobRoleAssignments]
    .map((row) => `${row.departmentId}:${row.jobRoleId}`)
    .sort()
    .join("|");
  return [
    input.primaryDepartmentId ?? "",
    additional,
    input.jobTitleId ?? "",
    teams,
    roles,
  ].join("::");
}

type Props = {
  departments: OrganizationDepartmentOption[];
  teams: OrganizationTeamOption[];
  /** @deprecated No longer shown in the org form; optional for callers that still pass catalog data. */
  jobTitles?: { id: string; name: string }[];
  jobRoles?: OrganizationJobRoleOption[];
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
  /** Preserved via hidden input so saves do not clear an existing jobTitleId. */
  jobTitleId: string | null;
  teamMemberships: OrganizationTeamMembership[];
  jobRoleAssignments?: OrganizationJobRoleAssignment[];
  requirePrimaryDepartment?: boolean;
};

function departmentLabel(department: OrganizationDepartmentOption) {
  return department.showInEmployeeApp === false
    ? `${department.name} (hidden in app)`
    : department.name;
}

function RemovableChip({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-300 bg-white py-1 pl-2.5 pr-1 text-sm text-zinc-800">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        aria-label={removeLabel}
      >
        ×
      </button>
    </span>
  );
}

export function EmployeeOrganizationFields({
  departments,
  teams,
  jobRoles = [],
  primaryDepartmentId,
  additionalDepartmentIds,
  jobTitleId,
  teamMemberships,
  jobRoleAssignments = [],
  requirePrimaryDepartment = false,
}: Props) {
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const initialPrimaryTeams = useMemo(() => {
    const next: Record<string, string> = {};
    for (const membership of teamMemberships) {
      if (!membership.isPrimary) continue;
      const team = teamById.get(membership.teamId);
      if (team) next[team.departmentId] = team.id;
    }
    return next;
  }, [teamById, teamMemberships]);
  const initialAdditionalTeams = useMemo(
    () =>
      new Set(
        teamMemberships
          .filter((membership) => !membership.isPrimary && teamById.has(membership.teamId))
          .map((membership) => membership.teamId),
      ),
    [teamById, teamMemberships],
  );
  const initialJobRoles = useMemo(() => {
    const next: Record<string, string> = {};
    for (const assignment of jobRoleAssignments) {
      next[assignment.departmentId] = assignment.jobRoleId;
    }
    return next;
  }, [jobRoleAssignments]);

  const [primaryDept, setPrimaryDept] = useState(primaryDepartmentId ?? "");
  const [additional, setAdditional] = useState<Set<string>>(
    () => new Set(additionalDepartmentIds.filter((id) => id && id !== primaryDepartmentId)),
  );
  const [primaryTeamByDept, setPrimaryTeamByDept] = useState<Record<string, string>>(initialPrimaryTeams);
  const [additionalTeams, setAdditionalTeams] = useState<Set<string>>(initialAdditionalTeams);
  const [jobRoleByDept, setJobRoleByDept] = useState<Record<string, string>>(initialJobRoles);

  const serverOrganizationKey = organizationStateKey({
    primaryDepartmentId,
    additionalDepartmentIds,
    jobTitleId,
    teamMemberships,
    jobRoleAssignments,
  });

  // After Save, the server revalidates and passes the persisted Team / Job Role props.
  // Local useState does not pick that up on its own (and React form reset can blank the selects).
  useEffect(() => {
    setPrimaryDept(primaryDepartmentId ?? "");
    setAdditional(
      new Set(additionalDepartmentIds.filter((id) => id && id !== primaryDepartmentId)),
    );
    setPrimaryTeamByDept(initialPrimaryTeams);
    setAdditionalTeams(new Set(initialAdditionalTeams));
    setJobRoleByDept(initialJobRoles);
    // Fingerprint is the intentional sync signal; initial* maps are derived from the same props.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when server org payload changes
  }, [serverOrganizationKey]);

  const selectedDepartmentIds = useMemo(() => {
    const ids = new Set(additional);
    if (primaryDept) ids.add(primaryDept);
    return ids;
  }, [additional, primaryDept]);

  const selectedDepartments = departments.filter((department) => selectedDepartmentIds.has(department.id));
  const additionalDepartmentOptions = departments.filter(
    (department) => department.id !== primaryDept && !additional.has(department.id),
  );
  const selectedAdditionalDepartments = departments.filter((department) => additional.has(department.id));

  function clearDepartmentScopedState(departmentId: string) {
    setPrimaryTeamByDept((teamsByDept) => {
      const copy = { ...teamsByDept };
      delete copy[departmentId];
      return copy;
    });
    setAdditionalTeams((currentTeams) => {
      const nextTeams = new Set(currentTeams);
      for (const team of teams) {
        if (team.departmentId === departmentId) nextTeams.delete(team.id);
      }
      return nextTeams;
    });
    setJobRoleByDept((current) => {
      const copy = { ...current };
      delete copy[departmentId];
      return copy;
    });
  }

  function addAdditionalDepartment(departmentId: string) {
    if (!departmentId || departmentId === primaryDept) return;
    setAdditional((current) => new Set(current).add(departmentId));
  }

  function removeAdditionalDepartment(departmentId: string) {
    setAdditional((current) => {
      const next = new Set(current);
      next.delete(departmentId);
      return next;
    });
    clearDepartmentScopedState(departmentId);
  }

  function setPrimaryTeam(departmentId: string, teamId: string) {
    setPrimaryTeamByDept((current) => ({ ...current, [departmentId]: teamId }));
    if (teamId) {
      setAdditionalTeams((current) => {
        const next = new Set(current);
        next.delete(teamId);
        return next;
      });
    }
  }

  function addAdditionalTeam(teamId: string) {
    if (!teamId) return;
    setAdditionalTeams((current) => new Set(current).add(teamId));
  }

  function removeAdditionalTeam(teamId: string) {
    setAdditionalTeams((current) => {
      const next = new Set(current);
      next.delete(teamId);
      return next;
    });
  }

  return (
    <div className="space-y-4 sm:col-span-2" data-testid="employee-organization-fields">
      {/* Preserve any existing jobTitleId without exposing a redundant control. */}
      <input type="hidden" name="jobTitleId" value={jobTitleId ?? ""} />

      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Organization</p>

      <label className="block text-xs text-zinc-600">
        <span>
          Primary Department
          {requirePrimaryDepartment ? <span className="font-medium text-red-700"> (required)</span> : null}
        </span>
        {departments.length === 0 ? (
          <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No departments are available. Open Admin → Departments and enable at least one, then try again.
          </p>
        ) : (
          <select
            name="primaryDepartmentId"
            required={requirePrimaryDepartment}
            value={primaryDept}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (primaryDept && primaryDept !== next) {
                clearDepartmentScopedState(primaryDept);
              }
              setPrimaryDept(next);
              setAdditional((current) => {
                const copy = new Set(current);
                copy.delete(next);
                return copy;
              });
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {requirePrimaryDepartment ? null : <option value="">Not set</option>}
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentLabel(department)}
              </option>
            ))}
          </select>
        )}
      </label>

      {departments.some((department) => department.id !== primaryDept) ? (
        <div>
          <p className="text-xs text-zinc-600">Additional Departments</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {selectedAdditionalDepartments.map((department) => (
              <span key={department.id}>
                <input type="hidden" name="additionalDepartmentIds" value={department.id} />
                <RemovableChip
                  label={departmentLabel(department)}
                  removeLabel={`Remove ${department.name}`}
                  onRemove={() => removeAdditionalDepartment(department.id)}
                />
              </span>
            ))}
            {additionalDepartmentOptions.length > 0 ? (
              <select
                value=""
                aria-label="Add department"
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  addAdditionalDepartment(next);
                }}
                className="rounded-md border border-dashed border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 hover:border-zinc-400"
              >
                <option value="">+ Add department</option>
                {additionalDepartmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {departmentLabel(department)}
                  </option>
                ))}
              </select>
            ) : null}
            {selectedAdditionalDepartments.length === 0 && additionalDepartmentOptions.length === 0 ? (
              <p className="text-xs text-zinc-500">No other departments available</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedDepartments.map((department) => {
        const departmentTeams = teams.filter((team) => team.departmentId === department.id);
        const departmentRoles = jobRoles.filter((role) => role.departmentId === department.id);
        const primaryTeamId = primaryTeamByDept[department.id] ?? "";
        const jobRoleId = jobRoleByDept[department.id] ?? "";
        const selectedExtraTeams = departmentTeams.filter(
          (team) => team.id !== primaryTeamId && additionalTeams.has(team.id),
        );
        const addableTeams = departmentTeams.filter(
          (team) => team.id !== primaryTeamId && !additionalTeams.has(team.id),
        );

        return (
          <section
            key={department.id}
            className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/70 px-3 py-3"
            data-testid="department-team-membership"
          >
            <h4 className="text-sm font-medium text-zinc-900">{department.name}</h4>

            {departmentTeams.length === 0 ? (
              <p className="text-xs text-zinc-500">No Teams configured</p>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-zinc-600">
                  Primary Team
                  <select
                    name={`primaryTeam:${department.id}`}
                    value={primaryTeamId}
                    onChange={(event) => setPrimaryTeam(department.id, event.currentTarget.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">No Primary Team</option>
                    {departmentTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                {departmentTeams.some((team) => team.id !== primaryTeamId) ? (
                  <div>
                    <p className="text-xs text-zinc-600">Additional Teams</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedExtraTeams.map((team) => (
                        <span key={team.id}>
                          <input type="hidden" name="additionalTeamIds" value={team.id} />
                          <RemovableChip
                            label={team.displayName}
                            removeLabel={`Remove ${team.displayName}`}
                            onRemove={() => removeAdditionalTeam(team.id)}
                          />
                        </span>
                      ))}
                      {addableTeams.length > 0 ? (
                        <select
                          value=""
                          aria-label={`Add team in ${department.name}`}
                          onChange={(event) => {
                            const next = event.currentTarget.value;
                            addAdditionalTeam(next);
                          }}
                          className="rounded-md border border-dashed border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 hover:border-zinc-400"
                        >
                          <option value="">+ Add team</option>
                          {addableTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.displayName}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <label className="block text-xs text-zinc-600">
              Job Role
              <select
                name={`jobRole:${department.id}`}
                value={jobRoleId}
                onChange={(event) => {
                  const nextRoleId = event.currentTarget.value;
                  setJobRoleByDept((current) => ({
                    ...current,
                    [department.id]: nextRoleId,
                  }));
                }}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                data-testid={`job-role-select-${department.id}`}
              >
                <option value="">Not set</option>
                {departmentRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.displayName} ({JOB_ROLE_TIER_LABEL[role.tier]})
                  </option>
                ))}
              </select>
            </label>
          </section>
        );
      })}
    </div>
  );
}
