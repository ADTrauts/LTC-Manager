import { randomUUID } from "node:crypto";
import { isFacilityScopedSession, verifySessionToken, type FacilitySession } from "@/lib/auth";
import { lockFacilityForAdministratorChange, userHoldsFacilityAdministratorSeat } from "@/lib/facility-access";
import { readAssistanceStructure } from "@/lib/facility-builder/assistance-structure";
import { validateSessionAuthority } from "@/lib/session-revocation";
import type { AssistancePilot } from "./assistance-pilot";
import {
  acquireLiveLogin, assistanceReference, currentTime, endHarborAssistanceSession, lockGrant, lockStaff, readBoundLogin,
  recordHarborAssistanceGrantRevocation, resolveHarborAssistanceActor, startHarborAssistanceSession,
  structureRead, structureReview, type AssistanceTx, type GrantScope, withHarborAssistanceTransaction,
} from "./assistance-store";

const day = 24 * 60 * 60_000;
const sessionMaximum = 30 * 60_000;
const auditRetention = 90 * day;
const auditActions = [
  "ASSISTANCE_GRANT_APPROVE", "ASSISTANCE_GRANT_REVOKE", "ASSISTANCE_START", "ASSISTANCE_END",
  "ASSISTANCE_LOGIN_END", "ASSISTANCE_READ", "ASSISTANCE_READ_DENIED",
] as const;
type Login = NonNullable<Awaited<ReturnType<typeof acquireLiveLogin>>>;

function scoped(pilot: AssistancePilot, facilityId: string, staffId: string) {
  return pilot.facilities.has(facilityId) && pilot.staff.has(staffId);
}

async function authorizedStaff(tx: AssistanceTx, token: string | undefined, allowed: Set<string>, owner = false) {
  const login = await acquireLiveLogin(tx, token);
  if (!login || !allowed.has(login.claim.uid) || (owner && login.claim.staffRole !== "OWNER")) return null;
  return login.expiresAt > await currentTime(tx) ? login : null;
}

async function readAdministrator(token: string | undefined, facilityId: string): Promise<FacilitySession | null> {
  if (!token) return null;
  try {
    const session = await verifySessionToken(token);
    return isFacilityScopedSession(session) && session.authKind === "user" && session.authMethod === "PASSWORD" &&
      session.facilityId === facilityId && session.role === "FACILITY_ADMINISTRATOR" ? session : null;
  } catch {
    return null;
  }
}

