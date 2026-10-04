import type {
  PrismaClient,
  SupportMacroAssignmentMode,
  SupportTicketEventType,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { SupportTicketError } from "./errors";
import {
  SUPPORT_TICKET_PRIORITY_LABEL,
  SUPPORT_TICKET_STATUS_LABEL,
  SUPPORT_TICKET_TYPE_LABEL,
} from "./labels";
import { renderSupportSavedReply, type SupportSavedReplyContext } from "./saved-replies";
import { addExistingSupportTicketTag } from "./tags";
import {
  applySupportTicketDetailChanges,
  applySupportTicketStatusChange,
} from "./ticket-service";

export const SUPPORT_MACRO_NAME_MAX = 80;
export const SUPPORT_MACRO_DESCRIPTION_MAX = 240;
export const SUPPORT_MACRO_ASSIGNMENT_MODES = ["UNCHANGED", "ME", "STAFF", "UNASSIGN"] as const;

export type SupportMacroFields = {
  name: string;
  description: string | null;
  savedReplyId: string | null;
  status: SupportTicketStatus | null;
  statusAfterReply: SupportTicketStatus | null;
  type: SupportTicketType | null;
  priority: SupportTicketPriority | null;
  assignmentMode: SupportMacroAssignmentMode;
  assignedStaffId: string | null;
  tagIds: string[];
};

export type SupportMacroRecord = SupportMacroFields & {
  id: string;
  isActive: boolean;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
  savedReply: { id: string; name: string; body: string; isActive: boolean } | null;
  assignedStaff: { id: string; displayName: string; isActive: boolean } | null;
  tags: { id: string; name: string; normalizedName: string; isActive: boolean }[];
};

export type SupportMacroApplyResult = {
  applicationId: string;
  draftBody: string | null;
  statusAfterReply: SupportTicketStatus | null;
  skippedInactiveTags: string[];
  savedReplyWarning: "inactive" | "missing" | null;
  events: SupportTicketEventType[];
};

type Db = PrismaClient;

function trimName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isSupportMacroAssignmentMode(value: unknown): value is SupportMacroAssignmentMode {
  return (
    typeof value === "string" &&
    (SUPPORT_MACRO_ASSIGNMENT_MODES as readonly string[]).includes(value)
  );
}

function normalizeMacroFields(input: SupportMacroFields): SupportMacroFields {
  const name = trimName(input.name);
  const description = input.description?.trim() ? input.description.trim() : null;
  if (!name || name.length > SUPPORT_MACRO_NAME_MAX) {
    throw new SupportTicketError("invalid_input");
  }
  if (description && description.length > SUPPORT_MACRO_DESCRIPTION_MAX) {
    throw new SupportTicketError("invalid_input");
  }
  if (input.assignmentMode === "STAFF" && !input.assignedStaffId) {
    throw new SupportTicketError("invalid_input");
  }
  const assignedStaffId = input.assignmentMode === "STAFF" ? input.assignedStaffId : null;
  let status = input.status;
  let statusAfterReply = input.statusAfterReply;
  if (input.savedReplyId && status === "WAITING_ON_CUSTOMER") {
    statusAfterReply = statusAfterReply ?? "WAITING_ON_CUSTOMER";
    status = null;
  }
  return {
    name,
    description,
    savedReplyId: input.savedReplyId,
    status,
    statusAfterReply,
    type: input.type,
    priority: input.priority,
    assignmentMode: input.assignmentMode,
    assignedStaffId,
    tagIds: [...new Set(input.tagIds)],
  };
}

const MACRO_INCLUDE = {
  savedReply: { select: { id: true, name: true, body: true, isActive: true } },
  assignedStaff: { select: { id: true, displayName: true, isActive: true } },
  tags: { select: { tag: { select: { id: true, name: true, normalizedName: true, isActive: true } } } },
} as const;

function toRecord(row: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  savedReplyId: string | null;
  status: SupportTicketStatus | null;
  statusAfterReply: SupportTicketStatus | null;
  type: SupportTicketType | null;
  priority: SupportTicketPriority | null;
  assignmentMode: SupportMacroAssignmentMode;
  assignedStaffId: string | null;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
  savedReply: SupportMacroRecord["savedReply"];
  assignedStaff: SupportMacroRecord["assignedStaff"];
  tags: { tag: SupportMacroRecord["tags"][number] }[];
}): SupportMacroRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    savedReplyId: row.savedReplyId,
    status: row.status,
    statusAfterReply: row.statusAfterReply,
    type: row.type,
    priority: row.priority,
    assignmentMode: row.assignmentMode,
    assignedStaffId: row.assignedStaffId,
    tagIds: row.tags.map((item) => item.tag.id),
    createdByStaffId: row.createdByStaffId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    savedReply: row.savedReply,
    assignedStaff: row.assignedStaff,
    tags: row.tags.map((item) => item.tag),
  };
}

