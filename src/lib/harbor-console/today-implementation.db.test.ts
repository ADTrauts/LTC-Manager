import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { bootstrapFacilityCustomer } from "@/lib/facility-provisioning/bootstrap";
import { createHarborSessionToken, verifyHarborSessionToken } from "./session";
import { loadHarborUnassignedImplementation, listHarborFacilities } from "./queries";
import { requestEngagement, assignEngagement, getEngagement } from "@/lib/implementation/service";
import { implementationWorkWhere } from "@/lib/implementation/work-queue";
import type { Actor } from "@/lib/implementation/authority";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

const url = process.env.ONBOARDING_TEST_DATABASE_URL;
if (url) assertDisposableDatabaseUrl(url);
process.env.AUTH_SECRET ||= "local-disposable-today-implementation";

test("SQL Today Implementation: full unassigned scope, oldest bounded snapshot, and live metadata-only staff access", {
  skip: !url,
}, async () => {
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const prefix = `Today Implementation ${randomUUID()}`;
    const f = await db.$transaction(tx => bootstrapFacilityCustomer(tx, {
      organization: { mode: "create", facilityName: `${prefix} Z Facility`, organizationName: `${prefix} Organization` },
      facility: { displayName: `${prefix} Z Facility`, billingEmail: `today-${randomUUID()}@example.invalid`, timezone: "America/New_York" },
      administrator: { mode: "create", email: `today-admin-${randomUUID()}@example.invalid`, displayName: "Synthetic Administrator", passwordHash: "unused-fixture", emailVerifiedAt: new Date() },
    }));
    await db.facility.createMany({ data: Array.from({ length: 200 }, (_, i) => ({
      id: randomUUID(), organizationId: f.organization.id, displayName: `${prefix} A ${String(i).padStart(3, "0")}`,
    })) });
    assert.equal((await listHarborFacilities(db, prefix)).some(row => row.id === f.facility.id), false);
    const user = await db.user.findUniqueOrThrow({ where: { id: f.user.id } });
    const customer: Actor = { kind: "customer", session: {
      uid: user.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility",
      facilityId: f.facility.id, role: "FACILITY_ADMINISTRATOR", name: user.displayName, email: user.email, sessionVersion: user.sessionVersion,
    } };
    async function staff(role: "OWNER" | "MEMBER") {
      const row = await db.platformStaff.create({ data: {
        email: `today-${role}-${randomUUID()}@example.invalid`, displayName: `Synthetic ${role}`, role, passwordHash: "unused-fixture",
      } });
      const actor: Extract<Actor, { kind: "staff" }> = { kind: "staff", workFacilityId: null,
        session: await verifyHarborSessionToken(await createHarborSessionToken({
          uid: row.id, email: row.email, name: row.displayName, staffRole: row.role, sessionVersion: row.sessionVersion,
        })),
      };
      return { row, actor };
    }
    const owner = await staff("OWNER"), member = await staff("MEMBER");
    const scope = { departmentKeys: ["PLANT"], deliverables: ["PRIVATE REQUEST SCOPE CANARY"] };
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const id = await requestEngagement(db, customer, f.facility.id, scope, randomUUID());
      ids.push(id);
      // Old synthetic dates make the preview assertions independent of other
      // suites; pairs deliberately tie and require the ID ordering.
      await db.implementationEngagement.update({ where: { id }, data: {
        createdAt: new Date(Date.UTC(i < 6 ? 1900 : 1899, 0, 1, 0, Math.floor(i / 2))),
      } });
    }
    await assignEngagement(db, owner.actor, ids[6]!, owner.row.id);
    // Independent filter canary: accepted history must never re-enter intake,
    // even if its responsibility is absent.
    await db.implementationEngagement.update({ where: { id: ids[7]! }, data: { acceptedAt: new Date(), acceptedByUserId: user.id } });
    const ordered = await db.implementationEngagement.findMany({
      where: { id: { in: ids.slice(0, 6) } }, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let counted = 0, changed = false;
    const racing = db.$extends({ query: { implementationEngagement: { async count({ args, query }) {
      assert.deepEqual(args.where, implementationWorkWhere("unassigned"));
      const total = await query(args);
      assert.equal(typeof total, "number");
      counted = total as number;
      await assignEngagement(db, owner.actor, ordered[0]!.id, owner.row.id);
      changed = true;
      return total;
    } } } }) as unknown as PrismaClient;
    const result = await loadHarborUnassignedImplementation(racing, member.actor);
    assert.equal(changed, true);
    assert.equal(result.total, counted);
    assert.ok(result.total >= 6, "Includes all work beyond the 200-Facility reader.");
    assert.deepEqual(result.rows.map(row => row.id), ordered.slice(0, 5).map(row => row.id));
    for (const row of result.rows) {
      assert.deepEqual(Object.keys(row).sort(), ["facilityId", "facilityName", "id", "organizationName", "requestedAt"]);
      assert.equal(row.facilityId, f.facility.id);
      assert.equal(row.facilityName, f.facility.displayName);
      assert.equal(row.organizationName, f.organization.name);
    }
    assert.ok(!JSON.stringify(result).includes("PRIVATE REQUEST SCOPE CANARY"));
    const fresh = await loadHarborUnassignedImplementation(db, owner.actor);
    assert.equal(fresh.rows.some(row => row.id === ordered[0]!.id), false);
    await assert.rejects(() => getEngagement(db, member.actor, ids[1]!), /explicitly recorded participation/);
    await assert.rejects(() => loadHarborUnassignedImplementation(db, customer), /Console staff/);
    await assert.rejects(() => loadHarborUnassignedImplementation(db, { ...member.actor, workFacilityId: f.facility.id }), /Exit the Facility work session/);
    await db.platformStaff.update({ where: { id: member.row.id }, data: { sessionVersion: { increment: 1 } } });
    await assert.rejects(() => loadHarborUnassignedImplementation(db, member.actor), /Console authority changed/);
    await db.platformStaff.update({ where: { id: owner.row.id }, data: { isActive: false } });
    await assert.rejects(() => loadHarborUnassignedImplementation(db, owner.actor), /Console authority changed/);
  } finally { await db.$disconnect(); }
});
