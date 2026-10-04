/**
 * SQL-backed outbound delivery / bounce / complaint tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { applySupportDeliveryEvent, parseSupportDeliveryEvent } from "./delivery-events";
import {
  postmarkBouncePayload,
  postmarkDeliveryPayload,
  postmarkSpamComplaintPayload,
} from "./fixtures/postmark-delivery";
import { postmarkInboundPayload } from "./fixtures/postmark-inbound";
import { parsePostmarkInbound } from "./inbound-email";
import { processInboundSupportEmail } from "./inbound-service";
import { sendSupportReply, type SupportReplyEmail } from "./reply";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function parsed(raw: unknown) {
  const result = parseSupportDeliveryEvent(raw);
  assert.ok(result.ok, JSON.stringify(result));
  return result.event;
}

test(
  "support outbound delivery events: delivered, bounce, complaint, idempotency, ordering",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = randomBytes(5).toString("hex");
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    let orgId: string | null = null;
    const staffIds: string[] = [];

    try {
      const org = await prisma.organization.create({ data: { name: `Delivery Org ${tag}` } });
      orgId = org.id;
      const staff = await prisma.platformStaff.create({
        data: { email: `delivery-staff-${tag}@vssyl.test`, displayName: "Delivery Staff", passwordHash: "x" },
      });
      staffIds.push(staff.id);
      const contactEmail = `customer-${tag}@example.com`;
      contactEmails.push(contactEmail);

      const inbound = parsePostmarkInbound(
        postmarkInboundPayload({
          fromEmail: contactEmail,
          subject: "Need help",
          textBody: "Please reply",
          messageId: `in-${tag}`,
        }),
      );
      assert.ok(inbound.ok);
      const created = await processInboundSupportEmail(prisma, inbound.email);
      assert.ok(created.result === "created");
      ticketIds.push(created.ticketId);

      const send =
        (messageId: string): ((email: SupportReplyEmail) => Promise<{ sent: true; messageId: string }>) =>
        async () => ({ sent: true, messageId });

      const reply = await sendSupportReply(
        prisma,
        {
          ticketId: created.ticketId,
          actorStaffId: staff.id,
          body: "We are looking into it.",
          clientSubmissionId: randomUUID(),
          status: "WAITING_ON_CUSTOMER",
        },
        send(`pm-wait-${tag}`),
      );
      assert.equal(reply.deliveryStatus, "SENT");

      const delivered = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkDeliveryPayload({ messageId: `pm-wait-${tag}` })),
      );
      assert.equal(delivered.result, "applied");
      if (delivered.result !== "applied") throw new Error("expected applied");
      assert.equal(delivered.deliveryStatus, "DELIVERED");
      const afterDelivery = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: reply.messageId } });
      assert.equal(afterDelivery.deliveryStatus, "DELIVERED");
      assert.ok(afterDelivery.deliveredAt);

      const deliveryAgain = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkDeliveryPayload({ messageId: `pm-wait-${tag}` })),
      );
      assert.equal(deliveryAgain.result, "duplicate");
      assert.equal(
        await prisma.supportTicketMessage.count({
          where: { id: reply.messageId, deliveryStatus: "DELIVERED" },
        }),
        1,
      );

      const bounce = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkBouncePayload({ messageId: `pm-wait-${tag}` })),
      );
      assert.equal(bounce.result, "applied");
      const bounced = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: reply.messageId } });
      assert.equal(bounced.deliveryStatus, "BOUNCED");
      assert.equal(bounced.bounceType, "HardBounce");
      assert.equal(bounced.bounceCode, "1");
      assert.ok(bounced.bouncedAt);
      assert.ok(bounced.deliveredAt, "prior delivery timestamp is kept");

      const bounceAgain = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkBouncePayload({ messageId: `pm-wait-${tag}` })),
      );
      assert.equal(bounceAgain.result, "duplicate");
      assert.equal(
        await prisma.supportTicketEvent.count({
          where: { causedByMessageId: reply.messageId, type: "EMAIL_BOUNCED" },
        }),
        1,
      );

      const ticketAfterBounce = await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId } });
      assert.equal(ticketAfterBounce.status, "OPEN");
      assert.ok(
        (await prisma.supportTicketEvent.findMany({ where: { ticketId: created.ticketId, type: "STATUS_CHANGED" } })).some(
          (event) => event.fromValue === "WAITING_ON_CUSTOMER" && event.toValue === "OPEN",
        ),
      );

      const laterDelivery = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkDeliveryPayload({ messageId: `pm-wait-${tag}` })),
      );
      assert.equal(laterDelivery.result, "ignored");
      assert.equal(
        (await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: reply.messageId } })).deliveryStatus,
        "BOUNCED",
      );

      const second = await sendSupportReply(
        prisma,
        {
          ticketId: created.ticketId,
          actorStaffId: staff.id,
          body: "Second reply.",
          clientSubmissionId: randomUUID(),
        },
        send(`pm-second-${tag}`),
      );
      const complaint = await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkSpamComplaintPayload({ messageId: `pm-second-${tag}` })),
      );
      assert.equal(complaint.result, "applied");
      const complained = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: second.messageId } });
      assert.equal(complained.deliveryStatus, "SPAM_COMPLAINT");
      assert.equal(complained.complaintType, "SpamComplaint");
      assert.ok(complained.complainedAt);
      assert.equal(
        await prisma.supportTicketEvent.count({
          where: { causedByMessageId: second.messageId, type: "EMAIL_COMPLAINT" },
        }),
        1,
      );

      const unknownBefore = await prisma.supportTicketMessage.count({ where: { ticketId: created.ticketId } });
      const unknown = await applySupportDeliveryEvent(prisma, parsed(postmarkDeliveryPayload({ messageId: `pm-none-${tag}` })));
      assert.equal(unknown.result, "unknown");
      assert.equal(await prisma.supportTicketMessage.count({ where: { ticketId: created.ticketId } }), unknownBefore);

      const soft = await sendSupportReply(
        prisma,
        {
          ticketId: created.ticketId,
          actorStaffId: staff.id,
          body: "Soft bounce reply.",
          clientSubmissionId: randomUUID(),
          status: "WAITING_ON_CUSTOMER",
        },
        send(`pm-soft-${tag}`),
      );
      await applySupportDeliveryEvent(
        prisma,
        parsed(postmarkBouncePayload({ messageId: `pm-soft-${tag}`, type: "SoftBounce", typeCode: 4096, inactive: false })),
      );
      assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId } })).status, "WAITING_ON_CUSTOMER");
      assert.equal(
        (await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: soft.messageId } })).deliveryStatus,
        "BOUNCED",
      );

      const inboundAgain = parsePostmarkInbound(
        postmarkInboundPayload({
          fromEmail: contactEmail,
          subject: "Re: Need help",
          textBody: "Thanks",
          messageId: `in-again-${tag}`,
          mailboxHash: (await prisma.supportTicket.findUniqueOrThrow({ where: { id: created.ticketId } })).replyToken,
        }),
      );
      assert.ok(inboundAgain.ok);
      const threaded = await processInboundSupportEmail(prisma, inboundAgain.email);
      assert.equal(threaded.result, "attached");
      assert.equal(threaded.result === "attached" && threaded.ticketId, created.ticketId);
    } finally {
      if (ticketIds.length) {
        await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      }
      if (contactEmails.length) {
        await prisma.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
      }
      if (staffIds.length) {
        await prisma.supportStaffNotification.deleteMany({ where: { staffId: { in: staffIds } } });
        await prisma.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
      }
      if (orgId) {
        await prisma.facility.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
      await prisma.$disconnect();
    }
  },
);
