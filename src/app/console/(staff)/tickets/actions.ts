"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";
import {
  SupportTicketError,
  SUPPORT_TICKET_ERROR_MESSAGE,
  type SupportTicketErrorCode,
} from "@/lib/support/errors";
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_TYPES } from "@/lib/support/labels";
import {
  createSupportAutomationRule,
  isSupportAutomationType,
  setSupportAutomationRuleActive,
  SUPPORT_AUTOMATION_MINUTES_PER_DAY,
  updateSupportAutomationRule,
} from "@/lib/support/automation";
import {
  createSupportMacro,
  isSupportMacroAssignmentMode,
  setSupportMacroActive,
  updateSupportMacro,
  applySupportMacro,
} from "@/lib/support/macros";
import { sendSupportReply } from "@/lib/support/reply";
import {
  createSupportSavedReply,
  setSupportSavedReplyActive,
  updateSupportSavedReply,
} from "@/lib/support/saved-replies";
import { SUPPORT_TICKET_STATUSES } from "@/lib/support/status-transition";
import {
  addSupportTicketTag,
  createSupportTag,
  removeSupportTicketTag,
  renameSupportTag,
  setSupportTagActive,
} from "@/lib/support/tags";
import {
  markAllSupportStaffNotificationsRead,
  markSupportStaffNotificationRead,
} from "@/lib/support/notifications";
import {
  addSupportTicketNote,
  changeSupportTicketStatus,
  createSupportTicket,
  updateSupportTicketDetails,
} from "@/lib/support/ticket-service";

const id = z.string().trim().min(1).max(64);
const optionalId = z
  .string()
  .trim()
  .max(64)
  .transform((value) => value || null);
const body = z.string().trim().min(1).max(8000);
const submissionId = z.string().uuid();
const status = z.enum(SUPPORT_TICKET_STATUSES);
const optionalType = z
  .union([z.enum(SUPPORT_TICKET_TYPES), z.literal("")])
  .transform((value) => value || null);
const priority = z.enum(SUPPORT_TICKET_PRIORITIES);

const createSchema = z.object({
  facilityId: optionalId,
  subject: z.string().trim().min(3).max(160),
  requesterEmail: z.string().trim().email().max(200),
  requesterName: z.string().trim().max(120),
  type: optionalType,
  priority,
  assignedStaffId: optionalId,
  body,
});

const noteSchema = z.object({ ticketId: id, body, clientSubmissionId: submissionId });

const replySchema = z.object({
  ticketId: id,
  body,
  clientSubmissionId: submissionId,
  status: z.union([status, z.literal("")]).transform((value) => value || null),
});

const statusSchema = z.object({ ticketId: id, status });

