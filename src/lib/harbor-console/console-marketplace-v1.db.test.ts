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
  loadConsoleWorkPresetDetail,
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

test(
  "Marketplace V1 list, detail, and source queries agree on known fixtures",
  { skip: skipReason },
  async () =>
    serial(async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const before = await listConsoleCatalogItems(prisma);
        const beforePlant = findItem(before, "PLANT");
        const beforeFood = findItem(before, "HEALTHCARE_FOOD_NUTRITION");
        const beforeEvs = findItem(before, "EVS");
        const beforeRound = findItem(before, "MECHANICAL_ROOM_ROUND");

        assert.equal(beforePlant.name, "Facility Plant Operations");
        assert.equal(beforePlant.versionDisplay, "1.0");
        assert.equal(beforePlant.statusLabel, "AVAILABLE");
        assert.equal(beforePlant.categoryLabel, "Healthcare");
        assert.equal(beforePlant.usageLabel, "users");
        assert.equal(beforeRound.versionDisplay, "\u2014");
        assert.equal(beforeRound.statusLabel, "\u2014");
        assert.equal(beforeRound.categoryLabel, "Facility Plant Operations");
        assert.equal(beforeRound.usageLabel, "published plans");
        assert.equal(before.filter((row) => row.stableKey === "HEALTHCARE_FOOD_NUTRITION").length, 1);
        assert.equal(before.filter((row) => row.stableKey === "DIETARY").length, 0);

        const plantA = await createOrgFacility(prisma, "plant-a");
        const plantB = await createOrgFacility(prisma, "plant-b");
        const decoy = await createOrgFacility(prisma, "decoy");
        const plantC = await createOrgFacility(prisma, "plant-c-shared-email");
        const dietary = await createOrgFacility(prisma, "dietary");
        const foodCanonical = await createOrgFacility(prisma, "food-canonical");
        const evs = await createOrgFacility(prisma, "evs");
        const workA = await createOrgFacility(prisma, "work-a");
        const workB = await createOrgFacility(prisma, "work-b");
        const isolation = await createOrgFacility(prisma, "isolation");
        const recordHost = await createOrgFacility(prisma, "record-host");

        const plantDeptA = await prisma.department.create({
          data: {
            facilityId: plantA.facility.id,
            key: "PLANT",
            name: "Plant Operations",
            isActive: true,
          },
        });
        await prisma.department.create({
          data: {
            facilityId: plantB.facility.id,
            key: "PLANT",
            name: "Plant Operations",
            isActive: false,
          },
        });
        await prisma.department.create({
          data: {
            facilityId: decoy.facility.id,
            key: `OTHER_${plantA.suffix}`,
            name: "Plant Operations",
            isActive: true,
          },
        });
        const plantDeptC = await prisma.department.create({
          data: {
            facilityId: plantC.facility.id,
            key: "PLANT",
            name: "Plant Operations",
            isActive: true,
          },
        });
        await prisma.department.create({
          data: {
            facilityId: dietary.facility.id,
            key: "DIETARY",
            name: "Dietary",
            isActive: true,
          },
        });
        await prisma.department.create({
          data: {
            facilityId: foodCanonical.facility.id,
            key: "HEALTHCARE_FOOD_NUTRITION",
            name: "Food Services",
            isActive: true,
          },
        });
        await prisma.department.create({
          data: {
            facilityId: evs.facility.id,
            key: "EVS",
            name: "Environmental Services",
            isActive: true,
          },
        });
        const workDeptA = await prisma.department.create({
          data: {
            facilityId: workA.facility.id,
            key: "PLANT",
            name: "Plant Operations",
            isActive: true,
          },
        });
        const workDeptB = await prisma.department.create({
          data: {
            facilityId: workB.facility.id,
            key: "PLANT",
            name: "Plant Ops",
            isActive: true,
          },
        });
        const isolationDept = await prisma.department.create({
          data: {
            facilityId: isolation.facility.id,
            key: "PLANT",
            name: "Plant Operations",
            isActive: true,
          },
        });
        const recordDept = await prisma.department.create({
          data: {
            facilityId: recordHost.facility.id,
            key: "DIETARY",
            name: "Dietary",
            isActive: true,
          },
        });

        for (const row of [
          { facilityId: plantA.facility.id, departmentId: plantDeptA.id },
          { facilityId: plantC.facility.id, departmentId: plantDeptC.id },
        ]) {
          const billing = await prisma.facilityBilling.create({
            data: { facilityId: row.facilityId, status: "ACTIVE" },
          });
          await prisma.facilityDepartmentEntitlement.create({
            data: {
              facilityBillingId: billing.id,
              facilityId: row.facilityId,
              departmentId: row.departmentId,
              departmentKey: "PLANT",
              status: "ACTIVE",
            },
          });
        }

        const adminRole = await ensureRole(prisma, "FACILITY_ADMINISTRATOR");
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Manager",
            lastName: "V1",
            email: `v1-manager-${plantA.suffix}@example.com`,
            roleType: "MANAGER",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        const supervisor = await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Supervisor",
            lastName: "V1",
            email: `v1-supervisor-${plantA.suffix}@example.com`,
            roleType: "SUPERVISOR",
            status: "ACTIVE",
          },
        });
        await prisma.employeeDepartment.create({
          data: { employeeId: supervisor.id, departmentId: plantDeptA.id },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Staff",
            lastName: "V1",
            email: `v1-staff-${plantA.suffix}@example.com`,
            roleType: "STAFF",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Lead",
            lastName: "V1",
            email: `v1-lead-${plantA.suffix}@example.com`,
            roleType: "LEAD_TEAM_MEMBER",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "GM",
            lastName: "V1",
            email: `v1-gm-${plantA.suffix}@example.com`,
            roleType: "GM",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Terminated",
            lastName: "V1",
            email: `v1-terminated-${plantA.suffix}@example.com`,
            roleType: "STAFF",
            status: "TERMINATED",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Other",
            lastName: "Dept",
            email: `v1-other-${plantA.suffix}@example.com`,
            roleType: "STAFF",
            status: "ACTIVE",
          },
        });
        await prisma.user.create({
          data: {
            email: `v1-admin-${plantA.suffix}@example.com`,
            displayName: "V1 Admin",
            facilityId: plantA.facility.id,
            roleId: adminRole.id,
            isActive: true,
            emailVerifiedAt: new Date(),
          },
        });
        // Same email authorized at two operable Facilities must count twice.
        const sharedEmail = `v1-shared-${plantA.suffix}@example.com`;
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Shared",
            lastName: "A",
            email: sharedEmail,
            roleType: "STAFF",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantC.facility.id,
            firstName: "Shared",
            lastName: "C",
            email: sharedEmail,
            roleType: "MANAGER",
            status: "ACTIVE",
            primaryDepartmentId: plantDeptC.id,
          },
        });

        const stableKey = `v1_cooler_${plantA.suffix}`;
        const published = await prisma.catalogLogDefinition.create({
          data: {
            stableKey,
            version: 1,
            status: "PUBLISHED",
            name: `V1 Cooler ${plantA.suffix}`,
            purposeType: "LOG",
            category: "TEMPERATURE",
            publishedAt: new Date(),
          },
        });
        await prisma.catalogLogDefinition.create({
          data: {
            stableKey,
            version: 2,
            status: "DRAFT",
            name: `V1 Cooler ${plantA.suffix}`,
            purposeType: "LOG",
            category: "TEMPERATURE",
          },
        });
        await prisma.facilityCatalogInstall.create({
          data: {
            facilityId: recordHost.facility.id,
            catalogDefinitionId: published.id,
            catalogStableKey: stableKey,
            catalogVersion: 1,
          },
        });
        for (const status of ["ACTIVE", "ACTIVE", "ACTIVE", "INACTIVE"] as const) {
          await prisma.logAttachment.create({
            data: {
              stableKey: `v1_${status.toLowerCase()}_${cuidLike()}`,
              facilityId: recordHost.facility.id,
              departmentId: recordDept.id,
              catalogDefinitionId: published.id,
              catalogStableKey: stableKey,
              catalogVersion: 1,
              status,
              effectiveFrom: new Date("2026-10-07T15:00:00.000Z"),
              targetKind: "FACILITY",
              timingMode: "AD_HOC",
            },
          });
        }

        const authored = await createCatalogDefinition(
          prisma,
          {
            name: `V1 Authored ${plantA.suffix}`,
            purposeType: "LOG",
            category: "OTHER",
            fields: [{ label: "Check", fieldType: "YES_NO", isRequired: true }],
          },
          HARBOR_CATALOG_WRITE,
        );
        await publishCatalogDefinition(prisma, authored.id, undefined, HARBOR_CATALOG_WRITE);
        const authoredSuccessor = await createCatalogDraftSuccessor(
          prisma,
          authored.id,
          HARBOR_CATALOG_WRITE,
        );
        assert.equal(authoredSuccessor.version, 2);
        assert.equal(
          findItem(await listConsoleCatalogItems(prisma), authored.stableKey).statusLabel,
          "Published \u00b7 Draft",
        );
        await retireCatalogDefinition(prisma, authored.id, HARBOR_CATALOG_WRITE);

        const procedureKey = `v1_procedure_${plantA.suffix}`;
        await prisma.catalogLogDefinition.create({
          data: {
            stableKey: procedureKey,
            version: 1,
            status: "PUBLISHED",
            name: "V1 Procedure Leak",
            purposeType: "PROCEDURE",
            category: "OTHER",
            publishedAt: new Date(),
          },
        });
        await prisma.operationalTemplate.create({
          data: {
            facilityId: isolation.facility.id,
            departmentId: isolationDept.id,
            stableKey: `v1_ot_${plantA.suffix}`,
            version: 1,
            name: "Cooler Temperature Log",
            purposeType: "LOG",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
        await prisma.knowledgeArticle.create({
          data: {
            facilityId: isolation.facility.id,
            departmentId: isolationDept.id,
            title: "V1 Procedure Knowledge",
            body: "Customer knowledge must not enter Marketplace.",
            category: "SOP",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
        await prisma.knowledgeArticle.create({
          data: {
            facilityId: isolation.facility.id,
            departmentId: isolationDept.id,
            title: "V1 Reference Knowledge",
            body: "Reference must not enter Marketplace.",
            category: "REFERENCE",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });
        await prisma.knowledgeArticle.create({
          data: {
            facilityId: isolation.facility.id,
            departmentId: isolationDept.id,
            title: "V1 Training Knowledge",
            body: "Training must not enter Marketplace.",
            category: "TRAINING",
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });

        const workStable = `v1_round_${plantA.suffix}`;
        for (const version of [
          { version: 1, status: "DRAFT" as const, name: "Night Mechanical Draft" },
          { version: 2, status: "PUBLISHED" as const, name: "Night Mechanical Published" },
          { version: 3, status: "DRAFT" as const, name: "Night Mechanical Successor" },
        ]) {
          await prisma.departmentWorkPlan.create({
            data: {
              facilityId: workA.facility.id,
              departmentId: workDeptA.id,
              stableKey: workStable,
              presetKey: "MECHANICAL_ROOM_ROUND",
              version: version.version,
              name: version.name,
              status: version.status,
            },
          });
        }
        await prisma.departmentWorkPlan.create({
          data: {
            facilityId: workB.facility.id,
            departmentId: workDeptB.id,
            stableKey: workStable,
            presetKey: "MECHANICAL_ROOM_ROUND",
            version: 1,
            name: "Other Facility Round",
            status: "PUBLISHED",
          },
        });
        await prisma.departmentWorkPlan.create({
          data: {
            facilityId: isolation.facility.id,
            departmentId: isolationDept.id,
            stableKey: `customer_walk_${plantA.suffix}`,
            version: 1,
            name: "Customer Walk",
            status: "PUBLISHED",
          },
        });

        const after = await listConsoleCatalogItems(prisma);
        const plant = findItem(after, "PLANT");
        const food = findItem(after, "HEALTHCARE_FOOD_NUTRITION");
        const evsItem = findItem(after, "EVS");
        const round = findItem(after, "MECHANICAL_ROOM_ROUND");
        const record = findItem(after, stableKey);

        // Plant: A, B, C, workA, workB, isolation = +6; decoy excluded.
        assert.equal(plant.facilityInstallCount, beforePlant.facilityInstallCount + 6);
        // Users: A has GM, Manager, Supervisor, Staff, Lead, FA, shared = 7; C has shared as Manager = 1; B = 0.
        assert.equal(plant.usageCount, (beforePlant.usageCount ?? 0) + 8);

        const plantDetail = await loadConsoleDepartmentProductDetail(prisma, "PLANT");
        assert.ok(plantDetail);
        assert.equal(plantDetail.name, plant.name);
        assert.equal(plantDetail.versionLabel, plant.versionDisplay);
        assert.equal(plantDetail.status, plant.statusLabel);
        assert.equal(plantDetail.releasedLabel, "October 7, 2026");
        assert.equal(plantDetail.facilityInstallCount, plant.facilityInstallCount);
        assert.equal(plantDetail.usersWithAccess, plant.usageCount);
        assert.equal(productAccessRoleTotal(plantDetail.roleCounts), plantDetail.usersWithAccess);
        assert.equal(plantDetail.roleCounts.generalManagers >= 1, true);
        assert.equal(plantDetail.roleCounts.managers >= 2, true);
        assert.equal(plantDetail.roleCounts.supervisors >= 1, true);
        assert.equal(plantDetail.roleCounts.staff >= 3, true);
        assert.equal(plantDetail.roleCounts.facilityAdministrators >= 1, true);
        const plantARow = plantDetail.facilities.find(
          (row) => row.facilityId === plantA.facility.id,
        );
        const plantBRow = plantDetail.facilities.find(
          (row) => row.facilityId === plantB.facility.id,
        );
        const plantCRow = plantDetail.facilities.find(
          (row) => row.facilityId === plantC.facility.id,
        );
        assert.ok(plantARow);
        assert.ok(plantBRow);
        assert.ok(plantCRow);
        assert.equal(plantARow.userCount, 7);
        assert.equal(plantARow.accessLabel, "Active");
        assert.equal(plantARow.departmentStatusLabel, "Enabled");
        assert.equal(plantBRow.userCount, 0);
        assert.equal(plantBRow.accessLabel, "Not entitled");
        assert.equal(plantBRow.departmentStatusLabel, "Disabled");
        assert.equal(plantCRow.userCount, 1);
        assert.equal(
          plantDetail.facilities.some((row) => row.facilityId === decoy.facility.id),
          false,
        );

        assert.equal(food.facilityInstallCount, beforeFood.facilityInstallCount + 3);
        const foodDetail = await loadConsoleDepartmentProductDetail(
          prisma,
          "HEALTHCARE_FOOD_NUTRITION",
        );
        assert.ok(foodDetail);
        assert.equal(foodDetail.facilityInstallCount, food.facilityInstallCount);
        assert.equal(foodDetail.usersWithAccess, food.usageCount);
        assert.equal(foodDetail.versionLabel, "\u2014");
        assert.equal(foodDetail.releasedLabel, "\u2014");
        assert.ok(foodDetail.facilities.some((row) => row.departmentKey === "DIETARY"));
        assert.ok(
          foodDetail.facilities.some((row) => row.departmentKey === "HEALTHCARE_FOOD_NUTRITION"),
        );

        assert.equal(evsItem.statusLabel, "DEVELOPMENT");
        assert.equal(evsItem.versionDisplay, "\u2014");
        const evsDetail = await loadConsoleDepartmentProductDetail(prisma, "EVS");
        assert.ok(evsDetail);
        assert.equal(evsDetail.status, "DEVELOPMENT");
        assert.equal(evsDetail.versionLabel, "\u2014");
        assert.equal(evsDetail.releasedLabel, "\u2014");
        assert.equal(evsDetail.facilityInstallCount, beforeEvs.facilityInstallCount + 1);
        assert.equal(evsDetail.usersWithAccess, 0);
        assert.equal(evsDetail.usersWithAccess, evsItem.usageCount);

        assert.equal(record.versionDisplay, "v1");
        assert.equal(record.statusLabel, "Published · Draft");
        assert.equal(record.facilityInstallCount, 1);
        assert.equal(record.usageCount, 3);
        assert.equal(record.usageLabel, "placements");
        const recordDetail = await loadHarborCatalogDetail(prisma, stableKey);
        const recordAdoption = await loadHarborCatalogAdoption(prisma, stableKey);
        assert.ok(recordDetail);
        assert.equal(recordDetail.published?.version, 1);
        assert.equal(recordDetail.draft?.version, 2);
        assert.equal(recordAdoption.facilityInstallCount, record.facilityInstallCount);
        assert.equal(recordAdoption.activePlacementCount, record.usageCount);
        assert.equal(
          await prisma.facilityCatalogInstall.count({ where: { catalogStableKey: stableKey } }),
          1,
        );
        assert.equal(
          await prisma.logAttachment.count({
            where: { catalogStableKey: stableKey, status: "ACTIVE" },
          }),
          3,
        );

        assert.equal(round.facilityInstallCount, beforeRound.facilityInstallCount + 2);
        assert.equal(round.usageCount, (beforeRound.usageCount ?? 0) + 2);
        const workDetail = await loadConsoleWorkPresetDetail(prisma, "MECHANICAL_ROOM_ROUND");
        assert.ok(workDetail);
        assert.equal(workDetail.versionLabel, "\u2014");
        assert.equal(workDetail.statusLabel, "\u2014");
        assert.equal(workDetail.owningProductName, "Facility Plant Operations");
        assert.equal(workDetail.facilityInstallCount, round.facilityInstallCount);
        assert.equal(workDetail.publishedPlanCount, round.usageCount);
        const workARows = workDetail.plans.filter((row) => row.facilityId === workA.facility.id);
        assert.equal(workARows.length, 3);
        assert.ok(workARows.some((row) => row.status === "PUBLISHED" && row.version === 2));
        assert.equal(
          after.some((row) => row.stableKey === procedureKey),
          false,
        );
        assert.equal(
          after.some((row) => row.name === "Cooler Temperature Log" && row.sourceType !== "CATALOG_RECORD"),
          false,
        );
        assert.equal(
          after.some((row) => row.stableKey === `customer_walk_${plantA.suffix}`),
          false,
        );
        assert.equal(
          after.some((row) => row.name.includes("V1 Procedure Knowledge")),
          false,
        );
        assert.equal(
          after.some((row) => row.name.includes("V1 Reference Knowledge")),
          false,
        );
        assert.equal(
          after.some((row) => row.name.includes("V1 Training Knowledge")),
          false,
        );

        const authoredAfterRetire = findItem(
          await listConsoleCatalogItems(prisma),
          authored.stableKey,
        );
        assert.equal(authoredAfterRetire.statusLabel, "Draft");
        assert.equal(authoredAfterRetire.versionDisplay, "v2");

        assert.equal(await loadConsoleDepartmentProductDetail(prisma, "NOT_REAL"), null);
        assert.equal(await loadConsoleWorkPresetDetail(prisma, "NOT_REAL"), null);
      } finally {
        await prisma.$disconnect();
      }
    }),
);
