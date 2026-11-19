import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { createHarborOperationsFixture } from "../../../tests/fixtures/harbor-operations";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { deriveFacilityDepartmentCatalog } from "@/lib/department-products/facility-catalog";
import { loadHarborOperations, HARBOR_OPERATION_QUEUES } from "./operations";
import { loadHarborCustomerLifecycle } from "./customer-lifecycle";
import { loadHarborScanDiagnostics } from "./scan-diagnostics";
import { harborLoginIdentity } from "./login-receipt";
import { createHarborSessionToken, verifyHarborSessionToken } from "./session";

const target = process.env.VERIFY_DATABASE_URL;

test("Operations, diagnostics and lifecycle: scoped projections, full queues and read-only authority", {
  skip: !target && "requires disposable migrated PostgreSQL",
}, async (t) => {
  assertDisposableDatabaseUrl(target);
  process.env.AUTH_SECRET ??= "local-operations-verification-only";
  const db = new PrismaClient({ datasourceUrl: target });
  try {
    const f = await createHarborOperationsFixture(db, { bulk: 205 });
    const owner = f.owner.session, member = f.member.session;
    const encoded = (value: unknown) => JSON.stringify(value);
    const readers = async (session: typeof owner) => [
      await loadHarborOperations(db, session, {}),
      await loadHarborCustomerLifecycle(db, session, f.a.facility.id, null),
      await loadHarborScanDiagnostics(db, session, f.scans.get("failed")!, null),
    ] as const;

    await t.test("all nine predicates include their evidence and exclude content, private Records and terminal delivery", async () => {
      const results = new Map();
      for (const queue of HARBOR_OPERATION_QUEUES) {
        const result = await loadHarborOperations(db, owner, { queue: queue.key });
        assert(result);
        assert.equal(result.selected.key, queue.key);
        assert.equal(result.pageCount, Math.max(1, Math.ceil(result.selected.total / 25)));
        assert(result.rows.length <= 25);
        assert.doesNotMatch(encoded(result), /PRIVATE_(?:BODY|ORIGINAL|REPLY|STORAGE|FILENAME|RECORD|PROVIDER|SCOPE)|passwordHash|loginKey|scanLeaseToken|checksumSha256/);
        results.set(queue.key, result);
      }
      assert(results.get("support").selected.total >= 206);
      assert.equal(results.get("support").rows.length, 25);
      assert(results.get("priority").rows.some((row: { id: string }) => row.id === f.ticket.id));
      assert(results.get("delivery").rows.some((row: { id: string }) => row.id === f.messages.get("FAILED")));
      assert(results.get("pending").rows.some((row: { id: string }) => row.id === f.messages.get("PENDING")));
      assert(results.get("pending").rows.some((row: { id: string }) => row.id === f.messages.get("SENT")));
      assert(!results.get("pending").rows.some((row: { id: string }) => row.id === f.messages.get("DELIVERED")));
      assert(results.get("scanning").selected.total >= 5);
      assert(results.get("automation").rows.some((row: { id: string }) => row.id === f.run.id));
      assert(results.get("billing").rows.some((row: { id: string }) => row.id === f.a.facility.id));
      assert(results.get("licensing").rows.some((row: { title: string }) => row.title === f.a.facility.displayName));
      assert(results.get("catalog").rows.some((row: { id: string }) => row.id === f.records[0].id));
    });

    await t.test("pagination goes beyond 200, clamps malformed pages and preserves consistent snapshot counts", async () => {
      const first = await loadHarborOperations(db, member, { page: ["9", "2"] });
      const later = await loadHarborOperations(db, member, { page: "9" });
      const last = await loadHarborOperations(db, member, { page: "999999" });
      assert(first && later && last);
      assert.equal(first.page, 1); assert.equal(later.offset, 200);
      assert(later.rows.length > 0); assert.equal(last.page, last.pageCount);
      assert(!later.rows.some((row) => first.rows.some((other) => other.id === row.id)));
      assert.equal(first.canPublish, false);
    });

    await t.test("scan stages partition backlog and diagnostics are bounded, redacted and participant-aware", async () => {
      for (const stage of ["eligible", "leased", "scheduled", "failed"] as const) {
        const view = await loadHarborOperations(db, member, { queue: "scanning", scan: stage }); assert(view);
        assert.equal(view.scanStages.reduce((sum, row) => sum + row.total, 0), view.queues.find((row) => row.key === "scanning")!.total);
        const id = f.scans.get(stage)!;
        assert(view.rows.some((row) => row.id === id));
        assert(!view.rows.some((row) => [f.scans.get("blocked"), f.scans.get("clean")].includes(row.id)));
      }
      const detail = await loadHarborScanDiagnostics(db, member, f.scans.get("failed")!, null);
      assert.equal(detail.kind, "found"); if (detail.kind !== "found") return;
      assert.equal(detail.attemptsTotal, 11); assert.equal(detail.attempts.length, 10);
      assert.equal(detail.policy.leaseSeconds, 90); assert.deepEqual(detail.policy.backoffSeconds, [60, 300]);
      assert(detail.implementationHref?.includes(f.engagement.id));
      const unrelated = await loadHarborScanDiagnostics(db, owner, f.scans.get("failed")!, null);
      assert(unrelated.kind === "found" && unrelated.implementationHref === null);
      const retired = await loadHarborScanDiagnostics(db, member, f.scans.get("failed")!, f.a.facility.id);
      assert(retired.kind === "found" && retired.implementationHref === null);
    });

    await t.test("lifecycle uses canonical seat/eligibility, Owner-only recovery, Facility isolation and bounded participating work", async () => {
      const a = await loadHarborCustomerLifecycle(db, owner, f.a.facility.id, null);
      const memberA = await loadHarborCustomerLifecycle(db, member, f.a.facility.id, null);
      const b = await loadHarborCustomerLifecycle(db, member, f.b.facility.id, null);
      assert(a.kind === "found" && memberA.kind === "found" && b.kind === "found");
      assert.equal(a.administrator.label, "Administrator seat held");
      assert(a.followUp.some((row) => row.key === "invitation"));
      assert.equal(memberA.administrator.activation, null);
      assert(!memberA.followUp.some((row) => row.key === "invitation"));
      assert.equal(memberA.myWork.total, 1); assert.equal(b.myWork.total, 0);
      assert.equal(b.unlinkedLicenses, 0); assert.equal(a.unlinkedLicenses, 1);
      const expected = deriveFacilityDepartmentCatalog({ departments: [], entitlements: [{ departmentKey: "PLANT", status: "ACTIVE" }], billingStatus: "PAST_DUE", entitlementsEnforced: false });
      assert.deepEqual(a.products?.map((row) => [row.productKey, row.operable, row.licensed]), expected.map((row) => [row.productKey, row.operable, row.licensed]));
      const retired = await loadHarborCustomerLifecycle(db, member, f.a.facility.id, f.a.facility.id);
      assert(retired.kind === "found" && retired.implementation === null && retired.myWork.total === null);
      await db.department.createMany({ data: Array.from({ length: 201 }, (_, i) => ({ facilityId: f.b.facility.id, key: `BOUND_${i}`, name: `Bound ${i}` })) });
      const bounded = await loadHarborCustomerLifecycle(db, member, f.b.facility.id, null);
      assert(bounded.kind === "found" && bounded.products === null);
    });

    await t.test("reads do not alter canonical data and accidental writes inside the read transaction fail", async () => {
      const before = await db.facility.findUnique({ where: { id: f.a.facility.id }, include: { billing: true, units: true, unitSpaces: true } });
      assert(before && before.unitSpaces.length === 1 && before.unitSpaces[0].unitId === null && before.unitSpaces[0].facilityRoomTypeId === null);
      await readers(owner);
      assert.deepEqual(await db.facility.findUnique({ where: { id: f.a.facility.id }, include: { billing: true, units: true, unitSpaces: true } }), before);
      const injected = new Proxy(db, { get(target, key) {
        if (key !== "$transaction") return Reflect.get(target, key);
        return (body: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => target.$transaction(async (tx) => {
          return body(new Proxy(tx, { get(client, property) {
            if (property !== "facility") return Reflect.get(client, property);
            return new Proxy(client.facility, { get(model, method) {
              if (method !== "findUnique") return Reflect.get(model, method);
              return async () => client.facility.update({ where: { id: f.a.facility.id }, data: { displayName: "UNAUTHORIZED WRITE" } });
            } });
          } }));
        }, options);
      } });
      await assert.rejects(loadHarborCustomerLifecycle(injected, owner, f.a.facility.id, null), /read-only transaction/);
      assert.deepEqual(await db.facility.findUnique({ where: { id: f.a.facility.id }, include: { billing: true, units: true, unitSpaces: true } }), before);
    });

    await t.test("missing, customer, expired, role-changed and inactive staff authority deny all readers", async () => {
      async function denied(session: typeof owner) {
        const [operations, lifecycle, scan] = await readers(session);
        assert.equal(operations, null); assert.equal(lifecycle.kind, "unauthorized"); assert.equal(scan.kind, "unauthorized");
      }
      await denied({ ...owner, uid: f.a.user.id });
      await denied({ ...owner, uid: randomUUID() });
      await denied({ ...owner, exp: 1 });
      await denied({ ...member, staffRole: "OWNER" });
      await db.platformStaff.update({ where: { id: f.owner.row.id }, data: { isActive: false } });
      await denied(owner);
      await db.platformStaff.update({ where: { id: f.owner.row.id }, data: { isActive: true, role: "MEMBER", sessionVersion: { increment: 1 } } });
      await denied(owner);
    });

    await t.test("a completed logout during projection assembly denies it and preserves another login", async () => {
      const session = member;
      const other = await verifyHarborSessionToken(await createHarborSessionToken({ uid: session.uid, name: session.name, email: session.email, staffRole: session.staffRole, sessionVersion: session.sessionVersion }));
      const login = harborLoginIdentity(session)!;
      let once = false;
      const race = new Proxy(db, { get(target, key) {
        if (key !== "$transaction") return Reflect.get(target, key);
        return async (body: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel: Prisma.TransactionIsolationLevel }) => {
          const result = await target.$transaction(body, options);
          if (!once) { once = true; await target.harborAssistanceLoginReceipt.create({ data: { loginKey: login.key, retainUntil: login.retainUntil } }); }
          return result;
        };
      } });
      assert.equal(await loadHarborOperations(race, session, {}), null);
      const [operations, lifecycle, scan] = await readers(session);
      assert.equal(operations, null); assert.equal(lifecycle.kind, "unauthorized"); assert.equal(scan.kind, "unauthorized");
      assert(await loadHarborOperations(db, other, {}));
      assert.equal(+(await db.harborAssistanceLoginReceipt.findUniqueOrThrow({ where: { loginKey: login.key } })).retainUntil, +login.retainUntil);
    });
  } finally { await db.$disconnect(); }
});