const detailsSchema = z.object({
  ticketId: id,
  type: optionalType,
  priority,
  assignedStaffId: optionalId,
  facilityId: optionalId,
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function ticketPath(ticketId: string) {
  return `/console/tickets/${ticketId}`;
}

function revalidateTickets(ticketId?: string) {
  revalidatePath("/console");
  revalidatePath("/console/tickets");
  revalidatePath("/console/tickets/saved-replies");
  revalidatePath("/console/tickets/tags");
  revalidatePath("/console/tickets/macros");
  revalidatePath("/console/tickets/automations");
  if (ticketId) {
    revalidatePath(ticketPath(ticketId));
  }
}

function libraryPath(
  kind: "saved-replies" | "tags" | "macros" | "automations",
  error?: SupportTicketErrorCode | null,
) {
  return error ? `/console/tickets/${kind}?error=${error}` : `/console/tickets/${kind}`;
}

async function mutateLibrary(
  kind: "saved-replies" | "tags" | "macros" | "automations",
  mutation: () => Promise<unknown>,
): Promise<never> {
  let errorCode: SupportTicketErrorCode | null = null;
  try {
    await mutation();
  } catch (error) {
    if (!(error instanceof SupportTicketError)) {
      throw error;
    }
    errorCode = error.code;
  }
  revalidateTickets();
  redirect(libraryPath(kind, errorCode));
}

/** Expected domain failures return to the ticket with a notice instead of an error page. */
async function mutateTicket(ticketId: string, mutation: () => Promise<unknown>): Promise<never> {
  let errorCode: SupportTicketErrorCode | null = null;
  try {
    await mutation();
  } catch (error) {
    if (!(error instanceof SupportTicketError)) {
      throw error;
    }
    errorCode = error.code;
  }
  revalidateTickets(ticketId);
  redirect(errorCode ? `${ticketPath(ticketId)}?error=${errorCode}` : ticketPath(ticketId));
}

export async function createSupportTicketAction(formData: FormData) {
  const session = await requireHarborStaff();
  const parsed = createSchema.safeParse({
    facilityId: field(formData, "facilityId"),
    subject: field(formData, "subject"),
    requesterEmail: field(formData, "requesterEmail"),
    requesterName: field(formData, "requesterName"),
    type: field(formData, "type"),
    priority: field(formData, "priority") || "NORMAL",
    assignedStaffId: field(formData, "assignedStaffId"),
    body: field(formData, "body"),
  });
  if (!parsed.success) {
    redirect("/console/tickets/new?error=invalid_input");
  }

  let ticketId: string | null = null;
  let errorCode: SupportTicketErrorCode | null = null;
  try {
    const ticket = await createSupportTicket(prisma, {
      actorStaffId: session.uid,
      requesterEmail: parsed.data.requesterEmail,
      requesterName: parsed.data.requesterName,
      subject: parsed.data.subject,
      facilityId: parsed.data.facilityId,
      type: parsed.data.type,
      priority: parsed.data.priority,
      assignedStaffId: parsed.data.assignedStaffId,
      note: parsed.data.body,
    });
    ticketId = ticket.id;
  } catch (error) {
    if (!(error instanceof SupportTicketError)) {
      throw error;
    }
    errorCode = error.code;
  }

  if (!ticketId) {
    redirect(`/console/tickets/new?error=${errorCode ?? "invalid_input"}`);
  }
  revalidateTickets(ticketId);
  redirect(ticketPath(ticketId));
}

export async function addSupportTicketNoteAction(formData: FormData) {
  const session = await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const parsed = noteSchema.safeParse({
    ticketId,
    body: field(formData, "body"),
    clientSubmissionId: field(formData, "clientSubmissionId"),
  });
  if (!parsed.success) {
    redirect(`${ticketPath(ticketId)}?error=invalid_input`);
  }
  await mutateTicket(parsed.data.ticketId, () =>
    addSupportTicketNote(prisma, { ...parsed.data, actorStaffId: session.uid }),
  );
}

export async function replySupportTicketAction(formData: FormData) {
  const session = await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const parsed = replySchema.safeParse({
    ticketId,
    body: field(formData, "body"),
    clientSubmissionId: field(formData, "clientSubmissionId"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    redirect(`${ticketPath(ticketId)}?error=invalid_input`);
  }
  await mutateTicket(parsed.data.ticketId, () =>
    sendSupportReply(prisma, { ...parsed.data, actorStaffId: session.uid }),
  );
}

export async function changeSupportTicketStatusAction(formData: FormData) {
  const session = await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const parsed = statusSchema.safeParse({ ticketId, status: field(formData, "status") });
  if (!parsed.success) {
    redirect(`${ticketPath(ticketId)}?error=invalid_input`);
  }
  await mutateTicket(parsed.data.ticketId, () =>
    changeSupportTicketStatus(prisma, { ...parsed.data, actorStaffId: session.uid }),
  );
}

export async function updateSupportTicketDetailsAction(formData: FormData) {
  const session = await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const parsed = detailsSchema.safeParse({
    ticketId,
    type: field(formData, "type"),
    priority: field(formData, "priority"),
    assignedStaffId: field(formData, "assignedStaffId"),
    facilityId: field(formData, "facilityId"),
  });
  if (!parsed.success) {
    redirect(`${ticketPath(ticketId)}?error=invalid_input`);
  }
  const { ticketId: parsedTicketId, ...changes } = parsed.data;
  await mutateTicket(parsedTicketId, () =>
    updateSupportTicketDetails(prisma, {
      ticketId: parsedTicketId,
      actorStaffId: session.uid,
      changes,
    }),
  );
}

export async function assignSupportTicketToMeAction(formData: FormData) {
  const session = await requireHarborStaff();
  const parsed = id.safeParse(field(formData, "ticketId"));
  if (!parsed.success) {
    redirect("/console/tickets");
  }
  await mutateTicket(parsed.data, () =>
    updateSupportTicketDetails(prisma, {
      ticketId: parsed.data,
      actorStaffId: session.uid,
      changes: { assignedStaffId: session.uid },
    }),
  );
}

export async function addSupportTicketTagAction(formData: FormData) {
  const session = await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const tagId = field(formData, "tagId");
  const name = field(formData, "name");
  if (!ticketId) {
    redirect("/console/tickets");
  }
  await mutateTicket(ticketId, () =>
    addSupportTicketTag(prisma, {
      ticketId,
      actorStaffId: session.uid,
      tagId: tagId || undefined,
      name: name || undefined,
    }),
  );
}

export async function removeSupportTicketTagAction(formData: FormData) {
  await requireHarborStaff();
  const ticketId = field(formData, "ticketId");
  const tagId = field(formData, "tagId");
  if (!ticketId || !tagId) {
    redirect(ticketId ? ticketPath(ticketId) : "/console/tickets");
  }
  await mutateTicket(ticketId, () => removeSupportTicketTag(prisma, { ticketId, tagId }));
}

export async function createSupportSavedReplyAction(formData: FormData) {
  const session = await requireHarborStaff();
  await mutateLibrary("saved-replies", () =>
    createSupportSavedReply(prisma, {
      actorStaffId: session.uid,
      name: field(formData, "name"),
      body: field(formData, "body"),
    }),
  );
}

export async function updateSupportSavedReplyAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("saved-replies", () =>
    updateSupportSavedReply(prisma, {
      id: field(formData, "id"),
      name: field(formData, "name"),
      body: field(formData, "body"),
    }),
  );
}

export async function setSupportSavedReplyActiveAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("saved-replies", () =>
    setSupportSavedReplyActive(prisma, {
      id: field(formData, "id"),
      isActive: field(formData, "isActive") === "true",
    }),
  );
}

export async function createSupportTagAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("tags", () => createSupportTag(prisma, { name: field(formData, "name") }));
}

export async function renameSupportTagAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("tags", () =>
    renameSupportTag(prisma, { id: field(formData, "id"), name: field(formData, "name") }),
  );
}

