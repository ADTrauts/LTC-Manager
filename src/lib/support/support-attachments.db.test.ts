/**
 * SQL-backed support attachment tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { createMemorySupportAttachmentStore } from "./attachment-store";
import { persistInboundSupportAttachments } from "./attachments";
import { postmarkInboundPayload } from "./fixtures/postmark-inbound";
import { parsePostmarkInbound, readInboundAttachmentContents } from "./inbound-email";
import { processInboundSupportEmail } from "./inbound-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(6).toString("hex");
}

test(
  "support attachments: persist, retry, reject, and leave attachment-free mail unchanged",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const store = createMemorySupportAttachmentStore();
    const contactEmails: string[] = [];
    const ticketIds: string[] = [];

    try {
      const one = postmarkInboundPayload({
        fromEmail: `one-${tag}@example.com`,
        subject: "One file",
        attachments: false,
      });
      one.Attachments = [
        {
          Name: "screenshot.png",
          Content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          ContentType: "image/png",
          ContentLength: 68,
          ContentID: "ii_shot",
        },
      ];
      contactEmails.push(`one-${tag}@example.com`);
      const parsedOne = parsePostmarkInbound(one);
      assert.ok(parsedOne.ok);
      const created = await processInboundSupportEmail(prisma, parsedOne.email, {
        attachmentContents: readInboundAttachmentContents(one),
        attachmentStore: store,
      });
      assert.equal(created.result, "created");
      if (created.result !== "created") throw new Error("expected created");
      ticketIds.push(created.ticketId);

      const rows = await prisma.supportTicketAttachment.findMany({
        where: { messageId: created.messageId },
        orderBy: { position: "asc" },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.filename, "screenshot.png");
      assert.equal(rows[0]?.contentType, "image/png");
      assert.equal(rows[0]?.contentId, "ii_shot");
      assert.equal(rows[0]?.scanStatus, "PENDING");
      assert.equal(rows[0]?.rejectionReason, null);
      assert.ok(rows[0]?.checksumSha256);
      assert.ok(rows[0]?.storageKey);
      assert.ok(store.objects.has(`support/${created.ticketId}/${created.messageId}/${rows[0]?.id}`));
      assert.equal(await prisma.supportTicketMessage.count({ where: { ticketId: created.ticketId } }), 1);

      const replay = await processInboundSupportEmail(prisma, parsedOne.email, {
        attachmentContents: readInboundAttachmentContents(one),
        attachmentStore: store,
      });
      assert.equal(replay.result, "duplicate");
      assert.equal(await prisma.supportTicketAttachment.count({ where: { messageId: created.messageId } }), 1);
      assert.equal(await prisma.supportTicketMessage.count({ where: { ticketId: created.ticketId } }), 1);
      assert.equal(store.objects.size, 1);

      const many = postmarkInboundPayload({
        fromEmail: `many-${tag}@example.com`,
        subject: "Two files",
      });
      contactEmails.push(`many-${tag}@example.com`);
      const parsedMany = parsePostmarkInbound(many);
      assert.ok(parsedMany.ok);
      const createdMany = await processInboundSupportEmail(prisma, parsedMany.email, {
        attachmentContents: readInboundAttachmentContents(many),
        attachmentStore: store,
      });
      assert.ok(createdMany.result === "created");
      if (createdMany.result !== "created") throw new Error("expected created");
      ticketIds.push(createdMany.ticketId);
      assert.equal(await prisma.supportTicketAttachment.count({ where: { messageId: createdMany.messageId } }), 2);

      const bad = postmarkInboundPayload({
        fromEmail: `bad-${tag}@example.com`,
        subject: "Broken files",
        attachments: false,
      });
      bad.Attachments = [
        {
          Name: "broken.bin",
          Content: "%%%not-base64%%%",
          ContentType: "application/octet-stream",
          ContentLength: 12,
          ContentID: "",
        },
        {
          Name: "huge.bin",
          Content: "QQ==",
          ContentType: "application/octet-stream",
          ContentLength: 20 * 1024 * 1024,
          ContentID: "",
        },
        {
          Name: "malware.exe",
          Content: "TVqQAAMAAAAEAAAA",
          ContentType: "application/octet-stream",
          ContentLength: 12,
          ContentID: "",
        },
      ];
      contactEmails.push(`bad-${tag}@example.com`);
      const parsedBad = parsePostmarkInbound(bad);
      assert.ok(parsedBad.ok);
      const createdBad = await processInboundSupportEmail(prisma, parsedBad.email, {
        attachmentContents: readInboundAttachmentContents(bad),
        attachmentStore: store,
      });
      assert.ok(createdBad.result === "created");
      if (createdBad.result !== "created") throw new Error("expected created");
      ticketIds.push(createdBad.ticketId);
      const rejected = await prisma.supportTicketAttachment.findMany({
        where: { messageId: createdBad.messageId },
        orderBy: { position: "asc" },
      });
      assert.equal(rejected.map((row) => row.rejectionReason).join(","), "INVALID_BASE64,OVERSIZE,BLOCKED_TYPE");
      assert.ok(rejected.every((row) => row.scanStatus === "BLOCKED"));
      assert.ok(rejected.every((row) => row.storageKey === null));
      assert.equal(await prisma.supportTicketMessage.count({ where: { id: createdBad.messageId } }), 1);

      const none = postmarkInboundPayload({
        fromEmail: `none-${tag}@example.com`,
        subject: "No files",
        attachments: false,
      });
      contactEmails.push(`none-${tag}@example.com`);
      const parsedNone = parsePostmarkInbound(none);
      assert.ok(parsedNone.ok);
      const createdNone = await processInboundSupportEmail(prisma, parsedNone.email, {
        attachmentContents: readInboundAttachmentContents(none),
        attachmentStore: store,
      });
      assert.ok(createdNone.result === "created");
      if (createdNone.result !== "created") throw new Error("expected created");
      ticketIds.push(createdNone.ticketId);
      assert.equal(await prisma.supportTicketAttachment.count({ where: { messageId: createdNone.messageId } }), 0);

      const orphan = await persistInboundSupportAttachments(prisma, {
        ticketId: created.ticketId,
        messageId: created.messageId,
        attachments: parsedOne.email.attachments,
        contents: readInboundAttachmentContents(one),
        store,
      });
      assert.equal(orphan.length, 1);
      assert.equal(orphan[0]?.id, rows[0]?.id);
    } finally {
      if (ticketIds.length) {
        await prisma.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicketAttachment.deleteMany({ where: { message: { ticketId: { in: ticketIds } } } });
        await prisma.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
        await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      }
      await prisma.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
      await prisma.$disconnect();
    }
  },
);
