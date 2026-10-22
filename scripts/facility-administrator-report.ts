#!/usr/bin/env npx tsx
/**
 * CDA-02 rollout report: facilities with more than one Facility Administrator.
 * Read-only: runs inside a READ ONLY transaction.
 *
 * From ltc-manager/:
 *   npx tsx scripts/facility-administrator-report.ts --database-url=postgresql://...
 * Without --database-url it uses DATABASE_URL. Exits 1 when any facility has a conflict.
 */
import { PrismaClient } from "@prisma/client";

import { listFacilityAdministratorConflicts } from "@/lib/facility-administrator/report";

function databaseUrl(): string {
  const flag = process.argv.find((arg) => arg.startsWith("--database-url="));
  const url = flag ? flag.slice("--database-url=".length) : process.env.DATABASE_URL;
  if (!url) throw new Error("Pass --database-url=… or set DATABASE_URL.");
  return url;
}

function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "") || "(default)";
  } catch {
    return "(unparsed)";
  }
}

async function main() {
  const url = databaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const conflicts = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return listFacilityAdministratorConflicts(tx);
    });
    console.log(`Database: ${databaseName(url)}`);
    if (conflicts.length === 0) {
      console.log("Clean: no facility has more than one Facility Administrator.");
      return;
    }
    console.log(`${conflicts.length} facilit${conflicts.length === 1 ? "y has" : "ies have"} more than one Facility Administrator:\n`);
    for (const conflict of conflicts) {
      console.log(`${conflict.facilityName} (${conflict.organizationName}) — ${conflict.facilityId}`);
      for (const claim of conflict.claims) {
        const state = claim.kind === "current" ? `current since ${claim.since?.toISOString()}` : "home role only (no open period)";
        console.log(`  - ${claim.displayName} <${claim.email}>: ${state}`);
      }
      console.log("");
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
