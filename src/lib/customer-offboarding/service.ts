import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { loadFacilityAdministratorSeat } from "@/lib/facility-administrator";
import { validateSessionAuthority } from "@/lib/session-revocation";
import { isValidIanaTimezone } from "@/lib/operational-time";
import { lockHarborStaffSession, validateHarborStaffSession, type HarborJwtPayload } from "@/lib/harbor-console/auth";
import { harborLoginIdentity } from "@/lib/harbor-console/login-receipt";
import { customerOffboardingCommandSchema, offboardingEnabled, OPEN_OFFBOARDING_STATUSES,
  offboardingPlanSchema, ownerOffboardingCommandSchema, requestOffboardingSchema, requireOffboarding } from "./contract";

type Tx = Prisma.TransactionClient;
export type OffboardingActor = { kind: "CUSTOMER"; session: FacilitySession } | { kind: "OWNER"; session: HarborJwtPayload };
const fingerprint = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
function enabled() { requireOffboarding(offboardingEnabled(), "Offboarding review is not available yet."); }

async function currentRequester(tx: Tx, facilityId: string, userId: string) {
  const seat = await loadFacilityAdministratorSeat(tx, facilityId);
  return seat.kind === "HELD" && seat.holder.userId === userId && seat.holder.since.getTime() <= Date.now();
}

async function requireCustomer(tx: Tx, s: FacilitySession) {
  requireOffboarding(s.authKind === "user" && s.authMethod !== "QUICK_PIN" && s.scopeKind === "facility" &&
    !s.accessKind && s.role === "FACILITY_ADMINISTRATOR" && typeof s.exp === "number" && s.exp * 1000 > Date.now() &&
    (await validateSessionAuthority(s, tx)).valid && await currentRequester(tx, s.facilityId, s.uid),
  "Sign in as the current Facility Administrator.");
}

async function requireOwner(tx: Tx, s: HarborJwtPayload, lock = false) {
  const login = harborLoginIdentity(s);
  requireOffboarding(login && !login.assistance, "Normal OWNER sign-in is required.");
  const authority = lock ? await lockHarborStaffSession(s, tx) : await validateHarborStaffSession(s, tx);
  requireOffboarding(authority.valid && authority.staff.role === "OWNER", "Current OWNER sign-in is required.");
  return authority.staff;
}

async function lockFacility(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Facility" WHERE "id"=${id} FOR UPDATE`;
}
async function lockUser(tx: Tx, facilityId: string, userId: string) {
  // Serializes seat/access changes and exact-login logout through the existing User receipt FK.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "UserFacilityAccess" WHERE "facilityId"=${facilityId} AND "userId"=${userId} FOR SHARE`;
}
async function lockCommand(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended(${`customer-offboarding:${id}`},0))`;
}
async function replay(tx: Tx, id: string, hash: string) {
  const prior = await tx.customerOffboardingEvent.findUnique({ where: { id }, select: { fingerprint: true, requestId: true } });
  if (!prior) return null;
  requireOffboarding(prior.fingerprint === hash, "This request reference was already used. Refresh before continuing.");
  return prior.requestId;
}
async function lockRequest(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "CustomerOffboardingRequest" WHERE "id"=${id}::uuid FOR UPDATE`;
  const row = await tx.customerOffboardingRequest.findUnique({ where: { id } });
  requireOffboarding(row, "Request not found.");
  return row;
}

export async function createOffboardingRequest(db: PrismaClient, s: FacilitySession, raw: unknown) {
  enabled();
  const parsed = requestOffboardingSchema.safeParse(raw);
  requireOffboarding(parsed.success, "Enter a valid planning date and a reason of 8–1,000 characters.");
  const input = parsed.data;
  const hash = fingerprint(["REQUESTED", s.facilityId, s.uid, input]);
  return db.$transaction(async (tx) => {
    await lockCommand(tx, input.id);
    await lockFacility(tx, s.facilityId);
    await lockUser(tx, s.facilityId, s.uid);
    await requireCustomer(tx, s);
    const prior = await replay(tx, input.id, hash);
    if (prior) return prior;
    const open = await tx.customerOffboardingRequest.count({ where: { facilityId: s.facilityId, status: { in: OPEN_OFFBOARDING_STATUSES } } });
    requireOffboarding(open === 0, "This Facility already has an open offboarding request. Continue your request or contact Support to resolve an earlier Administrator’s request.");
    const facility = await tx.facility.findUniqueOrThrow({ where: { id: s.facilityId }, select: { timezone: true } });
    requireOffboarding(isValidIanaTimezone(facility.timezone), "Confirm the Facility timezone before requesting an offboarding plan.");
    const now = new Date();
    await tx.customerOffboardingRequest.create({ data: {
      ...input, facilityId: s.facilityId, requesterId: s.uid, requesterLabel: s.name.slice(0, 100),
      facilityTimezone: facility.timezone, fingerprint: hash, createdAt: now, updatedAt: now,
      events: { create: { id: input.id, revision: 0, fingerprint: hash, action: "REQUESTED",
        actorId: s.uid, actorKind: "CUSTOMER", actorLabel: s.name.slice(0, 100), detail: { planVersion: 0, noticeVersion: 1 }, createdAt: now } },
    } });
    await requireCustomer(tx, s);
    return input.id;
  }, { isolationLevel: "ReadCommitted", timeout: 15000 });
}

