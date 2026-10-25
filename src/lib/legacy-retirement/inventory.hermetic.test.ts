import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  LOG_PRESET_CATALOG_MATCHES,
  UNMATCHED_LOG_PRESETS,
  matchedCatalogStableKeys,
} from "../../../prisma/apply-log-template-presets.mjs";

/**
 * Readers and writers of the dropped Records stores.
 * LEG-07: this list is empty. This file names the stores only as search terms.
 */
const LEGACY_STORE_ACCESS = [
  ["prisma", "logTemplate"].join("."),
  ["prisma", "logSubmission"].join("."),
  ["prisma", "logAssignment"].join("."),
  ["prisma", "logTemplateField"].join("."),
  ["prisma", "inspectionDefinition"].join("."),
  ["prisma", "inspectionSubmission"].join("."),
  ["prisma", "operationalTemplate"].join("."),
  ["prisma", "unitMealTime"].join("."),
  [".", "logTemplate", "."].join(""),
  [".", "logSubmission", "."].join(""),
  [".", "logAssignment", "."].join(""),
  [".", "inspectionDefinition", "."].join(""),
  [".", "inspectionSubmission", "."].join(""),
  [".", "operationalTemplate", "."].join(""),
  [".", "unitMealTime", "."].join(""),
];

const SKIP_DIR = new Set(["node_modules", "migrations", ".next", "dist"]);
const EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);

function filesTouchingLegacyStores(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const dot = name.lastIndexOf(".");
      if (!EXT.has(dot >= 0 ? name.slice(dot) : "")) continue;
      const text = readFileSync(path, "utf8");
      if (LEGACY_STORE_ACCESS.some((token) => text.includes(token))) found.push(path);
    }
  };
  for (const root of ["src", "scripts", "prisma"]) walk(root);
  return found.sort();
}

test("legacy store entry points are gone", () => {
  assert.deepEqual(filesTouchingLegacyStores(), []);
});

test("seeds and provisioning install Catalog Records and do not create legacy rows", () => {
  const seed = readFileSync("prisma/seed.mjs", "utf8");
  const presets = readFileSync("prisma/apply-log-template-presets.mjs", "utf8");
  const provision = readFileSync("scripts/provision-facility.mjs", "utf8");
  const bootstrap = readFileSync("scripts/bootstrap-pilot-facility-admin.mjs", "utf8");
  for (const source of [seed, presets, provision, bootstrap]) {
    assert.equal(source.includes("unitMealTime"), false);
    assert.equal(source.includes("logTemplate"), false);
    assert.equal(source.includes("logAssignment"), false);
    assert.equal(source.includes("inspectionDefinition"), false);
    assert.equal(source.includes("operationalTemplate"), false);
  }
  assert.equal(existsSync("scripts/backfill-log-template-presets.mjs"), false);
  assert.equal(LOG_PRESET_CATALOG_MATCHES.length, 9);
  assert.deepEqual(UNMATCHED_LOG_PRESETS, []);
  assert.deepEqual(matchedCatalogStableKeys(), [
    "cooler_temperature_log",
    "food_temperature_log",
    "freezer_temperature_log",
    "high_temp_dishwasher_log",
    "receiving_temperature_log",
    "dietary_dry_storage_ambient",
    "evs_restroom_sanitation_round",
    "plant_generator_weekly_run_log",
  ]);
});
