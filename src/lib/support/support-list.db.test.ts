/**
 * SQL-backed support list / search tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { listSupportTickets } from "./list";
import { addSupportTicketNote, changeSupportTicketStatus, createSupportTicket } from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(5).toString("hex");
}

test(
  "support list: search, filters, queues, pagination",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    let orgId: string | null = null;
    const facilityIds: string[] = [];
    const staffIds: string[] = [];

    try {
      const org = await db.organization.create({ data: { name: `List Org ${tag}` } });
      orgId = org.id;
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Terrace View ${tag}` },
      });
      facilityIds.push(facility.id);
      const [me, other] = await Promise.all(
        ["me", "other"].map((key) =>
          db.platformStaff.create({
            data: {
              email: `list-${key}-${tag}@vssyl.test`,
              displayName: `List ${key} ${tag}`,
              passwordHash: "x",
            },
          }),
        ),
      );
      staffIds.push(me.id, other.id);

      const cooler = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `ada-${tag}@example.com`,
        requesterName: `Ada ${tag}`,
        subject: `Cooler export ${tag}`,
        facilityId: facility.id,
        type: "BUG",
        priority: "HIGH",
        assignedStaffId: me.id,
        note: `Internal fridge note ${tag}`,
      });
      ticketIds.push(cooler.id);
      contactEmails.push(`ada-${tag}@example.com`);

      const inbound = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `sam-${tag}@gmail.com`,
        requesterName: "Sam",
        subject: `Door sensor ${tag}`,
        type: "SUPPORT",
        priority: "NORMAL",
      });
      ticketIds.push(inbound.id);
      contactEmails.push(`sam-${tag}@gmail.com`);
      await db.supportTicketMessage.create({
        data: {
          ticketId: inbound.id,
          kind: "INBOUND",
          contactId: (await db.supportTicket.findUniqueOrThrow({ where: { id: inbound.id }, select: { contactId: true } }))
            .contactId,
          bodyText: `The freezer door keeps beeping ${tag}`,
          fromEmail: `sam-${tag}@gmail.com`,
        },
      });
      await db.supportTicket.update({ where: { id: inbound.id }, data: { status: "NEW" } });

      const closed = await createSupportTicket(db, {
        actorStaffId: other.id,
        requesterEmail: `closed-${tag}@example.com`,
        subject: `Old billing ${tag}`,
        type: "BILLING",
        priority: "LOW",
        assignedStaffId: other.id,
      });
      ticketIds.push(closed.id);
      contactEmails.push(`closed-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: closed.id,
        actorStaffId: other.id,
        status: "CLOSED",
      });

      const urgent = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `urgent-${tag}@example.com`,
        subject: `Urgent access ${tag}`,
        type: "ACCOUNT_ACCESS",
        priority: "URGENT",
      });
      ticketIds.push(urgent.id);
      contactEmails.push(`urgent-${tag}@example.com`);

      const extras = [];
      for (let i = 0; i < 3; i += 1) {
        const extra = await createSupportTicket(db, {
          actorStaffId: me.id,
          requesterEmail: `extra-${i}-${tag}@example.com`,
          subject: `Extra ${i} ${tag}`,
          priority: "NORMAL",
        });
        extras.push(extra);
        ticketIds.push(extra.id);
        contactEmails.push(`extra-${i}-${tag}@example.com`);
      }

      const coolerRow = await db.supportTicket.findUniqueOrThrow({
        where: { id: cooler.id },
        select: { number: true },
      });

      async function ids(params: Record<string, string>, pageSize?: number) {
        const result = await listSupportTickets(db, {
          staffId: me.id,
          params,
          pageSize,
        });
        return { ...result, numbers: result.tickets.map((row) => row.number) };
      }

      const byCode = await ids({ q: `VSS-${coolerRow.number}` });
      assert.equal(byCode.exactTicketNumberHit, true);
      assert.deepEqual(byCode.tickets.map((row) => row.id), [cooler.id]);

      const byBare = await ids({ q: String(coolerRow.number), queue: "closed" });
      assert.deepEqual(byBare.tickets.map((row) => row.id), [cooler.id]);

      const subject = await ids({ q: `cooler export ${tag}` });
      assert.ok(subject.tickets.some((row) => row.id === cooler.id));

      const email = await ids({ q: `ada-${tag}@example.com` });
      assert.ok(email.tickets.some((row) => row.id === cooler.id));

      const name = await ids({ q: `Ada ${tag}` });
      assert.ok(name.tickets.some((row) => row.id === cooler.id));

      const facilitySearch = await ids({ q: `Terrace View ${tag}` });
      assert.ok(facilitySearch.tickets.some((row) => row.id === cooler.id));

      const inboundBody = await ids({ q: `freezer door keeps beeping ${tag}` });
      assert.ok(inboundBody.tickets.some((row) => row.id === inbound.id));

      const note = await ids({ q: `Internal fridge note ${tag}` });
      assert.ok(note.tickets.some((row) => row.id === cooler.id));

      const open = await ids({ status: "OPEN" });
      assert.ok(open.tickets.every((row) => row.status === "OPEN"));
      assert.ok(open.tickets.some((row) => row.id === cooler.id));

      const high = await ids({ priority: "HIGH", q: tag });
      assert.deepEqual(high.tickets.map((row) => row.id), [cooler.id]);

      const unclassified = await ids({ type: "unclassified", q: tag });
      assert.ok(unclassified.tickets.every((row) => row.type === null));

      const mine = await ids({ assignee: "me" });
      assert.ok(mine.tickets.some((row) => row.id === cooler.id));
      assert.ok(mine.tickets.every((row) => row.assignedStaff?.displayName.includes("me")));

      const unassigned = await ids({ assignee: "unassigned", q: tag });
      assert.ok(unassigned.tickets.every((row) => row.assignedStaff === null));

      const otherAssignee = await ids({ assignee: other.id, q: tag });
      assert.ok(otherAssignee.tickets.some((row) => row.id === closed.id));

      const facilityFilter = await ids({ facility: facility.id });
      assert.ok(facilityFilter.tickets.every((row) => row.facility?.displayName.includes("Terrace View")));

      const noneFacility = await ids({ facility: "none", q: `Door sensor ${tag}` });
      assert.ok(noneFacility.tickets.some((row) => row.id === inbound.id));

      const today = await ids({ updated: "today", q: tag });
      assert.ok(today.tickets.length >= 1);

      const old = new Date("2020-01-02T12:00:00.000Z");
      await db.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${old} WHERE id = ${closed.id}`;
      const week = await ids({ updated: "7d", q: `Old billing ${tag}` });
      assert.equal(week.tickets.length, 0);

      const combined = await ids({ queue: "unassigned", priority: "URGENT", q: tag });
      assert.deepEqual(combined.tickets.map((row) => row.id), [urgent.id]);

      const highQueue = await ids({ queue: "high", q: tag });
      assert.ok(highQueue.tickets.some((row) => row.id === cooler.id));
      assert.ok(highQueue.tickets.some((row) => row.id === urgent.id));
      assert.ok(highQueue.tickets.every((row) => row.status !== "CLOSED"));

      const recent = await ids({ queue: "recent", q: tag });
      assert.ok(recent.tickets.every((row) => row.status !== "CLOSED" && row.status !== "RESOLVED"));

      const paged = await ids({ q: tag }, 2);
      assert.equal(paged.tickets.length, 2);
      assert.ok(paged.total >= 6);
      assert.ok(paged.pageCount >= 3);
      const page2 = await listSupportTickets(db, {
        staffId: me.id,
        params: { q: tag, page: "2" },
        pageSize: 2,
      });
      assert.equal(page2.tickets.length, 2);
      assert.notDeepEqual(
        page2.tickets.map((row) => row.id),
        paged.tickets.map((row) => row.id),
      );

      const defaults = await ids({});
      assert.equal(defaults.query.queue, "all");
      assert.equal(defaults.query.page, 1);

      await addSupportTicketNote(db, {
        ticketId: cooler.id,
        actorStaffId: me.id,
        body: "Second note",
        clientSubmissionId: randomUUID(),
      });
      const stillThere = await db.supportTicket.findUniqueOrThrow({
        where: { id: cooler.id },
        select: { subject: true, status: true },
      });
      assert.equal(stillThere.subject, `Cooler export ${tag}`);
    } finally {
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      if (contactEmails.length) {
        await db.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
      }
      if (staffIds.length) {
        await db.supportStaffNotification.deleteMany({ where: { staffId: { in: staffIds } } });
        await db.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
      }
      if (facilityIds.length) await db.facility.deleteMany({ where: { id: { in: facilityIds } } });
      if (orgId) await db.organization.delete({ where: { id: orgId } });
      await db.$disconnect();
    }
  },
);
