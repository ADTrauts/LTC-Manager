/**
 * Verify UserFacilityAccess backfill: every user has an active grant for current facility.
 * Run: node scripts/verify-user-facility-access.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.$queryRaw`
    SELECT u.id, u.email, u."facilityId"
    FROM "User" u
    LEFT JOIN "UserFacilityAccess" a
      ON a."userId" = u.id
     AND a."facilityId" = u."facilityId"
     AND a."isActive" = true
     AND a."revokedAt" IS NULL
    WHERE a.id IS NULL
  `;

  const orphanList = orphans;
  if (Array.isArray(orphanList) && orphanList.length > 0) {
    console.error("FAIL: users without current-facility access:", orphanList);
    process.exit(1);
  }

  const [userCount, grantCount] = await Promise.all([
    prisma.user.count(),
    prisma.userFacilityAccess.count({ where: { isActive: true, revokedAt: null } }),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        userCount,
        activeGrantCount: grantCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