async function liveAdministrator(tx: AssistanceTx, session: FacilitySession) {
  await lockFacilityForAdministratorChange(tx, session.facilityId);
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.uid} FOR SHARE`;
  const authority = await validateSessionAuthority(session, tx);
  const now = await currentTime(tx);
  return authority.valid && typeof session.exp === "number" && now.getTime() < session.exp * 1000 &&
    await userHoldsFacilityAdministratorSeat(tx, { userId: session.uid, facilityId: session.facilityId }) ? now : null;
}

export async function recordAssistanceConsent(
  pilot: AssistancePilot,
  token: string | undefined,
  input: { facilityId: string; staffId: string; minutes: number },
) {
  if (!scoped(pilot, input.facilityId, input.staffId) || !pilot.viewers.has(input.staffId) ||
    !Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) return null;
  const administrator = await readAdministrator(token, input.facilityId);
  if (!administrator) return null;
  return withHarborAssistanceTransaction(async (tx) => {
    if (!(await lockStaff(tx, input.staffId))) return null;
    const now = await liveAdministrator(tx, administrator);
    if (!now) return null;
    const consent = await tx.harborAssistanceConsent.create({ data: {
      facilityId: input.facilityId, staffId: input.staffId, administratorId: administrator.uid,
      operation: structureRead, purpose: structureReview, grantedAt: now,
      expiresAt: new Date(now.getTime() + input.minutes * 60_000),
    }, select: { id: true } });
    return consent.id;
  });
}

export async function approveAssistanceGrant(
  pilot: AssistancePilot,
  token: string | undefined,
  input: { facilityId: string; staffId: string; consentId: string },
) {
  if (!scoped(pilot, input.facilityId, input.staffId) || !pilot.viewers.has(input.staffId)) return null;
  const proposedApprover = await readBoundLogin(token);
  if (!proposedApprover || proposedApprover.claim.uid === input.staffId) return null;
  return withHarborAssistanceTransaction(async (tx) => {
    if (!(await lockStaff(tx, input.staffId, proposedApprover.claim.uid))) return null;
    const approver = await authorizedStaff(tx, token, pilot.approvers, true);
    if (!approver) return null;
    const recipient = await tx.platformStaff.findUnique({ where: { id: input.staffId }, select: { isActive: true } });
    if (!recipient?.isActive) return null;
    await lockFacilityForAdministratorChange(tx, input.facilityId);
    const consent = await tx.harborAssistanceConsent.findFirst({
      where: { id: input.consentId, facilityId: input.facilityId, staffId: input.staffId,
        operation: structureRead, purpose: structureReview, withdrawnAt: null },
      include: { grant: { select: { id: true, approvedByStaffId: true, expiresAt: true, revokedAt: true } } },
    });
    if (!consent || !await userHoldsFacilityAdministratorSeat(tx, {
      userId: consent.administratorId, facilityId: input.facilityId,
    })) return null;
    const now = await currentTime(tx);
    if (now >= approver.expiresAt || now >= consent.expiresAt || now < consent.grantedAt) return null;
    if (consent.grant) {
      return consent.grant.approvedByStaffId === approver.claim.uid && !consent.grant.revokedAt &&
        consent.grant.expiresAt > now ? consent.grant.id : null;
    }
    const grant = await tx.harborFacilityGrant.create({ data: {
      facilityId: input.facilityId, staffId: input.staffId, consentId: consent.id,
      operations: [structureRead], approvedAt: now, startsAt: now,
      expiresAt: new Date(Math.min(now.getTime() + day, consent.expiresAt.getTime())),
      approvedByStaffId: approver.claim.uid,
    }, select: { id: true } });
    await tx.harborAuditEvent.create({ data: {
      staffId: approver.claim.uid, facilityId: input.facilityId, action: "ASSISTANCE_GRANT_APPROVE", createdAt: now,
      assistance: { create: { grantId: grant.id, operation: structureRead, purpose: structureReview } },
    } });
    return grant.id;
  });
}

export async function withdrawAssistanceConsent(
  pilot: AssistancePilot,
  token: string | undefined,
  input: { facilityId: string; staffId: string; consentId: string },
) {
  if (!scoped(pilot, input.facilityId, input.staffId)) return false;
  const administrator = await readAdministrator(token, input.facilityId);
  if (!administrator) return false;
  return withHarborAssistanceTransaction(async (tx) => {
    if (!(await lockStaff(tx, input.staffId)) || !await liveAdministrator(tx, administrator)) return false;
    const consent = await tx.harborAssistanceConsent.findFirst({
      where: { id: input.consentId, facilityId: input.facilityId, staffId: input.staffId },
      include: { grant: { select: { id: true } } },
    });
    if (!consent) return false;
    if (consent.withdrawnAt) return true;
    const grant = consent.grant && await lockGrant(tx, input.staffId, { grantId: consent.grant.id, facilityId: input.facilityId });
    const now = await currentTime(tx);
    if (typeof administrator.exp !== "number" || now.getTime() >= administrator.exp * 1000) return false;
    await tx.harborAssistanceConsent.update({ where: { id: consent.id }, data: {
      withdrawnAt: now, withdrawnByUserId: administrator.uid,
    } });
    if (grant && !grant.revokedAt) {
      await tx.harborFacilityGrant.update({ where: { id: grant.id }, data: {
        revokedAt: now, revokedByUserId: administrator.uid,
      } });
      await tx.harborAssistanceSession.updateMany({ where: { grantId: grant.id, endedAt: null }, data: {
        endedAt: now, endReason: "CONSENT_WITHDRAWN", endedByUserId: administrator.uid,
      } });
    }
    return true;
  });
}

async function consentAllows(tx: AssistanceTx, input: GrantScope, staffId: string, now: Date) {
  return await tx.harborFacilityGrant.findFirst({
    where: {
      id: input.grantId, staffId, facilityId: input.facilityId,
      consent: { facilityId: input.facilityId, staffId, operation: structureRead, purpose: structureReview,
        grantedAt: { lte: now }, expiresAt: { gt: now }, withdrawnAt: null },
    }, select: { id: true, expiresAt: true },
  });
}

export async function switchAssistanceContext(
  pilot: AssistancePilot,
  token: string | undefined,
  input: GrantScope & { requestId: string; switchFrom?: string },
) {
  return withHarborAssistanceTransaction(async (tx) => {
    const login = await authorizedStaff(tx, token, pilot.viewers);
    if (!login || !scoped(pilot, input.facilityId, login.claim.uid)) return false;
    const now = await currentTime(tx);
    const grant = await consentAllows(tx, input, login.claim.uid, now);
    if (!grant) return false;
    const previous = await tx.harborAssistanceSession.findUnique({
      where: { loginKey_requestId: { loginKey: login.key, requestId: input.requestId } },
      select: { expiresAt: true },
    });
    const expiresAt = previous?.expiresAt ?? new Date(Math.min(
      now.getTime() + sessionMaximum, grant.expiresAt.getTime(), login.expiresAt.getTime(),
    ));
    return Boolean(await startHarborAssistanceSession(tx, token, { ...input, purpose: structureReview, expiresAt }));
  });
}

async function lookupContext(tx: AssistanceTx, pilot: AssistancePilot, login: Login, reference: string) {
  if (!assistanceReference.test(reference)) return null;
  const found = await tx.harborAssistanceSession.findUnique({
    where: { loginKey_requestId: { loginKey: login.key, requestId: reference } },
    select: { id: true, grantId: true, grant: { select: { facilityId: true } } },
  });
  if (!found || !scoped(pilot, found.grant.facilityId, login.claim.uid)) return null;
  return { sessionId: found.id, grantId: found.grantId, facilityId: found.grant.facilityId };
}

export async function endPilotAssistance(pilot: AssistancePilot, token: string | undefined, reference: string) {
  return withHarborAssistanceTransaction(async (tx) => {
    const login = await authorizedStaff(tx, token, pilot.viewers);
    const scope = login && await lookupContext(tx, pilot, login, reference);
    return scope ? endHarborAssistanceSession(tx, token, scope) : false;
  });
}

export async function revokePilotAssistance(
  pilot: AssistancePilot, token: string | undefined, input: GrantScope & { staffId: string },
) {
  if (!token || !scoped(pilot, input.facilityId, input.staffId)) return false;
  const revoker = await readBoundLogin(token);
  if (!revoker || !pilot.revokers.has(revoker.claim.uid) || revoker.claim.staffRole !== "OWNER") return false;
  // The store locks both staff rows in order and rechecks the revoker's signed role and live login.
  return withHarborAssistanceTransaction((tx) => recordHarborAssistanceGrantRevocation(tx, token, input));
}

export class AssistanceAuthorityExpired extends Error {}

export async function loadPilotStructure(pilot: AssistancePilot, token: string | undefined, reference: string) {
  return withHarborAssistanceTransaction(async (tx) => {
    const login = await authorizedStaff(tx, token, pilot.viewers);
    if (!login) return null;
    const requestKey = randomUUID();
    const scope = await lookupContext(tx, pilot, login, reference);
    const actor = scope && await resolveHarborAssistanceActor(tx, token, { ...scope, operation: structureRead });
    if (!actor || !await consentAllows(tx, actor, actor.staffId, await currentTime(tx))) {
      await tx.harborAuditEvent.create({ data: {
        staffId: login.claim.uid, action: "ASSISTANCE_READ_DENIED",
        assistance: { create: { requestKey, operation: structureRead, purpose: structureReview } },
      } });
      return null;
    }
    const structure = await readAssistanceStructure(tx, actor.facilityId);
    if (!structure) return null;
    await tx.harborAuditEvent.create({ data: {
      staffId: actor.staffId, facilityId: actor.facilityId, action: "ASSISTANCE_READ",
      assistance: { create: { grantId: actor.grantId, sessionId: actor.sessionId, requestKey,
        operation: actor.operation, purpose: structureReview } },
    } });
    // Audit or reads may have waited. Roll back the success record if any timer expired.
    if (!await resolveHarborAssistanceActor(tx, token, actor) ||
        !await consentAllows(tx, actor, actor.staffId, await currentTime(tx))) throw new AssistanceAuthorityExpired();
    return structure;
  });
}

/** Internal audit maintenance. The receipt table has its own retention rule and is never pruned here. */
export async function maintainPilotAudit(pilot: AssistancePilot, token: string | undefined, prune = false) {
  return withHarborAssistanceTransaction(async (tx) => {
    const reviewer = await authorizedStaff(tx, token, pilot.reviewers);
    if (!reviewer) return null;
    const since = new Date((await currentTime(tx)).getTime() - auditRetention);
    const scope = {
      staffId: { in: [...pilot.staff] }, action: { in: [...auditActions] },
      OR: [{ facilityId: { in: [...pilot.facilities] } }, { facilityId: null }],
    };
    if (prune) return (await tx.harborAuditEvent.deleteMany({ where: { ...scope, createdAt: { lt: since } } })).count;
    return tx.harborAuditEvent.findMany({
      where: { ...scope, createdAt: { gte: since } },
      select: { staffId: true, facilityId: true, action: true, createdAt: true, assistance: {
        select: { grantId: true, sessionId: true, requestKey: true, operation: true, purpose: true },
      } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200,
    });
  });
}
