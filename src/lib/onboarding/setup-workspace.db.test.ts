import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { resolveCurrentInternalFacilityRole } from "@/lib/facility-access/internal-facility-role";
import { loadSetupWorkspace } from "./workspace";
import { saveFacilityOnboarding } from "./transitions";
import { acceptSetupManagerInvitation, issueSetupManagerInvitation, deliverSetupManagerInvitation, findSetupManagerInvitation, listSetupManagerInvitations } from "./manager-invitations";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
const skip = !url;
async function run(body: (db: PrismaClient) => Promise<void>) { const db = new PrismaClient({ datasources: { db: { url: url! } } }); try { await body(db); } finally { await db.$disconnect(); } }
async function fixture(db: PrismaClient) {
  const id = randomUUID();
  for (const key of ["FACILITY_ADMINISTRATOR", "MANAGER", "STAFF"] as const) await db.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  const role = await db.role.findUniqueOrThrow({ where: { key: "FACILITY_ADMINISTRATOR" } });
  const org = await db.organization.create({ data: { name: `ONB03 ${id}`, organizationType: "LONG_TERM_CARE" } });
  const facility = await db.facility.create({ data: { displayName: "Known site", organizationId: org.id, timezone: "America/Chicago", onboardingCurrentStep: "facility" } });
  const actor = await db.user.create({ data: { email: `admin-${id}@example.com`, displayName: "Known Administrator", facilityId: facility.id, roleId: role.id, passwordHash: "existing-password", emailVerifiedAt: new Date() } });
  const grant = await db.userFacilityAccess.create({ data: { userId: actor.id, facilityId: facility.id, rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: new Date("2020-01-01") } } } });
  const session = { uid: actor.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", facilityId: facility.id, role: "FACILITY_ADMINISTRATOR", sessionVersion: 0, name: actor.displayName, email: actor.email } as FacilitySession;
  const email = `manager-${id}@example.com`;
  const issue = (retry = false) => issueSetupManagerInvitation(db, session, { expectedFacilityId: facility.id, email, retry });
  const accept = (rawToken: string) => acceptSetupManagerInvitation(db, { rawToken, firstName: "Casey", lastName: "Manager", employmentType: "PART_TIME", passwordHash: "accepted-password" });
  return { org, facility, actor, grant, session, email, issue, accept };
}

test("SQL: prefilled zero-Department workspace is read-only; entry confirmation reuses site/Organization and preserves journey dates", { skip }, () => run(async (db) => {
  const f = await fixture(db), before = await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } });
  const snapshot = await loadSetupWorkspace(db, f.session);
  assert.equal(snapshot.administrator.name, f.actor.displayName); assert.equal(snapshot.facility.displayName, "Known site"); assert.equal(snapshot.facility.timezone, "America/Chicago");
  assert.equal(snapshot.classification.facilityType, "LONG_TERM_CARE"); assert.equal(snapshot.structure.locations, 0); assert.ok(snapshot.catalog.every((p) => !p.installed && !p.licensed));
  assert.deepEqual(await db.facility.findUniqueOrThrow({ where: { id: f.facility.id } }), before);
  const first = await saveFacilityOnboarding(db, { facilityId: f.facility.id, facilityName: "Confirmed site", timezone: "America/Chicago", confirmEntry: true, step: "departments" });
  const second = await saveFacilityOnboarding(db, { facilityId: f.facility.id, facilityName: "Confirmed site", timezone: "America/Chicago", confirmEntry: true });
  assert.deepEqual(second.onboardingEntryConfirmedAt, first.onboardingEntryConfirmedAt);
  assert.equal(await db.facility.count({ where: { organizationId: f.org.id } }), 1);
  assert.equal(await db.organization.count({ where: { id: f.org.id } }), 1);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
}));

