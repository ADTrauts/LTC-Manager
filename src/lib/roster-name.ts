/**
 * Split signup "full name" into roster first/last names (Employee requires min length per app rules).
 */
export function rosterNameFromSignupDisplayName(adminName: string): { firstName: string; lastName: string } {
  const normalized = adminName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "General", lastName: "Manager" };
  }
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx === -1) {
    const only = normalized.slice(0, 60);
    const firstName = only.length >= 2 ? only : `${only}GM`.slice(0, 60);
    return { firstName, lastName: "Manager" };
  }
  let firstName = normalized.slice(0, spaceIdx).trim().slice(0, 60);
  let lastName = normalized.slice(spaceIdx + 1).trim().slice(0, 60);
  if (firstName.length < 2) {
    firstName = `${firstName}`.padEnd(2, "-").slice(0, 60);
  }
  if (lastName.length < 2) {
    lastName = `${lastName}`.padEnd(2, "-").slice(0, 60);
  }
  return { firstName, lastName };
}
