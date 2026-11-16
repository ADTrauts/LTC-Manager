import { createHash } from "node:crypto";
import type { HarborAssistanceOperation, HarborFacilityGrant, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateHarborStaffSession } from "./auth";
import { type HarborJwtPayload, verifyHarborSessionToken } from "./session";

// Internal persistence commands. No grant writer, assistance route, or login issuer calls this store.
declare const assistanceTransaction: unique symbol;
type Tx = Prisma.TransactionClient & { readonly [assistanceTransaction]: true };

export function withHarborAssistanceTransaction<T>(run: (tx: Tx) => Promise<T>): Promise<T> {
  // A snapshot taken before a row lock wait could miss a just-committed logout receipt.
  return prisma.$transaction((tx) => run(tx as Tx), { isolationLevel: "ReadCommitted" });
}

type GrantScope = { grantId: string; facilityId: string };
type SessionScope = GrantScope & { sessionId: string };
type BoundLogin = { claim: HarborJwtPayload; key: string; expiresAt: Date };

export type HarborAssistanceActor = Readonly<{
  kind: "harbor_assistance";
  staffId: string;
  facilityId: string;
  grantId: string;
  sessionId: string;
  operation: HarborAssistanceOperation;
}>;

const structureRead = "FACILITY_STRUCTURE_READ";
const structureReview = "FACILITY_STRUCTURE_REVIEW";
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function readBoundLogin(token: string | undefined): Promise<BoundLogin | null> {
  if (!token) return null;
  let claim: HarborJwtPayload;
  try {
    claim = await verifyHarborSessionToken(token);
  } catch {
    return null;
  }
  if (typeof claim.jti !== "string" || !uuidV4.test(claim.jti) ||
      typeof claim.exp !== "number" || !Number.isSafeInteger(claim.exp)) return null;
  const expiresAt = new Date(claim.exp * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || !claim.uid) return null;
  const key = createHash("sha256").update(claim.uid).update("\0").update(claim.jti).digest("hex");
  return { claim, key, expiresAt };
}

// Serialize for a subject across every grant and login. Revocation can involve two staff rows.
async function lockStaff(tx: Tx, staffId: string, actorStaffId = staffId): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "PlatformStaff" WHERE "id" IN (${staffId}, ${actorStaffId})
    ORDER BY "id" FOR NO KEY UPDATE
  `;
  return rows.length === (staffId === actorStaffId ? 1 : 2);
}

async function currentTime(tx: Tx): Promise<Date> {
  const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return row.now;
}

async function hasEndedLogin(tx: Tx, key: string): Promise<boolean> {
  return (await tx.harborAssistanceAuditDetail.findUnique({
    where: { loginKey: key },
    select: { eventId: true },
  })) !== null;
}

async function acquireLiveLogin(tx: Tx, token: string | undefined): Promise<BoundLogin | null> {
  const login = await readBoundLogin(token);
  if (!login || !(await lockStaff(tx, login.claim.uid))) return null;
  const authority = await validateHarborStaffSession(login.claim, tx);
  return authority.valid && !(await hasEndedLogin(tx, login.key)) ? login : null;
}

async function lockGrant(tx: Tx, staffId: string, scope: GrantScope) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "HarborFacilityGrant"
    WHERE "id" = ${scope.grantId} AND "staffId" = ${staffId} AND "facilityId" = ${scope.facilityId}
    FOR NO KEY UPDATE
  `;
  return rows.length ? tx.harborFacilityGrant.findUnique({ where: { id: scope.grantId } }) : null;
}

