import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { bootstrapFacilityCustomer } from "@/lib/facility-provisioning/bootstrap";
import { createHarborSessionToken, verifyHarborSessionToken } from "./session";
import { loadHarborAssignedImplementation, loadHarborCustomerDirectoryPage, listHarborFacilities } from "./queries";
import { implementationWorkWhere } from "@/lib/implementation/work-queue";
import {
  requestEngagement, assignEngagement, getEngagement, issueQuote, approveQuote,
  recordDelivery, reviewHandoff, acceptHandoff,
} from "@/lib/implementation/service";
import { STAGES } from "@/lib/implementation/contract";
import type { Actor } from "@/lib/implementation/authority";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
process.env.AUTH_SECRET ||= "local-disposable-assigned-work";

test("SQL assigned Implementation: live responsibility, full counts, composed pages, reassignment and acceptance", { skip: !url }, async () => {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    for (const missing of [undefined, "", " "]) {
      assert.throws(() => implementationWorkWhere("assigned", missing), /staff identity/);
    }
    const prefix = `Assigned ${randomUUID()}`;
    const f = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
      organization: { mode: "create", facilityName: `${prefix} Z00` },
      facility: { displayName: `${prefix} Z00`, billingEmail: `assigned-${randomUUID()}@example.invalid`, timezone: "America/New_York" },
      administrator: { mode: "create", email: `assigned-admin-${randomUUID()}@example.invalid`, displayName: "Synthetic Administrator", passwordHash: "unused-fixture", emailVerifiedAt: new Date() },
    }));
    const facilities = [f.facility.id];
    async function facility(name: string) {
      const next = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
        organization: { mode: "existing", organizationId: f.organization.id },
        facility: { displayName: name, billingEmail: f.user.email, timezone: "America/New_York" },
        administrator: { mode: "reuse", userId: f.user.id },
      }));
      return next.facility.id;
    }
    for (let i = 1; i < 27; i++) facilities.push(await facility(`${prefix} Z${String(i).padStart(2, "0")}`));
    const outside = await facility(`${prefix} C Other`);
    await db.facility.createMany({ data: Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(), organizationId: f.organization.id, displayName: `${prefix} A${String(i).padStart(3, "0")}`,
    })) });
    assert.equal((await listHarborFacilities(db, prefix)).some(row => facilities.includes(row.id)), false);
    async function customer(facilityId: string): Promise<Actor> {
      const user = await db.user.findUniqueOrThrow({ where: { id: f.user.id } });
      return { kind: "customer", session: {
        uid: user.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", facilityId,
        role: "FACILITY_ADMINISTRATOR", email: user.email, name: user.displayName, sessionVersion: user.sessionVersion,
      } };
    }
    async function staff(role: "OWNER" | "MEMBER"): Promise<Extract<Actor, { kind: "staff" }>> {
      const row = await db.platformStaff.create({ data: {
        email: `assigned-${role}-${randomUUID()}@example.invalid`, displayName: "Synthetic staff", role, passwordHash: "unused-fixture",
      } });
      return { kind: "staff", workFacilityId: null, session: await verifyHarborSessionToken(await createHarborSessionToken({
        uid: row.id, email: row.email, name: row.displayName, staffRole: row.role, sessionVersion: row.sessionVersion,
      })) };
    }
    const owner = await staff("OWNER"), a = await staff("MEMBER"), b = await staff("MEMBER");
    const scope = { departmentKeys: ["PLANT"], deliverables: ["PRIVATE ASSIGNED REQUEST CANARY"] };
    const ids: string[] = [];
    for (const [i, facilityId] of facilities.entries()) {
      const id = await requestEngagement(db, await customer(facilityId), facilityId, scope, randomUUID());
      await assignEngagement(db, owner, id, a.session.uid);
      await db.implementationEngagement.update({ where: { id }, data: { createdAt: new Date(Date.UTC(2026, 0, 1, 0, Math.floor(i / 2))) } });
      ids.push(id);
    }
    const other = await requestEngagement(db, await customer(outside), outside, scope, randomUUID());
    await assignEngagement(db, owner, other, a.session.uid);
    await assignEngagement(db, owner, other, b.session.uid);
    // Former responsibility retains explicit participation, but is not current work.
    assert.equal((await getEngagement(db, a, other)).id, other);
    await requestEngagement(db, await customer(outside), outside, scope, randomUUID());
    await db.facility.update({ where: { id: facilities[0]! }, data: { onboardingCompletedAt: new Date() } });

    const queue = await loadHarborAssignedImplementation(db, a);
    assert.equal(queue.total, 27);
    assert.equal(queue.rows.length, 5);
    const ordered = await db.implementationEngagement.findMany({
      where: { id: { in: ids } }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    assert.deepEqual(queue.rows.map(row => row.id), ordered.slice(0, 5).map(row => row.id));
    assert.ok(!JSON.stringify(queue).includes("PRIVATE ASSIGNED REQUEST CANARY"));
    assert.equal((await loadHarborAssignedImplementation(db, b)).total, 1);
    assert.equal((await loadHarborAssignedImplementation(db, owner)).total, 0);
    const implementation = { filter: "assigned" as const, actor: a };
    const first = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation });
    assert.equal(first.total, 27); assert.equal(first.rows.length, 25); assert.equal(first.pageCount, 2);
    const second = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation, page: "2" });
    assert.equal(second.total, 27); assert.equal(second.rows.length, 2);
    assert.deepEqual(second.rows.map(row => row.id), facilities.slice(25));
    const pending = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation, setup: "awaiting", page: "2" });
    assert.equal(pending.total, 26); assert.deepEqual(pending.rows.map(row => row.id), [facilities[26]]);
    const done = await loadHarborCustomerDirectoryPage(db, { query: `${prefix} Z00`, implementation, setup: "acknowledged" });
    assert.equal(done.total, 1);
    assert.equal((await loadHarborCustomerDirectoryPage(db, { query: `${prefix} C Other`, implementation })).total, 0);

    await assignEngagement(db, owner, ids[0]!, b.session.uid);
    assert.equal((await loadHarborAssignedImplementation(db, a)).total, 26);
    assert.equal((await loadHarborAssignedImplementation(db, b)).total, 2);
    assert.equal((await getEngagement(db, a, ids[0]!)).id, ids[0]);
    assert.equal((await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation, setup: "acknowledged" })).total, 0);
    const customerActor = await customer(facilities[1]!);
    const quote = await issueQuote(db, owner, ids[1]!, 0, scope, "Synthetic verification waiver");
    await approveQuote(db, customerActor, ids[1]!, quote.id, quote.digest);
    for (const stage of STAGES) await recordDelivery(db, owner, ids[1]!, { stage, disposition: "DELIVERED", notes: "Synthetic verification evidence" });
    await acceptHandoff(db, customerActor, ids[1]!, (await reviewHandoff(db, customerActor, ids[1]!)).fingerprint);
    const remaining = await loadHarborAssignedImplementation(db, a);
    assert.equal(remaining.total, 25);
    assert.ok(remaining.rows.every(row => row.id !== ids[0] && row.id !== ids[1]));
    const clamped = await loadHarborCustomerDirectoryPage(db, { query: prefix, implementation, page: "2" });
    assert.equal(clamped.total, 25); assert.equal(clamped.page, 1); assert.equal(clamped.rows.length, 25);
    await assert.rejects(() => loadHarborAssignedImplementation(db, customerActor), /Console staff/);
    await assert.rejects(() => loadHarborAssignedImplementation(db, { ...a, workFacilityId: facilities[0]! }), /Exit the Facility work session/);
    await db.platformStaff.update({ where: { id: a.session.uid }, data: { sessionVersion: { increment: 1 } } });
    await assert.rejects(() => loadHarborAssignedImplementation(db, a), /Console authority changed/);
    await assert.rejects(() => loadHarborCustomerDirectoryPage(db, { implementation }), /Console authority changed/);
  } finally { await db.$disconnect(); }
});
