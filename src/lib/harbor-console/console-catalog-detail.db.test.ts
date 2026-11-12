/**
 * Marketplace detail SQL certification.
 * Opt in via a disposable migrated database. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { getDepartmentProduct } from "@/lib/department-products/registry";

import { loadHarborCatalogAdoption, loadHarborCatalogDetail } from "./catalog";
import { CONSOLE_CATALOG_EMPTY, listConsoleCatalogItems } from "./console-catalog";
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

async function ensureRole(prisma: PrismaClient, key: "FACILITY_ADMINISTRATOR" | "STAFF" | "GM" | "MANAGER") {
  return prisma.role.upsert({
    where: { key },
    update: {},
    create: { id: cuidLike(), key, name: key },
  });
}

async function createOrgFacility(prisma: PrismaClient, label: string) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Phase 6D ${label} ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 6D ${label} ${suffix}`,
      timezone: "America/New_York",
    },
  });
  return { suffix, org, facility };
}
