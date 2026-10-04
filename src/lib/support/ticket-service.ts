import {
  Prisma,
  type PrismaClient,
  type SupportTicketEventType,
  type SupportTicketPriority,
  type SupportTicketStatus,
  type SupportTicketType,
} from "@prisma/client";

import { upsertSupportContact } from "./contacts";
import { SupportTicketError } from "./errors";
import { generateSupportReplyToken } from "./identifiers";
import { dispatchPendingSupportStaffNotificationEmails } from "./notification-email";
import { recordSupportStaffNotifications } from "./notifications";
import { planSupportTicketStatusChange } from "./status-transition";

type Tx = Prisma.TransactionClient;

export function isClientSubmissionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((field) => field.includes("clientSubmissionId"));
}

async function requireActiveStaff(tx: Tx, staffId: string) {
  const staff = await tx.platformStaff.findFirst({
    where: { id: staffId, isActive: true },
    select: { id: true, displayName: true },
  });
  if (!staff) {
    throw new SupportTicketError("invalid_reference");
  }
  return staff;
}

async function requireFacility(tx: Tx, facilityId: string) {
  const facility = await tx.facility.findUnique({
    where: { id: facilityId },
    select: { id: true, displayName: true },
  });
  if (!facility) {
    throw new SupportTicketError("invalid_reference");
  }
  return facility;
}

export type CreateSupportTicketInput = {
  actorStaffId: string;
  requesterEmail: string;
  requesterName?: string | null;
  subject: string;
  facilityId?: string | null;
  type?: SupportTicketType | null;
  priority?: SupportTicketPriority;
  assignedStaffId?: string | null;
  note?: string | null;
};

/** Staff-opened tickets start OPEN: a Vssyl employee has already acted on them. */
export async function createSupportTicket(
  db: PrismaClient,
  input: CreateSupportTicketInput,
): Promise<{ id: string; number: number }> {
  return db.$transaction(async (tx) => {
    const facility = input.facilityId ? await requireFacility(tx, input.facilityId) : null;
    if (input.assignedStaffId) {
      await requireActiveStaff(tx, input.assignedStaffId);
    }
    const contact = await upsertSupportContact(tx, {
      email: input.requesterEmail,
      displayName: input.requesterName,
    });
    const status: SupportTicketStatus = "OPEN";
    const priority = input.priority ?? "NORMAL";

    const ticket = await tx.supportTicket.create({
      data: {
        replyToken: generateSupportReplyToken(),
        subject: input.subject.trim(),
        status,
        type: input.type ?? null,
        priority,
        contactId: contact.id,
        facilityId: facility?.id ?? null,
        assignedStaffId: input.assignedStaffId ?? null,
      },
      select: { id: true, number: true },
    });

    await tx.supportTicketEvent.create({
      data: {
        ticketId: ticket.id,
        type: "CREATED",
        actorStaffId: input.actorStaffId,
        toValue: status,
        metadata: {
          source: "CONSOLE",
          priority,
          type: input.type ?? null,
          assignedStaffId: input.assignedStaffId ?? null,
          facilityId: facility?.id ?? null,
          facilityName: facility?.displayName ?? null,
        },
      },
    });

    const note = input.note?.trim();
    if (note) {
      await tx.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          kind: "NOTE",
          authorStaffId: input.actorStaffId,
          bodyText: note,
        },
      });
    }

    const ticketRef = {
      id: ticket.id,
      number: ticket.number,
      subject: input.subject.trim(),
      assignedStaffId: input.assignedStaffId ?? null,
    };
    if (ticketRef.assignedStaffId) {
      await recordSupportStaffNotifications(tx, {
        type: "ASSIGNED_TO_ME",
        ticket: ticketRef,
        actorStaffId: input.actorStaffId,
        sourceKey: `create->${ticketRef.assignedStaffId}`,
      });
    }
    if (priority === "URGENT" || priority === "HIGH") {
      await recordSupportStaffNotifications(tx, {
        type: priority === "URGENT" ? "URGENT_PRIORITY" : "HIGH_PRIORITY",
        ticket: ticketRef,
        actorStaffId: input.actorStaffId,
        sourceKey: `create->${priority}`,
      });
    }

    return ticket;
  }).then(async (ticket) => {
    await dispatchPendingSupportStaffNotificationEmails(db, { ticketId: ticket.id });
    return ticket;
  });
}

type StatusRow = {
  id: string;
  status: SupportTicketStatus;
  resolvedAt: Date | null;
  closedAt: Date | null;
};

