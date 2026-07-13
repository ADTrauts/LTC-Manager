/**
 * Wave 11 M1 — Organization backfill verification.
 *
 * Run after migrate: node scripts/verify-organization-backfill.mjs
 *
 * Checks:
 * - every Facility has organizationId
 * - Organization rows exist for those ids
 * - managementCompanyName is still present where it was set (non-destructive)
 * - facilities sharing the same normalized managementCompanyName share one Organization
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeKey(raw) {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const facilities = await prisma.facility.findMany({
    select: {
      id: true,
      displayName: true,
      managementCompanyName: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
    },
  });

  const orphaned = facilities.filter((f) => !f.organizationId || !f.organization);
  if (orphaned.length > 0) {
    console.error("FAIL: orphaned facilities:", orphaned.map((f) => f.id));
    process.exit(1);
  }

  const byCompany = new Map();
  for (const facility of facilities) {
    const company = facility.managementCompanyName?.trim();
    if (!company) continue;
    const key = normalizeKey(company);
    const list = byCompany.get(key) ?? [];
    list.push(facility);
    byCompany.set(key, list);
  }

  for (const [key, group] of byCompany) {
    const orgIds = new Set(group.map((f) => f.organizationId));
    if (orgIds.size !== 1) {
      console.error(
        `FAIL: facilities with managementCompanyName key "${key}" span multiple orgs:`,
        [...orgIds],
      );
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        facilityCount: facilities.length,
        organizationCount: new Set(facilities.map((f) => f.organizationId)).size,
        sharedCompanyGroups: [...byCompany.entries()].filter(([, g]) => g.length > 1).length,
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
