import type { Prisma, PrismaClient } from "@prisma/client";

import {
  createOrganizationSessionToken,
  isPartnerFacilitySession,
  verifySessionToken,
  type PartnerFacilitySession,
} from "@/lib/auth";
import { getCurrentOrganizationRole } from "@/lib/organization-membership";
import {
  resolveFacilityAuthorization,
  type PartnerFacilityAuthorization,
} from "@/lib/partner-user-access";

type DbClient = PrismaClient | Prisma.TransactionClient;

export class PartnerFacilitySessionError extends Error {
  readonly code:
    | "PARTNERSHIP_NOT_IN_ORGANIZATION"
    | "PARTNER_ACCESS_DENIED";

  constructor(code: PartnerFacilitySessionError["code"], message: string) {
    super(message);
    this.name = "PartnerFacilitySessionError";
    this.code = code;
  }
}

/**
 * Confirms the Organization session may enter one explicit partnership.
 * Does not write User, Facility access, cookies, or a session.
 */
export async function resolvePartnerFacilityEntry(
  db: DbClient,
  input: {
    userId: string;
    organizationId: string;
    facilityId: string;
    facilityPartnerOrganizationId: string;
    now?: Date;
  },
): Promise<PartnerFacilityAuthorization> {
  const partnership = await db.facilityPartnerOrganization.findFirst({
    where: {
      id: input.facilityPartnerOrganizationId,
      facilityId: input.facilityId,
    },
    select: { id: true, organizationId: true, facilityId: true },
  });
  if (!partnership || partnership.organizationId !== input.organizationId) {
    throw new PartnerFacilitySessionError(
      "PARTNERSHIP_NOT_IN_ORGANIZATION",
      "That client partnership is not part of this Organization.",
    );
  }

  const resolved = await resolveFacilityAuthorization(db, {
    userId: input.userId,
    facilityId: input.facilityId,
    accessKind: "partner",
    facilityPartnerOrganizationId: input.facilityPartnerOrganizationId,
    instant: input.now ?? new Date(),
  });
  if (
    resolved.authorization.path !== "partner" ||
    resolved.authorization.facilityPartnerOrganizationId !== input.facilityPartnerOrganizationId ||
    resolved.authorization.partnerOrganizationId !== input.organizationId ||
    resolved.authorization.allowedDepartmentIds.length === 0
  ) {
    throw new PartnerFacilitySessionError(
      "PARTNER_ACCESS_DENIED",
      "You do not have current partner access to that Facility.",
    );
  }
  return resolved.authorization;
}

/** Membership still current in the signed partner Organization, or sign-in. */
export async function resolvePartnerFacilityExit(
  db: DbClient,
  session: Pick<PartnerFacilitySession, "uid" | "partnerOrganizationId" | "facilityId" | "facilityPartnerOrganizationId">,
): Promise<{ action: "organization"; organizationId: string } | { action: "login" }> {
  const consistent = await partnerContextMatchesPartnership(db, session);
  if (!consistent) return { action: "login" };
  const role = await getCurrentOrganizationRole(db, {
    userId: session.uid,
    organizationId: session.partnerOrganizationId,
  });
  if (!role) return { action: "login" };
  return { action: "organization", organizationId: session.partnerOrganizationId };
}

export type PartnerFacilityTransition =
  | { outcome: "organization"; token: string; organizationId: string }
  | {
      outcome: "clear";
      reason: "UNSIGNED" | "NOT_PARTNER" | "IDENTITY" | "MISMATCH" | "MEMBERSHIP";
    };

/**
 * Replace a partner Facility session with an Organization session, or clear it.
 * The candidate Organization is the signed `partnerOrganizationId` only.
 * `requestedOrganizationId` is accepted so callers can pass through query input
 * and is never read. This function does not write cookies.
 */
export async function completePartnerFacilityTransition(
  db: DbClient,
  input: { token: string; requestedOrganizationId?: string | null },
): Promise<PartnerFacilityTransition> {
  void input.requestedOrganizationId;

  let payload;
  try {
    payload = await verifySessionToken(input.token);
  } catch {
    return { outcome: "clear", reason: "UNSIGNED" };
  }
  if (!isPartnerFacilitySession(payload)) {
    return { outcome: "clear", reason: "NOT_PARTNER" };
  }

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, displayName: true, sessionVersion: true, isActive: true },
  });
  if (!user?.isActive || !user.email || user.sessionVersion !== payload.sessionVersion) {
    return { outcome: "clear", reason: "IDENTITY" };
  }

  const exit = await resolvePartnerFacilityExit(db, payload);
  if (exit.action === "login") {
    const partnership = await db.facilityPartnerOrganization.findFirst({
      where: { id: payload.facilityPartnerOrganizationId, facilityId: payload.facilityId },
      select: { organizationId: true },
    });
    const mismatched =
      !partnership || partnership.organizationId !== payload.partnerOrganizationId;
    return { outcome: "clear", reason: mismatched ? "MISMATCH" : "MEMBERSHIP" };
  }

  const token = await createOrganizationSessionToken({
    uid: user.id,
    authMethod: "PASSWORD",
    name: user.displayName,
    email: user.email,
    organizationId: exit.organizationId,
    sessionVersion: user.sessionVersion,
  });
  return { outcome: "organization", token, organizationId: exit.organizationId };
}

async function partnerContextMatchesPartnership(
  db: DbClient,
  session: Pick<PartnerFacilitySession, "facilityId" | "partnerOrganizationId" | "facilityPartnerOrganizationId">,
): Promise<boolean> {
  const partnership = await db.facilityPartnerOrganization.findFirst({
    where: { id: session.facilityPartnerOrganizationId, facilityId: session.facilityId },
    select: { organizationId: true },
  });
  return partnership?.organizationId === session.partnerOrganizationId;
}
