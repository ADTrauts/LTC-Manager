/**
 * Console catalog projection SQL certification.
 * Opt in via a disposable migrated database. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { DEPARTMENT_WORK_PRESET_KEYS } from "@/lib/department-work/work-presets";

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
        (await listConsoleCatalogItems(prisma)).filter((row) => row.sourceType === "DEPARTMENT_PRODUCT" && row.name === "Healthcare Food & Nutrition").length,
        1,
      );
      assert.equal(evsItem.usageCount, beforeEvs.usageCount);
      assert.equal(evsItem.facilityInstallCount, beforeEvs.facilityInstallCount + 1);
    } finally {
      await prisma.$disconnect();
    }
    }),
);

test(
  "catalog records, work presets, and customer-authored rows stay on their sources",
  { skip: skipReason },
  async () =>
    serial(async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const beforeRound = await item(prisma, "MECHANICAL_ROOM_ROUND");
      const beforeCoolerInstalls = await prisma.facilityCatalogInstall.count({
        where: { catalogStableKey: "cooler_temperature_log" },
      });
      const beforeCoolerPlacements = await prisma.logAttachment.count({
        where: { catalogStableKey: "cooler_temperature_log", status: "ACTIVE" },
      });

      let cooler = await prisma.catalogLogDefinition.findUnique({
        where: { stableKey_version: { stableKey: "cooler_temperature_log", version: 1 } },
      });
      if (!cooler) {
        cooler = await prisma.catalogLogDefinition.create({
          data: {
            stableKey: "cooler_temperature_log",
            version: 1,
            status: "PUBLISHED",
            name: "Cooler Temperature Log",
            purposeType: "LOG",
            category: "TEMPERATURE",
            publishedAt: new Date(),
          },
        });
      }

      const host = await createOrgFacility(prisma, "records");
      const department = await prisma.department.create({
        data: { facilityId: host.facility.id, key: "DIETARY", name: "Dietary" },
      });
      await prisma.facilityCatalogInstall.create({
        data: {
          facilityId: host.facility.id,
          catalogDefinitionId: cooler.id,
          catalogStableKey: cooler.stableKey,
          catalogVersion: cooler.version,
        },
      });
      for (const status of ["ACTIVE", "ACTIVE", "INACTIVE"] as const) {
        await prisma.logAttachment.create({
          data: {
            stableKey: `attach_${status.toLowerCase()}_${cuidLike()}`,
            facilityId: host.facility.id,
            departmentId: department.id,
            catalogDefinitionId: cooler.id,
            catalogStableKey: cooler.stableKey,
            catalogVersion: cooler.version,
            status,
            effectiveFrom: new Date("2026-10-07T00:00:00.000Z"),
            targetKind: "FACILITY",
            timingMode: "AD_HOC",
          },
        });
      }

      const draftKey = `phase6b_draft_${host.suffix}`;
      await prisma.catalogLogDefinition.create({
        data: {
          stableKey: draftKey,
          version: 1,
          status: "PUBLISHED",
          name: "Phase 6B Draft Log",
          purposeType: "LOG",
          category: "EQUIPMENT",
        },
      });
      await prisma.catalogLogDefinition.create({
        data: {
          stableKey: draftKey,
          version: 2,
          status: "DRAFT",
          name: "Phase 6B Draft Log",
          purposeType: "LOG",
          category: "EQUIPMENT",
        },
      });
      const procedureKey = `phase6b_procedure_${host.suffix}`;
      await prisma.catalogLogDefinition.create({
        data: {
          stableKey: procedureKey,
          version: 1,
          status: "PUBLISHED",
          name: "Phase 6B Procedure",
          purposeType: "PROCEDURE",
          category: "OTHER",
        },
      });

      const workA = await createOrgFacility(prisma, "work-a");
      const workB = await createOrgFacility(prisma, "work-b");
      const workDraftOnly = await createOrgFacility(prisma, "work-draft");
      const workCustomer = await createOrgFacility(prisma, "work-customer");
      const deptA = await prisma.department.create({
        data: { facilityId: workA.facility.id, key: "PLANT", name: "Plant Operations" },
      });
      const deptB = await prisma.department.create({
        data: { facilityId: workB.facility.id, key: "PLANT", name: "Plant Operations" },
      });
      const deptDraft = await prisma.department.create({
        data: { facilityId: workDraftOnly.facility.id, key: "PLANT", name: "Plant Operations" },
      });
      const deptCustomer = await prisma.department.create({
        data: { facilityId: workCustomer.facility.id, key: "PLANT", name: "Plant Operations" },
      });
      await prisma.departmentWorkPlan.create({
        data: {
          facilityId: workA.facility.id,
          departmentId: deptA.id,
          stableKey: "MECHANICAL_ROOM_ROUND",
          version: 1,
          name: "Dietary Servery Opening",
          status: "DRAFT",
          presetKey: "MECHANICAL_ROOM_ROUND",
        },
      });
      await prisma.departmentWorkPlan.create({
        data: {
          facilityId: workA.facility.id,
          departmentId: deptA.id,
          stableKey: "MECHANICAL_ROOM_ROUND",
          version: 2,
          name: "Dietary Servery Opening",
          status: "PUBLISHED",
          presetKey: "MECHANICAL_ROOM_ROUND",
        },
      });
      await prisma.departmentWorkPlan.create({
        data: {
          facilityId: workB.facility.id,
          departmentId: deptB.id,
          stableKey: "MECHANICAL_ROOM_ROUND",
          version: 1,
          name: "Mechanical Room Round",
          status: "PUBLISHED",
          presetKey: "MECHANICAL_ROOM_ROUND",
        },
      });
      await prisma.departmentWorkPlan.create({
        data: {
          facilityId: workDraftOnly.facility.id,
          departmentId: deptDraft.id,
          stableKey: "MECHANICAL_ROOM_ROUND",
          version: 1,
          name: "Mechanical Room Round",
          status: "DRAFT",
          presetKey: "MECHANICAL_ROOM_ROUND",
        },
      });
      const customerKey = `work_customer_${workCustomer.suffix}`;
      await prisma.departmentWorkPlan.create({
        data: {
          facilityId: workCustomer.facility.id,
          departmentId: deptCustomer.id,
          stableKey: customerKey,
          name: "Customer Walk",
          status: "PUBLISHED",
        },
      });
      await prisma.operationalTemplate.create({
        data: {
          facilityId: workA.facility.id,
          departmentId: deptA.id,
          stableKey: "EQUIPMENT_CONDITION_INSPECTION",
          name: "Equipment Condition Inspection",
          purposeType: "INSPECTION",
          presetKey: "EQUIPMENT_CONDITION_INSPECTION",
        },
      });
      const knowledgeTitle = `Customer procedure ${workCustomer.suffix}`;
      await prisma.knowledgeArticle.create({
        data: {
          facilityId: workCustomer.facility.id,
          departmentId: deptCustomer.id,
          title: knowledgeTitle,
          body: "Facility-authored knowledge",
          category: "SOP",
        },
      });

      const items = await listConsoleCatalogItems(prisma);
      const coolerItem = items.find((row) => row.stableKey === "cooler_temperature_log");
      assert.ok(coolerItem);
      assert.equal(coolerItem.sourceType, "CATALOG_RECORD");
      assert.equal(coolerItem.catalogFamily, "RECORDS");
      assert.equal(coolerItem.catalogSubtype, "LOG");
      assert.equal(coolerItem.categoryLabel, "Temperature");
      assert.equal(coolerItem.versionDisplay, "v1");
      assert.equal(coolerItem.statusLabel, "Published");
      assert.equal(coolerItem.usageLabel, "placements");
      assert.equal(
        coolerItem.facilityInstallCount,
        await prisma.facilityCatalogInstall.count({
          where: { catalogStableKey: "cooler_temperature_log" },
        }),
      );
      assert.equal(
        coolerItem.usageCount,
        await prisma.logAttachment.count({
          where: { catalogStableKey: "cooler_temperature_log", status: "ACTIVE" },
        }),
      );
      assert.equal(coolerItem.facilityInstallCount, beforeCoolerInstalls + 1);
      assert.equal(coolerItem.usageCount, beforeCoolerPlacements + 2);

      const draft = items.find((row) => row.stableKey === draftKey);
      assert.ok(draft);
      assert.equal(draft.versionDisplay, "v1");
      assert.equal(draft.statusLabel, "Published · Draft");
      assert.equal(items.some((row) => row.stableKey === procedureKey), false);

      const round = items.find((row) => row.stableKey === "MECHANICAL_ROOM_ROUND");
      assert.ok(round);
      assert.equal(round.sourceType, "WORK_PRESET");
      assert.equal(round.catalogFamily, "WORK");
      assert.equal(round.categoryLabel, "Facility Plant Operations");
      assert.equal(round.categoryKey, "PLANT");
      assert.equal(round.versionDisplay, "\u2014");
      assert.equal(round.statusLabel, "\u2014");
      assert.equal(round.facilityInstallCount, beforeRound.facilityInstallCount + 3);
      assert.equal(round.usageCount, (beforeRound.usageCount ?? 0) + 2);
      assert.equal(round.name, "Mechanical Room Round");

      assert.equal(
        items.filter((row) => row.sourceType === "WORK_PRESET").length,
        DEPARTMENT_WORK_PRESET_KEYS.length,
      );
      assert.equal(items.filter((row) => row.sourceType === "DEPARTMENT_PRODUCT").length, 3);
      assert.equal(items.some((row) => row.stableKey === customerKey), false);
      assert.equal(items.some((row) => row.stableKey === "EQUIPMENT_CONDITION_INSPECTION"), false);
      assert.equal(items.some((row) => row.name === knowledgeTitle), false);
      assert.equal(items.some((row) => row.name === "Plant Operations starter configuration"), false);
      assert.ok(items.some((row) => row.sourceType === "CATALOG_RECORD"));
      assert.deepEqual(
        [...new Set(items.map((row) => row.sourceType))].sort(),
        ["CATALOG_RECORD", "DEPARTMENT_PRODUCT", "WORK_PRESET"],
      );
    } finally {
      await prisma.$disconnect();
    }
    }),
);
