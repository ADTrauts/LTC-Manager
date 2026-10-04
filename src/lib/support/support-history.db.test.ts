/**
 * SQL-backed support history tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  loadSupportContactHistory,
  loadSupportFacilityHistory,
  loadSupportTicketHistoryContext,
  SUPPORT_HISTORY_RECENT_LIMIT,
} from "./history";
import { listSupportTickets } from "./list";
import { changeSupportTicketStatus, createSupportTicket, updateSupportTicketDetails } from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(5).toString("hex");
}

test(
  "support history: contact and facility counts, recent rows, and filters",
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
      const org = await db.organization.create({ data: { name: `History Org ${tag}` } });
      orgId = org.id;
      const [facilityA, facilityB] = await Promise.all([
        db.facility.create({ data: { organizationId: org.id, displayName: `Cedar A ${tag}` } }),
        db.facility.create({ data: { organizationId: org.id, displayName: `Cedar B ${tag}` } }),
      ]);
      facilityIds.push(facilityA.id, facilityB.id);
      const staff = await db.platformStaff.create({
        data: {
          email: `history-${tag}@vssyl.test`,
          displayName: `History ${tag}`,
          passwordHash: "x",
        },
      });
      staffIds.push(staff.id);

      const adaEmail = `ada-${tag}@example.com`;
      const samEmail = `sam-${tag}@example.com`;
      contactEmails.push(adaEmail, samEmail);
      await db.supportContact.create({
        data: { email: samEmail, displayName: `Sam ${tag}` },
      });

      const make = async (subject: string, facilityId?: string | null) => {
        const ticket = await createSupportTicket(db, {
          actorStaffId: staff.id,
          requesterEmail: adaEmail,
          requesterName: `Ada ${tag}`,
          subject: `${subject} ${tag}`,
          facilityId: facilityId === undefined ? facilityA.id : facilityId,
        });
        ticketIds.push(ticket.id);
        return ticket;
      };

      const newest = await make("Newest export");
      const waiting = await make("Waiting login");
      const resolved = await make("Resolved billing");
      const closedOnB = await make("Closed on B", facilityB.id);
      const noFacility = await make("No facility ticket", null);
      const extra1 = await make("Extra one");
      const extra2 = await make("Extra two");

      await changeSupportTicketStatus(db, {
        ticketId: waiting.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await changeSupportTicketStatus(db, {
        ticketId: resolved.id,
        actorStaffId: staff.id,
        status: "RESOLVED",
      });
      await changeSupportTicketStatus(db, {
        ticketId: closedOnB.id,
        actorStaffId: staff.id,
        status: "CLOSED",
      });

      const t0 = new Date("2026-09-01T12:00:00.000Z");
      const t1 = new Date("2026-09-10T12:00:00.000Z");
      const t2 = new Date("2026-09-20T12:00:00.000Z");
      const t3 = new Date("2026-09-30T12:00:00.000Z");
      await db.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${t3} WHERE id = ${newest.id}`;
      await db.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${t2} WHERE id IN (${waiting.id}, ${resolved.id})`;
      await db.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${t1} WHERE id IN (${closedOnB.id}, ${noFacility.id})`;
      await db.$executeRaw`UPDATE "SupportTicket" SET "updatedAt" = ${t0} WHERE id IN (${extra1.id}, ${extra2.id})`;

      const ada = await db.supportContact.findUniqueOrThrow({ where: { email: adaEmail } });
      const sam = await db.supportContact.findUniqueOrThrow({ where: { email: samEmail } });

      await db.supportContact.update({
        where: { id: ada.id },
        data: { facilityId: facilityB.id },
      });

      const contactHistory = await loadSupportContactHistory(db, ada.id);
      assert.ok(contactHistory);
      assert.equal(contactHistory.total, 7);
      assert.equal(contactHistory.active, 5);
      assert.equal(contactHistory.waitingOnCustomer, 1);
      assert.equal(contactHistory.resolved, 1);
      assert.equal(contactHistory.closed, 1);
      assert.equal(contactHistory.recent.length, SUPPORT_HISTORY_RECENT_LIMIT);
      assert.deepEqual(
        contactHistory.recent.map((row) => row.id),
        [newest.id, resolved.id, waiting.id, noFacility.id, closedOnB.id],
      );
      assert.equal(contactHistory.lastContactAt?.getTime(), contactHistory.recent[0]?.updatedAt.getTime());
      assert.equal(contactHistory.recent[0]?.id, newest.id);
      assert.equal(contactHistory.viewAllHref, `/console/tickets?contact=${ada.id}`);
      assert.ok(!contactHistory.recent.some((row) => row.id === extra1.id));

      const emptyContact = await loadSupportContactHistory(db, sam.id);
      assert.ok(emptyContact);
      assert.equal(emptyContact.total, 0);
      assert.equal(emptyContact.recent.length, 0);
      assert.equal(emptyContact.lastContactAt, null);

      const missing = await loadSupportContactHistory(db, "cabcdefghijklmnopqrstu");
      assert.equal(missing, null);

      const facilityAHistory = await loadSupportFacilityHistory(db, facilityA.id);
      assert.equal(facilityAHistory.total, 5);
      assert.equal(facilityAHistory.active, 4);
      assert.ok(facilityAHistory.recent.every((row) => row.id !== closedOnB.id));
      assert.ok(facilityAHistory.recent.every((row) => row.id !== noFacility.id));
      assert.equal(facilityAHistory.viewAllHref, `/console/tickets?facility=${facilityA.id}`);
      assert.equal(facilityAHistory.recentRequesters.length, 1);
      assert.equal(facilityAHistory.recentRequesters[0]?.id, ada.id);

      const facilityBHistory = await loadSupportFacilityHistory(db, facilityB.id);
      assert.equal(facilityBHistory.total, 1);
      assert.equal(facilityBHistory.recent[0]?.id, closedOnB.id);

      const unusedFacility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Unused ${tag}` },
      });
      facilityIds.push(unusedFacility.id);
      const unusedHistory = await loadSupportFacilityHistory(db, unusedFacility.id);
      assert.equal(unusedHistory.total, 0);
      assert.equal(unusedHistory.recent.length, 0);

      const context = await loadSupportTicketHistoryContext(db, {
        contactId: ada.id,
        facilityId: facilityA.id,
      });
      assert.equal(context.contact.previousCount, 6);
      assert.equal(context.contact.previousLabel, "6 previous tickets");
      assert.equal(context.contact.ticketsHref, `/console/tickets?contact=${ada.id}`);
      assert.equal(context.facility?.total, 5);
      assert.equal(context.facility?.active, 4);

      const noFacilityContext = await loadSupportTicketHistoryContext(db, {
        contactId: ada.id,
        facilityId: null,
      });
      assert.equal(noFacilityContext.facility, null);

      await updateSupportTicketDetails(db, {
        ticketId: newest.id,
        actorStaffId: staff.id,
        changes: { facilityId: facilityB.id },
      });
      const facilityAAfterMove = await loadSupportFacilityHistory(db, facilityA.id);
      assert.equal(facilityAAfterMove.total, 4);
      assert.ok(!facilityAAfterMove.recent.some((row) => row.id === newest.id));
      const adaAfterMove = await loadSupportContactHistory(db, ada.id);
      assert.equal(adaAfterMove?.total, 7);

      const contactFilter = await listSupportTickets(db, {
        staffId: staff.id,
        params: { contact: ada.id },
      });
      assert.equal(contactFilter.total, 7);
      assert.ok(contactFilter.tickets.every((row) => row.contact.id === ada.id));

      const contactOpen = await listSupportTickets(db, {
        staffId: staff.id,
        params: { contact: ada.id, status: "OPEN" },
      });
      assert.ok(contactOpen.tickets.every((row) => row.status === "OPEN"));
      assert.ok(contactOpen.tickets.some((row) => row.id === extra1.id));
      assert.ok(!contactOpen.tickets.some((row) => row.id === resolved.id));

      const samFilter = await listSupportTickets(db, {
        staffId: staff.id,
        params: { contact: sam.id },
      });
      assert.equal(samFilter.total, 0);
    } finally {
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportStaffNotification.deleteMany({
        where: { OR: [{ ticketId: { in: ticketIds } }, { staffId: { in: staffIds } }] },
      });
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
