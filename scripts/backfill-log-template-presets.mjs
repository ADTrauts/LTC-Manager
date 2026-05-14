#!/usr/bin/env node
/**
 * Inserts/updates shipped log template presets for every facility in the database.
 * Use when a facility was created before presets were added and did not use provision/seed.
 *
 * From ltc-manager/: node scripts/backfill-log-template-presets.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { applyLogTemplatePresets } from "../prisma/apply-log-template-presets.mjs";

function loadEnvFile() {
  try {
    const p = resolve(process.cwd(), ".env");
    const raw = readFileSync(p, "utf8");
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
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

loadEnvFile();
const prisma = new PrismaClient();

async function main() {
  const facilities = await prisma.facility.findMany({ select: { id: true, displayName: true } });
  for (const f of facilities) {
    console.log(`Applying log presets: ${f.displayName} (${f.id})`);
    await applyLogTemplatePresets(prisma, { facilityId: f.id, createdByRoleId: null });
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
