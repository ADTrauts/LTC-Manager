import {
  getAppSession,
  isOrganizationScopedSession,
  type OrganizationSessionPayload,
} from "@/lib/auth";
import {
  assertOrganizationMember,
  type OrganizationMembershipView,
} from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

export type OrganizationSession = OrganizationSessionPayload & {
  authKind: "user";
};

/**
 * Require an organization-scoped session and a current active membership
 * for the selected Organization. Authority is always re-checked server-side.
 */
export async function requireOrganizationSession(): Promise<{
  session: OrganizationSession;
  membership: OrganizationMembershipView;
}> {
  const session = await getAppSession();
  if (
    !session ||
    session.authKind !== "user" ||
    !isOrganizationScopedSession(session)
  ) {
    throw new Error("Unauthorized.");
  }

  const membership = await assertOrganizationMember(prisma, {
    userId: session.uid,
    organizationId: session.organizationId,
  });

  return {
    session: session as OrganizationSession,
    membership,
  };
}
