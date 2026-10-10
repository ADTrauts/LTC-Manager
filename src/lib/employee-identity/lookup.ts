import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function findEmployeeForUserFacility(
  db: DbClient,
  input: { userId: string; facilityId: string },
): Promise<{ id: string; status: string; userId: string | null } | null> {
  if (!input.userId?.trim() || !input.facilityId?.trim()) return null;
  return db.employee.findFirst({
    where: { userId: input.userId, facilityId: input.facilityId },
    select: { id: true, status: true, userId: true },
  });
}
