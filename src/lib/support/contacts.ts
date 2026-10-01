import type { Prisma } from "@prisma/client";

export function normalizeSupportEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function cleanDisplayName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A user is linked only when exactly one active, verified user owns the address. The link labels
 * the contact for staff; it never grants the sender any authority.
 */
async function findSafeUserMatch(tx: Prisma.TransactionClient, email: string) {
  const users = await tx.user.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      isActive: true,
      emailVerifiedAt: { not: null },
    },
    select: { id: true, facilityId: true },
    take: 2,
  });
  return users.length === 1 ? users[0] : null;
}

export async function upsertSupportContact(
  tx: Prisma.TransactionClient,
  input: { email: string; displayName?: string | null },
): Promise<{ id: string; email: string; facilityId: string | null }> {
  const email = normalizeSupportEmail(input.email);
  if (!email) {
    throw new Error("Support contact email is required.");
  }
  const displayName = cleanDisplayName(input.displayName);

  const existing = await tx.supportContact.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, userId: true, facilityId: true },
  });

  if (!existing) {
    const match = await findSafeUserMatch(tx, email);
    return tx.supportContact.create({
      data: {
        email,
        displayName,
        userId: match?.id ?? null,
        facilityId: match?.facilityId ?? null,
      },
      select: { id: true, email: true, facilityId: true },
    });
  }

  const data: Prisma.SupportContactUncheckedUpdateInput = {};
  if (displayName && !existing.displayName) {
    data.displayName = displayName;
  }
  if (!existing.userId) {
    const match = await findSafeUserMatch(tx, email);
    if (match) {
      data.userId = match.id;
      if (!existing.facilityId) {
        data.facilityId = match.facilityId;
      }
    }
  }
  if (Object.keys(data).length > 0) {
    await tx.supportContact.update({ where: { id: existing.id }, data });
  }
  return {
    id: existing.id,
    email: existing.email,
    facilityId: (data.facilityId as string | undefined) ?? existing.facilityId,
  };
}
