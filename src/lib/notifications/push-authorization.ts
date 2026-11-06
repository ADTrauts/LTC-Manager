/**
 * Send-time authorization for a personal Web Push subscription.
 * A User row is not enough. The browser must have been enabled under a
 * still-current authorization lease. This is not a second session store.
 */

/** Same length as the signed session cookie. A source test keeps the two aligned. */
export const PUSH_AUTHORIZATION_TTL_MS = 12 * 60 * 60 * 1000;

export type PushSendAuthorization = "allowed" | "revoked" | "expired" | "unbound" | "user_inactive";

/**
 * Cap a server-observed session expiry at the session lifetime.
 * A missing or already-past expiry cannot authorize a send.
 */
export function capPushAuthorizationUntil(now: Date, sessionExpiresAt: Date): Date | null {
  const expires = sessionExpiresAt.getTime();
  if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
  return new Date(Math.min(expires, now.getTime() + PUSH_AUTHORIZATION_TTL_MS));
}

export function pushSendAuthorization(input: {
  revokedAt: Date | null;
  authorizedUntil: Date | null;
  userActive: boolean;
  now: Date;
}): PushSendAuthorization {
  if (!input.userActive) return "user_inactive";
  if (input.revokedAt) return "revoked";
  if (!input.authorizedUntil) return "unbound";
  if (input.authorizedUntil.getTime() <= input.now.getTime()) return "expired";
  return "allowed";
}

/**
 * The account menu may treat logout as finished only after User-wide push
 * revocation commits. A missing session stays signed in. A redirect alone
 * is not that commit.
 */
export function logoutClearsSession(outcome: "revoked" | "skipped"): boolean {
  return outcome === "revoked";
}

export function pushAuthorizationErrorCode(decision: Exclude<PushSendAuthorization, "allowed">): string {
  if (decision === "revoked") return "subscription_revoked";
  if (decision === "expired") return "authorization_expired";
  if (decision === "unbound") return "authorization_unbound";
  return "user_inactive";
}