/** Returns false for a same-status request; throws for a disallowed transition. */
export async function applySupportTicketStatusChange(
  tx: Tx,
  input: {
    ticket: StatusRow;
    to: SupportTicketStatus;
    actorStaffId: string | null;
    causedByMessageId?: string | null;
    eventMetadata?: Prisma.InputJsonObject;
    now: Date;
  },
): Promise<boolean> {
  const plan = planSupportTicketStatusChange({
    from: input.ticket.status,
    to: input.to,
    resolvedAt: input.ticket.resolvedAt,
    closedAt: input.ticket.closedAt,
    now: input.now,
  });
  if (plan.kind === "unchanged") {
    return false;
  }
  if (plan.kind === "invalid") {
    throw new SupportTicketError(
      input.ticket.status === "CLOSED" ? "ticket_closed" : "invalid_transition",
    );
  }

  const updated = await tx.supportTicket.updateMany({
    where: { id: input.ticket.id, status: plan.from },
    data: plan.data,
  });
  if (updated.count !== 1) {
    throw new SupportTicketError("conflict");
  }
  await tx.supportTicketEvent.create({
    data: {
      ticketId: input.ticket.id,
      type: "STATUS_CHANGED",
      actorStaffId: input.actorStaffId,
      causedByMessageId: input.causedByMessageId ?? null,
      fromValue: plan.from,
      toValue: plan.to,
      metadata: input.eventMetadata,
    },
  });
  return true;
}

async function loadStatusRow(tx: Tx, ticketId: string): Promise<StatusRow> {
  const ticket = await tx.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, resolvedAt: true, closedAt: true },
  });
  if (!ticket) {
    throw new SupportTicketError("not_found");
  }
  return ticket;
}

export async function changeSupportTicketStatus(
  db: PrismaClient,
  input: { ticketId: string; actorStaffId: string; status: SupportTicketStatus; now?: Date },
): Promise<{ changed: boolean }> {
  return db.$transaction(async (tx) => {
    const ticket = await loadStatusRow(tx, input.ticketId);
    const changed = await applySupportTicketStatusChange(tx, {
      ticket,
      to: input.status,
      actorStaffId: input.actorStaffId,
      now: input.now ?? new Date(),
    });
    return { changed };
  });
}

export type SupportTicketDetailChanges = {
  type?: SupportTicketType | null;
  priority?: SupportTicketPriority;
  assignedStaffId?: string | null;
  facilityId?: string | null;
};

/**
 * Applies only the fields that actually differ, writing one event per changed field in the same
 * transaction. Never touches the SupportContact.
 */
