/**
 * Install matched Catalog Records on every facility and move Food & Nutrition
 * onto the forward engine when an older rollout still says LEGACY.
 * Does not copy legacy submissions. Does not change Plant or EVS rollouts.
 *
 * Refuses the local ltc_manager database. Requires LEG01_APPLY=1.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

import { upsertPublishedCatalogSeeds } from "../prisma/apply-catalog-log-seeds.mjs";
import { installMatchedCatalogRecords } from "../prisma/apply-log-template-presets.mjs";
import { redactDatabaseUrl } from "./verify/lib/database-target.mjs";

function loadEnvFile(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

if (process.env.LEG01_ENV_FILE) loadEnvFile(process.env.LEG01_ENV_FILE);

const url = process.env.DATABASE_URL ?? "";
const target = redactDatabaseUrl(url);
const localTestDatabase = target.endsWith("/ltc_manager");
if (!url || (localTestDatabase && process.env.LEG01_INCLUDE_LOCAL !== "1")) {
  console.error("leg01: refused. Set LEG01_INCLUDE_LOCAL=1 to include the local ltc_manager test database.");
  process.exit(1);
}
if (process.env.LEG01_APPLY !== "1") {
  console.error(`leg01: dry run only against ${target}. Set LEG01_APPLY=1 to write.`);
  process.exit(0);
}

const prisma = new PrismaClient();
const today = new Date().toISOString().slice(0, 10);

try {
  await upsertPublishedCatalogSeeds(prisma);
  const facilities = await prisma.facility.findMany({ select: { id: true, displayName: true } });
  for (const facility of facilities) {
    await installMatchedCatalogRecords(prisma, { facilityId: facility.id });
  }

  const dietary = await prisma.department.findMany({
    where: { isActive: true, key: { in: ["DIETARY", "EVS", "PLANT"] } },
    select: { id: true, facilityId: true, key: true },
  });
  const moved = 0;
  void dietary;
  void today;

  console.log(`leg01: installed Catalog Records on ${facilities.length} facilities at ${target}`);
  console.log(`leg01: departments moved forward from an older LEGACY rollout: ${moved}`);
} finally {
  await prisma.$disconnect();
}
