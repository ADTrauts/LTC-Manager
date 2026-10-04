import { Prisma, type PrismaClient } from "@prisma/client";

type DbOrTx = PrismaClient | Prisma.TransactionClient;

import { SupportTicketError } from "./errors";

export const SUPPORT_TAG_NAME_MAX = 40;

export type SupportTagRecord = {
  id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type Db = PrismaClient;

/** Trim, collapse whitespace, lowercase. Blank or over-long names are invalid. */
export function normalizeSupportTagName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > SUPPORT_TAG_NAME_MAX) return null;
  return name.toLowerCase();
}

export function parseSupportTagName(raw: string): { name: string; normalizedName: string } {
  const name = raw.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeSupportTagName(name);
  if (!normalizedName) {
    throw new SupportTicketError("invalid_input");
  }
  return { name, normalizedName };
}

export async function listSupportTags(
  db: Db,
  options: { activeOnly?: boolean } = {},
): Promise<SupportTagRecord[]> {
  return db.supportTag.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createSupportTag(db: Db, input: { name: string }): Promise<SupportTagRecord> {
  const fields = parseSupportTagName(input.name);
  try {
    return await db.supportTag.create({ data: fields });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SupportTicketError("conflict");
    }
    throw error;
  }
}

export async function renameSupportTag(
  db: Db,
  input: { id: string; name: string },
): Promise<SupportTagRecord> {
  const fields = parseSupportTagName(input.name);
  try {
    return await db.supportTag.update({
      where: { id: input.id },
      data: fields,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SupportTicketError("conflict");
    }
    throw new SupportTicketError("not_found");
  }
}

export async function setSupportTagActive(
  db: Db,
  input: { id: string; isActive: boolean },
): Promise<SupportTagRecord> {
  try {
    return await db.supportTag.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    });
  } catch {
    throw new SupportTicketError("not_found");
  }
}

export async function addExistingSupportTicketTag(
  db: DbOrTx,
  input: { ticketId: string; actorStaffId: string; tagId: string },
): Promise<"added" | "duplicate" | "skipped_inactive"> {
  const tag = await db.supportTag.findUnique({ where: { id: input.tagId } });
  if (!tag) {
    throw new SupportTicketError("invalid_reference");
  }
  if (!tag.isActive) {
    return "skipped_inactive";
  }
  const existing = await db.supportTicketTag.findUnique({
    where: { ticketId_tagId: { ticketId: input.ticketId, tagId: tag.id } },
    select: { tagId: true },
  });
  if (existing) {
    return "duplicate";
  }
  await db.supportTicketTag.create({
    data: {
      ticketId: input.ticketId,
      tagId: tag.id,
      addedByStaffId: input.actorStaffId,
    },
  });
  return "added";
}

export async function addSupportTicketTag(
  db: Db,
  input: { ticketId: string; actorStaffId: string; tagId?: string; name?: string },
): Promise<{ tag: SupportTagRecord; created: boolean }> {
  const ticket = await db.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  });
  if (!ticket) {
    throw new SupportTicketError("not_found");
  }
  const staff = await db.platformStaff.findFirst({
    where: { id: input.actorStaffId, isActive: true },
    select: { id: true },
  });
  if (!staff) {
    throw new SupportTicketError("invalid_reference");
  }

  let tag: SupportTagRecord | null = null;
  let created = false;
  if (input.tagId) {
    tag = await db.supportTag.findUnique({ where: { id: input.tagId } });
    if (!tag) {
      throw new SupportTicketError("invalid_reference");
    }
    if (!tag.isActive) {
      throw new SupportTicketError("invalid_input");
    }
  } else if (input.name) {
    const fields = parseSupportTagName(input.name);
    const existing = await db.supportTag.findUnique({
      where: { normalizedName: fields.normalizedName },
    });
    if (existing) {
      if (!existing.isActive) {
        throw new SupportTicketError("invalid_input");
      }
      tag = existing;
    } else {
      tag = await createSupportTag(db, { name: input.name });
      created = true;
    }
  } else {
    throw new SupportTicketError("invalid_input");
  }

  try {
    await db.supportTicketTag.create({
      data: {
        ticketId: ticket.id,
        tagId: tag.id,
        addedByStaffId: staff.id,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { tag, created };
    }
    throw error;
  }
  return { tag, created };
}

export async function removeSupportTicketTag(
  db: Db,
  input: { ticketId: string; tagId: string },
): Promise<void> {
  await db.supportTicketTag.deleteMany({
    where: { ticketId: input.ticketId, tagId: input.tagId },
  });
}
