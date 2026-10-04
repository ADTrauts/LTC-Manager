/**
 * SQL-backed Harbor support notification tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { applySupportDeliveryEvent, parseSupportDeliveryEvent } from "./delivery-events";
import { postmarkBouncePayload, postmarkSpamComplaintPayload } from "./fixtures/postmark-delivery";
import { postmarkInboundPayload } from "./fixtures/postmark-inbound";
import { parsePostmarkInbound } from "./inbound-email";
import { processInboundSupportEmail } from "./inbound-service";
import { dispatchPendingSupportStaffNotificationEmails } from "./notification-email";
import {
  listSupportStaffNotifications,
  markAllSupportStaffNotificationsRead,
  markSupportStaffNotificationRead,
} from "./notifications";
import { sendSupportReply } from "./reply";
import { createSupportTicket, updateSupportTicketDetails } from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(5).toString("hex");
}

function inboundEmail(options: Parameters<typeof postmarkInboundPayload>[0]) {
  const parsed = parsePostmarkInbound(postmarkInboundPayload(options));
  assert.ok(parsed.ok);
  return parsed.email;
}

test(
  "support notifications: create, recipients, idempotency, read state, isolated email",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    const staffIds: string[] = [];
    let orgId: string | null = null;
    const facilityIds: string[] = [];

    try {
      const org = await db.organization.create({ data: { name: `Notify Org ${tag}` } });
      orgId = org.id;
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Notify Fac ${tag}` },
      });
      facilityIds.push(facility.id);
      const [me, other] = await Promise.all(
        ["me", "other"].map((key) =>
          db.platformStaff.create({
            data: {
              email: `notify-${key}-${tag}@vssyl.test`,
              displayName: `Notify ${key} ${tag}`,
              passwordHash: "x",
            },
          }),
        ),
      );
      staffIds.push(me.id, other.id);

      const created = await processInboundSupportEmail(
        db,
        inboundEmail({
          fromEmail: `ada-${tag}@example.com`,
          fromName: "Ada Lovelace",
          subject: "Report export failed",
          textBody: "Export is broken",
          messageId: `new-${tag}`,
        }),
      );
      assert.equal(created.result, "created");
      ticketIds.push(created.ticketId);
      contactEmails.push(`ada-${tag}@example.com`);

      const newRows = await db.supportStaffNotification.findMany({
        where: { ticketId: created.ticketId, type: "NEW_TICKET", staffId: { in: staffIds } },
      });
      assert.equal(newRows.length, 2);
      assert.ok(newRows.every((row) => row.title === "New support ticket"));
      assert.ok(newRows.every((row) => row.body.includes("Report export failed")));
      assert.ok(newRows.every((row) => row.body.includes("VSS-")));
      assert.ok(newRows.every((row) => !row.body.includes("Export is broken")));

      const again = await processInboundSupportEmail(
        db,
        inboundEmail({
          fromEmail: `ada-${tag}@example.com`,
          fromName: "Ada Lovelace",
          subject: "Report export failed",
          textBody: "Export is broken",
          messageId: `new-${tag}`,
        }),
      );
      assert.equal(again.result, "duplicate");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "NEW_TICKET", staffId: { in: staffIds } },
        }),
        2,
      );

      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: me.id,
        changes: { assignedStaffId: other.id },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "ASSIGNED_TO_ME", staffId: other.id },
        }),
        1,
      );
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "ASSIGNED_TO_ME", staffId: me.id },
        }),
        0,
      );

      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: other.id,
        changes: { assignedStaffId: other.id },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "ASSIGNED_TO_ME" },
        }),
        1,
      );

      const ticket = await db.supportTicket.findUniqueOrThrow({
        where: { id: created.ticketId },
        select: { replyToken: true, number: true },
      });
      const reply = await processInboundSupportEmail(
        db,
        inboundEmail({
          fromEmail: `ada-${tag}@example.com`,
          mailboxHash: ticket.replyToken,
          subject: `Re: [VSS-${ticket.number}] Report export failed`,
          textBody: "Still broken",
          messageId: `reply-${tag}`,
        }),
      );
      assert.equal(reply.result, "attached");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "CUSTOMER_REPLIED", staffId: other.id },
        }),
        1,
      );

      const auto = await processInboundSupportEmail(
        db,
        inboundEmail({
          fromEmail: `ada-${tag}@example.com`,
          mailboxHash: ticket.replyToken,
          subject: "Out of office",
          textBody: "Away",
          messageId: `auto-${tag}`,
          extraHeaders: [{ Name: "Auto-Submitted", Value: "auto-replied" }],
        }),
      );
      assert.equal(auto.result, "attached");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "CUSTOMER_REPLIED" },
        }),
        1,
      );

      const consoleTicket = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `sam-${tag}@example.com`,
        requesterName: "Sam",
        subject: `Note only ${tag}`,
        note: "Internal only",
      });
      ticketIds.push(consoleTicket.id);
      contactEmails.push(`sam-${tag}@example.com`);
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: consoleTicket.id },
        }),
        0,
      );

      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: me.id,
        changes: { priority: "HIGH" },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "HIGH_PRIORITY", staffId: other.id },
        }),
        1,
      );
      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: me.id,
        changes: { priority: "HIGH" },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "HIGH_PRIORITY" },
        }),
        1,
      );
      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: me.id,
        changes: { priority: "URGENT" },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "URGENT_PRIORITY", staffId: other.id },
        }),
        1,
      );
      await updateSupportTicketDetails(db, {
        ticketId: created.ticketId,
        actorStaffId: me.id,
        changes: { priority: "HIGH" },
      });
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "HIGH_PRIORITY" },
        }),
        1,
      );

      const unassignedUrgent = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `urgent-${tag}@example.com`,
        subject: `Unassigned urgent ${tag}`,
        priority: "URGENT",
      });
      ticketIds.push(unassignedUrgent.id);
      contactEmails.push(`urgent-${tag}@example.com`);
      const urgentFanout = await db.supportStaffNotification.findMany({
        where: { ticketId: unassignedUrgent.id, type: "URGENT_PRIORITY" },
        select: { staffId: true },
      });
      assert.equal(urgentFanout.some((row) => row.staffId === other.id), true);
      assert.equal(urgentFanout.some((row) => row.staffId === me.id), false);

      const outbound = await sendSupportReply(
        db,
        {
          ticketId: created.ticketId,
          actorStaffId: other.id,
          body: "Looking into this.",
          clientSubmissionId: randomUUID(),
        },
        async () => ({ sent: true, messageId: `pm-out-${tag}` }),
      );
      const bounce = parseSupportDeliveryEvent(postmarkBouncePayload({ messageId: `pm-out-${tag}` }));
      assert.ok(bounce.ok);
      assert.equal((await applySupportDeliveryEvent(db, bounce.event)).result, "applied");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "BOUNCED", staffId: other.id },
        }),
        1,
      );
      assert.equal((await applySupportDeliveryEvent(db, bounce.event)).result, "duplicate");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "BOUNCED" },
        }),
        1,
      );

      const failed = await sendSupportReply(
        db,
        {
          ticketId: created.ticketId,
          actorStaffId: other.id,
          body: "Second try.",
          clientSubmissionId: randomUUID(),
        },
        async () => ({ sent: false, reason: "send_failed", error: "boom" }),
      );
      assert.equal(failed.deliveryStatus, "FAILED");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "DELIVERY_FAILED", staffId: other.id },
        }),
        1,
      );

      const complaintMail = await sendSupportReply(
        db,
        {
          ticketId: created.ticketId,
          actorStaffId: other.id,
          body: "Third try.",
          clientSubmissionId: randomUUID(),
        },
        async () => ({ sent: true, messageId: `pm-spam-${tag}` }),
      );
      assert.equal(complaintMail.deliveryStatus, "SENT");
      const complaint = parseSupportDeliveryEvent(postmarkSpamComplaintPayload({ messageId: `pm-spam-${tag}` }));
      assert.ok(complaint.ok);
      assert.equal((await applySupportDeliveryEvent(db, complaint.event)).result, "applied");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, type: "SPAM_COMPLAINT", staffId: other.id },
        }),
        1,
      );

      const mine = await listSupportStaffNotifications(db, other.id);
      assert.ok(mine.unreadCount >= 4);
      const otherFeed = await listSupportStaffNotifications(db, me.id);
      assert.equal(
        otherFeed.items.some((item) => item.type === "ASSIGNED_TO_ME"),
        false,
      );

      const firstUnread = mine.items.find((item) => !item.isRead);
      assert.ok(firstUnread);
      await markSupportStaffNotificationRead(db, { staffId: other.id, id: firstUnread.id });
      assert.equal(
        (await db.supportStaffNotification.findUniqueOrThrow({ where: { id: firstUnread.id } })).isRead,
        true,
      );
      const stolen = await markSupportStaffNotificationRead(db, { staffId: me.id, id: firstUnread.id });
      assert.equal(stolen.ok, false);

      await markAllSupportStaffNotificationsRead(db, { staffId: other.id });
      assert.equal((await listSupportStaffNotifications(db, other.id)).unreadCount, 0);

      const sent: Array<{ to: string; subject: string; tag?: string; text?: string }> = [];
      await dispatchPendingSupportStaffNotificationEmails(
        db,
        { ticketId: created.ticketId },
        {
          env: { VSSYL_PUBLIC_URL: "https://vssyl.com", POSTMARK_SERVER_TOKEN: "test-token", POSTMARK_FROM_EMAIL: "noreply@vssyl.com" },
          send: async (message) => {
            sent.push(message);
            return { sent: true, messageId: `staff-${sent.length}` };
          },
        },
      );
      assert.ok(sent.length >= 1);
      assert.ok(sent.every((message) => message.to.endsWith("@vssyl.test")));
      assert.ok(sent.every((message) => !message.to.includes("ada-")));
      assert.ok(sent.every((message) => message.tag === "support-staff-notification"));
      assert.ok(sent.every((message) => message.subject.startsWith("[Vssyl Support]")));
      assert.ok(sent.every((message) => (message.text ?? "").includes("/console/tickets/")));
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: created.ticketId, emailStatus: "SENT" },
        }),
        sent.length,
      );

      const beforeFail = await db.supportTicket.count({ where: { id: created.ticketId } });
      await dispatchPendingSupportStaffNotificationEmails(
        db,
        { ticketId: created.ticketId },
        {
          env: { POSTMARK_SERVER_TOKEN: "test-token" },
          send: async () => {
            throw new Error("postmark down");
          },
        },
      );
      assert.equal(await db.supportTicket.count({ where: { id: created.ticketId } }), beforeFail);

      let failedOnce = false;
      const failingCreate = await processInboundSupportEmail(
        db,
        inboundEmail({
          fromEmail: `fail-${tag}@example.com`,
          subject: `Email fail ${tag}`,
          textBody: "Still a ticket",
          messageId: `fail-${tag}`,
        }),
      );
      assert.equal(failingCreate.result, "created");
      ticketIds.push(failingCreate.ticketId);
      contactEmails.push(`fail-${tag}@example.com`);
      await dispatchPendingSupportStaffNotificationEmails(
        db,
        { ticketId: failingCreate.ticketId },
        {
          env: { POSTMARK_SERVER_TOKEN: "test-token", POSTMARK_FROM_EMAIL: "noreply@vssyl.com" },
          send: async () => {
            failedOnce = true;
            return { sent: false, reason: "send_failed", error: "rejected" };
          },
        },
      );
      assert.equal(failedOnce, true);
      assert.equal((await db.supportTicket.findUniqueOrThrow({ where: { id: failingCreate.ticketId } })).status, "NEW");
      assert.equal(
        await db.supportStaffNotification.count({
          where: { ticketId: failingCreate.ticketId, staffId: { in: staffIds }, emailStatus: "FAILED" },
        }),
        2,
      );
    } finally {
      await db.supportStaffNotification.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      if (contactEmails.length) await db.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
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
