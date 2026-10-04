/**
 * SQL-backed support macro tests.
 * Opt in via SUPPORT_TICKETS_TEST_DATABASE_URL / VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { SupportTicketError } from "./errors";
import {
  applySupportMacro,
  createSupportMacro,
  listSupportMacros,
  setSupportMacroActive,
  updateSupportMacro,
} from "./macros";
import { createSupportSavedReply, setSupportSavedReplyActive } from "./saved-replies";
import { createSupportTag, setSupportTagActive } from "./tags";
import { changeSupportTicketStatus, createSupportTicket } from "./ticket-service";

const databaseUrl =
  process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set SUPPORT_TICKETS_TEST_DATABASE_URL to a disposable migrated database to run these";

function suffix() {
  return randomBytes(5).toString("hex");
}

test(
  "macros: management, atomic apply, events, no auto-send",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const tag = suffix();
    const ticketIds: string[] = [];
    const contactEmails: string[] = [];
    const replyIds: string[] = [];
    const tagIds: string[] = [];
    const macroIds: string[] = [];
    const staffIds: string[] = [];
    let orgId: string | null = null;
    const facilityIds: string[] = [];

    try {
      const org = await db.organization.create({ data: { name: `Macro Org ${tag}` } });
      orgId = org.id;
      const facility = await db.facility.create({
        data: { organizationId: org.id, displayName: `Macro Fac ${tag}` },
      });
      facilityIds.push(facility.id);
      const [me, other] = await Promise.all(
        ["me", "other"].map((key) =>
          db.platformStaff.create({
            data: {
              email: `macro-${key}-${tag}@vssyl.test`,
              displayName: `Macro ${key} ${tag}`,
              passwordHash: "x",
            },
          }),
        ),
      );
      staffIds.push(me.id, other.id);

      const reply = await createSupportSavedReply(db, {
        actorStaffId: me.id,
        name: `Need info ${tag}`,
        body: "Hi {{customer.first_name}} about {{ticket.number}} at {{facility.name}} — {{staff.name}}",
      });
      replyIds.push(reply.id);
      const reporting = await createSupportTag(db, { name: `Reporting ${tag}` });
      const exportTag = await createSupportTag(db, { name: `Export ${tag}` });
      tagIds.push(reporting.id, exportTag.id);

      const created = await createSupportMacro(db, {
        actorStaffId: me.id,
        name: `Need info ${tag}`,
        description: "Ask for more detail",
        savedReplyId: reply.id,
        status: "WAITING_ON_CUSTOMER",
        statusAfterReply: "WAITING_ON_CUSTOMER",
        type: "SUPPORT",
        priority: "HIGH",
        assignmentMode: "ME",
        assignedStaffId: null,
        tagIds: [reporting.id, exportTag.id],
      });
      macroIds.push(created.id);
      assert.equal(created.status, null);
      assert.equal(created.statusAfterReply, "WAITING_ON_CUSTOMER");

      const edited = await updateSupportMacro(db, {
        id: created.id,
        name: created.name,
        description: created.description,
        savedReplyId: reply.id,
        status: null,
        statusAfterReply: "WAITING_ON_CUSTOMER",
        type: "BUG",
        priority: "HIGH",
        assignmentMode: "ME",
        assignedStaffId: null,
        tagIds: [reporting.id, exportTag.id],
      });
      assert.equal(edited.type, "BUG");

      await setSupportMacroActive(db, { id: created.id, isActive: false });
      assert.equal((await listSupportMacros(db, { activeOnly: true })).some((row) => row.id === created.id), false);
      await setSupportMacroActive(db, { id: created.id, isActive: true });

      await assert.rejects(
        () =>
          createSupportMacro(db, {
            actorStaffId: me.id,
            name: `Bad staff ${tag}`,
            description: null,
            savedReplyId: null,
            status: null,
            statusAfterReply: null,
            type: null,
            priority: null,
            assignmentMode: "STAFF",
            assignedStaffId: "not-a-staff-id",
            tagIds: [],
          }),
        (error: unknown) => error instanceof SupportTicketError && error.code === "invalid_reference",
      );

      const inactiveTag = await createSupportTag(db, { name: `Inactive ${tag}` });
      tagIds.push(inactiveTag.id);
      await setSupportTagActive(db, { id: inactiveTag.id, isActive: false });
      await assert.rejects(
        () =>
          createSupportMacro(db, {
            actorStaffId: me.id,
            name: `Bad tag ${tag}`,
            description: null,
            savedReplyId: null,
            status: null,
            statusAfterReply: null,
            type: null,
            priority: null,
            assignmentMode: "UNCHANGED",
            assignedStaffId: null,
            tagIds: [inactiveTag.id],
          }),
        (error: unknown) => error instanceof SupportTicketError && error.code === "invalid_input",
      );

      const ticket = await createSupportTicket(db, {
        actorStaffId: other.id,
        requesterEmail: `ada-${tag}@example.com`,
        requesterName: "Ada Lovelace",
        subject: `Macro ticket ${tag}`,
        facilityId: facility.id,
      });
      ticketIds.push(ticket.id);
      contactEmails.push(`ada-${tag}@example.com`);

      const applied = await applySupportMacro(db, {
        ticketId: ticket.id,
        macroId: created.id,
        actorStaffId: me.id,
        context: {
          customerName: "Ada Lovelace",
          ticketNumber: ticket.number,
          facilityName: `Macro Fac ${tag}`,
          staffName: me.displayName,
        },
      });
      assert.match(applied.draftBody ?? "", /Hi Ada about VSS-/);
      assert.equal(applied.statusAfterReply, "WAITING_ON_CUSTOMER");
      assert.ok(applied.events.includes("TYPE_CHANGED"));
      assert.ok(applied.events.includes("PRIORITY_CHANGED"));
      assert.ok(applied.events.includes("ASSIGNMENT_CHANGED"));
      assert.equal(applied.events.includes("STATUS_CHANGED"), false);

      const after = await db.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: {
          status: true,
          type: true,
          priority: true,
          assignedStaffId: true,
          ticketTags: { select: { tagId: true } },
          events: { select: { type: true, metadata: true } },
          messages: { select: { id: true } },
        },
      });
      assert.equal(after.status, "OPEN");
      assert.equal(after.type, "BUG");
      assert.equal(after.priority, "HIGH");
      assert.equal(after.assignedStaffId, me.id);
      assert.equal(after.ticketTags.length, 2);
      assert.equal(after.messages.length, 0);
      assert.ok(
        after.events.some(
          (event) =>
            event.type === "TYPE_CHANGED" &&
            event.metadata &&
            typeof event.metadata === "object" &&
            !Array.isArray(event.metadata) &&
            event.metadata.source === "MACRO",
        ),
      );

      const again = await applySupportMacro(db, {
        ticketId: ticket.id,
        macroId: created.id,
        actorStaffId: me.id,
        context: {
          customerName: "Ada Lovelace",
          ticketNumber: ticket.number,
          facilityName: `Macro Fac ${tag}`,
          staffName: me.displayName,
        },
      });
      assert.equal(again.draftBody?.includes("Ada"), true);
      const tagCount = await db.supportTicketTag.count({ where: { ticketId: ticket.id } });
      assert.equal(tagCount, 2);

      const staffMacro = await createSupportMacro(db, {
        actorStaffId: me.id,
        name: `Assign other ${tag}`,
        description: null,
        savedReplyId: null,
        status: "RESOLVED",
        statusAfterReply: null,
        type: null,
        priority: "LOW",
        assignmentMode: "STAFF",
        assignedStaffId: other.id,
        tagIds: [],
      });
      macroIds.push(staffMacro.id);
      const resolved = await applySupportMacro(db, {
        ticketId: ticket.id,
        macroId: staffMacro.id,
        actorStaffId: me.id,
        context: {
          customerName: "Ada Lovelace",
          ticketNumber: ticket.number,
          facilityName: null,
          staffName: me.displayName,
        },
      });
      assert.equal(resolved.draftBody, null);
      const resolvedRow = await db.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: { status: true, assignedStaffId: true, resolvedAt: true, priority: true },
      });
      assert.equal(resolvedRow.status, "RESOLVED");
      assert.ok(resolvedRow.resolvedAt);
      assert.equal(resolvedRow.assignedStaffId, other.id);
      assert.equal(resolvedRow.priority, "LOW");

      const unassign = await createSupportMacro(db, {
        actorStaffId: me.id,
        name: `Unassign ${tag}`,
        description: null,
        savedReplyId: null,
        status: "OPEN",
        statusAfterReply: null,
        type: null,
        priority: null,
        assignmentMode: "UNASSIGN",
        assignedStaffId: null,
        tagIds: [],
      });
      macroIds.push(unassign.id);
      await applySupportMacro(db, {
        ticketId: ticket.id,
        macroId: unassign.id,
        actorStaffId: me.id,
        context: {
          customerName: null,
          ticketNumber: ticket.number,
          facilityName: null,
          staffName: me.displayName,
        },
      });
      const reopened = await db.supportTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: { status: true, assignedStaffId: true, resolvedAt: true },
      });
      assert.equal(reopened.status, "OPEN");
      assert.equal(reopened.assignedStaffId, null);
      assert.equal(reopened.resolvedAt, null);

      await changeSupportTicketStatus(db, {
        ticketId: ticket.id,
        actorStaffId: me.id,
        status: "CLOSED",
      });
      await assert.rejects(
        () =>
          applySupportMacro(db, {
            ticketId: ticket.id,
            macroId: created.id,
            actorStaffId: me.id,
            context: {
              customerName: "Ada",
              ticketNumber: ticket.number,
              facilityName: null,
              staffName: me.displayName,
            },
          }),
        (error: unknown) => error instanceof SupportTicketError && error.code === "ticket_closed",
      );

      await setSupportSavedReplyActive(db, { id: reply.id, isActive: false });
      const openTicket = await createSupportTicket(db, {
        actorStaffId: me.id,
        requesterEmail: `sam-${tag}@example.com`,
        requesterName: "Sam",
        subject: `Second ${tag}`,
      });
      ticketIds.push(openTicket.id);
      contactEmails.push(`sam-${tag}@example.com`);
      const warned = await applySupportMacro(db, {
        ticketId: openTicket.id,
        macroId: created.id,
        actorStaffId: me.id,
        context: {
          customerName: "Sam",
          ticketNumber: openTicket.number,
          facilityName: null,
          staffName: me.displayName,
        },
      });
      assert.equal(warned.draftBody, null);
      assert.equal(warned.savedReplyWarning, "inactive");
      const second = await db.supportTicket.findUniqueOrThrow({
        where: { id: openTicket.id },
        select: { type: true, status: true, messages: { select: { id: true } } },
      });
      assert.equal(second.type, "BUG");
      assert.equal(second.status, "OPEN");
      assert.equal(second.messages.length, 0);
    } finally {
      await db.supportMacroApplication.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportMacroTag.deleteMany({ where: { macroId: { in: macroIds } } });
      if (macroIds.length) await db.supportMacro.deleteMany({ where: { id: { in: macroIds } } });
      await db.supportTicketTag.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
      if (replyIds.length) await db.supportSavedReply.deleteMany({ where: { id: { in: replyIds } } });
      if (tagIds.length) await db.supportTag.deleteMany({ where: { id: { in: tagIds } } });
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