async function lockSession(tx: Tx, login: BoundLogin, scope: SessionScope) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "HarborAssistanceSession"
    WHERE "id" = ${scope.sessionId} AND "grantId" = ${scope.grantId} AND "loginKey" = ${login.key}
    FOR NO KEY UPDATE
  `;
  return rows.length ? tx.harborAssistanceSession.findUnique({ where: { id: scope.sessionId } }) : null;
}

function grantsOperation(grant: HarborFacilityGrant, operation: string, now: Date): boolean {
  return operation === structureRead && grant.operations.includes(structureRead) &&
    !grant.revokedAt && grant.startsAt <= now && now < grant.expiresAt;
}

export async function startHarborAssistanceSession(
  tx: Tx,
  token: string | undefined,
  input: GrantScope & { requestId: string; purpose: typeof structureReview; expiresAt: Date },
): Promise<string | null> {
  if (!uuidV4.test(input.requestId) || input.purpose !== structureReview ||
      !Number.isFinite(input.expiresAt.getTime())) return null;
  const login = await acquireLiveLogin(tx, token);
  if (!login) return null;
  const grant = await lockGrant(tx, login.claim.uid, input);
  if (!grant) return null;

  const previous = await tx.harborAssistanceSession.findUnique({
    where: { loginKey_requestId: { loginKey: login.key, requestId: input.requestId } },
  });
  const now = await currentTime(tx);
  if (!grantsOperation(grant, structureRead, now) || input.expiresAt <= now ||
      input.expiresAt > grant.expiresAt || input.expiresAt > login.expiresAt) return null;
  if (previous) {
    return previous.grantId === grant.id && !previous.endedAt &&
      previous.purpose === input.purpose && previous.expiresAt.getTime() === input.expiresAt.getTime()
      ? previous.id : null;
  }

  const session = await tx.harborAssistanceSession.create({
    data: {
      grantId: grant.id, loginKey: login.key, requestId: input.requestId,
      purpose: input.purpose, startedAt: now, expiresAt: input.expiresAt,
    },
  });
  await tx.harborAuditEvent.create({ data: {
    staffId: login.claim.uid, facilityId: grant.facilityId, action: "ASSISTANCE_START",
    assistance: { create: { grantId: grant.id, sessionId: session.id } }, createdAt: now,
  } });
  return session.id;
}

// A future resource reader must use this decision and query its owned scope in the same transaction.
export async function resolveHarborAssistanceActor(
  tx: Tx,
  token: string | undefined,
  input: SessionScope & { operation: string },
): Promise<HarborAssistanceActor | null> {
  if (input.operation !== structureRead) return null;
  const login = await acquireLiveLogin(tx, token);
  if (!login) return null;
  const grant = await lockGrant(tx, login.claim.uid, input);
  if (!grant) return null;
  const session = await lockSession(tx, login, input);
  if (!session) return null;

  const now = await currentTime(tx);
  if (!grantsOperation(grant, input.operation, now) || session.endedAt ||
      now < session.startedAt || now >= session.expiresAt || now >= login.expiresAt) return null;
  return {
    kind: "harbor_assistance", staffId: login.claim.uid, facilityId: grant.facilityId,
    grantId: grant.id, sessionId: session.id, operation: input.operation,
  };
}

export async function endHarborAssistanceSession(tx: Tx, token: string | undefined, scope: SessionScope) {
  const login = await acquireLiveLogin(tx, token);
  if (!login) return false;
  const grant = await lockGrant(tx, login.claim.uid, scope);
  if (!grant) return false;
  const session = await lockSession(tx, login, scope);
  if (!session) return false;
  const now = await currentTime(tx);
  if (now >= login.expiresAt) return false;
  if (session.endedAt) return true;
  await tx.harborAssistanceSession.update({
    where: { id: session.id },
    data: { endedAt: now, endReason: "STAFF_EXIT", endedByStaffId: login.claim.uid },
  });
  await tx.harborAuditEvent.create({ data: {
    staffId: login.claim.uid, facilityId: grant.facilityId, action: "ASSISTANCE_END",
    assistance: { create: { grantId: grant.id, sessionId: session.id } }, createdAt: now,
  } });
  return true;
}

/** Persistence only. A future governance command must authorize who can revoke before calling. */
export async function recordHarborAssistanceGrantRevocation(
  tx: Tx,
  token: string,
  scope: GrantScope & { staffId: string },
) {
  const revoker = await readBoundLogin(token);
  if (!revoker || !(await lockStaff(tx, scope.staffId, revoker.claim.uid))) return false;
  const authority = await validateHarborStaffSession(revoker.claim, tx);
  if (!authority.valid || await hasEndedLogin(tx, revoker.key)) return false;
  const grant = await lockGrant(tx, scope.staffId, scope);
  if (!grant) return false;
  const now = await currentTime(tx);
  if (now >= revoker.expiresAt) return false;
  if (grant.revokedAt) return true;

  await tx.harborFacilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: now, revokedByStaffId: revoker.claim.uid },
  });
  await tx.harborAssistanceSession.updateMany({
    where: { grantId: grant.id, endedAt: null },
    data: { endedAt: now, endReason: "GRANT_REVOKED", endedByStaffId: revoker.claim.uid },
  });
  await tx.harborAuditEvent.create({ data: {
    staffId: revoker.claim.uid, facilityId: grant.facilityId, action: "ASSISTANCE_GRANT_REVOKE",
    assistance: { create: { grantId: grant.id } }, createdAt: now,
  } });
  return true;
}

/** Only logout reaches this store in the app. Unbound logins need no assistance tables. */
export async function endBrowserAssistanceLogin(token: string | undefined) {
  const login = await readBoundLogin(token);
  if (!login) return;
  await withHarborAssistanceTransaction(async (tx) => {
    if (!(await lockStaff(tx, login.claim.uid)) || await hasEndedLogin(tx, login.key)) return;
    const now = await currentTime(tx);
    await tx.harborAssistanceSession.updateMany({
      where: { loginKey: login.key, endedAt: null },
      data: { endedAt: now, endReason: "HARBOR_LOGOUT", endedByStaffId: login.claim.uid },
    });
    // Write a receipt even if no sessions exist. A later start must reject that signed login.
    await tx.harborAuditEvent.create({ data: {
      staffId: login.claim.uid, action: "ASSISTANCE_LOGIN_END",
      assistance: { create: { loginKey: login.key } }, createdAt: now,
    } });
  });
}
