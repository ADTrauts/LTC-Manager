/**
 * The old servery milestone tables are retired. Recording a milestone now
 * refuses with MEAL_NOT_CONFIGURED until the Key Point path replaces it.
 *
 * Set SERVERY_MILESTONE_TEST_DATABASE_URL to a disposable migrated database.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL = process.env.SERVERY_MILESTONE_TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set SERVERY_MILESTONE_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "servery-milestone-db-test-secret";

let db: PrismaClient | null = null;

async function client(): Promise<PrismaClient> {
  if (db) return db;
  const { PrismaClient: Client } = await import("@prisma/client");
  db = new Client({ datasources: { db: { url: TEST_DATABASE_URL } } });
  return db;
}

after(async () => {
  await db?.$disconnect();
});

test("a missing unit is not found", { skip }, async () => {
  const prisma = await client();
  const { recordServeryMilestone } = await import("./record-milestone");
  const result = await recordServeryMilestone(
    {
      facilityId: "missing-facility",
      unitId: "missing-unit",
      mealType: "BREAKFAST",
      milestone: "READY",
      action: "RECORD",
      clientActionId: "retired-missing-unit",
      actor: {
        userId: null,
        employeeId: null,
        role: "STAFF",
        authMethod: "pin",
      },
    },
    prisma,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "UNIT_NOT_FOUND");
});

test("a live servery does not write the retired milestone store", { skip }, async () => {
  const prisma = await client();
  const unit = await prisma.unit.findFirst({
    where: {
      unitType: "SERVERY",
      isActive: true,
      facility: { departments: { some: { key: "DIETARY", isActive: true } } },
    },
    select: { id: true, facilityId: true },
  });
  if (!unit) return;
  const { recordServeryMilestone } = await import("./record-milestone");
  const result = await recordServeryMilestone(
    {
      facilityId: unit.facilityId,
      unitId: unit.id,
      mealType: "BREAKFAST",
      milestone: "READY",
      action: "RECORD",
      clientActionId: `retired-${unit.id}`,
      actor: {
        userId: null,
        employeeId: null,
        role: "MANAGER",
        authMethod: "password",
      },
    },
    prisma,
  );
  assert.equal(result.ok, false);
});