export async function setSupportTagActiveAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("tags", () =>
    setSupportTagActive(prisma, {
      id: field(formData, "id"),
      isActive: field(formData, "isActive") === "true",
    }),
  );
}

function optionalEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseMacroForm(formData: FormData) {
  const assignmentModeRaw = field(formData, "assignmentMode") || "UNCHANGED";
  if (!isSupportMacroAssignmentMode(assignmentModeRaw)) {
    throw new SupportTicketError("invalid_input");
  }
  return {
    name: field(formData, "name"),
    description: field(formData, "description") || null,
    savedReplyId: field(formData, "savedReplyId") || null,
    status: optionalEnum(field(formData, "status"), SUPPORT_TICKET_STATUSES),
    statusAfterReply: optionalEnum(field(formData, "statusAfterReply"), SUPPORT_TICKET_STATUSES),
    type: optionalEnum(field(formData, "type"), SUPPORT_TICKET_TYPES),
    priority: optionalEnum(field(formData, "priority"), SUPPORT_TICKET_PRIORITIES),
    assignmentMode: assignmentModeRaw,
    assignedStaffId: field(formData, "assignedStaffId") || null,
    tagIds: formData.getAll("tagIds").filter((value): value is string => typeof value === "string" && value.length > 0),
  };
}

export async function createSupportMacroAction(formData: FormData) {
  const session = await requireHarborStaff();
  await mutateLibrary("macros", () =>
    createSupportMacro(prisma, { actorStaffId: session.uid, ...parseMacroForm(formData) }),
  );
}

export async function updateSupportMacroAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("macros", () =>
    updateSupportMacro(prisma, { id: field(formData, "id"), ...parseMacroForm(formData) }),
  );
}

export async function setSupportMacroActiveAction(formData: FormData) {
  await requireHarborStaff();
  await mutateLibrary("macros", () =>
    setSupportMacroActive(prisma, {
      id: field(formData, "id"),
      isActive: field(formData, "isActive") === "true",
    }),
  );
}

