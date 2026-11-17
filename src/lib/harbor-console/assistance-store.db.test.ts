import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { NextRequest } from "next/server";

import { POST as logout } from "@/app/api/console/auth/logout/route";
import { createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import {
  endHarborAssistanceSession, recordHarborAssistanceGrantRevocation, resolveHarborAssistanceActor,
  startHarborAssistanceSession, withHarborAssistanceTransaction as transaction,
} from "./assistance-store";
import { createHarborSessionToken, HARBOR_SESSION_COOKIE, HARBOR_STAFF_LOGIN_TOKEN_USE, verifyHarborSessionToken } from "./session";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
const origin = "https://preview.example.invalid";
type Staff = Awaited<ReturnType<typeof prisma.platformStaff.create>>;

const gate = () => {
  let open!: () => void;
  const ready = new Promise<void>((resolve) => { open = resolve; });
  return { ready, open };
};

async function waitForLock(statement: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE ${statement})
      AS waiting
    `;
    if (row.waiting) return;
    await delay(25);
  }
  assert.fail("expected a database lock wait");
}

function signOut(token: string, customerCookie = "") {
  return logout(new NextRequest(origin + "/api/console/auth/logout", { method: "POST", headers: {
    origin, cookie: `${HARBOR_SESSION_COOKIE}=${token}${customerCookie}`,
  } }));
}

function tokenFor(staff: Staff, bound = true) {
  return createHarborSessionToken({
    uid: staff.id, email: staff.email, name: staff.displayName,
    staffRole: staff.role, sessionVersion: staff.sessionVersion,
  }, bound ? { bindAssistance: true } : undefined);
}

test("Harbor assistance authority is scoped, revocable and transactional", {
  skip: !databaseUrl && "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  assertDisposableDatabaseUrl(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET ??= "synthetic-harbor-assistance-foundation";
  const tag = `assistance-${randomUUID()}`;
  const organization = await prisma.organization.create({ data: { name: tag } });
  const facilities = await Promise.all(["A", "B"].map((label) => prisma.facility.create({
    data: { displayName: label, organizationId: organization.id },
  })));
  const [facility, foreign] = facilities;
  const [staff, revoker] = await Promise.all((["MEMBER", "OWNER"] as const).map((role) =>
    prisma.platformStaff.create({ data: {
      role, email: `${tag}-${role}@example.invalid`, displayName: role, passwordHash: "unused-fixture",
    } })));
  const staffIds = [staff.id, revoker.id];
  t.after(async () => {
    try {
      await prisma.harborAssistanceSession.deleteMany({ where: { grant: { staffId: { in: staffIds } } } });
      await prisma.harborFacilityGrant.deleteMany({ where: { staffId: { in: staffIds } } });
      await prisma.harborAuditEvent.deleteMany({ where: { staffId: { in: staffIds } } });
      await prisma.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
      await prisma.facility.deleteMany({ where: { organizationId: organization.id } });
      await prisma.organization.delete({ where: { id: organization.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function grant(expiresAt = new Date(Date.now() + 60_000), startsAt = new Date(Date.now() - 60_000)) {
    return prisma.harborFacilityGrant.create({ data: {
      facilityId: facility.id, staffId: staff.id, approvedByStaffId: revoker.id,
      operations: ["FACILITY_STRUCTURE_READ"], approvedAt: startsAt, startsAt, expiresAt,
    } });
  }
  function start(token: string, input: ReturnType<typeof intent>) {
    return transaction((tx) => startHarborAssistanceSession(tx, token, input));
  }
  function intent(grantId: string, expiresAt = new Date(Date.now() + 30_000)) {
    return { grantId, facilityId: facility.id, requestId: randomUUID(),
      purpose: "FACILITY_STRUCTURE_REVIEW" as const, expiresAt };
  }
  function resolve(token: string, scope: { facilityId: string; grantId: string; sessionId: string }, operation = "FACILITY_STRUCTURE_READ") {
    return transaction((tx) => resolveHarborAssistanceActor(tx, token, { ...scope, operation }));
  }

  await t.test("requires the granted Facility, staff, operation and exact signed login", async () => {
    const [bound, secondLogin, owner, ordinary] = await Promise.all([
      tokenFor(staff), tokenFor(staff), tokenFor(revoker), tokenFor(staff, false),
    ]);
    const customer = await createSessionToken({
      uid: "fixture-customer", name: "Customer", email: "customer@example.invalid",
      facilityId: facility.id, role: "FACILITY_ADMINISTRATOR",
    });
    const g = await grant();
    const params = intent(g.id);
    const ordinaryClaims = await verifyHarborSessionToken(ordinary);
    assert.equal(ordinaryClaims.tokenUse, HARBOR_STAFF_LOGIN_TOKEN_USE);
    assert.ok(ordinaryClaims.jti);
    for (const unqualified of [owner, ordinary, customer, "malformed"]) {
      assert.equal(await start(unqualified, params), null);
    }
    assert.equal(await start(bound, { ...params, facilityId: foreign.id }), null);
    assert.equal(await start(bound, { ...params, expiresAt: new Date(g.expiresAt.getTime() + 1) }), null);

    const [id, duplicate] = await Promise.all([start(bound, params), start(bound, params)]);
    assert.ok(id);
    assert.equal(duplicate, id);
    assert.equal(await start(bound, { ...params, expiresAt: new Date(params.expiresAt.getTime() - 1) }), null);
    const scope = { ...params, sessionId: id };
    assert.deepEqual(await resolve(bound, scope), {
      kind: "harbor_assistance", staffId: staff.id, grantId: g.id, facilityId: facility.id,
      sessionId: id, operation: "FACILITY_STRUCTURE_READ",
    });
    assert.equal(await resolve(bound, { ...scope, facilityId: foreign.id }), null);
    assert.equal(await resolve(bound, scope, "PRIVATE_RECORDS_READ"), null);
    assert.equal(await resolve(secondLogin, scope), null);
    assert.equal(await resolve(owner, scope), null);

    await prisma.platformStaff.update({ where: { id: staff.id }, data: { isActive: false } });
    assert.equal(await resolve(bound, scope), null);
    await prisma.platformStaff.update({ where: { id: staff.id }, data: { isActive: true, sessionVersion: { increment: 1 } } });
    assert.equal(await start(bound, params), null);
    await prisma.platformStaff.update({ where: { id: staff.id }, data: { sessionVersion: staff.sessionVersion } });

    assert.equal(await transaction((tx) => endHarborAssistanceSession(tx, secondLogin, scope)), false);
    assert.equal(await transaction((tx) => endHarborAssistanceSession(tx, bound, scope)), true);
    assert.equal(await transaction((tx) => endHarborAssistanceSession(tx, bound, scope)), true);
    assert.equal(await resolve(bound, scope), null);
    assert.equal(await start(bound, params), null);
    const events = await prisma.harborAuditEvent.findMany({
      where: { assistance: { sessionId: id } },
      select: { action: true, staffId: true, facilityId: true, assistance: { select: { loginKey: true } } },
      orderBy: { action: "asc" },
    });
    assert.deepEqual(events.map((event) => event.action), ["ASSISTANCE_START", "ASSISTANCE_END"]);
    assert.ok(events.every((event) => event.staffId === staff.id && event.facilityId === facility.id &&
      event.assistance?.loginKey === null));
  });

  await t.test("grant revocation invalidates every login under that grant and is safe to retry", async () => {
    const [bound, other, approver] = await Promise.all([tokenFor(staff), tokenFor(staff), tokenFor(revoker)]);
    const g = await grant();
    const params = intent(g.id);
    const [first, second] = await Promise.all([start(bound, params), start(other, params)]);
    assert.ok(first && second && first !== second);
    const revoke = (facilityId: string) => transaction((tx) =>
      recordHarborAssistanceGrantRevocation(tx, approver, { grantId: g.id, staffId: staff.id, facilityId }));
    assert.equal(await revoke(foreign.id), false);
    assert.equal(await revoke(facility.id), true);
    assert.equal(await revoke(facility.id), true);
    assert.equal(await resolve(bound, { ...params, sessionId: first }), null);
    assert.equal(await start(other, intent(g.id)), null);
    const closed = await prisma.harborAssistanceSession.findMany({ where: { grantId: g.id } });
    assert.equal(closed.length, 2);
    assert.ok(closed.every((row) => row.endedAt && row.endReason === "GRANT_REVOKED" && row.endedByStaffId === revoker.id));
    assert.equal(await prisma.harborAuditEvent.count({
      where: { action: "ASSISTANCE_GRANT_REVOKE", assistance: { grantId: g.id } },
    }), 1);
  });

  await t.test("a start that waited for a real database lock rechecks expiry", async () => {
    const bound = await tokenFor(staff);
    const expiresAt = new Date(Date.now() + 1_500);
    const g = await grant(expiresAt);
    const params = intent(g.id, expiresAt);
    const held = gate();
    const release = gate();
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "HarborFacilityGrant" WHERE id = ${g.id} FOR NO KEY UPDATE`;
      held.open();
      await release.ready;
    });
    await held.ready;
    const waiting = start(bound, params);
    try {
      await waitForLock('%FROM "HarborFacilityGrant"%FOR NO KEY UPDATE%');
      await delay(Math.max(0, expiresAt.getTime() - Date.now()) + 35);
    } finally {
      release.open();
      await blocker;
    }
    assert.equal(await waiting, null);
    assert.equal(await prisma.harborAssistanceSession.count({ where: { grantId: g.id } }), 0);
  });

  await t.test("a start waits for committed grant revocation and leaves no new session", async () => {
    const [bound, approver] = await Promise.all([tokenFor(staff), tokenFor(revoker)]);
    const g = await grant();
    const held = gate();
    const release = gate();
    const revoke = transaction(async (tx) => {
      const result = await recordHarborAssistanceGrantRevocation(tx, approver, { ...intent(g.id), staffId: staff.id });
      held.open();
      await release.ready;
      return result;
    });
    await held.ready;
    const waiting = start(bound, intent(g.id));
    try {
      await waitForLock('%FROM "PlatformStaff"%FOR NO KEY UPDATE%');
    } finally {
      release.open();
    }
    assert.equal(await revoke, true);
    assert.equal(await waiting, null);
    assert.equal(await prisma.harborAssistanceSession.count({ where: { grantId: g.id } }), 0);
  });

  await t.test("Harbor logout ends only the signed login, including a start racing the logout", async () => {
    const [bound, independent, withoutSessions] = await Promise.all([tokenFor(staff), tokenFor(staff), tokenFor(staff)]);
    const g = await grant();
    const before = await start(independent, intent(g.id));
    assert.ok(before);
    const held = gate();
    const release = gate();
    const firstStart = transaction(async (tx) => {
      const id = await startHarborAssistanceSession(tx, bound, intent(g.id));
      held.open();
      await release.ready;
      return id;
    });
    await held.ready;
    const logoutWaiting = signOut(bound, "; ltc_session=unmodified-customer-fixture");
    try {
      await waitForLock('%FROM "PlatformStaff"%FOR NO KEY UPDATE%');
    } finally {
      release.open();
    }
    const [id, response] = await Promise.all([firstStart, logoutWaiting]);
    assert.ok(id);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), origin + "/console/login");
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /ltc_session=/);
    assert.equal(await resolve(bound, { ...intent(g.id), sessionId: id }), null);
    assert.equal(await start(bound, intent(g.id)), null);
    assert.equal(await signOut(bound).then((r) => r.status), 303);
    assert.equal(await signOut(withoutSessions).then((r) => r.status), 303);
    assert.equal(await start(withoutSessions, intent(g.id)), null);
    assert.ok(await resolve(independent, { ...intent(g.id), sessionId: before }));
    assert.equal((await prisma.harborAssistanceSession.findUniqueOrThrow({ where: { id } })).endReason, "HARBOR_LOGOUT");
    assert.equal(await prisma.harborAuditEvent.count({ where: { staffId: staff.id, action: "ASSISTANCE_LOGIN_END" } }), 2);
  });

  await t.test("logout holding the staff lock blocks and then denies a concurrent start", async () => {
    const bound = await tokenFor(staff);
    const g = await grant();
    const held = gate();
    const release = gate();
    // Hold only the audit write so the actual logout handler acquires its staff lock first.
    const blocker = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "HarborAuditEvent" IN SHARE MODE`;
      held.open();
      await release.ready;
    });
    await held.ready;
    const pendingLogout = signOut(bound);
    let pendingStart: Promise<string | null> | undefined;
    try {
      await waitForLock('%INSERT INTO%"HarborAuditEvent"%');
      pendingStart = start(bound, intent(g.id));
      await waitForLock('%FROM "PlatformStaff"%FOR NO KEY UPDATE%');
    } finally {
      release.open();
      await blocker;
    }
    assert.equal((await pendingLogout).status, 303);
    assert.equal(await pendingStart, null);
    assert.equal(await prisma.harborAssistanceSession.count({ where: { grantId: g.id } }), 0);
  });

  await t.test("a database audit rejection rolls back the session and a revoked grant", async () => {
    const [bound, approver] = await Promise.all([tokenFor(staff), tokenFor(revoker)]);
    const g = await grant();
    const params = intent(g.id);
    await prisma.$executeRaw`
      CREATE FUNCTION harbor_assistance_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF current_setting('harbor.assistance_test_reject_audit', true) = 'on' THEN
            RAISE EXCEPTION 'synthetic audit rejection';
          END IF;
          RETURN NEW;
        END;
      $$
    `;
    try {
      await prisma.$executeRaw`
        CREATE TRIGGER harbor_assistance_test_audit BEFORE INSERT ON "HarborAuditEvent"
          FOR EACH ROW EXECUTE FUNCTION harbor_assistance_test_reject_audit()
      `;
      await assert.rejects(transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('harbor.assistance_test_reject_audit', 'on', true)`;
        return startHarborAssistanceSession(tx, bound, params);
      }), /synthetic audit rejection/);
      assert.equal(await prisma.harborAssistanceSession.count({ where: { grantId: g.id } }), 0);
      const id = await start(bound, params);
      assert.ok(id);
      await assert.rejects(transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('harbor.assistance_test_reject_audit', 'on', true)`;
        return recordHarborAssistanceGrantRevocation(tx, approver, { ...params, staffId: staff.id });
      }), /synthetic audit rejection/);
      assert.equal((await prisma.harborFacilityGrant.findUniqueOrThrow({ where: { id: g.id } })).revokedAt, null);
      assert.ok(await resolve(bound, { ...params, sessionId: id }));
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS harbor_assistance_test_audit ON "HarborAuditEvent"`;
      await prisma.$executeRaw`DROP FUNCTION harbor_assistance_test_reject_audit()`;
    }
  });

  await t.test("SQL rejects malformed operation scope, intervals and partial terminal state", async () => {
    const g = await grant();
    await assert.rejects(prisma.harborFacilityGrant.update({
      where: { id: g.id }, data: { operations: { set: [] } },
    }), /HarborFacilityGrant_scope/);
    await assert.rejects(prisma.harborFacilityGrant.update({
      where: { id: g.id }, data: { expiresAt: g.startsAt },
    }), /HarborFacilityGrant_interval/);
    await assert.rejects(prisma.harborFacilityGrant.update({
      where: { id: g.id }, data: { revokedAt: new Date() },
    }), /HarborFacilityGrant_revocation/);
    const id = await start(await tokenFor(staff), intent(g.id));
    assert.ok(id);
    await assert.rejects(prisma.harborAssistanceSession.update({
      where: { id }, data: { endReason: "STAFF_EXIT" },
    }), /HarborAssistanceSession_end/);
  });
});
