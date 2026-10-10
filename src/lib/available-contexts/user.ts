import type { Prisma, PrismaClient } from "@prisma/client";

import { AvailableContextError } from "./types";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ActiveUser = {
  id: string;
  facilityId: string | null;
};

export async function assertActiveUser(db: DbClient, userId: string): Promise<ActiveUser> {
  if (!userId.trim()) {
    throw new AvailableContextError("USER_NOT_FOUND", "User not found.");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, facilityId: true },
  });

  if (!user) {
    throw new AvailableContextError("USER_NOT_FOUND", "User not found.");
  }
  if (!user.isActive) {
    throw new AvailableContextError("USER_INACTIVE", "User is inactive.");
  }

  return { id: user.id, facilityId: user.facilityId };
}
