import type { PrismaClient } from "@prisma/client";

import { SupportTicketError } from "./errors";
import { formatSupportTicketNumber } from "./ticket-number";

export const SUPPORT_SAVED_REPLY_NAME_MAX = 80;
export const SUPPORT_SAVED_REPLY_BODY_MAX = 8000;

export const SUPPORT_SAVED_REPLY_VARIABLES = [
  "customer.first_name",
  "customer.name",
  "ticket.number",
  "facility.name",
  "staff.name",
] as const;

export type SupportSavedReplyVariable = (typeof SUPPORT_SAVED_REPLY_VARIABLES)[number];

export type SupportSavedReplyRecord = {
  id: string;
  name: string;
  body: string;
  isActive: boolean;
  createdByStaffId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type SupportSavedReplyContext = {
  customerName: string | null;
  ticketNumber: number;
  facilityName: string | null;
  staffName: string | null;
};

type Db = PrismaClient;

function trimName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validateSavedReplyFields(input: { name: string; body: string }) {
  const name = trimName(input.name);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (!name || name.length > SUPPORT_SAVED_REPLY_NAME_MAX) {
    throw new SupportTicketError("invalid_input");
  }
  if (!body || body.length > SUPPORT_SAVED_REPLY_BODY_MAX) {
    throw new SupportTicketError("invalid_input");
  }
  return { name, body };
}

function firstName(displayName: string | null): string {
  const trimmed = displayName?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/** Deterministic {{token}} substitution. Unknown tokens stay as written. Missing values become "". */
export function renderSupportSavedReply(body: string, context: SupportSavedReplyContext): string {
  const values: Record<SupportSavedReplyVariable, string> = {
    "customer.name": context.customerName?.trim() ?? "",
    "customer.first_name": firstName(context.customerName),
    "ticket.number": formatSupportTicketNumber(context.ticketNumber),
    "facility.name": context.facilityName?.trim() ?? "",
    "staff.name": context.staffName?.trim() ?? "",
  };
  return body.replace(/\{\{\s*([a-z_.]+)\s*\}\}/gi, (match, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    return Object.hasOwn(values, key) ? values[key as SupportSavedReplyVariable] : match;
  });
}

export async function listSupportSavedReplies(
  db: Db,
  options: { activeOnly?: boolean } = {},
): Promise<SupportSavedReplyRecord[]> {
  return db.supportSavedReply.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createSupportSavedReply(
  db: Db,
  input: { actorStaffId: string; name: string; body: string },
): Promise<SupportSavedReplyRecord> {
  const fields = validateSavedReplyFields(input);
  const staff = await db.platformStaff.findFirst({
    where: { id: input.actorStaffId, isActive: true },
    select: { id: true },
  });
  if (!staff) {
    throw new SupportTicketError("invalid_reference");
  }
  return db.supportSavedReply.create({
    data: {
      name: fields.name,
      body: fields.body,
      createdByStaffId: staff.id,
    },
  });
}

export async function updateSupportSavedReply(
  db: Db,
  input: { id: string; name: string; body: string },
): Promise<SupportSavedReplyRecord> {
  const fields = validateSavedReplyFields(input);
  try {
    return await db.supportSavedReply.update({
      where: { id: input.id },
      data: { name: fields.name, body: fields.body },
    });
  } catch {
    throw new SupportTicketError("not_found");
  }
}

export async function setSupportSavedReplyActive(
  db: Db,
  input: { id: string; isActive: boolean },
): Promise<SupportSavedReplyRecord> {
  try {
    return await db.supportSavedReply.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    });
  } catch {
    throw new SupportTicketError("not_found");
  }
}