export async function customerOffboardingCommand(db: PrismaClient, s: FacilitySession, raw: unknown) {
  enabled();
  const parsed = customerOffboardingCommandSchema.safeParse(raw);
  requireOffboarding(parsed.success, "Invalid request. Refresh the page.");
  const input = parsed.data;
  const hash = fingerprint(["CUSTOMER", s.facilityId, s.uid, input]);
  return db.$transaction(async (tx) => {
    await lockCommand(tx, input.commandId);
    await lockFacility(tx, s.facilityId);
    await lockUser(tx, s.facilityId, s.uid);
    await requireCustomer(tx, s);
    const prior = await replay(tx, input.commandId, hash);
    if (prior) return prior;
    const row = await lockRequest(tx, input.requestId);
    requireOffboarding(row.facilityId === s.facilityId && row.requesterId === s.uid, "Request not found.");
    requireOffboarding(row.revision === input.revision, "This request or plan changed. Refresh and review it again.");
    requireOffboarding(OPEN_OFFBOARDING_STATUSES.includes(row.status), "This request is no longer open.");
    if (input.action === "ACKNOWLEDGE") requireOffboarding(row.status === "PLAN_READY" && offboardingPlanSchema.safeParse(row.plan).success,
      "Only a valid, currently published plan can be acknowledged.");
    const revision = row.revision + 1;
    const now = new Date();
    await tx.customerOffboardingRequest.update({ where: { id: row.id }, data: {
      revision, updatedAt: now, status: input.action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "WITHDRAWN",
    } });
    await tx.customerOffboardingEvent.create({ data: { id: input.commandId, requestId: row.id, revision,
      fingerprint: hash, actorId: s.uid, actorKind: "CUSTOMER", actorLabel: s.name.slice(0, 100),
      action: input.action === "ACKNOWLEDGE" ? "PLAN_ACKNOWLEDGED" : "WITHDRAWN",
      detail: { planVersion: row.planVersion }, createdAt: now } });
    await requireCustomer(tx, s);
    return row.id;
  }, { isolationLevel: "ReadCommitted", timeout: 15000 });
}

export async function ownerOffboardingCommand(db: PrismaClient, s: HarborJwtPayload, raw: unknown) {
  enabled();
  const parsed = ownerOffboardingCommandSchema.safeParse(raw);
  requireOffboarding(parsed.success, "Complete all four shared plan sections and choose a valid target date, or provide a decline reason.");
  const input = parsed.data;
  const hash = fingerprint(["OWNER", s.uid, input]);
  return db.$transaction(async (tx) => {
    await lockCommand(tx, input.commandId);
    const staff = await requireOwner(tx, s, true);
    const prior = await replay(tx, input.commandId, hash);
    if (prior) return prior;
    const meta = await tx.customerOffboardingRequest.findUnique({ where: { id: input.requestId }, select: { facilityId: true } });
    requireOffboarding(meta, "Request not found.");
    await lockFacility(tx, meta.facilityId);
    const row = await lockRequest(tx, input.requestId);
    requireOffboarding(row.revision === input.revision, "This request changed. Refresh before deciding.");
    requireOffboarding(OPEN_OFFBOARDING_STATUSES.includes(row.status), "This request is no longer open.");
    if (input.action === "PUBLISH_PLAN") {
      await lockUser(tx, row.facilityId, row.requesterId);
      requireOffboarding(await currentRequester(tx, row.facilityId, row.requesterId),
        "The requesting Administrator no longer holds the seat. Decline this request; the current Administrator must submit a fresh one.");
    }
    const revision = row.revision + 1;
    const planVersion = row.planVersion + (input.action === "PUBLISH_PLAN" ? 1 : 0);
    const now = new Date();
    await tx.customerOffboardingRequest.update({ where: { id: row.id }, data: {
      revision, planVersion, updatedAt: now, status: input.action === "PUBLISH_PLAN" ? "PLAN_READY" : "DECLINED",
      ...(input.action === "PUBLISH_PLAN" ? { plan: input.plan } : {}),
    } });
    await tx.customerOffboardingEvent.create({ data: { id: input.commandId, requestId: row.id, revision,
      fingerprint: hash, actorId: staff.id, actorKind: "OWNER", actorLabel: staff.displayName.slice(0, 100),
      action: input.action === "PUBLISH_PLAN" ? "PLAN_PUBLISHED" : "DECLINED",
      detail: input.action === "PUBLISH_PLAN" ? { planVersion, plan: input.plan } : { planVersion, reason: input.reason }, createdAt: now } });
    await requireOwner(tx, s);
    return row.id;
  }, { isolationLevel: "ReadCommitted", timeout: 15000 });
}

