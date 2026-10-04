/**
 * SQL-backed support automation tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  createSupportAutomationRule,
  setSupportAutomationRuleActive,
} from "./automation";
import { processSupportAutomations } from "./automation-processor";
import type { SupportReplyEmailSender } from "./reply";
import { createSupportSavedReply } from "./saved-replies";
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
  return randomBytes(5).toString("hex");
}

const sent: SupportReplyEmailSender = async () => ({ sent: true, messageId: `pm-${randomUUID()}` });
const failed: SupportReplyEmailSender = async () => ({
  sent: false,
  reason: "send_failed",
  error: "rejected",
});

test(
  "support automation: timing, safety, lifecycle, and concurrency",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    const staffIds: string[] = [];
    const ruleIds: string[] = [];
    const replyIds: string[] = [];
    let orgId: string | null = null;

    try {
      const org = await db.organization.create({ data: { name: `Auto Org ${tag}` } });
      orgId = org.id;
      const staff = await db.platformStaff.create({
        data: {
          email: `auto-${tag}@vssyl.test`,
          displayName: `Auto ${tag}`,
          passwordHash: "x",
        },
      });
      staffIds.push(staff.id);
      const reply = await createSupportSavedReply(db, {
        actorStaffId: staff.id,
        name: `Waiting check-in ${tag}`,
        body: "Checking in on {{ticket.number}}.",
      });
      replyIds.push(reply.id);

      const make = async (subject: string, email = `ada-${tag}@example.com`) => {
        contactEmails.push(email);
        const ticket = await createSupportTicket(db, {
          actorStaffId: staff.id,
          requesterEmail: email,
          requesterName: `Ada ${tag}`,
          subject: `${subject} ${tag}`,
        });
        ticketIds.push(ticket.id);
        return ticket;
      };

      const waiting = await make("Waiting reminder");
      await changeSupportTicketStatus(db, {
        ticketId: waiting.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      const early = new Date("2026-10-01T12:00:00.000Z");
      const due = new Date("2026-09-20T12:00:00.000Z");
      const now = new Date("2026-10-01T15:00:00.000Z");
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${early} WHERE "ticketId" = ${waiting.id} AND type = 'STATUS_CHANGED'`;

      const reminder = await createSupportAutomationRule(db, {
        actorStaffId: staff.id,
        name: `Reminder ${tag}`,
        type: "WAITING_REMINDER",
        delayMinutes: 5 * 1440,
        savedReplyId: reply.id,
        isActive: true,
      });
      ruleIds.push(reminder.id);

      const before = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(before.applied, 0);
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: waiting.id } })).status,
        "WAITING_ON_CUSTOMER",
      );

      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${waiting.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const first = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(first.applied, 1);
      const afterReminder = await db.supportTicket.findUniqueOrThrow({
        where: { id: waiting.id },
        include: { messages: true, events: true },
      });
      assert.equal(afterReminder.status, "WAITING_ON_CUSTOMER");
      assert.equal(afterReminder.messages.filter((row) => row.kind === "OUTBOUND").length, 1);
      assert.ok(afterReminder.events.some((row) => row.type === "AUTOMATION_APPLIED"));

      const second = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(second.applied, 0);
      assert.equal(
        (await db.supportTicketMessage.count({ where: { ticketId: waiting.id, kind: "OUTBOUND" } })),
        1,
      );

      const noted = await make("Note does not reset", `note-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: noted.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${noted.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      await addSupportTicketNote(db, {
        ticketId: noted.id,
        actorStaffId: staff.id,
        body: "internal only",
        clientSubmissionId: randomUUID(),
      });
      await updateSupportTicketDetails(db, {
        ticketId: noted.id,
        actorStaffId: staff.id,
        changes: { assignedStaffId: staff.id },
      });
      const notedRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(notedRun.applied, 1);

      const replied = await make("Customer replied", `reply-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: replied.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${replied.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      await changeSupportTicketStatus(db, {
        ticketId: replied.id,
        actorStaffId: staff.id,
        status: "OPEN",
      });
      const repliedRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(repliedRun.applied, 0);

      const bounced = await make("Bounced", `bounce-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: bounced.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${bounced.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      await db.supportTicketMessage.create({
        data: {
          ticketId: bounced.id,
          kind: "OUTBOUND",
          authorStaffId: staff.id,
          bodyText: "earlier",
          fromEmail: "support@vssyl.com",
          toEmails: [`bounce-${tag}@example.com`],
          deliveryStatus: "BOUNCED",
          clientSubmissionId: randomUUID(),
        },
      });
      const bounceRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(bounceRun.applied, 0);

      const complained = await make("Complained", `spam-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: complained.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${complained.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      await db.supportTicketMessage.create({
        data: {
          ticketId: complained.id,
          kind: "OUTBOUND",
          authorStaffId: staff.id,
          bodyText: "earlier",
          fromEmail: "support@vssyl.com",
          toEmails: [`spam-${tag}@example.com`],
          deliveryStatus: "SPAM_COMPLAINT",
          clientSubmissionId: randomUUID(),
        },
      });
      const spamRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(spamRun.applied, 0);

      const failedTicket = await make("Failed delivery", `fail-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: failedTicket.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${failedTicket.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const failSend = await processSupportAutomations(db, {
        now,
        send: failed,
        ruleIds: [reminder.id],
      });
      assert.equal(failSend.applied, 0);
      assert.equal(failSend.failed, 1);
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: failedTicket.id } })).status,
        "WAITING_ON_CUSTOMER",
      );

      const closed = await make("Already closed", `closed-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: closed.id,
        actorStaffId: staff.id,
        status: "CLOSED",
      });
      const closedRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(closedRun.applied, 0);

      await setSupportAutomationRuleActive(db, { ruleId: reminder.id, isActive: false });
      const inactive = await processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] });
      assert.equal(inactive.applied, 0);
      await setSupportAutomationRuleActive(db, { ruleId: reminder.id, isActive: true });

      for (const id of [waiting.id, noted.id, bounced.id, complained.id, failedTicket.id]) {
        const row = await db.supportTicket.findUniqueOrThrow({ where: { id }, select: { status: true } });
        if (row.status === "WAITING_ON_CUSTOMER") {
          await changeSupportTicketStatus(db, { ticketId: id, actorStaffId: staff.id, status: "OPEN" });
        }
      }

      const resolveTarget = await make("Resolve no response", `resolve-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: resolveTarget.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${resolveTarget.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const resolveRule = await createSupportAutomationRule(db, {
        actorStaffId: staff.id,
        name: `Resolve ${tag}`,
        type: "WAITING_RESOLVE",
        delayMinutes: 10 * 1440,
        savedReplyId: reply.id,
        isActive: true,
      });
      ruleIds.push(resolveRule.id);
      const resolveNow = new Date("2026-10-05T12:00:00.000Z");
      const resolved = await processSupportAutomations(db, {
        now: resolveNow,
        send: sent,
        ruleIds: [resolveRule.id],
      });
      assert.equal(resolved.applied, 1);
      const resolvedRow = await db.supportTicket.findUniqueOrThrow({ where: { id: resolveTarget.id } });
      assert.equal(resolvedRow.status, "RESOLVED");
      assert.ok(resolvedRow.resolvedAt);
      assert.ok(
        (await db.supportTicketEvent.findFirst({
          where: { ticketId: resolveTarget.id, type: "STATUS_CHANGED", toValue: "RESOLVED" },
        }))?.metadata &&
          JSON.stringify(
            (
              await db.supportTicketEvent.findFirstOrThrow({
                where: { ticketId: resolveTarget.id, type: "STATUS_CHANGED", toValue: "RESOLVED" },
              })
            ).metadata,
          ).includes("AUTOMATION"),
      );

      const noMail = await make("Direct resolve", `direct-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: noMail.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${noMail.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const silentResolve = await createSupportAutomationRule(db, {
        actorStaffId: staff.id,
        name: `Silent resolve ${tag}`,
        type: "WAITING_RESOLVE",
        delayMinutes: 1,
        isActive: true,
      });
      ruleIds.push(silentResolve.id);
      const silent = await processSupportAutomations(db, {
        now: resolveNow,
        send: failed,
        ruleIds: [silentResolve.id],
      });
      assert.equal(silent.applied, 1);
      assert.equal((await db.supportTicket.findUniqueOrThrow({ where: { id: noMail.id } })).status, "RESOLVED");

      const failedFinal = await make("Failed final", `finalfail-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: failedFinal.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${failedFinal.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const finalFail = await processSupportAutomations(db, {
        now: resolveNow,
        send: failed,
        ruleIds: [resolveRule.id],
      });
      assert.equal(finalFail.applied, 0);
      assert.equal(
        (await db.supportTicket.findUniqueOrThrow({ where: { id: failedFinal.id } })).status,
        "WAITING_ON_CUSTOMER",
      );

      const closeTarget = await make("Close resolved", `close-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: closeTarget.id,
        actorStaffId: staff.id,
        status: "RESOLVED",
      });
      const resolvedAt = new Date("2026-09-20T12:00:00.000Z");
      await db.supportTicket.update({
        where: { id: closeTarget.id },
        data: { resolvedAt },
      });
      const closeRule = await createSupportAutomationRule(db, {
        actorStaffId: staff.id,
        name: `Close ${tag}`,
        type: "RESOLVED_CLOSE",
        delayMinutes: 7 * 1440,
        isActive: true,
      });
      ruleIds.push(closeRule.id);
      const closedAuto = await processSupportAutomations(db, {
        now,
        send: sent,
        ruleIds: [closeRule.id],
      });
      assert.equal(closedAuto.applied, 1);
      const closedRow = await db.supportTicket.findUniqueOrThrow({ where: { id: closeTarget.id } });
      assert.equal(closedRow.status, "CLOSED");
      assert.ok(closedRow.closedAt);

      const unassigned = await make("Unassigned sits", `unassigned-${tag}@example.com`);
      await db.supportTicket.update({
        where: { id: unassigned.id },
        data: { createdAt: due, assignedStaffId: null, status: "NEW" },
      });
      const alertRule = await createSupportAutomationRule(db, {
        actorStaffId: staff.id,
        name: `Unassigned ${tag}`,
        type: "UNASSIGNED_ALERT",
        delayMinutes: 120,
        isActive: true,
      });
      ruleIds.push(alertRule.id);
      const alerted = await processSupportAutomations(db, { now, send: sent, ruleIds: [alertRule.id] });
      assert.equal(alerted.applied, 1);
      assert.ok(
        (await db.supportStaffNotification.count({
          where: { ticketId: unassigned.id, type: "UNASSIGNED_ALERT" },
        })) >= 1,
      );
      const assigned = await make("Assigned skip", `assigned-${tag}@example.com`);
      await updateSupportTicketDetails(db, {
        ticketId: assigned.id,
        actorStaffId: staff.id,
        changes: { assignedStaffId: staff.id },
      });
      await db.supportTicket.update({ where: { id: assigned.id }, data: { createdAt: due } });
      const assignedRun = await processSupportAutomations(db, { now, send: sent, ruleIds: [alertRule.id] });
      assert.equal(assignedRun.applied, 0);

      const race = await make("Race", `race-${tag}@example.com`);
      await changeSupportTicketStatus(db, {
        ticketId: race.id,
        actorStaffId: staff.id,
        status: "WAITING_ON_CUSTOMER",
      });
      await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${race.id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      const [a, b] = await Promise.all([
        processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] }),
        processSupportAutomations(db, { now, send: sent, ruleIds: [reminder.id] }),
      ]);
      assert.equal(a.applied + b.applied, 1);
      assert.equal(
        await db.supportTicketMessage.count({ where: { ticketId: race.id, kind: "OUTBOUND" } }),
        1,
      );

      let sawFailure = false;
      const boom: SupportReplyEmailSender = async (email) => {
        if (email.ticketSubject.includes("Boom")) {
          sawFailure = true;
          throw new Error("boom");
        }
        return sent(email);
      };
      const boomTicket = await make("Boom", `boom-${tag}@example.com`);
      const okTicket = await make("Survivor", `ok-${tag}@example.com`);
      for (const id of [boomTicket.id, okTicket.id]) {
        await changeSupportTicketStatus(db, {
          ticketId: id,
          actorStaffId: staff.id,
          status: "WAITING_ON_CUSTOMER",
        });
        await db.$executeRaw`UPDATE "SupportTicketEvent" SET "createdAt" = ${due} WHERE "ticketId" = ${id} AND type = 'STATUS_CHANGED' AND "toValue" = 'WAITING_ON_CUSTOMER'`;
      }
      const mixed = await processSupportAutomations(db, { now, send: boom, ruleIds: [reminder.id] });
      assert.equal(sawFailure, true);
      assert.equal(mixed.failed >= 1, true);
      assert.equal(mixed.applied >= 1, true);
      assert.equal((await db.supportTicket.findUniqueOrThrow({ where: { id: okTicket.id } })).status, "WAITING_ON_CUSTOMER");
    } finally {
      await db.supportAutomationRun.deleteMany({ where: { ruleId: { in: ruleIds } } });
      await db.supportAutomationRule.deleteMany({ where: { id: { in: ruleIds } } });
      await db.supportStaffNotification.deleteMany({
        where: { OR: [{ ticketId: { in: ticketIds } }, { staffId: { in: staffIds } }] },
      });
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      if (replyIds.length) await db.supportSavedReply.deleteMany({ where: { id: { in: replyIds } } });
      if (contactEmails.length) await db.supportContact.deleteMany({ where: { email: { in: contactEmails } } });
      if (staffIds.length) {
        await db.supportStaffNotification.deleteMany({ where: { staffId: { in: staffIds } } });
        await db.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
      }
      if (orgId) await db.organization.delete({ where: { id: orgId } });
      await db.$disconnect();
    }
  },
);