export async function applySupportTicketDetailChanges(
  tx: Tx,
  input: {
    ticketId: string;
    actorStaffId: string;
    changes: SupportTicketDetailChanges;
    eventMetadata?: Prisma.InputJsonObject;
  },
): Promise<SupportTicketEventType[]> {
  const current = await tx.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: {
      id: true,
      number: true,
      subject: true,
      type: true,
      priority: true,
      assignedStaffId: true,
      facilityId: true,
      assignedStaff: { select: { displayName: true } },
      facility: { select: { displayName: true } },
    },
  });
  if (!current) {
    throw new SupportTicketError("not_found");
  }

  const { changes } = input;
  const data: Prisma.SupportTicketUncheckedUpdateManyInput = {};
  const events: Prisma.SupportTicketEventCreateManyInput[] = [];
  const event = (
    type: SupportTicketEventType,
    fromValue: string | null,
    toValue: string | null,
    metadata?: Prisma.InputJsonObject,
  ) =>
    events.push({
      ticketId: current.id,
      type,
      actorStaffId: input.actorStaffId,
      fromValue,
      toValue,
      metadata: metadata
        ? { ...metadata, ...(input.eventMetadata ?? {}) }
        : input.eventMetadata,
    });

  if (changes.type !== undefined && changes.type !== current.type) {
    data.type = changes.type;
    event("TYPE_CHANGED", current.type, changes.type);
  }
  if (changes.priority !== undefined && changes.priority !== current.priority) {
    data.priority = changes.priority;
    event("PRIORITY_CHANGED", current.priority, changes.priority);
  }
  if (changes.assignedStaffId !== undefined && changes.assignedStaffId !== current.assignedStaffId) {
    const next = changes.assignedStaffId
      ? await requireActiveStaff(tx, changes.assignedStaffId)
      : null;
    data.assignedStaffId = next?.id ?? null;
    event("ASSIGNMENT_CHANGED", current.assignedStaffId, next?.id ?? null, {
      fromStaffName: current.assignedStaff?.displayName ?? null,
      toStaffName: next?.displayName ?? null,
    });
  }
  if (changes.facilityId !== undefined && changes.facilityId !== current.facilityId) {
    const next = changes.facilityId ? await requireFacility(tx, changes.facilityId) : null;
    data.facilityId = next?.id ?? null;
    event("FACILITY_CHANGED", current.facilityId, next?.id ?? null, {
      fromFacilityName: current.facility?.displayName ?? null,
      toFacilityName: next?.displayName ?? null,
    });
  }

  if (events.length === 0) {
    return [];
  }

  const updated = await tx.supportTicket.updateMany({
    where: {
      id: current.id,
      type: current.type,
      priority: current.priority,
      assignedStaffId: current.assignedStaffId,
      facilityId: current.facilityId,
    },
    data,
  });
  if (updated.count !== 1) {
    throw new SupportTicketError("conflict");
  }
  await tx.supportTicketEvent.createMany({ data: events });

  const nextAssigned =
    changes.assignedStaffId !== undefined ? (data.assignedStaffId as string | null) : current.assignedStaffId;
  const ticketRef = {
    id: current.id,
    number: current.number,
    subject: current.subject,
    assignedStaffId: nextAssigned ?? null,
  };
  if (changes.assignedStaffId !== undefined && changes.assignedStaffId !== current.assignedStaffId && nextAssigned) {
    await recordSupportStaffNotifications(tx, {
      type: "ASSIGNED_TO_ME",
      ticket: ticketRef,
      actorStaffId: input.actorStaffId,
      sourceKey: `${current.assignedStaffId ?? "none"}->${nextAssigned}`,
    });
  }
  if (changes.priority !== undefined && changes.priority !== current.priority) {
    if (changes.priority === "URGENT") {
      await recordSupportStaffNotifications(tx, {
        type: "URGENT_PRIORITY",
        ticket: ticketRef,
        actorStaffId: input.actorStaffId,
        sourceKey: `${current.priority}->URGENT`,
      });
    } else if (changes.priority === "HIGH" && current.priority !== "URGENT") {
      await recordSupportStaffNotifications(tx, {
        type: "HIGH_PRIORITY",
        ticket: ticketRef,
        actorStaffId: input.actorStaffId,
        sourceKey: `${current.priority}->HIGH`,
      });
    }
  }

  return events.map((row) => row.type);
}

export async function updateSupportTicketDetails(
  db: PrismaClient,
  input: { ticketId: string; actorStaffId: string; changes: SupportTicketDetailChanges },
): Promise<SupportTicketEventType[]> {
  const events = await db.$transaction((tx) => applySupportTicketDetailChanges(tx, input));
  await dispatchPendingSupportStaffNotificationEmails(db, { ticketId: input.ticketId });
  return events;
}

export async function findPriorSupportSubmission(
  db: PrismaClient | Tx,
  ticketId: string,
  clientSubmissionId: string,
): Promise<{ id: string } | null> {
  const prior = await db.supportTicketMessage.findUnique({
    where: { clientSubmissionId },
    select: { id: true, ticketId: true },
  });
  if (!prior) {
    return null;
  }
  if (prior.ticketId !== ticketId) {
    throw new SupportTicketError("submission_mismatch");
  }
  return { id: prior.id };
}

/** Internal note: never emailed, never changes status. Repeat submissions return the first note. */
export async function addSupportTicketNote(
  db: PrismaClient,
  input: {
    ticketId: string;
    actorStaffId: string;
    body: string;
    clientSubmissionId: string;
    now?: Date;
  },
): Promise<{ messageId: string; duplicate: boolean }> {
  const prior = await findPriorSupportSubmission(db, input.ticketId, input.clientSubmissionId);
  if (prior) {
    return { messageId: prior.id, duplicate: true };
  }
  try {
    return await db.$transaction(async (tx) => {
      await loadStatusRow(tx, input.ticketId);
      const message = await tx.supportTicketMessage.create({
        data: {
          ticketId: input.ticketId,
          kind: "NOTE",
          authorStaffId: input.actorStaffId,
          bodyText: input.body.trim(),
          clientSubmissionId: input.clientSubmissionId,
        },
        select: { id: true },
      });
      await tx.supportTicket.update({
        where: { id: input.ticketId },
        data: { updatedAt: input.now ?? new Date() },
      });
      return { messageId: message.id, duplicate: false };
    });
  } catch (error) {
    if (isClientSubmissionConflict(error)) {
      const raced = await findPriorSupportSubmission(db, input.ticketId, input.clientSubmissionId);
      if (raced) {
        return { messageId: raced.id, duplicate: true };
      }
    }
    throw error;
  }
}