async function assertMacroReferences(
  db: Db,
  fields: SupportMacroFields,
  options: { existingTagIds?: string[]; existingSavedReplyId?: string | null } = {},
) {
  if (fields.savedReplyId) {
    const reply = await db.supportSavedReply.findUnique({
      where: { id: fields.savedReplyId },
      select: { id: true, isActive: true },
    });
    if (!reply) {
      throw new SupportTicketError("invalid_reference");
    }
    if (!reply.isActive && reply.id !== options.existingSavedReplyId) {
      throw new SupportTicketError("invalid_input");
    }
  }
  if (fields.assignmentMode === "STAFF" && fields.assignedStaffId) {
    const staff = await db.platformStaff.findFirst({
      where: { id: fields.assignedStaffId, isActive: true },
      select: { id: true },
    });
    if (!staff) {
      throw new SupportTicketError("invalid_reference");
    }
  }
  if (fields.tagIds.length) {
    const tags = await db.supportTag.findMany({
      where: { id: { in: fields.tagIds } },
      select: { id: true, isActive: true },
    });
    if (tags.length !== fields.tagIds.length) {
      throw new SupportTicketError("invalid_input");
    }
    const existing = new Set(options.existingTagIds ?? []);
    if (tags.some((tag) => !tag.isActive && !existing.has(tag.id))) {
      throw new SupportTicketError("invalid_input");
    }
  }
}

export async function listSupportMacros(
  db: Db,
  options: { activeOnly?: boolean } = {},
): Promise<SupportMacroRecord[]> {
  const rows = await db.supportMacro.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    include: MACRO_INCLUDE,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return rows.map(toRecord);
}

export async function createSupportMacro(
  db: Db,
  input: SupportMacroFields & { actorStaffId: string },
): Promise<SupportMacroRecord> {
  const fields = normalizeMacroFields(input);
  const staff = await db.platformStaff.findFirst({
    where: { id: input.actorStaffId, isActive: true },
    select: { id: true },
  });
  if (!staff) {
    throw new SupportTicketError("invalid_reference");
  }
  await assertMacroReferences(db, fields);
  const created = await db.supportMacro.create({
    data: {
      name: fields.name,
      description: fields.description,
      savedReplyId: fields.savedReplyId,
      status: fields.status,
      statusAfterReply: fields.statusAfterReply,
      type: fields.type,
      priority: fields.priority,
      assignmentMode: fields.assignmentMode,
      assignedStaffId: fields.assignedStaffId,
      createdByStaffId: staff.id,
      tags: { create: fields.tagIds.map((tagId) => ({ tagId })) },
    },
    include: MACRO_INCLUDE,
  });
  return toRecord(created);
}

export async function updateSupportMacro(
  db: Db,
  input: SupportMacroFields & { id: string },
): Promise<SupportMacroRecord> {
  const fields = normalizeMacroFields(input);
  const current = await db.supportMacro.findUnique({
    where: { id: input.id },
    select: { savedReplyId: true, tags: { select: { tagId: true } } },
  });
  if (!current) {
    throw new SupportTicketError("not_found");
  }
  await assertMacroReferences(db, fields, {
    existingTagIds: current.tags.map((row) => row.tagId),
    existingSavedReplyId: current.savedReplyId,
  });
  try {
    const updated = await db.$transaction(async (tx) => {
      await tx.supportMacroTag.deleteMany({ where: { macroId: input.id } });
      return tx.supportMacro.update({
        where: { id: input.id },
        data: {
          name: fields.name,
          description: fields.description,
          savedReplyId: fields.savedReplyId,
          status: fields.status,
          statusAfterReply: fields.statusAfterReply,
          type: fields.type,
          priority: fields.priority,
          assignmentMode: fields.assignmentMode,
          assignedStaffId: fields.assignedStaffId,
          tags: { create: fields.tagIds.map((tagId) => ({ tagId })) },
        },
        include: MACRO_INCLUDE,
      });
    });
    return toRecord(updated);
  } catch (error) {
    if (error instanceof SupportTicketError) throw error;
    throw new SupportTicketError("not_found");
  }
}

export async function setSupportMacroActive(
  db: Db,
  input: { id: string; isActive: boolean },
): Promise<SupportMacroRecord> {
  try {
    return toRecord(
      await db.supportMacro.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
        include: MACRO_INCLUDE,
      }),
    );
  } catch {
    throw new SupportTicketError("not_found");
  }
}

