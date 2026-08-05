import type { AppRole } from "@/lib/access";
import type { AccessMatrixGroup } from "@/lib/route-registry";

const ROLE_LABELS: Record<AppRole, string> = {
  FACILITY_ADMINISTRATOR: "Facility Administrator",
  GM: "General Manager",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  LEAD_TEAM_MEMBER: "Lead Team Member",
  STAFF: "Team Member",
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  PUBLIC: "Public",
  AUTHENTICATED: "Any signed-in role",
  ROLE_RESTRICTED: "Role restricted",
  HANDLER_AUTHORIZED_API: "Signed in, checked in handler",
  REDIRECT_ONLY: "Redirect",
  INTERNAL: "Internal",
};

const MODULE_LABELS: Record<string, string> = {
  account: "Account",
  administration: "Administration",
  assets: "Assets",
  auth: "Sign-in",
  departments: "Departments",
  employees: "Employees",
  issues: "Issues",
  locations: "Locations",
  logs: "Logs",
  marketing: "Public site",
  menus: "Menus",
  onboarding: "Setup",
  "operations-center": "Operations Center",
  repairs: "Repairs",
  reports: "Review",
  staffing: "Staffing",
  "todays-work": "Today's Work",
  workspace: "Workspace",
};

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

/**
 * Read-only presentation of the platform route policy.
 *
 * There is deliberately no interactive element here. Facility Administrators assign people to roles;
 * they do not define what a role can reach.
 */
export function AccessMatrix({
  groups,
  roles,
}: {
  groups: AccessMatrixGroup[];
  roles: readonly AppRole[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Platform-managed access</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600">
          Role capabilities are defined by the platform and are the same in every facility. You assign
          people to roles and control which Facilities and Departments they can work in — you cannot
          change what a role is allowed to reach. Changes to role capability are made by the product
          team through a released update.
        </p>
      </section>

      {groups.map((group) => (
        <section
          key={group.module}
          className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            {moduleLabel(group.module)}
          </h3>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-600">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Area
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Access
                  </th>
                  {roles.map((role) => (
                    <th key={role} scope="col" className="px-3 py-2 font-medium">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.pattern} className="border-b border-zinc-100 last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-zinc-900">{row.navLabel ?? row.pattern}</p>
                      <p className="text-xs text-zinc-500">{row.pattern}</p>
                      {row.featureFlag ? (
                        <p className="text-xs text-amber-700">Requires the {row.featureFlag} feature</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-zinc-600">
                      <p>{CLASSIFICATION_LABELS[row.classification] ?? row.classification}</p>
                      {row.requiresDownstreamAuthorization ? (
                        <p className="text-zinc-500">Additional checks apply inside the page</p>
                      ) : null}
                    </td>
                    {roles.map((role) => {
                      const allowed = row.allowedByRole[role];
                      return (
                        <td key={role} className="px-3 py-2 align-top">
                          <span
                            className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                              allowed
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {allowed ? "Allowed" : "No access"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