test("SQL: real invitation intent and delivery/retry states grant nothing; retry rotates tokens and preserves legacy notice history", { skip }, () => run(async (db) => {
  const f = await fixture(db), historical = new Date("2025-01-01");
  await db.onboardingManagerInvite.create({ data: { facilityId: f.facility.id, email: f.email, acceptedAt: historical } });
  assert.equal((await listSetupManagerInvitations(db, f.facility.id))[0]!.state, "LEGACY_NOTICE");
  const first = await f.issue();
  assert.equal((await deliverSetupManagerInvitation(db, { ...first, origin: "https://test.example" }, { configured: () => false })).deliveryStatus, "NOT_CONFIGURED");
  assert.equal((await listSetupManagerInvitations(db, f.facility.id))[0]!.state, "DELIVERY_NOT_CONFIGURED");
  const second = await f.issue(true);
  await deliverSetupManagerInvitation(db, { ...second, origin: "https://test.example" }, { configured: () => true, send: async () => ({ sent: false, reason: "send_failed", error: "injected" }) });
  assert.equal((await listSetupManagerInvitations(db, f.facility.id))[0]!.state, "DELIVERY_FAILED");
  const third = await f.issue(true); let deliveredUrl = "";
  await deliverSetupManagerInvitation(db, { ...third, origin: "https://test.example" }, { configured: () => true, send: async (input) => { deliveredUrl = input.inviteUrl; return { sent: true, messageId: "test" }; } });
  assert.equal(new URL(deliveredUrl).searchParams.get("token"), third.rawToken); assert.equal(new URL(deliveredUrl).searchParams.get("kind"), "manager");
  assert.equal((await listSetupManagerInvitations(db, f.facility.id))[0]!.state, "PENDING");
  assert.equal(await findSetupManagerInvitation(db, first.rawToken), null); assert.equal(await findSetupManagerInvitation(db, second.rawToken), null);
  const row = await db.onboardingManagerInvite.findUniqueOrThrow({ where: { id: third.id } });
  assert.deepEqual(row.acceptedAt, historical); assert.equal(row.grantAcceptedAt, null); assert.notEqual(row.tokenHash, third.rawToken);
  assert.equal(await db.user.count({ where: { email: f.email } }), 0); assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 0);
  assert.equal(await db.userFacilityAccess.count({ where: { facilityId: f.facility.id } }), 1);
  assert.ok(!JSON.stringify(await listSetupManagerInvitations(db, f.facility.id)).includes(third.rawToken));
}));

test("SQL: explicit acceptance creates one canonical Manager Employee and role grant; duplicate acceptance cannot replay", { skip }, () => run(async (db) => {
  const f = await fixture(db), invitation = await f.issue(), result = await f.accept(invitation.rawToken);
  const employee = await db.employee.findUniqueOrThrow({ where: { id: result.employeeId } });
  assert.equal(employee.userId, result.userId); assert.equal(employee.roleType, "MANAGER"); assert.equal(employee.employmentType, "PART_TIME"); assert.equal(employee.pinDigest, null);
  assert.equal((await resolveCurrentInternalFacilityRole(db, { userId: result.userId, facilityId: f.facility.id }))?.roleKey, "MANAGER");
  assert.equal((await listSetupManagerInvitations(db, f.facility.id))[0]!.state, "ACCEPTED");
  await assert.rejects(() => f.accept(invitation.rawToken), /invalid|accepted/);
  assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 1);
  assert.equal(await db.department.count({ where: { facilityId: f.facility.id } }), 0);
}));

