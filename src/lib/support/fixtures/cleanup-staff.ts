import type { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

/** Test-only recipient cleanup. Notification fan-out takes KEY SHARE on each
 * recipient, so acquire UPDATE before deleting notifications and their staff. */
export async function cleanupSyntheticSupportStaff(db: PrismaClient, staffIds: string[]) {
  assertDisposableDatabaseUrl(process.env.SUPPORT_TICKETS_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL);
  if (!staffIds.length) return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PlatformStaff" WHERE "id" = ANY(${staffIds}::text[]) ORDER BY "id" FOR UPDATE`;
    await tx.supportStaffNotification.deleteMany({ where: { staffId: { in: staffIds } } });
    await tx.platformStaff.deleteMany({ where: { id: { in: staffIds } } });
  });
}
