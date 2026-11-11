/**
 * Console catalog projection SQL certification.
 * Opt in via a disposable migrated database. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { listConsoleCatalogItems, type ConsoleCatalogItem } from "./console-catalog";

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
    data: { name: `Console catalog ${label} ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Console catalog ${label} ${suffix}`,
      timezone: "America/New_York",
    },
  });
  return { suffix, facility };
}

async function item(prisma: PrismaClient, stableKey: string): Promise<ConsoleCatalogItem> {
  const items = await listConsoleCatalogItems(prisma);
  const found = items.find((row) => row.stableKey === stableKey);
  assert.ok(found, stableKey);
  return found;
}

test(
  "department install counts use lineage keys and user access uses operability",
  { skip: skipReason },
  async () =>
    serial(async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await prisma.$transaction(async (snapshot) => {
      const prisma = snapshot as unknown as PrismaClient;
      const beforePlant = await item(prisma, "PLANT");
      const beforeFood = await item(prisma, "HEALTHCARE_FOOD_NUTRITION");
      const beforeEvs = await item(prisma, "EVS");
      assert.equal(
        (await listConsoleCatalogItems(prisma)).filter((row) => row.stableKey === "HEALTHCARE_FOOD_NUTRITION")
          .length,
        1,
      );

      const plantA = await createOrgFacility(prisma, "plant-a");
      const plantB = await createOrgFacility(prisma, "plant-b");
      const decoy = await createOrgFacility(prisma, "decoy");
      const foodLegacy = await createOrgFacility(prisma, "food-legacy");
      const foodCanonical = await createOrgFacility(prisma, "food-canonical");
      const evs = await createOrgFacility(prisma, "evs");

      const departmentA = await prisma.department.create({
        data: { facilityId: plantA.facility.id, key: "PLANT", name: "Plant Operations", isActive: true },
      });
      await prisma.department.create({
        data: { facilityId: plantB.facility.id, key: "PLANT", name: "Plant Operations", isActive: false },
      });
      await prisma.department.create({
        data: {
          facilityId: decoy.facility.id,
          key: `CUSTOM_${decoy.suffix}`,
          name: "Plant Operations",
          isActive: true,
        },
      });
      await prisma.department.create({
        data: { facilityId: foodLegacy.facility.id, key: "DIETARY", name: "Nutrition Services", isActive: true },
      });
      await prisma.department.create({
        data: {
          facilityId: foodCanonical.facility.id,
          key: "HEALTHCARE_FOOD_NUTRITION",
          name: "Food Services",
          isActive: true,
        },
      });
      const evsDepartment = await prisma.department.create({
        data: { facilityId: evs.facility.id, key: "EVS", name: "Environmental Services", isActive: true },
      });

      const billing = await prisma.facilityBilling.create({
        data: { facilityId: plantA.facility.id, status: "ACTIVE" },
      });
      await prisma.facilityDepartmentEntitlement.create({
        data: {
          facilityBillingId: billing.id,
          facilityId: plantA.facility.id,
          departmentId: departmentA.id,
          departmentKey: "PLANT",
          status: "ACTIVE",
        },
      });

      const adminRole = await ensureRole(prisma, "FACILITY_ADMINISTRATOR");
      const staffRole = await ensureRole(prisma, "STAFF");
      const sharedEmail = `mgr-${plantA.suffix}@example.com`;

      await prisma.employee.create({
        data: {
          facilityId: plantA.facility.id,
          firstName: "Pat",
          lastName: "Manager",
          email: sharedEmail,
          roleType: "MANAGER",
          status: "ACTIVE",
          primaryDepartmentId: departmentA.id,
        },
      });
      const supervisor = await prisma.employee.create({
        data: {
          facilityId: plantA.facility.id,
          firstName: "Sam",
          lastName: "Supervisor",
          email: `sup-${plantA.suffix}@example.com`,
          roleType: "SUPERVISOR",
          status: "ACTIVE",
        },
      });
      await prisma.employeeDepartment.create({
        data: { employeeId: supervisor.id, departmentId: departmentA.id },
      });
      const otherDepartment = await prisma.department.create({
        data: { facilityId: plantA.facility.id, key: `OTHER_${plantA.suffix}`, name: "Laundry" },
      });
      await prisma.employee.create({
        data: {
          facilityId: plantA.facility.id,
          firstName: "Una",
          lastName: "Other",
          email: `other-${plantA.suffix}@example.com`,
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: otherDepartment.id,
        },
      });
      await prisma.employee.create({
        data: {
          facilityId: plantA.facility.id,
          firstName: "Terry",
          lastName: "Former",
          email: `former-${plantA.suffix}@example.com`,
          roleType: "STAFF",
          status: "TERMINATED",
          primaryDepartmentId: departmentA.id,
        },
      });
      await prisma.user.create({
        data: {
          email: `admin-${plantA.suffix}@example.com`,
          displayName: "Verified Admin",
          facilityId: plantA.facility.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.user.create({
        data: {
          email: sharedEmail,
          displayName: "Pat Manager",
          facilityId: plantA.facility.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.user.create({
        data: {
          email: `inactive-admin-${plantA.suffix}@example.com`,
          displayName: "Inactive Admin",
          facilityId: plantA.facility.id,
          roleId: adminRole.id,
          isActive: false,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.user.create({
        data: {
          email: `unverified-admin-${plantA.suffix}@example.com`,
          displayName: "Unverified Admin",
          facilityId: plantA.facility.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: null,
        },
      });
      await prisma.user.create({
        data: {
          email: `staff-${plantA.suffix}@example.com`,
          displayName: "Staff Login",
          facilityId: plantA.facility.id,
          roleId: staffRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });

      const disabledDepartment = await prisma.department.findFirstOrThrow({
        where: { facilityId: plantB.facility.id, key: "PLANT" },
      });
      await prisma.employee.create({
        data: {
          facilityId: plantB.facility.id,
          firstName: "Dee",
          lastName: "Disabled",
          email: `disabled-${plantB.suffix}@example.com`,
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: disabledDepartment.id,
        },
      });
      await prisma.user.create({
        data: {
          email: `disabled-admin-${plantB.suffix}@example.com`,
          displayName: "Disabled Facility Admin",
          facilityId: plantB.facility.id,
          roleId: adminRole.id,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.employee.create({
        data: {
          facilityId: evs.facility.id,
          firstName: "Eve",
          lastName: "Evs",
          email: `evs-${evs.suffix}@example.com`,
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: evsDepartment.id,
        },
      });

      const plant = await item(prisma, "PLANT");
      const food = await item(prisma, "HEALTHCARE_FOOD_NUTRITION");
      const evsItem = await item(prisma, "EVS");
      assert.equal(plant.facilityInstallCount, beforePlant.facilityInstallCount + 2);
      assert.equal(plant.usageCount, (beforePlant.usageCount ?? 0) + 3);
      assert.equal(food.facilityInstallCount, beforeFood.facilityInstallCount + 2);
      assert.equal(
        (await listConsoleCatalogItems(prisma)).filter((row) => row.sourceType === "DEPARTMENT_PRODUCT" && row.name === "Food and Nutrition").length,
        1,
      );
      assert.equal(evsItem.usageCount, beforeEvs.usageCount);
      assert.equal(evsItem.facilityInstallCount, beforeEvs.facilityInstallCount + 1);
      }, { isolationLevel: "RepeatableRead", timeout: 60000 });
    } finally {
      await prisma.$disconnect();
    }
    }),
);
