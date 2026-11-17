import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "../verify/database-target";
import { cleanupSyntheticSupportStaff } from "./fixtures/cleanup-staff";
import { changeSupportTicketStatus, createSupportTicket, updateSupportTicketDetails } from "./ticket-service";

const databaseUrl = process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

test("manual Support status snapshots follow the row lock and roll back with the transition", {
  skip: !databaseUrl && "requires disposable PostgreSQL",
}, async () => {
  assertDisposableDatabaseUrl(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const key = randomUUID();
  const email = `status-${key}@example.invalid`;
  let staffId: string | undefined;
  let organizationId: string | undefined;
  let ticketId: string | undefined;
  try {
    const staff = await db.platformStaff.create({ data: { email, displayName: "Status actor", passwordHash: "x" } });
    staffId = staff.id;
    const org = await db.organization.create({ data: { name: key } });
    organizationId = org.id;
    const facilityA = await db.facility.create({ data: { organizationId: org.id, displayName: "Original Facility" } });
    const facilityB = await db.facility.create({ data: { organizationId: org.id, displayName: "Reassigned Facility" } });
    const ticket = await createSupportTicket(db, {
      actorStaffId: staff.id, requesterEmail: email, subject: "Attribution", facilityId: facilityA.id,
    });
    ticketId = ticket.id;
    const input = { ticketId: ticket.id, actorStaffId: staff.id };
    const events = () => db.supportTicketEvent.findMany({ where: { ticketId: ticket.id, type: "STATUS_CHANGED" } });

    assert.deepEqual(await changeSupportTicketStatus(db, { ...input, status: "OPEN" }), { changed: false });
    assert.equal((await events()).length, 0);

    let transition: ReturnType<typeof changeSupportTicketStatus> | undefined;
    try {
      await db.$transaction(async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        await tx.supportTicket.update({ where: { id: ticket.id }, data: { facilityId: facilityB.id } });
        transition = changeSupportTicketStatus(db, { ...input, status: "WAITING_ON_CUSTOMER" });
        for (let attempt = 0; attempt < 100; attempt++) {
          const [{ waiting }] = await tx.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (SELECT 1 FROM pg_stat_activity
              WHERE ${pid} = ANY(pg_blocking_pids(pg_stat_activity.pid))) AS waiting
          `;
          if (waiting) return;
          await setTimeout(25);
        }
        assert.fail("The status update did not wait on the ticket reassignment");
      });
    } finally {
      if (transition) assert.deepEqual(await transition, { changed: true });
    }
    const [recorded] = await events();
    assert.equal(recorded.actorStaffId, staff.id);
    assert.equal(recorded.fromValue, "OPEN");
    assert.equal(recorded.toValue, "WAITING_ON_CUSTOMER");
    assert.deepEqual(recorded.metadata, {
      manualStatusFacility: { id: facilityB.id, displayName: facilityB.displayName },
    });

    await updateSupportTicketDetails(db, { ...input, changes: { facilityId: null } });
    await assert.rejects(
      changeSupportTicketStatus(db, { ...input, actorStaffId: randomUUID(), status: "RESOLVED" }),
      { code: "P2003" },
    );
    const afterRollback = await db.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    assert.equal(afterRollback.status, "WAITING_ON_CUSTOMER");
    assert.equal(afterRollback.resolvedAt, null);
    assert.deepEqual(await events(), [recorded]);

    assert.deepEqual(await changeSupportTicketStatus(db, { ...input, status: "RESOLVED" }), { changed: true });
    const all = await events();
    assert.equal(all.length, 2);
    assert.deepEqual(all.find((event) => event.id === recorded.id), recorded);
    assert.deepEqual(all.find((event) => event.toValue === "RESOLVED")?.metadata, { manualStatusFacility: null });
  } finally {
    if (ticketId) {
      await db.supportTicketEvent.deleteMany({ where: { ticketId } });
      await db.supportStaffNotification.deleteMany({ where: { ticketId } });
      await db.supportTicket.delete({ where: { id: ticketId } });
    }
    await db.supportContact.deleteMany({ where: { email } });
    if (staffId) await cleanupSyntheticSupportStaff(db, [staffId]);
    if (organizationId) {
      await db.facility.deleteMany({ where: { organizationId } });
      await db.organization.delete({ where: { id: organizationId } });
    }
    await db.$disconnect();
  }
});
