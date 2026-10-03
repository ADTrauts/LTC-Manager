/**
 * SQL-backed inbound support email tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { postmarkInboundPayload, type PostmarkInboundFixtureOptions } from "./fixtures/postmark-inbound";
import { parsePostmarkInbound } from "./inbound-email";
import { processInboundSupportEmail, type SupportInboundResult } from "./inbound-service";
import { sendSupportReply, type SupportReplyEmail } from "./reply";
import { changeSupportTicketStatus } from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function email(options: PostmarkInboundFixtureOptions) {
  const parsed = parsePostmarkInbound(postmarkInboundPayload(options));
  assert.ok(parsed.ok);
  return parsed.email;
}

function created(result: SupportInboundResult) {
  assert.ok(result.result === "created" || result.result === "attached", JSON.stringify(result));
  return result;
}

test(
  "support inbound email: new tickets, reply routing, lifecycle, idempotency, fallbacks",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = randomBytes(5).toString("hex");
    const addr = (name: string) => `${name}-${tag}@example.com`;
    const contactEmails = ["stranger", "known", "colleague", "other", "auto", "own"].map(addr);
    let orgId: string | null = null;
    let facilityId: string | null = null;
    let staffId: string | null = null;
    let userId: string | null = null;

    try {
      const org = await prisma.organization.create({ data: { name: `Inbound Org ${tag}` } });
      orgId = org.id;
      const facility = await prisma.facility.create({
        data: { organizationId: org.id, displayName: `Inbound Facility ${tag}` },
      });
      facilityId = facility.id;
      const role = await prisma.role.findFirstOrThrow({ select: { id: true } });
      const user = await prisma.user.create({
        data: {
          email: addr("known"),
          displayName: "Known User",
          facilityId: facility.id,
          roleId: role.id,
          emailVerifiedAt: new Date(),
        },
      });
      userId = user.id;
      const staff = await prisma.platformStaff.create({
        data: { email: `inbound-staff-${tag}@vssyl.test`, displayName: "Inbound Staff", passwordHash: "x" },
      });
      staffId = staff.id;

      // New ticket from an unknown sender.
      const first = email({
        fromEmail: addr("stranger").toUpperCase(),
        fromName: "Stranger",
        subject: "Fwd: RE: Cooler logs not saving",
        textBody: "Full text body",
        strippedTextReply: "Stripped reply",
        htmlBody: "<p onclick=x>Hi</p><script>alert(1)</script>",
      });
      const t0 = new Date("2026-10-01T12:00:00Z");
      const newResult = created(await processInboundSupportEmail(prisma, first, { now: t0 }));
      assert.equal(newResult.result, "created");
      assert.equal(newResult.routing, "new_ticket");
      const ticket = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: newResult.ticketId },
        include: { contact: true, events: true, messages: true },
      });
      assert.equal(ticket.status, "NEW");
      assert.equal(ticket.type, null);
      assert.equal(ticket.priority, "NORMAL");
      assert.equal(ticket.assignedStaffId, null);
      assert.equal(ticket.facilityId, null);
      assert.equal(ticket.subject, "Cooler logs not saving");
      assert.match(ticket.replyToken, /^[0-9a-f]{40}$/);
      assert.equal(ticket.contact.email, addr("stranger"));
      assert.equal(ticket.contact.displayName, "Stranger");
      assert.equal(ticket.contact.userId, null);
      assert.equal(ticket.events.length, 1);
      assert.equal(ticket.events[0].type, "CREATED");
      assert.equal(ticket.events[0].actorStaffId, null);
      assert.equal((ticket.events[0].metadata as Record<string, unknown>).source, "EMAIL");
      const inbound = ticket.messages[0];
      assert.equal(ticket.messages.length, 1);
      assert.equal(inbound.kind, "INBOUND");
      assert.equal(inbound.contactId, ticket.contactId);
      assert.equal(inbound.authorStaffId, null);
      assert.equal(inbound.deliveryStatus, null);
      assert.equal(inbound.providerMessageId, first.providerMessageId);
      assert.equal(inbound.internetMessageId, first.internetMessageId);
      assert.equal(inbound.fromEmail, addr("stranger"));
      assert.equal(inbound.fromName, "Stranger");
      assert.equal(inbound.bodyText, "Full text body");
      assert.equal(inbound.strippedReplyText, "Stripped reply");
      assert.equal(inbound.bodyHtml, "<p onclick=x>Hi</p><script>alert(1)</script>");
      assert.equal(inbound.subject, "Fwd: RE: Cooler logs not saving");
      assert.deepEqual(inbound.ccEmails, ["grace@example.com"]);
      assert.deepEqual(inbound.receivedAt, t0);
      assert.ok(Array.isArray(inbound.inboundHeaders));
      assert.deepEqual(
        (inbound.attachmentManifest as Array<{ name: string }>).map((entry) => entry.name),
        ["screenshot.png", "invoice.pdf"],
      );
      assert.equal(JSON.stringify(inbound.attachmentManifest).includes("iVBORw0KGgo"), false);

      // Same Postmark MessageID again: nothing new.
      const again = await processInboundSupportEmail(prisma, first);
      assert.deepEqual(again, {
        result: "duplicate",
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        messageId: inbound.id,
      });
      assert.equal(await prisma.supportTicketMessage.count({ where: { ticketId: ticket.id } }), 1);

      // Known verified user: contact links to the user and the ticket takes their facility.
      const known = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("known"), subject: "Billing question" })),
      );
      const knownTicket = await prisma.supportTicket.findUniqueOrThrow({
        where: { id: known.ticketId },
        include: { contact: true },
      });
      assert.equal(knownTicket.contact.userId, user.id);
      assert.equal(knownTicket.facilityId, facility.id);

      // Empty subject.
      const blank = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), subject: "" })),
      );
      assert.equal(
        (await prisma.supportTicket.findUniqueOrThrow({ where: { id: blank.ticketId } })).subject,
        "(No subject)",
      );

      // replyToken on a NEW ticket attaches and leaves it NEW.
      const t1 = new Date("2026-10-01T13:00:00Z");
      const onNew = created(
        await processInboundSupportEmail(
          prisma,
          email({ fromEmail: addr("stranger"), mailboxHash: ticket.replyToken, subject: "Re: whatever" }),
          { now: t1 },
        ),
      );
      assert.equal(onNew.result, "attached");
      assert.equal(onNew.routing, "reply_token");
      assert.equal(onNew.ticketId, ticket.id);
      assert.equal(onNew.statusChanged, false);
      let current = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(current.status, "NEW");
      assert.deepEqual(current.updatedAt, t1);

      // OPEN stays OPEN.
      await changeSupportTicketStatus(prisma, { ticketId: ticket.id, actorStaffId: staff.id, status: "OPEN" });
      created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), mailboxHash: ticket.replyToken })),
      );
      current = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(current.status, "OPEN");

      // WAITING_ON_CUSTOMER reopens to OPEN with an actor-less event tied to the message.
      await changeSupportTicketStatus(prisma, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      const waitingReply = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), mailboxHash: ticket.replyToken })),
      );
      assert.equal(waitingReply.statusChanged, true);
      const reopenEvent = await prisma.supportTicketEvent.findFirstOrThrow({
        where: { ticketId: ticket.id, causedByMessageId: waitingReply.messageId },
      });
      assert.equal(reopenEvent.type, "STATUS_CHANGED");
      assert.equal(reopenEvent.actorStaffId, null);
      assert.equal(reopenEvent.fromValue, "WAITING_ON_CUSTOMER");
      assert.equal(reopenEvent.toValue, "OPEN");

      // Automatic replies are recorded but never reopen.
      await changeSupportTicketStatus(prisma, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      const auto = created(
        await processInboundSupportEmail(
          prisma,
          email({
            fromEmail: addr("stranger"),
            mailboxHash: ticket.replyToken,
            extraHeaders: [{ Name: "Auto-Submitted", Value: "auto-replied" }],
          }),
        ),
      );
      assert.equal(auto.statusChanged, false);
      assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "WAITING_ON_CUSTOMER");

      // RESOLVED reopens and clears resolvedAt.
      await changeSupportTicketStatus(prisma, { ticketId: ticket.id, actorStaffId: staff.id, status: "RESOLVED" });
      assert.ok((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).resolvedAt);
      const resolvedReply = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), mailboxHash: ticket.replyToken })),
      );
      assert.equal(resolvedReply.statusChanged, true);
      current = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(current.status, "OPEN");
      assert.equal(current.resolvedAt, null);

      // A colleague replying with the token joins the same ticket under their own contact.
      const colleague = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("colleague"), mailboxHash: ticket.replyToken })),
      );
      assert.equal(colleague.ticketId, ticket.id);
      const colleagueMessage = await prisma.supportTicketMessage.findUniqueOrThrow({
        where: { id: colleague.messageId },
        include: { contact: true },
      });
      assert.equal(colleagueMessage.contact?.email, addr("colleague"));
      assert.notEqual(colleagueMessage.contactId, ticket.contactId);
      assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).contactId, ticket.contactId);

      // Unknown and malformed tokens fall through to a new ticket.
      for (const hash of ["f".repeat(40), "not-a-token"]) {
        const fallback = created(
          await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), mailboxHash: hash })),
        );
        assert.equal(fallback.result, "created");
        assert.notEqual(fallback.ticketId, ticket.id);
      }

      // RFC fallback: a reply that lost the token but quotes our outbound Message-ID.
      const sent: SupportReplyEmail[] = [];
      const outbound = await sendSupportReply(
        prisma,
        {
          ticketId: ticket.id,
          actorStaffId: staff.id,
          body: "Try again now.",
          clientSubmissionId: randomUUID(),
          status: "WAITING_ON_CUSTOMER",
          fromEmail: "Vssyl Support <support@vssyl.test>",
          replyTo: `support+${ticket.replyToken}@reply.vssyl.test`,
        },
        async (message) => {
          sent.push(message);
          return { sent: true, messageId: `pm-out-${tag}` };
        },
      );
      assert.equal(sent[0].from, "Vssyl Support <support@vssyl.test>");
      assert.equal(sent[0].replyTo, `support+${ticket.replyToken}@reply.vssyl.test`);
      const outboundRow = await prisma.supportTicketMessage.findUniqueOrThrow({ where: { id: outbound.messageId } });
      assert.equal(outboundRow.replyTo, `support+${ticket.replyToken}@reply.vssyl.test`);
      assert.ok(outboundRow.internetMessageId);
      const viaInReplyTo = created(
        await processInboundSupportEmail(
          prisma,
          email({ fromEmail: addr("stranger"), inReplyTo: outboundRow.internetMessageId! }),
        ),
      );
      assert.equal(viaInReplyTo.routing, "in_reply_to");
      assert.equal(viaInReplyTo.ticketId, ticket.id);
      const viaReferences = created(
        await processInboundSupportEmail(
          prisma,
          email({ fromEmail: addr("other"), references: [`unknown-${tag}@x.example`, outboundRow.internetMessageId!] }),
        ),
      );
      assert.equal(viaReferences.routing, "references");
      assert.equal(viaReferences.ticketId, ticket.id);

      // Subject marker attaches only for the ticket's own requester.
      const marker = `Re: [VSS-${ticket.number}] Cooler logs`;
      const fromRequester = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), subject: marker })),
      );
      assert.equal(fromRequester.routing, "subject_marker");
      assert.equal(fromRequester.ticketId, ticket.id);
      const fromOther = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("other"), subject: marker })),
      );
      assert.equal(fromOther.result, "created");
      assert.notEqual(fromOther.ticketId, ticket.id);
      assert.equal(
        (await prisma.supportTicket.findUniqueOrThrow({ where: { id: fromOther.ticketId } })).subject,
        "Cooler logs",
      );

      // CLOSED is final: the reply opens a follow-up ticket that points back.
      await changeSupportTicketStatus(prisma, { ticketId: ticket.id, actorStaffId: staff.id, status: "CLOSED" });
      const afterClose = created(
        await processInboundSupportEmail(prisma, email({ fromEmail: addr("stranger"), mailboxHash: ticket.replyToken })),
      );
      assert.equal(afterClose.result, "created");
      assert.equal(afterClose.followUpOfTicketNumber, ticket.number);
      assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "CLOSED");
      const followUpCreated = await prisma.supportTicketEvent.findFirstOrThrow({
        where: { ticketId: afterClose.ticketId, type: "CREATED" },
      });
      assert.equal(
        (followUpCreated.metadata as Record<string, unknown>).previousTicketNumber,
        `VSS-${ticket.number}`,
      );
      const followUp = await prisma.supportTicket.findUniqueOrThrow({ where: { id: afterClose.ticketId } });
      assert.equal(followUp.status, "NEW");
      assert.notEqual(followUp.replyToken, ticket.replyToken);

      // Concurrent deliveries of one Postmark message produce one message and one ticket.
      const raced = email({ fromEmail: addr("auto") });
      const results = await Promise.all([
        processInboundSupportEmail(prisma, raced),
        processInboundSupportEmail(prisma, raced),
        processInboundSupportEmail(prisma, raced),
      ]);
      assert.equal(results.filter((result) => result.result === "created").length, 1);
      assert.equal(results.filter((result) => result.result === "duplicate").length, 2);
      assert.equal(
        await prisma.supportTicketMessage.count({ where: { providerMessageId: raced.providerMessageId } }),
        1,
      );
      assert.equal(
        await prisma.supportTicket.count({ where: { contact: { email: addr("auto") } } }),
        1,
      );

      // The same email via a second Vssyl address (new Postmark id, same RFC id) is one message.
      const secondCopy = { ...raced, providerMessageId: randomUUID() };
      assert.equal((await processInboundSupportEmail(prisma, secondCopy)).result, "duplicate");

      // Mail from Vssyl's own sender never becomes a ticket.
      const own = await processInboundSupportEmail(prisma, email({ fromEmail: addr("own") }), {
        isOwnAddress: (address) => address === addr("own"),
      });
      assert.deepEqual(own, { result: "ignored", reason: "own_address" });
      assert.equal(await prisma.supportContact.count({ where: { email: addr("own") } }), 0);
    } finally {
      const contacts = await prisma.supportContact.findMany({
        where: { email: { in: contactEmails } },
        select: { id: true },
      });
      const contactIds = contacts.map((row) => row.id);
      const tickets = await prisma.supportTicket.findMany({
        where: { OR: [{ contactId: { in: contactIds } }, { messages: { some: { contactId: { in: contactIds } } } }] },
        select: { id: true },
      });
      const ticketIds = tickets.map((row) => row.id);
      await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.supportTicketAttachment.deleteMany({ where: { message: { ticketId: { in: ticketIds } } } });
      await prisma.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      await prisma.supportContact.deleteMany({ where: { id: { in: contactIds } } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      if (staffId) await prisma.platformStaff.deleteMany({ where: { id: staffId } });
      if (facilityId) await prisma.facility.deleteMany({ where: { id: facilityId } });
      if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.$disconnect();
    }
  },
);
