#!/usr/bin/env node
/**
 * Sync today's OperationInstance rows from active OperationDefinition templates.
 *
 * Idempotent: existing (definitionId, serviceDate) rows are preserved; only missing
 * instances are created. Safe to run while OPERATION_ENGINE_ENABLED=false — this only
 * prepares data and does not change product behavior.
 *
 * Usage (from ltc-manager/):
 *   npm run db:sync-operation-instances
 *   npm run db:sync-operation-instances -- --facility-id=<facilityId>
 *   npm run db:sync-operation-instances -- --date=2026-07-08
 *   npm run db:sync-operation-instances -- --facility-id=<facilityId> --date=2026-07-08
 *
 * Without --facility-id, all facilities are synced.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { facilityLocalDateToServiceDate, loadFacilityTimezone } from "../src/lib/operational-time";
import { syncOperationInstances } from "../src/lib/operations/sync-operation-instances";

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

  for (const arg of argv) {
    if (arg.startsWith("--facility-id=")) {
      facilityId = arg.slice("--facility-id=".length).trim() || undefined;
      continue;
    }
    if (arg.startsWith("--date=")) {
      date = arg.slice("--date=".length).trim() || undefined;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npm run db:sync-operation-instances
  npm run db:sync-operation-instances -- --facility-id=<facilityId>
  npm run db:sync-operation-instances -- --date=YYYY-MM-DD`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  let serviceDate: Date | undefined;
  if (date) {
    serviceDate = facilityLocalDateToServiceDate(date);
  }

  return { facilityId, serviceDate };
}

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const { facilityId, serviceDate } = parseArgs(process.argv.slice(2));

  if (facilityId) {
    const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
    const results = await syncOperationInstances(prisma, {
      facilityId,
      serviceDate,
      facilityTimezone,
    });
    for (const result of results) {
      const day = result.serviceDate.toISOString().slice(0, 10);
      console.log(
        `facility=${result.facilityId} timezone=${facilityTimezone} date=${day} definitions=${result.definitionsConsidered} created=${result.created} skipped=${result.skippedExisting}`,
      );
    }
    return;
  }

  const results = await syncOperationInstances(prisma, { serviceDate });

  if (results.length === 0) {
    console.log("No facilities found.");
    return;
  }

  for (const result of results) {
    const day = result.serviceDate.toISOString().slice(0, 10);
    console.log(
      `facility=${result.facilityId} date=${day} definitions=${result.definitionsConsidered} created=${result.created} skipped=${result.skippedExisting}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
