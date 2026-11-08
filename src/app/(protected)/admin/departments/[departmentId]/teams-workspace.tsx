import Link from "next/link";

import { EmptyState } from "@/components/design-system/EmptyState";
import type { DepartmentPeopleOrganization } from "@/lib/department-administration/people-organization";

type Props = {
  departmentName: string;
  organization: DepartmentPeopleOrganization;
  employeesHref: string;
  selectedTeamId: string | null;
};

export function TeamsWorkspace({
  departmentName,
  organization,
  employeesHref,
  selectedTeamId,
}: Props) {
  const selected =
    organization.teams.find((team) => team.id === selectedTeamId) ?? organization.teams[0] ?? null;

  return (
    <section className="space-y-3" data-testid="department-teams-panel">
      <div className="space-y-2" data-testid="department-teams-header">
        <h2 className="text-base font-semibold text-zinc-900">Organization</h2>
        <p className="text-sm text-zinc-600">
          Teams are optional. A Team groups people in {departmentName}. It does not own rooms or
          coverage. Employee Builder manages membership, the Team lead, and qualifications.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium text-zinc-500">Department</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">
            {organization.employeeCount}{" "}
            {organization.employeeCount === 1 ? "employee" : "employees"}
          </p>
          <p className="text-xs text-zinc-600">
            {organization.headName ? `Head · ${organization.headName}` : "No Department head"}
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium text-zinc-500">Teams</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{organization.teamCount}</p>
          <p className="text-xs text-zinc-600">
            {organization.unteamedCount} with no Team
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="text-xs font-medium text-zinc-500">Qualifications</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900">
            {organization.unqualifiedCount} without an active qualification
          </p>
          <p className="text-xs text-zinc-600">
            {organization.qualificationCounts
              .filter((row) => row.activeCount > 0)
              .map((row) => `${row.roleLabel} ${row.activeCount}`)
              .join(" · ") || "None recorded"}
          </p>
        </article>
      </div>

      {organization.teams.length === 0 ? (
        <EmptyState
          title="Teams are optional"
          description="A Team groups people in this Department. It does not own rooms or coverage."
          data-testid="department-teams-empty"
        />
      ) : null}

      <div
        className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white xl:min-h-40 xl:flex-row"
        data-testid="department-teams-split"
      >
        <div className="w-full shrink-0 border-zinc-200 xl:w-80 xl:border-r" data-testid="team-list-pane">
          {organization.teams.length > 0 ? (
            <ul className="divide-y divide-zinc-100" data-testid="team-list">
              {organization.teams.map((team) => (
                <li key={team.id}>
                  <div
                    className={`flex items-center gap-3 px-3 py-3 ${
                      selected?.id === team.id ? "bg-amber-50/60" : ""
                    }`}
                    data-testid="team-row"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900">{team.name}</span>
                      <span className="block text-xs text-zinc-600">
                        {team.memberCount} {team.memberCount === 1 ? "person" : "people"}
                      </span>
                      <span className="block text-xs text-zinc-500">
                        {team.leadName ? `Lead: ${team.leadName}` : "Manager not assigned"}
                      </span>
                    </span>
                    <span className="shrink-0 text-zinc-400" aria-hidden>
                      ›
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-zinc-500">No teams yet.</p>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4" data-testid="team-detail-panel">
          {selected ? (
            <>
              <p className="text-sm font-medium text-zinc-900">{selected.name}</p>
              <p className="text-sm text-zinc-600">
                {selected.leadName ? `Lead: ${selected.leadName}` : "Manager not assigned"}
              </p>
              <Link
                href={`${employeesHref}&team=${encodeURIComponent(selected.id)}`}
                className="inline-flex text-sm font-medium text-zinc-800 underline-offset-2 hover:underline"
              >
                View employees
              </Link>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No Teams are configured for this Department.</p>
          )}
          <p>
            <Link
              href={`${employeesHref}#department-teams`}
              className="inline-flex text-sm font-medium text-zinc-800 underline-offset-2 hover:underline"
            >
              Manage teams in Employee Builder
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