async function requireActor(tx: Tx, actor: OffboardingActor) {
  if (actor.kind === "CUSTOMER") await requireCustomer(tx, actor.session);
  else await requireOwner(tx, actor.session);
}
async function revalidateActor(db: PrismaClient, actor: OffboardingActor) {
  // Repeat outside the read snapshot so a completed seat transfer/logout cannot reuse stale authorization.
  await db.$transaction((tx) => requireActor(tx, actor));
}

export async function listOffboardingRequests(db: PrismaClient, actor: OffboardingActor, page = 1,
  facilityId?: string, openOnly = false) {
  enabled();
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await requireActor(tx, actor);
    const where = { ...(actor.kind === "CUSTOMER" ? { facilityId: actor.session.facilityId, requesterId: actor.session.uid } : facilityId ? { facilityId } : {}),
      ...(openOnly ? { status: { in: OPEN_OFFBOARDING_STATUSES } } : {}) };
    const total = await tx.customerOffboardingRequest.count({ where });
    const pages = Math.max(1, Math.ceil(total / 25));
    const current = Math.max(1, Math.min(pages, Number.isSafeInteger(page) ? page : 1));
    const rows = await tx.customerOffboardingRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25, skip: (current - 1) * 25, select: {
        id: true, requesterLabel: true, requestedDate: true, facilityTimezone: true, status: true, planVersion: true,
        createdAt: true, facility: { select: { id: true, displayName: true } },
      } });
    const facility = actor.kind === "CUSTOMER" ? await tx.facility.findUnique({ where: { id: actor.session.facilityId }, select: { displayName: true } }) : null;
    const facilityHasOpen = actor.kind === "CUSTOMER" && await tx.customerOffboardingRequest.count({
      where: { facilityId: actor.session.facilityId, status: { in: OPEN_OFFBOARDING_STATUSES } },
    }) > 0;
    return { rows, total, pages, page: current, facilityName: facility?.displayName, facilityHasOpen };
  }, { isolationLevel: "RepeatableRead" });
  await revalidateActor(db, actor);
  return result;
}

export async function loadOffboardingRequest(db: PrismaClient, actor: OffboardingActor, id: string, eventPage = 1) {
  enabled();
  // Reuse the UUID schema, without interpreting a malformed reference as a database cast error.
  requireOffboarding(customerOffboardingCommandSchema.shape.requestId.safeParse(id).success, "Request not found.");
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await requireActor(tx, actor);
    const row = await tx.customerOffboardingRequest.findFirst({ where: { id,
      ...(actor.kind === "CUSTOMER" ? { facilityId: actor.session.facilityId, requesterId: actor.session.uid } : {}) },
      select: { id: true, facilityId: true, requesterId: true, requesterLabel: true, requestedDate: true, facilityTimezone: true,
        reason: true, status: true, revision: true, planVersion: true, plan: true, createdAt: true, updatedAt: true,
        facility: { select: { id: true, displayName: true, operationsSuspendedAt: true,
          billing: { select: { status: true, updatedAt: true } } } },
      } });
    requireOffboarding(row, "Request not found.");
    const total = await tx.customerOffboardingEvent.count({ where: { requestId: row.id } });
    const pages = Math.max(1, Math.ceil(total / 25));
    const page = Math.max(1, Math.min(pages, Number.isSafeInteger(eventPage) ? eventPage : 1));
    const events = await tx.customerOffboardingEvent.findMany({ where: { requestId: row.id }, orderBy: { revision: "desc" },
      take: 25, skip: (page - 1) * 25, select: { id: true, revision: true, action: true, actorLabel: true, actorKind: true,
        detail: true, createdAt: true } });
    const exportWhere = { facilityId: row.facilityId, requesterId: row.requesterId };
    const exportPending = await tx.customerRecordExportRequest.count({ where: { ...exportWhere, status: "PENDING" } });
    const exportApproved = await tx.customerRecordExportRequest.count({ where: { ...exportWhere, status: "APPROVED", expiresAt: { gt: new Date() } } });
    return { row, events, total, pages, page, requesterCurrent: await currentRequester(tx, row.facilityId, row.requesterId),
      exports: { pending: exportPending, approved: exportApproved } };
  }, { isolationLevel: "RepeatableRead" });
  await revalidateActor(db, actor);
  return result;
}
