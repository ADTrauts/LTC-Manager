/**
 * SQL-backed support ticket tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { SupportTicketError } from "./errors";
import { generateSupportReplyToken } from "./identifiers";
import { sendSupportReply, type SupportReplyEmail } from "./reply";
import {
  addSupportTicketNote,
  changeSupportTicketStatus,
  createSupportTicket,
  updateSupportTicketDetails,
} from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(6).toString("hex");
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof SupportTicketError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

test(
  "support tickets: create, note, status, details, replies, idempotency, constraints",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    let orgId: string | null = null;
    const facilityIds: string[] = [];
    const staffIds: string[] = [];
    const userIds: string[] = [];

    try {
      const org = await prisma.organization.create({ data: { name: `Support Org ${tag}` } });
      orgId = org.id;
      const facility = await prisma.facility.create({
        data: { organizationId: org.id, displayName: `Terrace View ${tag}` },
      });
      const otherFacility = await prisma.facility.create({
        data: { organizationId: org.id, displayName: `Harbor Pines ${tag}` },
      });
      facilityIds.push(facility.id, otherFacility.id);
      const role = await prisma.role.findFirstOrThrow({ select: { id: true } });
      const user = await prisma.user.create({
        data: {
          email: `linked-${tag}@example.com`,
          displayName: "Linked User",
          facilityId: facility.id,
          roleId: role.id,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(user.id);
      const [staff, otherStaff] = await Promise.all(
        ["a", "b"].map((key) =>
          prisma.platformStaff.create({
            data: {
              email: `staff-${key}-${tag}@vssyl.test`,
              displayName: `Staff ${key.toUpperCase()}`,
              passwordHash: "x",
            },
          }),
        ),
      );
      staffIds.push(staff.id, otherStaff.id);

      // Create: ticket, CREATED event, and note commit together; the contact links to the matching user.
      const linkedEmail = `  Linked-${tag}@Example.com `;
      contactEmails.push(`linked-${tag}@example.com`);
      const created = await createSupportTicket(prisma, {
        actorStaffId: staff.id,
        requesterEmail: linkedEmail,
        requesterName: "Ada",
        subject: "  Cooler logs not saving ",
        facilityId: facility.id,
        type: "BUG",
        priority: "HIGH",
        note: "Called in by phone.",
      });
      ticketIds.push(created.id);
      assert.ok(created.number >= 1001);

      const ticket = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: created.id },
        include: { contact: true, events: true, messages: true },
      });
      assert.equal(ticket.subject, "Cooler logs not saving");
      assert.equal(ticket.status, "OPEN");
      assert.equal(ticket.type, "BUG");
      assert.equal(ticket.priority, "HIGH");
      assert.match(ticket.replyToken, /^[0-9a-f]{40}$/);
      assert.equal(ticket.contact.email, `linked-${tag}@example.com`);
      assert.equal(ticket.contact.userId, user.id);
      assert.equal(ticket.contact.facilityId, facility.id);
      assert.deepEqual(ticket.events.map((event) => event.type), ["CREATED"]);
      assert.equal(ticket.events[0]?.actorStaffId, staff.id);
      assert.equal(ticket.messages.length, 1);
      assert.equal(ticket.messages[0]?.kind, "NOTE");

      const second = await createSupportTicket(prisma, {
        actorStaffId: staff.id,
        requesterEmail: `linked-${tag}@example.com`,
        subject: "Second",
      });
      ticketIds.push(second.id);
      assert.ok(second.number > created.number);

      // A failed create leaves nothing behind.
      await rejectsWith(
        createSupportTicket(prisma, {
          actorStaffId: staff.id,
          requesterEmail: `rollback-${tag}@example.com`,
          subject: "Rollback",
          assignedStaffId: "missing-staff",
        }),
        "invalid_reference",
      );
      assert.equal(
        await prisma.supportContact.count({ where: { email: `rollback-${tag}@example.com` } }),
        0,
      );

      // No facility, no user.
      const unlinkedEmail = `stranger-${tag}@example.com`;
      contactEmails.push(unlinkedEmail);
      const noFacility = await createSupportTicket(prisma, {
        actorStaffId: staff.id,
        requesterEmail: unlinkedEmail,
        subject: "No facility",
      });
      ticketIds.push(noFacility.id);
      const noFacilityTicket = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: noFacility.id },
        include: { contact: true, messages: true },
      });
      assert.equal(noFacilityTicket.facilityId, null);
      assert.equal(noFacilityTicket.contact.userId, null);
      assert.equal(noFacilityTicket.contact.facilityId, null);
      assert.equal(noFacilityTicket.messages.length, 0);

      // Notes are idempotent per clientSubmissionId and never touch status.
      const noteSubmission = randomUUID();
      const note = await addSupportTicketNote(prisma, {
        ticketId: created.id,
        actorStaffId: staff.id,
        body: " Checked logs ",
        clientSubmissionId: noteSubmission,
      });
      const noteAgain = await addSupportTicketNote(prisma, {
        ticketId: created.id,
        actorStaffId: staff.id,
        body: " Checked logs ",
        clientSubmissionId: noteSubmission,
      });
      assert.equal(note.duplicate, false);
      assert.deepEqual(noteAgain, { messageId: note.messageId, duplicate: true });
      await rejectsWith(
        addSupportTicketNote(prisma, {
          ticketId: second.id,
          actorStaffId: staff.id,
          body: "Other ticket",
          clientSubmissionId: noteSubmission,
        }),
        "submission_mismatch",
      );
      assert.equal(
        await prisma.supportTicketMessage.count({ where: { ticketId: created.id, kind: "NOTE" } }),
        2,
      );

      // Status: same-status writes nothing; RESOLVED sets resolvedAt; reopening clears it.
      assert.deepEqual(
        await changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "OPEN" }),
        { changed: false },
      );
      await changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "RESOLVED" });
      let lifecycle = await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.id } });
      assert.ok(lifecycle.resolvedAt);
      await changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "OPEN" });
      lifecycle = await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(lifecycle.resolvedAt, null);
      await rejectsWith(
        changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "NEW" }),
        "invalid_transition",
      );
      const statusEvents = await prisma.supportTicketEvent.findMany({
        where: { ticketId: created.id, type: "STATUS_CHANGED" },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        statusEvents.map((event) => [event.fromValue, event.toValue]),
        [
          ["OPEN", "RESOLVED"],
          ["RESOLVED", "OPEN"],
        ],
      );

      // Details: one event per changed field, name snapshots, contact untouched.
      const changedTypes = await updateSupportTicketDetails(prisma, {
        ticketId: created.id,
        actorStaffId: staff.id,
        changes: {
          type: "FEATURE_REQUEST",
          priority: "HIGH",
          assignedStaffId: otherStaff.id,
          facilityId: otherFacility.id,
        },
      });
      assert.deepEqual(changedTypes, ["TYPE_CHANGED", "ASSIGNMENT_CHANGED", "FACILITY_CHANGED"]);
      const facilityEvent = await prisma.supportTicketEvent.findFirstOrThrow({
        where: { ticketId: created.id, type: "FACILITY_CHANGED" },
      });
      assert.deepEqual(facilityEvent.metadata, {
        fromFacilityName: facility.displayName,
        toFacilityName: otherFacility.displayName,
      });
      const assignmentEvent = await prisma.supportTicketEvent.findFirstOrThrow({
        where: { ticketId: created.id, type: "ASSIGNMENT_CHANGED" },
      });
      assert.deepEqual(assignmentEvent.metadata, { fromStaffName: null, toStaffName: "Staff B" });
      const contactAfter = await prisma.supportContact.findUniqueOrThrow({
        where: { email: `linked-${tag}@example.com` },
      });
      assert.equal(contactAfter.facilityId, facility.id);
      assert.deepEqual(
        await updateSupportTicketDetails(prisma, {
          ticketId: created.id,
          actorStaffId: staff.id,
          changes: { type: "FEATURE_REQUEST", priority: "HIGH" },
        }),
        [],
      );
      const unassigned = await updateSupportTicketDetails(prisma, {
        ticketId: created.id,
        actorStaffId: staff.id,
        changes: { assignedStaffId: null, priority: "URGENT" },
      });
      assert.deepEqual(unassigned, ["PRIORITY_CHANGED", "ASSIGNMENT_CHANGED"]);

      // Replies: PENDING is committed before sending, then SENT with the provider id.
      const sent: SupportReplyEmail[] = [];
      const replySubmission = randomUUID();
      const reply = await sendSupportReply(
        prisma,
        {
          ticketId: created.id,
          actorStaffId: staff.id,
          body: "We fixed it.",
          clientSubmissionId: replySubmission,
          status: "WAITING_ON_CUSTOMER",
          fromEmail: "noreply@vssyl.com",
        },
        async (email) => {
          sent.push(email);
          const pending = await prisma.supportTicketMessage.findUniqueOrThrow({
            where: { id: email.metadata.supportMessageId },
          });
          assert.equal(pending.deliveryStatus, "PENDING");
          return { sent: true, messageId: `pm-${tag}` };
        },
      );
      assert.equal(reply.deliveryStatus, "SENT");
      assert.equal(sent.length, 1);
      const sentEmail = sent[0]!;
      assert.equal(sentEmail.to, `linked-${tag}@example.com`);
      assert.equal(sentEmail.emailSubject, `[VSS-${created.number}] Cooler logs not saving`);
      assert.equal(sentEmail.facilityDisplayName, otherFacility.displayName);
      assert.deepEqual(sentEmail.metadata, {
        supportTicketId: created.id,
        supportTicketNumber: `VSS-${created.number}`,
        supportMessageId: reply.messageId,
      });
      const sentRow = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: reply.messageId } });
      assert.equal(sentRow.kind, "OUTBOUND");
      assert.equal(sentRow.deliveryStatus, "SENT");
      assert.equal(sentRow.providerMessageId, `pm-${tag}`);
      assert.ok(sentRow.sentAt);
      assert.match(sentRow.internetMessageId ?? "", /^support\.[0-9a-f-]{36}@vssyl\.com$/);
      assert.equal(sentEmail.internetMessageId, sentRow.internetMessageId);
      const replyStatusEvent = await prisma.supportTicketEvent.findFirstOrThrow({
        where: { ticketId: created.id, causedByMessageId: reply.messageId },
      });
      assert.equal(replyStatusEvent.type, "STATUS_CHANGED");
      assert.equal(replyStatusEvent.toValue, "WAITING_ON_CUSTOMER");

      // A repeated submission neither records nor sends again.
      const replyAgain = await sendSupportReply(
        prisma,
        {
          ticketId: created.id,
          actorStaffId: staff.id,
          body: "We fixed it.",
          clientSubmissionId: replySubmission,
          status: "WAITING_ON_CUSTOMER",
        },
        async () => {
          throw new Error("must not send a duplicate");
        },
      );
      assert.deepEqual(replyAgain, { messageId: reply.messageId, duplicate: true, deliveryStatus: null });
      assert.equal(
        await prisma.supportTicketMessage.count({ where: { ticketId: created.id, kind: "OUTBOUND" } }),
        1,
      );

      // Failures stay on the timeline as FAILED with a readable reason.
      const failed = await sendSupportReply(
        prisma,
        {
          ticketId: created.id,
          actorStaffId: staff.id,
          body: "Second try",
          clientSubmissionId: randomUUID(),
          fromEmail: "noreply@vssyl.com",
        },
        async () => ({ sent: false, reason: "send_failed", error: "Inactive recipient" }),
      );
      assert.equal(failed.deliveryStatus, "FAILED");
      const failedRow = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: failed.messageId } });
      assert.equal(failedRow.deliveryStatus, "FAILED");
      assert.equal(failedRow.deliveryError, "Postmark did not accept the message: Inactive recipient");
      assert.equal(failedRow.providerMessageId, null);
      assert.equal(failedRow.sentAt, null);

      const thrown = await sendSupportReply(
        prisma,
        {
          ticketId: created.id,
          actorStaffId: staff.id,
          body: "Third try",
          clientSubmissionId: randomUUID(),
          fromEmail: "noreply@vssyl.com",
        },
        async () => {
          throw new Error("socket hang up");
        },
      );
      assert.equal(thrown.deliveryStatus, "FAILED");

      // Closed tickets are final and take no replies.
      await changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "CLOSED" });
      const closed = await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.id } });
      assert.ok(closed.closedAt);
      await rejectsWith(
        changeSupportTicketStatus(prisma, { ticketId: created.id, actorStaffId: staff.id, status: "OPEN" }),
        "ticket_closed",
      );
      await rejectsWith(
        sendSupportReply(
          prisma,
          { ticketId: created.id, actorStaffId: staff.id, body: "Late", clientSubmissionId: randomUUID() },
          async () => {
            throw new Error("must not send to a closed ticket");
          },
        ),
        "ticket_closed",
      );

      // Database CHECK constraints back the message-kind invariants.
      await assert.rejects(
        prisma.supportTicketMessage.create({
          data: { ticketId: second.id, kind: "NOTE", bodyText: "No author" },
        }),
      );
      await assert.rejects(
        prisma.supportTicketMessage.create({
          data: {
            ticketId: second.id,
            kind: "NOTE",
            authorStaffId: staff.id,
            bodyText: "Note with delivery",
            deliveryStatus: "SENT",
          },
        }),
      );
      await assert.rejects(
        prisma.supportTicketMessage.create({
          data: {
            ticketId: second.id,
            kind: "OUTBOUND",
            authorStaffId: staff.id,
            bodyText: "Reply without delivery state",
            clientSubmissionId: randomUUID(),
          },
        }),
      );
      await assert.rejects(
        prisma.supportTicketMessage.create({
          data: { ticketId: second.id, kind: "INBOUND", bodyText: "Inbound without contact" },
        }),
      );
      await assert.rejects(
        prisma.supportTicket.create({
          data: {
            replyToken: "Not-A-Token",
            subject: "Bad token",
            contactId: contactAfter.id,
          },
        }),
      );
      const tokenTicket = await prisma.supportTicket.create({
        data: { replyToken: generateSupportReplyToken(), subject: "Token ok", contactId: contactAfter.id },
      });
      ticketIds.push(tokenTicket.id);
      assert.equal(tokenTicket.status, "NEW");
      assert.equal(tokenTicket.priority, "NORMAL");
      assert.equal(tokenTicket.type, null);
    } finally {
      if (ticketIds.length) {
        await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicketAttachment.deleteMany({ where: { message: { ticketId: { in: ticketIds } } } });
        await prisma.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      }
      await prisma.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.supportStaffNotification.deleteMany({ where: { staffId: { in: staffIds } } });
      await prisma.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
      await prisma.facility.deleteMany({ where: { id: { in: facilityIds } } });
      if (orgId) {
        await prisma.organization.deleteMany({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    }
  },
);
