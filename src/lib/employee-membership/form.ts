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

  return {
    primaryDepartmentId,
    additionalDepartmentIds,
    jobTitleId: optionalId(formData.get("jobTitleId")),
    teamMemberships: [...memberships.entries()].map(([teamId, isPrimary]) => ({
      teamId,
      isPrimary,
    })),
  };
}
