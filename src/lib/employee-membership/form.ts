import type { TeamMembershipInput } from "./team";

function optionalId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parseEmployeeOrganizationForm(formData: FormData): {
  primaryDepartmentId: string | null;
  additionalDepartmentIds: string[];
  jobTitleId: string | null;
  teamMemberships: TeamMembershipInput[];
  jobRoleByDepartmentId: Map<string, string | null>;
} {
  const primaryDepartmentId = optionalId(formData.get("primaryDepartmentId"));
  const additionalDepartmentIds = formData
    .getAll("additionalDepartmentIds")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const primaryByTeam = new Map<string, boolean>();
  for (const [key, value] of formData.entries()) {
    if (typeof key !== "string" || !key.startsWith("primaryTeam:")) continue;
    const teamId = typeof value === "string" ? value.trim() : "";
    if (!teamId) continue;
    primaryByTeam.set(teamId, true);
  }

  const additionalTeamIds = formData
    .getAll("additionalTeamIds")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  const memberships = new Map<string, boolean>();
  for (const teamId of additionalTeamIds) memberships.set(teamId, false);
  for (const [teamId, isPrimary] of primaryByTeam) memberships.set(teamId, isPrimary);

  const jobRoleByDepartmentId = new Map<string, string | null>();
  for (const [key, value] of formData.entries()) {
    if (typeof key !== "string" || !key.startsWith("jobRole:")) continue;
    const departmentId = key.slice("jobRole:".length).trim();
    if (!departmentId) continue;
    const roleId = typeof value === "string" ? value.trim() : "";
    jobRoleByDepartmentId.set(departmentId, roleId.length > 0 ? roleId : null);
  }

  return {
    primaryDepartmentId,
    additionalDepartmentIds,
    jobTitleId: optionalId(formData.get("jobTitleId")),
    teamMemberships: [...memberships.entries()].map(([teamId, isPrimary]) => ({
      teamId,
      isPrimary,
    })),
    jobRoleByDepartmentId,
  };
}
