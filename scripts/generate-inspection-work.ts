#!/usr/bin/env node
/**
 * Generate due InspectionOccurrence rows and optional Tasks for recurring definitions.
 *
 * Idempotent: existing (definitionId, serviceDate) rows are preserved.
 *
 * Usage (from ltc-manager/):
 *   npm run db:generate-inspection-work
 *   npm run db:generate-inspection-work -- --facility-id=<facilityId>
 *   npm run db:generate-inspection-work -- --date=2026-07-12
 *   npm run db:generate-inspection-work -- --facility-id=<id> --date=2026-07-12 --through-date=2026-07-19
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { loadFacilityTimezone } from "../src/lib/operational-time";
import { generateDueInspectionWorkForFacilities } from "../src/lib/work/inspections/generate-due-inspection-work";

function loadEnvFile() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    /* no .env */
  }
}

function parseArgs(argv: string[]) {
  let facilityId: string | undefined;
  let date: string | undefined;
  let throughDate: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--facility-id=")) {
      facilityId = arg.slice("--facility-id=".length).trim() || undefined;
      continue;
    }
    if (arg.startsWith("--date=")) {
      date = arg.slice("--date=".length).trim() || undefined;
      continue;
    }
    if (arg.startsWith("--through-date=")) {
      throughDate = arg.slice("--through-date=".length).trim() || undefined;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npm run db:generate-inspection-work
  npm run db:generate-inspection-work -- --facility-id=<facilityId>
  npm run db:generate-inspection-work -- --date=YYYY-MM-DD
  npm run db:generate-inspection-work -- --date=YYYY-MM-DD --through-date=YYYY-MM-DD`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { facilityId, date, throughDate };
}

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const { facilityId, date, throughDate } = parseArgs(process.argv.slice(2));
  const results = await generateDueInspectionWorkForFacilities(
    { facilityId, date, throughDate },
    { db: prisma },
  );

  if (results.length === 0) {
    console.log("No facilities found.");
    return;
  }

  for (const result of results) {
    const timezone = await loadFacilityTimezone(prisma, result.facilityId);
    console.log(
      `facility=${result.facilityId} timezone=${timezone} from=${result.fromServiceDate} through=${result.throughServiceDate} definitions=${result.definitionsConsidered} occurrences+${result.occurrencesCreated}/existing=${result.occurrencesExisting} tasks+${result.tasksCreated}/upd=${result.tasksUpdated}/skip=${result.tasksSkipped}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
