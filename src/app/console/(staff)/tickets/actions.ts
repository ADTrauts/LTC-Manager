"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isEmailConfigured, sendConsoleTicketReplyEmail } from "@/lib/email";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

const openSchema = z.object({
  facilityId: z.string().cuid(),
  subject: z.string().trim().min(3).max(160),
  requesterEmail: z.string().trim().email().max(200),
  requesterName: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(8000),
});

const replySchema = z.object({
  ticketId: z.string().cuid(),
  body: z.string().trim().min(1).max(8000),
  status: z.enum(["OPEN", "WAITING_ON_CUSTOMER", "RESOLVED"]),
});

export async function openConsoleTicketAction(formData: FormData) {
  const session = await requireHarborStaff();
  const parsed = openSchema.safeParse({
    facilityId: formData.get("facilityId"),
    subject: formData.get("subject"),
    requesterEmail: formData.get("requesterEmail"),
    requesterName: String(formData.get("requesterName") ?? "").trim() || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the ticket fields.");
  }

  const facility = await prisma.facility.findUnique({
    where: { id: parsed.data.facilityId },
    select: { id: true },
  });
  if (!facility) {
    throw new Error("Facility not found.");
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.consoleTicket.create({
      data: {
        facilityId: facility.id,
        subject: parsed.data.subject,
        requesterEmail: parsed.data.requesterEmail.toLowerCase(),
        requesterName: parsed.data.requesterName || null,
        openedByStaffId: session.uid,
        status: "OPEN",
        messages: {
          create: {
            body: parsed.data.body,
            authorStaffId: session.uid,
          },
        },
      },
      select: { id: true },
    });
    await tx.harborAuditEvent.create({
      data: {
        staffId: session.uid,
        action: "TICKET_OPEN",
        facilityId: facility.id,
      },
    });
    return created;
  });

  revalidatePath("/console");
  revalidatePath("/console/tickets");
  redirect(`/console/tickets/${ticket.id}`);
}

export async function replyConsoleTicketAction(formData: FormData) {
  const session = await requireHarborStaff();
  const parsed = replySchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Check the reply.");
  }

  const ticket = await prisma.consoleTicket.findUnique({
    where: { id: parsed.data.ticketId },
    select: {
      id: true,
      subject: true,
      requesterEmail: true,
      requesterName: true,
      facilityId: true,
      facility: { select: { displayName: true } },
    },
  });
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const now = new Date();
  let emailedAt: Date | null = null;
  if (isEmailConfigured()) {
    const result = await sendConsoleTicketReplyEmail({
      to: ticket.requesterEmail,
      displayName: ticket.requesterName || "there",
      facilityDisplayName: ticket.facility.displayName,
      subject: ticket.subject,
      replyBody: parsed.data.body,
    });
    if (result.sent) {
      emailedAt = now;
    } else if (result.reason === "send_failed") {
      console.info("console_ticket_reply_failed", { ticketId: ticket.id, error: result.error });
    }
  } else {
    console.info("console_ticket_reply_skipped_not_configured", { ticketId: ticket.id });
  }

  await prisma.$transaction(async (tx) => {
    await tx.consoleTicketMessage.create({
      data: {
        ticketId: ticket.id,
        body: parsed.data.body,
        authorStaffId: session.uid,
        emailedAt,
      },
    });
    await tx.consoleTicket.update({
      where: { id: ticket.id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === "RESOLVED" ? now : null,
      },
    });
    await tx.harborAuditEvent.create({
      data: {
        staffId: session.uid,
        action: "TICKET_REPLY",
        facilityId: ticket.facilityId,
      },
    });
  });

  revalidatePath("/console");
  revalidatePath("/console/tickets");
  revalidatePath(`/console/tickets/${ticket.id}`);
}
