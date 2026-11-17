import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { GET as getReviewerAudit } from "@/app/api/console/assistance/audit/route";
import { createSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import {
  approveAssistanceGrant, endPilotAssistance, loadPilotStructure, prunePilotAudit, readPilotAudit, recordAssistanceConsent,
  revokePilotAssistance, switchAssistanceContext, withdrawAssistanceConsent,
} from "./assistance-governance";
import { endBrowserAssistanceLogin, readBoundLogin, recordHarborAssistanceGrantRevocation, withHarborAssistanceTransaction } from "./assistance-store";
import { ASSISTANCE_AUDIT } from "./assistance-pilot";
import { createHarborSessionToken, HARBOR_JWT_CLOCK_TOLERANCE_SECONDS, HARBOR_SESSION_COOKIE } from "./session";

const url = process.env.VERIFY_DATABASE_URL;

function barrier() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function waitForStaffLock() {
  for (let i = 0; i < 80; i++) {
    const [row] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND wait_event_type = 'Lock' AND query LIKE '%FROM "PlatformStaff"%FOR NO KEY UPDATE%') AS waiting
    `;
    if (row.waiting) return;
    await delay(20);
  }
  assert.fail("expected read waiting for staff lock");
}

test("Phase 1B.3 synthetic A/B authority, read-only structure, and durable logout", {
  skip: !url && "set VERIFY_DATABASE_URL to migrated disposable PostgreSQL",
}, async (t) => {
  assertDisposableDatabaseUrl(url);
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET ??= "synthetic-assistance-sql";
  const marker = randomUUID().replaceAll("-", "");
  const org = await prisma.organization.create({ data: { name: marker } });
  const facility = (name: string) => prisma.facility.create({ data: { organizationId: org.id, displayName: name } });
  const [a, b] = await Promise.all([facility("Synthetic A"), facility("Synthetic B")]);
  const staff = (label: string, role = "MEMBER" as "MEMBER" | "OWNER") => prisma.platformStaff.create({
    data: { email: `${label}-${marker}@example.invalid`, displayName: label, passwordHash: "unused", role },
  });
  const [viewer, approver, revoker, reviewer, unrelated] = await Promise.all([
    staff("viewer"), staff("approver", "OWNER"), staff("revoker", "OWNER"), staff("reviewer"), staff("unrelated", "OWNER"),
  ]);
  const staffIds = [viewer.id, approver.id, revoker.id, reviewer.id, unrelated.id];
  const facilityIds = [a.id, b.id];
  const role = await prisma.role.upsert({ where: { key: "FACILITY_ADMINISTRATOR" }, update: {},
    create: { key: "FACILITY_ADMINISTRATOR", name: "Facility Administrator" } });
  const admins = await Promise.all([a, b].map((item, i) => prisma.user.create({ data: {
    email: `admin${i}-${marker}@example.invalid`, displayName: "Synthetic admin", facilityId: item.id,
    roleId: role.id, emailVerifiedAt: new Date(),
    facilityAccesses: { create: { facilityId: item.id, rolePeriods: { create: {
      startsAt: new Date("2020-01-01Z"), roleKey: "FACILITY_ADMINISTRATOR",
    } } } },
  } })));
  let guardInstalled = false;
  t.after(async () => {
    if (guardInstalled) {
      for (const table of ["Facility", "Unit", "UnitSpace", "FacilityRoomType", "UnitDepartmentResponsibility", "UnitSpaceResponsibility"]) {
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS harbor_b3_customer_guard ON "${table}"`);
      }
    }
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS harbor_b3_customer_guard()`;
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS harbor_b3_fail_audit ON "HarborAuditEvent"`;
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS harbor_b3_fail_audit()`;
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS harbor_b3_fail_consent_audit ON "HarborAssistanceConsentAuditEvent"`;
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS harbor_b3_fail_consent_audit()`;
    await prisma.harborAssistanceConsentAuditEvent.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await prisma.harborAssistanceSession.deleteMany({ where: { grant: { staffId: { in: staffIds } } } });
    await prisma.harborFacilityGrant.deleteMany({ where: { staffId: { in: staffIds } } });
    await prisma.harborAssistanceConsent.deleteMany({ where: { staffId: { in: staffIds } } });
    await prisma.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.userFacilityRolePeriod.deleteMany({ where: { userFacilityAccess: { facilityId: { in: facilityIds } } } });
    await prisma.userFacilityAccess.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: admins.map((u) => u.id) } } });
    await prisma.unit.deleteMany({ where: { facilityId: { in: facilityIds } } });
    await prisma.facility.deleteMany({ where: { id: { in: facilityIds } } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  });
  const pilot = {
    facilities: new Set(facilityIds), staff: new Set(staffIds), viewers: new Set([viewer.id, approver.id]),
    approvers: new Set([approver.id]), revokers: new Set([revoker.id]), reviewers: new Set([reviewer.id]),
  };
  const staffToken = (s: typeof viewer, bound = true) => createHarborSessionToken({
    uid: s.id, email: s.email, name: s.displayName, staffRole: s.role, sessionVersion: s.sessionVersion,
  }, bound ? { bindAssistance: true } : undefined);
  const [v, separateLogin, approving, revoking, reviewing, unrelatedToken, unbound] = await Promise.all([
    staffToken(viewer), staffToken(viewer), staffToken(approver), staffToken(revoker), staffToken(reviewer),
    staffToken(unrelated), staffToken(viewer, false),
  ]);
  const [adminA, adminB] = await Promise.all(admins.map((u, i) => createSessionToken({
    uid: u.id, email: u.email, name: u.displayName, role: "FACILITY_ADMINISTRATOR", sessionVersion: u.sessionVersion,
    facilityId: facilityIds[i],
  })));
  const unit = (facilityId: string, name: string, hierarchyRole: "BUILDING" | "FLOOR" | "NEIGHBORHOOD" | "STAGED" | null,
    parentUnitId: string | null = null, displayOrder = 100) => prisma.unit.create({ data: {
    facilityId, name, hierarchyRole, parentUnitId, displayOrder, unitType: "OTHER", description: "Excluded unit description",
  } });
  const building = await unit(a.id, "Building A", "BUILDING", null, 20);
  const root = await unit(a.id, "Root floor A", "FLOOR", null, 10);
  const floor = await unit(a.id, "Floor A", "FLOOR", building.id);
  const neighborhood = await unit(a.id, "Neighborhood A", "NEIGHBORHOOD", floor.id);
  const foreignFloor = await unit(b.id, "Foreign floor", "FLOOR");
  await unit(a.id, "Cross facility branch", "FLOOR", foreignFloor.id);
  await unit(a.id, "staged", "STAGED");
  await unit(a.id, "legacy", null);
  type SpaceKind = "STORAGE" | "RESTROOM" | "PATIENT_ROOM" | "OTHER";
  const space = (facilityId: string, unitId: string | null, name: string, spaceType: SpaceKind,
    parentSpaceId: string | null = null) => prisma.unitSpace.create({ data: {
    facilityId, unitId, name, spaceType, parentSpaceId, description: "Excluded room note", code: "PRIVATE", roomNumber: "999",
  } });
  const unlinked = await space(a.id, neighborhood.id, "Shared name", "STORAGE");
  await space(a.id, neighborhood.id, "Nested restroom", "RESTROOM", unlinked.id);
  const patient = await space(a.id, neighborhood.id, "Patient hidden", "PATIENT_ROOM");
  await space(a.id, neighborhood.id, "Nested private restroom", "RESTROOM", patient.id);
  await space(a.id, root.id, "Wrong unit child", "RESTROOM", unlinked.id);
  await space(a.id, null, "Undesignated", "STORAGE");
  await space(b.id, foreignFloor.id, "Shared name", "STORAGE");
  await space(b.id, neighborhood.id, "Foreign canary", "STORAGE");

  async function snapshot() {
    const queries = [
      prisma.facility.findMany({ where: { id: { in: facilityIds } }, orderBy: { id: "asc" } }),
      prisma.unit.findMany({ where: { facilityId: { in: facilityIds } }, orderBy: { id: "asc" } }),
      prisma.unitSpace.findMany({ where: { facilityId: { in: facilityIds } }, orderBy: { id: "asc" } }),
      prisma.facilityRoomType.findMany({ where: { facilityId: { in: facilityIds } }, orderBy: { id: "asc" } }),
      prisma.unitDepartmentResponsibility.findMany({ where: { unit: { facilityId: { in: facilityIds } } }, orderBy: { id: "asc" } }),
      prisma.unitSpaceResponsibility.findMany({ where: { space: { facilityId: { in: facilityIds } } }, orderBy: { id: "asc" } }),
    ];
    return await Promise.all(queries);
  }
  const before = await snapshot();
  // Limit the triggers to these fixtures so parallel Verify suites can still use their own facilities.
  for (const id of facilityIds) assert.match(id, /^[a-z0-9]+$/);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION harbor_b3_customer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE row_data jsonb; scope text;
    BEGIN
      FOREACH row_data IN ARRAY ARRAY[to_jsonb(OLD),to_jsonb(NEW)] LOOP
        scope := row_data->>'facilityId';
        IF TG_TABLE_NAME = 'Facility' THEN scope := row_data->>'id'; END IF;
        IF TG_TABLE_NAME = 'UnitDepartmentResponsibility' THEN
          SELECT "facilityId" INTO scope FROM "Unit" WHERE id = row_data->>'unitId';
        END IF;
        IF TG_TABLE_NAME = 'UnitSpaceResponsibility' THEN
          SELECT "facilityId" INTO scope FROM "UnitSpace" WHERE id = row_data->>'spaceId';
        END IF;
        IF scope IN ('${a.id}', '${b.id}') THEN RAISE EXCEPTION 'synthetic customer write denied'; END IF;
      END LOOP;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $$`);
  guardInstalled = true;
  for (const table of ["Facility", "Unit", "UnitSpace", "FacilityRoomType", "UnitDepartmentResponsibility", "UnitSpaceResponsibility"]) {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER harbor_b3_customer_guard BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION harbor_b3_customer_guard()`);
  }
  await assert.rejects(prisma.unitSpace.update({ where: { id: unlinked.id }, data: { name: "Changed" } }), /synthetic customer write denied/);

  const requestA = { facilityId: a.id, staffId: viewer.id, minutes: 1440, requestId: randomUUID() };
  const [consentA, ...consentRetries] = await Promise.all(Array.from({ length: 5 }, () =>
    recordAssistanceConsent(pilot, adminA, requestA)));
  assert.ok(consentA);
  assert.deepEqual(consentRetries, Array(4).fill(consentA));
  assert.equal(await prisma.harborAssistanceConsent.count({ where: { requestId: requestA.requestId } }), 1);
  assert.equal(await prisma.harborAssistanceConsentAuditEvent.count({ where: { consentId: consentA } }), 1);
  assert.equal(await recordAssistanceConsent(pilot, adminA, { ...requestA, minutes: 30 }), null);
  assert.equal(await recordAssistanceConsent(pilot, adminA, { ...requestA, staffId: approver.id }), null);
  assert.equal(await recordAssistanceConsent(pilot, adminB, { ...requestA, facilityId: b.id }), null);
  assert.equal(await recordAssistanceConsent(pilot, adminA, { ...requestA, facilityId: b.id }), null);
  assert.equal(await recordAssistanceConsent(pilot, v, requestA), null);
  assert.equal(await recordAssistanceConsent(pilot, adminA, { ...requestA, minutes: 1441 }), null);
  const selfConsent = await recordAssistanceConsent(pilot, adminA, {
    ...requestA, staffId: approver.id, minutes: 30, requestId: randomUUID(),
  });
  assert.ok(selfConsent);
  assert.equal(await approveAssistanceGrant(pilot, approving, { facilityId: a.id, staffId: approver.id, consentId: selfConsent }), null);
  const evidenceA = { facilityId: a.id, staffId: viewer.id, consentId: consentA };
  assert.equal(await approveAssistanceGrant(pilot, revoking, evidenceA), null);
  assert.equal(await approveAssistanceGrant(pilot, approving, { ...evidenceA, facilityId: b.id }), null);
  const grantA = await approveAssistanceGrant(pilot, approving, evidenceA);
  assert.ok(grantA);
  const publishedGrant = await prisma.harborFacilityGrant.findUniqueOrThrow({ where: { id: grantA } });
  assert.ok(publishedGrant.expiresAt.getTime() - publishedGrant.approvedAt.getTime() <= 24 * 60 * 60_000);
  const scopeA = { facilityId: a.id, grantId: grantA };
  const refA = randomUUID();
  for (const credential of [adminA, unrelatedToken, unbound]) {
    assert.equal(await switchAssistanceContext(pilot, credential, { ...scopeA, requestId: refA }), false);
  }
  assert.equal(await switchAssistanceContext(pilot, v, { ...scopeA, facilityId: b.id, requestId: refA }), false);
  assert.equal(await switchAssistanceContext(pilot, v, { ...scopeA, requestId: refA }), true);
  assert.equal(await switchAssistanceContext(pilot, v, { ...scopeA, requestId: refA }), true);
  const liveSession = await prisma.harborAssistanceSession.findFirstOrThrow({ where: { grantId: grantA, requestId: refA } });
  assert.ok(liveSession.expiresAt.getTime() - liveSession.startedAt.getTime() <= 30 * 60_000);
  assert.deepEqual(await loadPilotStructure(pilot, v, refA), { facilityName: "Synthetic A", units: [
    { name: "Root floor A", kind: "Floor", units: [], spaces: [] },
    { name: "Building A", kind: "Building", spaces: [], units: [
      { name: "Floor A", kind: "Floor", spaces: [], units: [
        { name: "Neighborhood A", kind: "Neighborhood", units: [], spaces: [
          { name: "Shared name", type: "Storage", spaces: [{ name: "Nested restroom", type: "Restroom", spaces: [] }] },
        ] },
      ] },
    ] },
  ] });
  assert.equal(await loadPilotStructure(pilot, separateLogin, refA), null);
  assert.equal(await loadPilotStructure(pilot, v, randomUUID()), null);
  assert.equal(await readPilotAudit(pilot, approving), null);
  const audit = await readPilotAudit(pilot, reviewing);
  assert.ok(Array.isArray(audit));
  assert.ok(audit.some((event) => event.action === "ASSISTANCE_READ" && event.staffId === viewer.id &&
    event.facilityId === a.id && event.assistance?.grantId === grantA && event.assistance?.sessionId === liveSession.id &&
    event.assistance?.operation === "FACILITY_STRUCTURE_READ" && event.assistance.requestKey));
  assert.ok(audit.some((event) => event.action === "ASSISTANCE_READ_DENIED" && event.facilityId === null &&
    event.assistance?.grantId === null && event.assistance?.sessionId === null));
  assert.ok(audit.some((event) => event.action === "ASSISTANCE_CONSENT_RECORDED" && event.staffId === null &&
    event.administratorId === admins[0].id && event.subjectStaffId === viewer.id && event.facilityId === a.id &&
    event.assistance?.consentId === consentA && event.assistance.grantId === null &&
    event.assistance.sessionIds.length === 0));

  await prisma.$executeRawUnsafe(`CREATE FUNCTION harbor_b3_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."staffId" = '${viewer.id}' AND NEW."action"::text = 'ASSISTANCE_READ'
    THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRaw`CREATE TRIGGER harbor_b3_fail_audit BEFORE INSERT ON "HarborAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION harbor_b3_fail_audit()`;
  await assert.rejects(loadPilotStructure(pilot, v, refA), /synthetic audit failure/);
  await prisma.$executeRaw`DROP TRIGGER harbor_b3_fail_audit ON "HarborAuditEvent"`;

  const requestB = { facilityId: b.id, staffId: viewer.id, minutes: 60, requestId: randomUUID() };
  const consentB = await recordAssistanceConsent(pilot, adminB, requestB);
  assert.ok(consentB);
  const evidenceB = { facilityId: b.id, staffId: viewer.id, consentId: consentB };
  const grantB = await approveAssistanceGrant(pilot, approving, evidenceB);
  assert.ok(grantB);
  const refs = [randomUUID(), randomUUID()];
  const switches = await Promise.all(refs.map((requestId) => switchAssistanceContext(pilot, v, {
    facilityId: b.id, grantId: grantB, requestId, switchFrom: refA,
  })));
  assert.equal(switches.filter(Boolean).length, 1);
  const refB = refs[switches.indexOf(true)];
  assert.equal(await loadPilotStructure(pilot, v, refA), null);
  assert.equal((await loadPilotStructure(pilot, v, refB))?.facilityName, "Synthetic B");
  assert.equal(await switchAssistanceContext(pilot, separateLogin, {
    facilityId: b.id, grantId: grantB, requestId: randomUUID(),
  }), true);

  // Transfer the synthetic seat so the consenting and withdrawing actors differ.
  const replacement = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.userFacilityRolePeriod.updateMany({
      where: { userFacilityAccess: { facilityId: b.id, userId: admins[1].id }, endsAt: null },
      data: { endsAt: now },
    });
    return tx.user.create({ data: {
      email: `replacement-${marker}@example.invalid`, displayName: "Replacement administrator",
      facilityId: b.id, roleId: role.id, emailVerifiedAt: now,
      facilityAccesses: { create: { facilityId: b.id, rolePeriods: { create: {
        startsAt: now, roleKey: "FACILITY_ADMINISTRATOR",
      } } } },
    } });
  });
  admins.push(replacement);
  const withdrawing = await createSessionToken({
    uid: replacement.id, email: replacement.email, name: replacement.displayName,
    role: "FACILITY_ADMINISTRATOR", sessionVersion: replacement.sessionVersion, facilityId: b.id,
  });
  assert.equal(await recordAssistanceConsent(pilot, withdrawing, requestB), null);
  assert.equal(await withdrawAssistanceConsent(pilot, adminA, evidenceB), false);
  assert.equal(await withdrawAssistanceConsent(pilot, adminB, evidenceB), false);
  const beforeWithdrawal = {
    consent: await prisma.harborAssistanceConsent.findUniqueOrThrow({ where: { id: consentB } }),
    grant: await prisma.harborFacilityGrant.findUniqueOrThrow({ where: { id: grantB } }),
    sessions: await prisma.harborAssistanceSession.findMany({ where: { grantId: grantB }, orderBy: { id: "asc" } }),
  };
  assert.equal(beforeWithdrawal.sessions.length, 2);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION harbor_b3_fail_consent_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."consentId" = '${consentB}' AND NEW."action"::text = 'ASSISTANCE_CONSENT_WITHDRAWN'
    THEN RAISE EXCEPTION 'synthetic withdrawal audit failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRaw`CREATE TRIGGER harbor_b3_fail_consent_audit BEFORE INSERT ON "HarborAssistanceConsentAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION harbor_b3_fail_consent_audit()`;
  await assert.rejects(withdrawAssistanceConsent(pilot, withdrawing, evidenceB), /synthetic withdrawal audit failure/);
  assert.deepEqual(await prisma.harborAssistanceConsent.findUniqueOrThrow({ where: { id: consentB } }), beforeWithdrawal.consent);
  assert.deepEqual(await prisma.harborFacilityGrant.findUniqueOrThrow({ where: { id: grantB } }), beforeWithdrawal.grant);
  assert.deepEqual(await prisma.harborAssistanceSession.findMany({
    where: { grantId: grantB }, orderBy: { id: "asc" },
  }), beforeWithdrawal.sessions);
  assert.equal(await prisma.harborAssistanceConsentAuditEvent.count({
    where: { consentId: consentB, action: "ASSISTANCE_CONSENT_WITHDRAWN" },
  }), 0);
  assert.equal((await loadPilotStructure(pilot, v, refB))?.facilityName, "Synthetic B");
  await prisma.$executeRaw`DROP TRIGGER harbor_b3_fail_consent_audit ON "HarborAssistanceConsentAuditEvent"`;

  assert.equal(await withdrawAssistanceConsent(pilot, withdrawing, evidenceB), true);
  assert.equal(await withdrawAssistanceConsent(pilot, withdrawing, evidenceB), true);
  assert.equal(await loadPilotStructure(pilot, v, refB), null);
  assert.equal(await approveAssistanceGrant(pilot, approving, evidenceB), null);
  const withdrawnGrant = await prisma.harborFacilityGrant.findUniqueOrThrow({ where: { id: grantB } });
  assert.equal(withdrawnGrant.revokedByUserId, replacement.id);
  const withdrawnSessions = await prisma.harborAssistanceSession.findMany({ where: { grantId: grantB } });
  assert.ok(withdrawnSessions.every((session) => session.endedByUserId === replacement.id &&
    session.endReason === "CONSENT_WITHDRAWN" && session.endedAt?.getTime() === withdrawnGrant.revokedAt?.getTime()));
  const withdrawalHistory = await readPilotAudit(pilot, reviewing);
  assert.ok(Array.isArray(withdrawalHistory));
  const withdrawal = withdrawalHistory.filter((event) => event.action === "ASSISTANCE_CONSENT_WITHDRAWN");
  assert.equal(withdrawal.length, 1);
  assert.equal(withdrawal[0].administratorId, replacement.id);
  assert.equal(withdrawal[0].staffId, null);
  assert.equal(withdrawal[0].subjectStaffId, viewer.id);
  assert.equal(withdrawal[0].facilityId, b.id);
  assert.equal(withdrawal[0].createdAt.getTime(), withdrawnGrant.revokedAt?.getTime());
  assert.equal(withdrawal[0].assistance?.consentId, consentB);
  assert.equal(withdrawal[0].assistance?.grantId, grantB);
  assert.deepEqual(withdrawal[0].assistance?.sessionIds, beforeWithdrawal.sessions.map(({ id }) => id));
  const scopedHistory = await readPilotAudit({ ...pilot, facilities: new Set([a.id]) }, reviewing);
  assert.ok(Array.isArray(scopedHistory) && !scopedHistory.some((event) => event.facilityId === b.id));

  const refAgain = randomUUID();
  assert.equal(await switchAssistanceContext(pilot, v, { ...scopeA, requestId: refAgain }), true);
  assert.equal(await revokePilotAssistance(pilot, approving, { ...scopeA, staffId: viewer.id }), false);
  const held = barrier();
  const commit = barrier();
  const revoke = withHarborAssistanceTransaction(async (tx) => {
    const result = await recordHarborAssistanceGrantRevocation(tx, revoking, { ...scopeA, staffId: viewer.id });
    held.release();
    await commit.wait;
    return result;
  });
  await held.wait;
  const waitingRead = loadPilotStructure(pilot, v, refAgain);
  try {
    await waitForStaffLock();
  } finally {
    commit.release();
  }
  assert.equal(await revoke, true);
  assert.equal(await waitingRead, null);

  assert.equal(await recordAssistanceConsent(pilot, adminA, requestA), consentA);
  assert.equal(await approveAssistanceGrant(pilot, approving, evidenceA), null);
  const liveConsent = await recordAssistanceConsent(pilot, adminA, { ...requestA, minutes: 60, requestId: randomUUID() });
  assert.ok(liveConsent);
  assert.notEqual(liveConsent, consentA);
  const liveGrant = await approveAssistanceGrant(pilot, approving, { ...evidenceA, consentId: liveConsent });
  assert.ok(liveGrant);
  const liveScope = { ...scopeA, grantId: liveGrant };
  const logoutRef = randomUUID();
  assert.equal(await switchAssistanceContext(pilot, v, { ...liveScope, requestId: logoutRef }), true);
  await Promise.all([loadPilotStructure(pilot, v, logoutRef), endBrowserAssistanceLogin(v)]);
  assert.equal(await loadPilotStructure(pilot, v, logoutRef), null);
  const login = await readBoundLogin(v);
  assert.ok(login);
  const receipt = await prisma.harborAssistanceLoginReceipt.findUniqueOrThrow({ where: { loginKey: login.key } });
  assert.equal(receipt.retainUntil.getTime(), login.expiresAt.getTime() + HARBOR_JWT_CLOCK_TOLERANCE_SECONDS * 1000);
  const logoutAudit = await prisma.harborAuditEvent.findFirstOrThrow({
    where: { staffId: viewer.id, action: "ASSISTANCE_LOGIN_END" }, include: { assistance: true },
  });
  assert.ok(logoutAudit.assistance?.loginKey === login.key);
  const reviewHost = "harbor-audit-test.vercel.app";
  const deployedSha = "a".repeat(40);
  const routeEnv = {
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "harbor-1b3-pilot",
    VERCEL_GIT_COMMIT_SHA: deployedSha, VERCEL_BRANCH_URL: reviewHost, VERCEL_URL: "direct-audit-test.vercel.app",
    HARBOR_ASSISTANCE_PREVIEW: "1", HARBOR_ASSISTANCE_APPROVED_COMMIT: deployedSha,
    HARBOR_ASSISTANCE_CUTOFF_UTC: new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    HARBOR_ASSISTANCE_PROTECTED_PREVIEWS: reviewHost, HARBOR_ASSISTANCE_FACILITIES: a.id,
    HARBOR_ASSISTANCE_STAFF: staffIds.filter((id) => id !== unrelated.id).join(","),
    HARBOR_ASSISTANCE_VIEWERS: viewer.id, HARBOR_ASSISTANCE_APPROVERS: approver.id,
    HARBOR_ASSISTANCE_REVOKERS: revoker.id, HARBOR_ASSISTANCE_REVIEWERS: reviewer.id,
  };
  function auditRoute(cookie?: string, search = "") {
    return getReviewerAudit(new NextRequest(`https://${reviewHost}${ASSISTANCE_AUDIT}${search}`, {
      headers: cookie ? { cookie } : {},
    }));
  }
  const staffCookie = (token: string) => `${HARBOR_SESSION_COOKIE}=${token}`;
  const original = Object.fromEntries(Object.keys(routeEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, routeEnv);
  try {
    const auditCounters = () => Promise.all([
      prisma.harborAuditEvent.count({ where: { staffId: { in: staffIds } } }),
      prisma.harborAssistanceConsentAuditEvent.count({ where: { facilityId: { in: facilityIds } } }),
      prisma.harborAssistanceLoginReceipt.count({ where: { loginKey: login.key } }),
    ]);
    const beforeReview = await auditCounters();
    const response = await auditRoute(staffCookie(reviewing));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    const json = await response.text();
    assert.ok(!json.includes(login.key) && !json.includes(v) && !json.includes("loginKey"));
    const { events } = JSON.parse(json) as { events: NonNullable<Awaited<ReturnType<typeof readPilotAudit>>> };
    const recorded = events.find((event) => event.action === "ASSISTANCE_CONSENT_RECORDED");
    assert.equal(recorded?.administratorId, admins[0].id);
    assert.equal(recorded?.facilityId, a.id);
    const approved = events.find((event) => event.action === "ASSISTANCE_GRANT_APPROVE");
    assert.equal(approved?.staffId, approver.id);
    assert.equal(approved?.facilityId, a.id);
    assert.ok(events.every((event) => event.facilityId !== b.id && event.staffId !== unrelated.id));
    assert.deepEqual(events.find((event) => event.id === logoutAudit.id)?.logoutReceipt, {
      exists: true, retainUntil: receipt.retainUntil.toISOString(),
    });
    process.env.HARBOR_ASSISTANCE_FACILITIES = facilityIds.join(",");
    const expanded = await auditRoute(staffCookie(reviewing));
    assert.equal(expanded.status, 200);
    const expandedHistory = await expanded.json() as { events: typeof events };
    const withdrawalEvent = expandedHistory.events.find((event) => event.action === "ASSISTANCE_CONSENT_WITHDRAWN");
    assert.equal(withdrawalEvent?.administratorId, replacement.id);
    assert.equal(withdrawalEvent?.facilityId, b.id);
    assert.equal(withdrawalEvent?.assistance?.grantId, grantB);
    assert.deepEqual(withdrawalEvent?.assistance?.sessionIds, beforeWithdrawal.sessions.map(({ id }) => id));
    for (const cookie of [staffCookie(approving), staffCookie(separateLogin), staffCookie(v), `ltc_session=${adminA}`,
      staffCookie(await staffToken(reviewer, false)), undefined]) {
      const denial = await auditRoute(cookie);
      assert.equal(denial.status, 404);
      assert.match(denial.headers.get("Cache-Control") ?? "", /no-store/);
    }
    assert.equal((await auditRoute(staffCookie(reviewing), "?prune=true")).status, 404);
    const secondReviewerLogin = await staffToken(reviewer);
    await endBrowserAssistanceLogin(secondReviewerLogin);
    assert.equal((await auditRoute(staffCookie(secondReviewerLogin))).status, 404);
    const afterReview = await auditCounters();
    assert.deepEqual(afterReview, [beforeReview[0] + 1, beforeReview[1], beforeReview[2]]);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  await assert.rejects(prisma.harborAssistanceLoginReceipt.delete({ where: { loginKey: login.key } }), /still required/);
  await prisma.harborAuditEvent.updateMany({
    where: { staffId: viewer.id, action: "ASSISTANCE_LOGIN_END" },
    data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60_000) },
  });
  await prisma.harborAssistanceConsentAuditEvent.updateMany({
    where: { consentId: consentB }, data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60_000) },
  });
  assert.equal(await prunePilotAudit(pilot, reviewing), 3);
  assert.equal(await prisma.harborAssistanceAuditDetail.findUnique({ where: { eventId: logoutAudit.id } }), null);
  assert.deepEqual(await prisma.harborAssistanceLoginReceipt.findUnique({ where: { loginKey: login.key } }), receipt);
  assert.equal(await prisma.harborAssistanceConsentAuditEvent.count({ where: { consentId: consentB } }), 0);
  assert.equal((await prisma.harborAssistanceConsent.findUniqueOrThrow({ where: { id: consentB } })).withdrawnByUserId, replacement.id);
  assert.equal(await switchAssistanceContext(pilot, v, { ...liveScope, requestId: randomUUID() }), false);
  assert.equal(await loadPilotStructure(pilot, v, logoutRef), null);

  await endBrowserAssistanceLogin(unrelatedToken);
  const unrelatedLogin = await readBoundLogin(unrelatedToken);
  assert.ok(unrelatedLogin);
  await prisma.platformStaff.delete({ where: { id: unrelated.id } });
  assert.ok(await prisma.harborAssistanceLoginReceipt.findUnique({ where: { loginKey: unrelatedLogin.key } }));
  const independent = randomUUID();
  assert.equal(await switchAssistanceContext(pilot, separateLogin, { ...liveScope, requestId: independent }), true);
  const expiresAt = new Date(Date.now() + 900);
  await prisma.harborAssistanceSession.updateMany({ where: { requestId: independent }, data: { expiresAt } });
  const expiryHeld = barrier();
  const expiryRelease = barrier();
  const holder = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PlatformStaff" WHERE "id" = ${viewer.id} FOR NO KEY UPDATE`;
    expiryHeld.release();
    await expiryRelease.wait;
  });
  await expiryHeld.wait;
  const expiresWhileWaiting = loadPilotStructure(pilot, separateLogin, independent);
  try {
    await waitForStaffLock();
    await delay(Math.max(0, expiresAt.getTime() - Date.now()) + 25);
  } finally {
    expiryRelease.release();
  }
  await holder;
  assert.equal(await expiresWhileWaiting, null);
  assert.equal(await endPilotAssistance(pilot, separateLogin, independent), true);
  assert.equal(await loadPilotStructure(pilot, separateLogin, independent), null);

  const signedExpiry = Math.floor(Date.now() / 1000) + 4;
  const shortToken = await new SignJWT({
    uid: viewer.id, email: viewer.email, name: viewer.displayName, staffRole: viewer.role,
    tokenUse: "harbor", sessionVersion: viewer.sessionVersion,
  }).setJti(randomUUID()).setExpirationTime(signedExpiry).setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const shortLogin = await readBoundLogin(shortToken);
  assert.ok(shortLogin);
  await endBrowserAssistanceLogin(shortToken);
  assert.equal((await prisma.harborAssistanceLoginReceipt.findUniqueOrThrow({
    where: { loginKey: shortLogin.key },
  })).retainUntil.getTime(), signedExpiry * 1000);
  await assert.rejects(prisma.harborAssistanceLoginReceipt.delete({ where: { loginKey: shortLogin.key } }), /still required/);
  await delay(Math.max(0, signedExpiry * 1000 - Date.now()) + 30);
  await prisma.harborAssistanceLoginReceipt.delete({ where: { loginKey: shortLogin.key } });
  assert.equal(await switchAssistanceContext(pilot, shortToken, { ...liveScope, requestId: randomUUID() }), false);
  assert.deepEqual(await snapshot(), before);
  assert.equal((await prisma.unitSpace.findUniqueOrThrow({ where: { id: unlinked.id } })).facilityRoomTypeId, null);
});