test("SQL: existing-account acceptance requires the matching authenticated identity and preserves global/home-Facility facts", { skip }, () => run(async (db) => {
  const f = await fixture(db), other = await fixture(db);
  const user = await db.user.update({ where: { id: other.actor.id }, data: { email: f.email } });
  const before = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const invitation = await f.issue();
  await assert.rejects(() => f.accept(invitation.rawToken), /Sign in/);
  await assert.rejects(() => acceptSetupManagerInvitation(db, { rawToken: invitation.rawToken, authenticatedUserId: f.actor.id, firstName: "Existing", lastName: "Manager", employmentType: "FULL_TIME" }), /invited/);
  const accepted = await acceptSetupManagerInvitation(db, { rawToken: invitation.rawToken, authenticatedUserId: user.id, firstName: "Existing", lastName: "Manager", employmentType: "FULL_TIME" });
  assert.equal(accepted.userId, user.id); assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: user.id } }), before);
  assert.equal((await resolveCurrentInternalFacilityRole(db, { userId: user.id, facilityId: other.facility.id }))?.roleKey, "FACILITY_ADMINISTRATOR");
  assert.equal((await resolveCurrentInternalFacilityRole(db, { userId: user.id, facilityId: f.facility.id }))?.roleKey, "MANAGER");
}));

test("SQL: revoked inviter, expired token, wrong Facility and denied actor cannot authorize a grant", { skip }, () => run(async (db) => {
  const f = await fixture(db), invitation = await f.issue();
  await db.userFacilityAccess.update({ where: { id: f.grant.id }, data: { isActive: false, revokedAt: new Date() } });
  await assert.rejects(() => f.accept(invitation.rawToken), /Administrator/);
  assert.equal(await db.user.count({ where: { email: f.email } }), 0);
  const other = await fixture(db);
  await assert.rejects(() => issueSetupManagerInvitation(db, other.session, { expectedFacilityId: f.facility.id, email: f.email }), /Facility changed/);
  const expired = await other.issue();
  await db.onboardingManagerInvite.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
  await assert.rejects(() => other.accept(expired.rawToken), /expired/);
  for (const patch of [{ role: "MANAGER" }, { authKind: "harbor_staff" }, { authMethod: "QUICK_PIN" }]) await assert.rejects(() => issueSetupManagerInvitation(db, { ...other.session, ...patch } as FacilitySession, { expectedFacilityId: other.facility.id, email: other.email }));
}));

test("SQL: existing/revoked access and terminated Employee cannot be reactivated or promoted by invitation", { skip }, () => run(async (db) => {
  const f = await fixture(db), other = await fixture(db);
  await db.user.update({ where: { id: other.actor.id }, data: { email: f.email } });
  await db.userFacilityAccess.create({ data: { userId: other.actor.id, facilityId: f.facility.id, isActive: false, revokedAt: new Date() } });
  await assert.rejects(() => f.issue(), /historical access/);
  const g = await fixture(db), invite = await g.issue();
  await db.employee.create({ data: { facilityId: g.facility.id, email: g.email, firstName: "Terminated", lastName: "Person", roleType: "STAFF", status: "TERMINATED", terminationDate: new Date("2025-01-01") } });
  await assert.rejects(() => g.accept(invite.rawToken), /lifecycle/);
  assert.equal(await db.user.count({ where: { email: g.email } }), 0);
}));

test("SQL: acceptance fault rolls back identity, Employee, access and receipt; clean retry succeeds", { skip }, () => run(async (db) => {
  const f = await fixture(db), invite = await f.issue();
  const faulty = db.$extends({ query: { onboardingManagerInvite: { async update() { throw new Error("receipt fault"); } } } }) as unknown as PrismaClient;
  await assert.rejects(() => acceptSetupManagerInvitation(faulty, { rawToken: invite.rawToken, firstName: "Casey", lastName: "Manager", employmentType: "FULL_TIME", passwordHash: "test" }), /receipt fault/);
  assert.equal(await db.user.count({ where: { email: f.email } }), 0); assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 0);
  await f.accept(invite.rawToken); assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 1);
}));

test("SQL: concurrent acceptance creates at most one canonical Employee/grant and accepts once", { skip }, () => run(async (db) => {
  const f = await fixture(db), invite = await f.issue();
  const results = await Promise.allSettled([f.accept(invite.rawToken), f.accept(invite.rawToken)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 1);
  assert.equal(await db.user.count({ where: { email: f.email } }), 1);
}));
