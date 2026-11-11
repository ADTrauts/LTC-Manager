/**
 * Console Marketplace V1 release SQL certification.
 * Deterministic known-count fixture. Opt in via disposable DB. Never target ltc_manager.
 * Run alone — not in the same node --test process as other Marketplace SQL suites.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  createCatalogDefinition,
  createCatalogDraftSuccessor,
  HARBOR_CATALOG_WRITE,
  publishCatalogDefinition,
  retireCatalogDefinition,
} from "@/lib/canonical-logs/catalog-service";
import { loadHarborCatalogAdoption, loadHarborCatalogDetail } from "@/lib/harbor-console/catalog";

import { listConsoleCatalogItems, type ConsoleCatalogItem } from "./console-catalog";
import {
  loadConsoleDepartmentProductDetail,
  productAccessRoleTotal,
} from "./console-catalog-detail";

const databaseUrl =
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set ASSET_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

let sqlTail: Promise<unknown> = Promise.resolve();

function serial<T>(run: () => Promise<T>): Promise<T> {
  const next = sqlTail.then(run, run);
  sqlTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function ensureRole(
  prisma: PrismaClient,
  key: "FACILITY_ADMINISTRATOR" | "MANAGER" | "SUPERVISOR" | "STAFF",
) {
  return prisma.role.upsert({
    where: { key },
    update: {},
    create: { id: cuidLike(), key, name: key },
  });
}

async function createOrgFacility(prisma: PrismaClient, label: string) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Marketplace V1 ${label} ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Marketplace V1 ${label} ${suffix}`,
      timezone: "America/New_York",
    },
  });
  return { suffix, facility };
}

function findItem(items: ConsoleCatalogItem[], stableKey: string): ConsoleCatalogItem {
  const found = items.find((row) => row.stableKey === stableKey);
  assert.ok(found, stableKey);
  return found;
}
