/**
 * SQL-backed saved-reply and tag tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { listSupportTickets } from "./list";
import {
  createSupportSavedReply,
  listSupportSavedReplies,
  renderSupportSavedReply,
  setSupportSavedReplyActive,
  updateSupportSavedReply,
} from "./saved-replies";
import {
  addSupportTicketTag,
  createSupportTag,
  removeSupportTicketTag,
  renameSupportTag,
  setSupportTagActive,
} from "./tags";
import { createSupportTicket } from "./ticket-service";
import { SupportTicketError } from "./errors";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(5).toString("hex");
}

test(
  "saved replies and tags: CRUD, insertion copy, and list filters",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    const replyIds: string[] = [];
    const tagIds: string[] = [];
    let orgId: string | null = null;
    const facilityIds: string[] = [];
    const staffIds: string[] = [];

    try {
      const org = await db.organization.create({ data: { name: `Reply Org ${tag}` } });
      orgId = org.id;
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Cedar Grove ${tag}` },
      });
      facilityIds.push(facility.id);
      const staff = await db.platformStaff.create({
        data: {
          email: `replies-${tag}@vssyl.test`,
          displayName: `Reply Staff ${tag}`,
          passwordHash: "x",
        },
      });
      staffIds.push(staff.id);

      const created = await createSupportSavedReply(db, {
        actorStaffId: staff.id,
        name: `Need more information ${tag}`,
        body: "Hi {{customer.first_name}}, we need more detail on {{ticket.number}} at {{facility.name}}.",
      });
      replyIds.push(created.id);
      assert.equal(created.isActive, true);

      const edited = await updateSupportSavedReply(db, {
        id: created.id,
        name: `Need more information ${tag}`,
        body: "Hello {{customer.name}} — {{staff.name}}",
      });
      assert.equal(edited.body, "Hello {{customer.name}} — {{staff.name}}");

      await setSupportSavedReplyActive(db, { id: created.id, isActive: false });
      const activeOnly = await listSupportSavedReplies(db, { activeOnly: true });
      assert.equal(activeOnly.some((row) => row.id === created.id), false);

      await setSupportSavedReplyActive(db, { id: created.id, isActive: true });
      const offered = await listSupportSavedReplies(db, { activeOnly: true });
      assert.ok(offered.some((row) => row.id === created.id));

      const ticket = await createSupportTicket(db, {
        actorStaffId: staff.id,
        requesterEmail: `ada-${tag}@example.com`,
        requesterName: "Ada Lovelace",
        subject: `Export freeze ${tag}`,
        facilityId: facility.id,
      });
      ticketIds.push(ticket.id);
      contactEmails.push(`ada-${tag}@example.com`);

      const other = await createSupportTicket(db, {
        actorStaffId: staff.id,
        requesterEmail: `sam-${tag}@example.com`,
        subject: `Unrelated ${tag}`,
      });
      ticketIds.push(other.id);
      contactEmails.push(`sam-${tag}@example.com`);

      const draft = renderSupportSavedReply(edited.body, {
        customerName: "Ada Lovelace",
        ticketNumber: ticket.number,
        facilityName: `Cedar Grove ${tag}`,
        staffName: staff.displayName,
      });
      assert.equal(draft, `Hello Ada Lovelace — ${staff.displayName}`);
      const sent = await db.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          kind: "NOTE",
          authorStaffId: staff.id,
          bodyText: draft,
          clientSubmissionId: randomUUID(),
        },
      });
      assert.equal(sent.bodyText, draft);
      assert.equal("savedReplyId" in sent, false);

      const reporting = await createSupportTag(db, { name: `Reporting ${tag}` });
      tagIds.push(reporting.id);
      await assert.rejects(
        () => createSupportTag(db, { name: `reporting ${tag}` }),
        (error: unknown) => error instanceof SupportTicketError && error.code === "conflict",
      );

      const firstAdd = await addSupportTicketTag(db, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        tagId: reporting.id,
      });
      assert.equal(firstAdd.tag.id, reporting.id);
      const duplicateAdd = await addSupportTicketTag(db, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        tagId: reporting.id,
      });
      assert.equal(duplicateAdd.tag.id, reporting.id);
      const count = await db.supportTicketTag.count({
        where: { ticketId: ticket.id, tagId: reporting.id },
      });
      assert.equal(count, 1);

      const billing = await addSupportTicketTag(db, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        name: `Billing ${tag}`,
      });
      tagIds.push(billing.tag.id);
      assert.equal(billing.created, true);

      const renamed = await renameSupportTag(db, { id: reporting.id, name: `Exports ${tag}` });
      assert.equal(renamed.normalizedName, `exports ${tag}`);
      const stillLinked = await db.supportTicketTag.findUnique({
        where: { ticketId_tagId: { ticketId: ticket.id, tagId: reporting.id } },
      });
      assert.ok(stillLinked);

      await setSupportTagActive(db, { id: reporting.id, isActive: false });
      await assert.rejects(
        () =>
          addSupportTicketTag(db, {
            ticketId: other.id,
            actorStaffId: staff.id,
            tagId: reporting.id,
          }),
        (error: unknown) => error instanceof SupportTicketError && error.code === "invalid_input",
      );
      const historical = await db.supportTicketTag.findUnique({
        where: { ticketId_tagId: { ticketId: ticket.id, tagId: reporting.id } },
      });
      assert.ok(historical);

      const tagged = await listSupportTickets(db, {
        staffId: staff.id,
        params: { tag: `Exports ${tag}` },
      });
      assert.deepEqual(tagged.tickets.map((row) => row.id), [ticket.id]);
      assert.ok(tagged.tickets[0]?.tags.some((row) => row.normalizedName === `exports ${tag}`));

      const withQueue = await listSupportTickets(db, {
        staffId: staff.id,
        params: { queue: "open", tag: `billing ${tag}` },
      });
      assert.deepEqual(withQueue.tickets.map((row) => row.id), [ticket.id]);

      const withPriority = await listSupportTickets(db, {
        staffId: staff.id,
        params: { status: "OPEN", priority: "NORMAL", tag: `billing ${tag}` },
      });
      assert.deepEqual(withPriority.tickets.map((row) => row.id), [ticket.id]);

      const paged = await listSupportTickets(db, {
        staffId: staff.id,
        params: { tag: `billing ${tag}`, page: "1" },
        pageSize: 1,
      });
      assert.equal(paged.tickets.length, 1);
      assert.equal(paged.total, 1);

      const unchangedSearch = await listSupportTickets(db, {
        staffId: staff.id,
        params: { q: `VSS-${ticket.number}` },
      });
      assert.equal(unchangedSearch.exactTicketNumberHit, true);
      assert.deepEqual(unchangedSearch.tickets.map((row) => row.id), [ticket.id]);

      await removeSupportTicketTag(db, { ticketId: ticket.id, tagId: reporting.id });
      const afterRemove = await listSupportTickets(db, {
        staffId: staff.id,
        params: { tag: `exports ${tag}` },
      });
      assert.equal(afterRemove.total, 0);
    } finally {
      await db.supportTicketTag.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      if (replyIds.length) await db.supportSavedReply.deleteMany({ where: { id: { in: replyIds } } });
      if (tagIds.length) await db.supportTag.deleteMany({ where: { id: { in: tagIds } } });
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
