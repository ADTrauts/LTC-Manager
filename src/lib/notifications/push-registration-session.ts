/**
 * Who may bind a personal browser to Web Push.
 * A full User session only. Quick PIN, Harbor, and a missing User id cannot.
 */

export function pushRegistrationUserId(
  session: { authKind?: string | null; authMethod?: string | null; uid?: string | null } | null,
): string | null {
  if (!session || session.authKind !== "user" || session.authMethod === "QUICK_PIN") return null;
  if (!session.uid) return null;
  return session.uid;
}

/** Logout, PIN, and Harbor may release the endpoint this browser is holding. They cannot register one. */
export function canReleaseBrowserPush(
  session: { authKind?: string | null; uid?: string | null } | null,
): boolean {
  if (!session?.uid) return false;
  return session.authKind === "user" || session.authKind === "employee" || session.authKind === "harbor_staff";
}
