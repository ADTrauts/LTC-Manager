"use client";

import { setEmployeeOperationalQualificationsAction } from "@/app/(protected)/employees/qualification-actions";
import { getRolesForDepartment } from "@/lib/scheduling/assignment-roles";

type DepartmentOption = { id: string; name: string; key?: string };
type TeamOption = {
  id: string;
  displayName: string;
  departmentId: string;
  managerEmployeeId?: string | null;
};

export function EmployeeOperationalEligibility({
  employeeId,
  departments,
  membershipDepartmentIds,
  qualifications,
  jobTitleName,
  teams,
  teamMemberships,
  canEdit,
}: {
  employeeId: string;
  departments: DepartmentOption[];
  membershipDepartmentIds: string[];
  qualifications: { departmentId: string; roleKey: string }[];
  jobTitleName: string | null;
  teams: TeamOption[];
  teamMemberships: { teamId: string; isPrimary: boolean }[];
  canEdit: boolean;
}) {
  const membership = new Set(membershipDepartmentIds);
  const rows = departments.filter((department) => department.key && membership.has(department.id));
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 border-t border-zinc-200 pt-4" data-testid="operational-eligibility">
      <div>
        <h3 className="text-sm font-medium text-zinc-900">Operational eligibility</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Job title: {jobTitleName ?? "None"}. Team membership does not grant an operational role.
        </p>
      </div>
      {rows.map((department) => {
        const roles = getRolesForDepartment(department.key!);
        const selected = new Set(
          qualifications.filter((row) => row.departmentId === department.id).map((row) => row.roleKey),
        );
        const departmentTeams = teams.filter((team) => team.departmentId === department.id);
        const memberTeams = departmentTeams.filter((team) =>
          teamMemberships.some((membershipRow) => membershipRow.teamId === team.id),
        );
        const primary = memberTeams.find((team) =>
          teamMemberships.some((membershipRow) => membershipRow.teamId === team.id && membershipRow.isPrimary),
        );
        const leads = departmentTeams.filter((team) => team.managerEmployeeId === employeeId);
        return (
          <form
            key={department.id}
            action={setEmployeeOperationalQualificationsAction}
            className="rounded-md border border-zinc-200 px-3 py-3"
          >
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="departmentId" value={department.id} />
            <p className="text-sm font-medium text-zinc-800">{department.name}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {primary ? `Primary team: ${primary.displayName}` : "No primary team"}
              {memberTeams.length > 1 ? ` · ${memberTeams.length - 1} other team${memberTeams.length === 2 ? "" : "s"}` : ""}
              {leads.length > 0 ? ` · Team lead: ${leads.map((team) => team.displayName).join(", ")}` : ""}
            </p>
            {roles.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">This Department has no operational roles.</p>
            ) : (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {roles.map((role) => (
                  <label key={role.key} className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      name="roleKey"
                      value={role.key}
                      defaultChecked={selected.has(role.key)}
                      disabled={!canEdit}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            )}
            {canEdit && roles.length > 0 ? (
              <button
                type="submit"
                className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Save eligibility
              </button>
            ) : null}
          </form>
        );
      })}
    </section>
  );
}