export async function applySupportMacroAction(ticketId: string, macroId: string) {
  const session = await requireHarborStaff();
  try {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        number: true,
        contact: { select: { displayName: true } },
        facility: { select: { displayName: true } },
      },
    });
    if (!ticket) {
      return { ok: false as const, message: SUPPORT_TICKET_ERROR_MESSAGE.not_found };
    }
    const result = await applySupportMacro(prisma, {
      ticketId,
      macroId,
      actorStaffId: session.uid,
      context: {
        customerName: ticket.contact.displayName,
        ticketNumber: ticket.number,
        facilityName: ticket.facility?.displayName ?? null,
        staffName: session.name,
      },
    });
    revalidateTickets(ticketId);
    const warnings: string[] = [];
    if (result.savedReplyWarning === "inactive") {
      warnings.push("The saved reply is inactive, so no draft text was inserted.");
    }
    if (result.savedReplyWarning === "missing") {
      warnings.push("The saved reply is no longer available, so no draft text was inserted.");
    }
    if (result.skippedInactiveTags.length) {
      warnings.push(`Skipped inactive tags: ${result.skippedInactiveTags.join(", ")}.`);
    }
    return {
      ok: true as const,
      draftBody: result.draftBody,
      statusAfterReply: result.statusAfterReply,
      notice: warnings.join(" ") || "Macro applied. Review the draft before sending.",
    };
  } catch (error) {
    if (error instanceof SupportTicketError) {
      return { ok: false as const, message: SUPPORT_TICKET_ERROR_MESSAGE[error.code] };
    }
    throw error;
  }
}

function parseAutomationDelayMinutes(formData: FormData, type: string): number {
  const rawMinutes = field(formData, "delayMinutes");
  const rawHours = field(formData, "delayHours");
  const rawDays = field(formData, "delayDays");
  if (rawMinutes) {
    const minutes = Number(rawMinutes);
    if (Number.isInteger(minutes) && minutes >= 0) return minutes;
  }
  if (type === "UNASSIGNED_ALERT") {
    const hours = Number(rawHours);
    return Number.isInteger(hours) && hours >= 0 ? hours * 60 : Number.NaN;
  }
  const days = Number(rawDays);
  return Number.isInteger(days) && days >= 0 ? days * SUPPORT_AUTOMATION_MINUTES_PER_DAY : Number.NaN;
}

export async function createSupportAutomationRuleAction(formData: FormData) {
  const session = await requireHarborStaff();
  const type = field(formData, "type");
  if (!isSupportAutomationType(type)) {
    return mutateLibrary("automations", async () => {
      throw new SupportTicketError("invalid_input");
    });
  }
  const delayMinutes = parseAutomationDelayMinutes(formData, type);
  return mutateLibrary("automations", () =>
    createSupportAutomationRule(prisma, {
      actorStaffId: session.uid,
      name: field(formData, "name"),
      type,
      delayMinutes,
      savedReplyId: field(formData, "savedReplyId") || null,
      isActive: field(formData, "isActive") === "on",
    }),
  );
}

export async function updateSupportAutomationRuleAction(formData: FormData) {
  await requireHarborStaff();
  const current = await prisma.supportAutomationRule.findUnique({
    where: { id: field(formData, "ruleId") },
    select: { type: true },
  });
  const delayMinutes = parseAutomationDelayMinutes(formData, current?.type ?? "");
  return mutateLibrary("automations", () =>
    updateSupportAutomationRule(prisma, {
      ruleId: field(formData, "ruleId"),
      name: field(formData, "name"),
      delayMinutes,
      savedReplyId: field(formData, "savedReplyId") || null,
    }),
  );
}

export async function setSupportAutomationRuleActiveAction(formData: FormData) {
  await requireHarborStaff();
  return mutateLibrary("automations", () =>
    setSupportAutomationRuleActive(prisma, {
      ruleId: field(formData, "ruleId"),
      isActive: field(formData, "isActive") === "true",
    }),
  );
}

export async function markSupportNotificationReadAction(notificationId: string, ticketId: string) {
  const session = await requireHarborStaff();
  const result = await markSupportStaffNotificationRead(prisma, {
    staffId: session.uid,
    id: notificationId,
  });
  revalidatePath("/console");
  if (!result.ok) {
    return { ok: false as const, href: "/console/tickets" };
  }
  return { ok: true as const, href: ticketPath(ticketId) };
}

export async function markAllSupportNotificationsReadAction() {
  const session = await requireHarborStaff();
  await markAllSupportStaffNotificationsRead(prisma, { staffId: session.uid });
  revalidatePath("/console");
  return { ok: true as const };
}
