import { cache } from "react";

import type { AppJwtPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  INITIAL_SESSION_VERSION,
  validateSessionAuthority,
  type PrismaLike,
  type SessionValidation,
} from "./session-version";

/**
 * Validate a session against current authority, once per request.
 *
 * `getSession` is called many times while rendering a page — by the layout, the page, and several
 * panels — so validating on every call would multiply one lookup into a dozen. React's `cache`
 * memoizes per request and is discarded when the request ends, which keeps revocation immediate:
 * the next request re-reads. A process-wide cache would do the opposite, delaying revocation by
 * whatever the cache lifetime happened to be, so there deliberately isn't one.
 *
 * Keyed on the identity and the claimed version rather than the token, so nothing derived from the
 * credential is held in memory beyond the request.
 */
const validateForRequest = cache(
  async (
    uid: string,
    authKind: string,
    facilityId: string,
    claimedVersion: number | undefined,
    claimedDepartmentId: string | null,
  ): Promise<SessionValidation> =>
    validateSessionAuthority(
      {
        uid,
        authKind,
        facilityId,
        sessionVersion: claimedVersion,
        primaryDepartmentId: claimedDepartmentId,
      } as AppJwtPayload,
      prisma,
    ),
);

/** Validate a verified session against current server-owned authority. */
export async function validateSessionForRequest(
  session: AppJwtPayload,
): Promise<SessionValidation> {
  return validateForRequest(
    session.uid,
    session.authKind ?? "user",
    session.facilityId,
    session.sessionVersion,
    session.primaryDepartmentId ?? null,
  );
}

/**
 * Read the version to stamp into a token being issued.
 *
 * Falls back to the initial version only when the identity cannot be read, which the caller has
 * already established it can — the fallback exists so a login cannot fail on a race with a
 * concurrent revocation, and a token stamped with a stale version is simply rejected on first use.
 */
export async function currentSessionVersionFor(
  identity: { kind: "user" | "employee"; id: string },
  client: PrismaLike,
): Promise<number> {
  if (identity.kind === "employee") {
    const employee = await client.employee.findUnique({
      where: { id: identity.id },
      select: { sessionVersion: true },
    });
    return employee?.sessionVersion ?? INITIAL_SESSION_VERSION;
  }
  const user = await client.user.findUnique({
    where: { id: identity.id },
    select: { sessionVersion: true },
  });
  return user?.sessionVersion ?? INITIAL_SESSION_VERSION;
}