export function describeSupportMacroActions(macro: SupportMacroRecord): string[] {
  const lines: string[] = [];
  if (macro.savedReply) {
    lines.push(
      macro.savedReply.isActive
        ? `Insert “${macro.savedReply.name}”`
        : `Reply “${macro.savedReply.name}” is inactive and will be skipped`,
    );
  }
  if (macro.type) lines.push(`Type → ${SUPPORT_TICKET_TYPE_LABEL[macro.type]}`);
  if (macro.priority) lines.push(`Priority → ${SUPPORT_TICKET_PRIORITY_LABEL[macro.priority]}`);
  if (macro.assignmentMode === "ME") lines.push("Assign → Me");
  if (macro.assignmentMode === "UNASSIGN") lines.push("Unassign");
  if (macro.assignmentMode === "STAFF") {
    lines.push(`Assign → ${macro.assignedStaff?.displayName ?? "selected staff"}`);
  }
  const activeTags = macro.tags.filter((tag) => tag.isActive).map((tag) => tag.name);
  if (activeTags.length) lines.push(`Add tags: ${activeTags.join(", ")}`);
  if (macro.status) lines.push(`Status → ${SUPPORT_TICKET_STATUS_LABEL[macro.status]}`);
  if (macro.statusAfterReply) {
    lines.push(`After send → ${SUPPORT_TICKET_STATUS_LABEL[macro.statusAfterReply]}`);
  }
  if (lines.length === 0) lines.push("No ticket actions");
  return lines;
}

function assignmentStaffId(
  mode: SupportMacroAssignmentMode,
  assignedStaffId: string | null,
  actorStaffId: string,
): string | null | undefined {
  if (mode === "UNCHANGED") return undefined;
  if (mode === "ME") return actorStaffId;
  if (mode === "UNASSIGN") return null;
  return assignedStaffId;
}

export async function applySupportMacro(
  db: Db,
  input: {
    ticketId: string;
    macroId: string;
    actorStaffId: string;
    context: SupportSavedReplyContext;
    now?: Date;
  },
): Promise<SupportMacroApplyResult> {
  return db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: input.ticketId },
      select: { id: true, status: true, resolvedAt: true, closedAt: true },
    });
    if (!ticket) {
      throw new SupportTicketError("not_found");
    }
    if (ticket.status === "CLOSED") {
      throw new SupportTicketError("ticket_closed");
    }
    const staff = await tx.platformStaff.findFirst({
      where: { id: input.actorStaffId, isActive: true },
      select: { id: true },
    });
    if (!staff) {
      throw new SupportTicketError("invalid_reference");
    }

    const macroRow = await tx.supportMacro.findUnique({
      where: { id: input.macroId },
      include: MACRO_INCLUDE,
    });
    if (!macroRow || !macroRow.isActive) {
      throw new SupportTicketError("not_found");
    }
    const macro = toRecord(macroRow);
    const eventMetadata: Prisma.InputJsonObject = {
      source: "MACRO",
      macroId: macro.id,
      macroName: macro.name,
    };

    const assignedStaffId = assignmentStaffId(
      macro.assignmentMode,
      macro.assignedStaffId,
      staff.id,
    );
    const events = await applySupportTicketDetailChanges(tx, {
      ticketId: ticket.id,
      actorStaffId: staff.id,
      eventMetadata,
      changes: {
        ...(macro.type ? { type: macro.type } : {}),
        ...(macro.priority ? { priority: macro.priority } : {}),
        ...(assignedStaffId !== undefined ? { assignedStaffId } : {}),
      },
    });

    if (macro.status) {
      const changed = await applySupportTicketStatusChange(tx, {
        ticket,
        to: macro.status,
        actorStaffId: staff.id,
        eventMetadata,
        now: input.now ?? new Date(),
      });
      if (changed) events.push("STATUS_CHANGED");
    }

    const skippedInactiveTags: string[] = [];
    for (const tag of macro.tags) {
      const result = await addExistingSupportTicketTag(tx, {
        ticketId: ticket.id,
        actorStaffId: staff.id,
        tagId: tag.id,
      });
      if (result === "skipped_inactive") {
        skippedInactiveTags.push(tag.name);
      }
    }

    let draftBody: string | null = null;
    let savedReplyWarning: SupportMacroApplyResult["savedReplyWarning"] = null;
    if (macro.savedReplyId) {
      if (!macro.savedReply) {
        savedReplyWarning = "missing";
      } else if (!macro.savedReply.isActive) {
        savedReplyWarning = "inactive";
      } else {
        draftBody = renderSupportSavedReply(macro.savedReply.body, input.context);
      }
    }

    const application = await tx.supportMacroApplication.create({
      data: {
        macroId: macro.id,
        ticketId: ticket.id,
        appliedByStaffId: staff.id,
        appliedAt: input.now ?? new Date(),
        macroName: macro.name,
      },
      select: { id: true },
    });

    return {
      applicationId: application.id,
      draftBody,
      statusAfterReply: draftBody ? macro.statusAfterReply : null,
      skippedInactiveTags,
      savedReplyWarning,
      events,
    };
  });
}
