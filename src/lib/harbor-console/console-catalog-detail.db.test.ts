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

test(
  "product, record, and work detail match the projection",
  { skip: skipReason },
  async () =>
    serial(async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const beforeItems = await listConsoleCatalogItems(prisma);
        const beforePlant = beforeItems.find((row) => row.stableKey === "PLANT");
        const beforeFood = beforeItems.find((row) => row.stableKey === "HEALTHCARE_FOOD_NUTRITION");
        const beforeEvs = beforeItems.find((row) => row.stableKey === "EVS");
        const beforeRound = beforeItems.find((row) => row.stableKey === "MECHANICAL_ROOM_ROUND");
        const beforePlantDetail = await loadConsoleDepartmentProductDetail(prisma, "PLANT");
        assert.ok(beforePlant && beforeFood && beforeEvs && beforeRound && beforePlantDetail);

        const plantA = await createOrgFacility(prisma, "Plant A");
        const plantB = await createOrgFacility(prisma, "Plant B");
        const decoy = await createOrgFacility(prisma, "Decoy");
        const dietary = await createOrgFacility(prisma, "Dietary");
        const foodCanonical = await createOrgFacility(prisma, "Food canonical");
        const evs = await createOrgFacility(prisma, "EVS");
        const workHost = await createOrgFacility(prisma, "Work host");
        const workOther = await createOrgFacility(prisma, "Work other");
        const recordHost = await createOrgFacility(prisma, "Record");

        const departmentA = await prisma.department.create({
          data: { facilityId: plantA.facility.id, key: "PLANT", name: "Plant Operations", isActive: true },
        });
        const departmentB = await prisma.department.create({
          data: { facilityId: plantB.facility.id, key: "PLANT", name: "Plant Operations", isActive: false },
        });
        await prisma.department.create({
          data: { facilityId: decoy.facility.id, key: `OTHER_${decoy.suffix}`, name: "Plant Operations", isActive: true },
        });
        const dietaryDepartment = await prisma.department.create({
          data: { facilityId: dietary.facility.id, key: "DIETARY", name: "Dietary", isActive: true },
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
          data: { facilityId: evs.facility.id, key: "EVS", name: "Environmental Services", isActive: true },
        });
        const workDepartment = await prisma.department.create({
          data: { facilityId: workHost.facility.id, key: "PLANT", name: "Plant Operations", isActive: true },
        });
        const workOtherDepartment = await prisma.department.create({
          data: { facilityId: workOther.facility.id, key: "PLANT", name: "Plant Operations", isActive: true },
        });
        const recordDepartment = await prisma.department.create({
          data: { facilityId: recordHost.facility.id, key: "DIETARY", name: "Dietary", isActive: true },
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
        const sharedEmail = `mgr-${plantA.suffix}@example.com`;
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Gina",
            lastName: "General",
            email: `gm-${plantA.suffix}@example.com`,
            roleType: "GM",
            status: "ACTIVE",
            primaryDepartmentId: departmentA.id,
          },
        });
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
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Lee",
            lastName: "Lead",
            email: `lead-${plantA.suffix}@example.com`,
            roleType: "LEAD_TEAM_MEMBER",
            status: "ACTIVE",
            primaryDepartmentId: departmentA.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: plantA.facility.id,
            firstName: "Stu",
            lastName: "Staff",
            email: `staff-${plantA.suffix}@example.com`,
            roleType: "STAFF",
            status: "ACTIVE",
            primaryDepartmentId: departmentA.id,
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
        await prisma.employee.create({
          data: {
            facilityId: plantB.facility.id,
            firstName: "Disabled",
            lastName: "Plant",
            email: `disabled-${plantB.suffix}@example.com`,
            roleType: "MANAGER",
            status: "ACTIVE",
            primaryDepartmentId: departmentB.id,
          },
        });
        await prisma.employee.create({
          data: {
            facilityId: evs.facility.id,
            firstName: "Evan",
            lastName: "Services",
            email: `evs-${evs.suffix}@example.com`,
            roleType: "STAFF",
            status: "ACTIVE",
            primaryDepartmentId: (
              await prisma.department.findFirstOrThrow({
                where: { facilityId: evs.facility.id, key: "EVS" },
              })
            ).id,
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

        const stableKey = `phase6d_adoption_${recordHost.suffix}`;
        const published = await prisma.catalogLogDefinition.create({
          data: {
            stableKey,
            version: 1,
            status: "PUBLISHED",
            name: "Phase 6D Adoption Log",
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
            name: "Phase 6D Adoption Log",
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
        for (const status of ["ACTIVE", "ACTIVE", "INACTIVE"] as const) {
          await prisma.logAttachment.create({
            data: {
              stableKey: `phase6d_${status.toLowerCase()}_${cuidLike()}`,
              facilityId: recordHost.facility.id,
              departmentId: recordDepartment.id,
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

        const lineageKey = `phase6d_round_${workHost.suffix}`;
        for (const version of [
          { version: 1, status: "DRAFT" as const, name: "Night Mechanical Draft" },
          { version: 2, status: "PUBLISHED" as const, name: "Night Mechanical Published" },
          { version: 3, status: "DRAFT" as const, name: "Night Mechanical Successor" },
        ]) {
          await prisma.departmentWorkPlan.create({
            data: {
              facilityId: workHost.facility.id,
              departmentId: workDepartment.id,
              stableKey: lineageKey,
              presetKey: "MECHANICAL_ROOM_ROUND",
              version: version.version,
              name: version.name,
              status: version.status,
            },
          });
        }
        await prisma.departmentWorkPlan.create({
          data: {
            facilityId: workOther.facility.id,
            departmentId: workOtherDepartment.id,
            stableKey: "MECHANICAL_ROOM_ROUND",
            presetKey: "MECHANICAL_ROOM_ROUND",
            version: 1,
            name: "Other Facility Round",
            status: "PUBLISHED",
          },
        });
        await prisma.departmentWorkPlan.create({
          data: {
            facilityId: decoy.facility.id,
            departmentId: (
              await prisma.department.findFirstOrThrow({ where: { facilityId: decoy.facility.id } })
            ).id,
            stableKey: `customer_walk_${decoy.suffix}`,
            version: 1,
            name: "Customer Walk",
            status: "PUBLISHED",
          },
        });

        const items = await listConsoleCatalogItems(prisma);
        const plant = items.find((row) => row.stableKey === "PLANT");
        const food = items.find((row) => row.stableKey === "HEALTHCARE_FOOD_NUTRITION");
        const evsItem = items.find((row) => row.stableKey === "EVS");
        const round = items.find((row) => row.stableKey === "MECHANICAL_ROOM_ROUND");
        const record = items.find((row) => row.stableKey === stableKey);
        assert.ok(plant && food && evsItem && round && record);

        const plantDetail = await loadConsoleDepartmentProductDetail(prisma, "PLANT");
        const foodDetail = await loadConsoleDepartmentProductDetail(prisma, "HEALTHCARE_FOOD_NUTRITION");
        const evsDetail = await loadConsoleDepartmentProductDetail(prisma, "EVS");
        const workDetail = await loadConsoleWorkPresetDetail(prisma, "MECHANICAL_ROOM_ROUND");
        const recordDetail = await loadHarborCatalogDetail(prisma, stableKey);
        const recordAdoption = await loadHarborCatalogAdoption(prisma, stableKey);
        assert.ok(plantDetail && foodDetail && evsDetail && workDetail && recordDetail);

        assert.equal(plantDetail.facilityInstallCount, plant.facilityInstallCount);
        assert.equal(plantDetail.usersWithAccess, plant.usageCount);
        assert.equal(plantDetail.facilityInstallCount, beforePlant.facilityInstallCount + 4);
        assert.equal(plantDetail.usersWithAccess, (beforePlant.usageCount ?? 0) + 6);
        assert.equal(plantDetail.versionLabel, "1.0");
        assert.equal(plantDetail.status, "AVAILABLE");
        assert.equal(plantDetail.releasedLabel, "October 7, 2026");
        assert.equal(plantDetail.installationKey, "PLANT");
        assert.deepEqual(plantDetail.capabilities, [...(getDepartmentProduct("PLANT")?.customerCapabilities ?? [])]);
        assert.equal(
          plantDetail.roleCounts.generalManagers - beforePlantDetail.roleCounts.generalManagers,
          1,
        );
        assert.equal(plantDetail.roleCounts.managers - beforePlantDetail.roleCounts.managers, 1);
        assert.equal(plantDetail.roleCounts.supervisors - beforePlantDetail.roleCounts.supervisors, 1);
        assert.equal(plantDetail.roleCounts.staff - beforePlantDetail.roleCounts.staff, 2);
        assert.equal(
          plantDetail.roleCounts.facilityAdministrators - beforePlantDetail.roleCounts.facilityAdministrators,
          1,
        );
        assert.equal(
          productAccessRoleTotal(plantDetail.roleCounts) - productAccessRoleTotal(beforePlantDetail.roleCounts),
          6,
        );

        const rowA = plantDetail.facilities.find((row) => row.facilityId === plantA.facility.id);
        const rowB = plantDetail.facilities.find((row) => row.facilityId === plantB.facility.id);
        assert.ok(rowA && rowB);
        assert.equal(rowA.userCount, 6);
        assert.equal(rowA.accessLabel, "Active");
        assert.equal(rowA.departmentStatusLabel, "Enabled");
        assert.equal(rowA.organizationName, plantA.org.name);
        assert.equal(rowB.userCount, 0);
        assert.equal(rowB.departmentStatusLabel, "Disabled");
        assert.equal(rowB.accessLabel, "Not entitled");
        assert.equal(
          plantDetail.facilities.some((row) => row.facilityId === decoy.facility.id),
          false,
        );
        assert.equal(plantDetail.facilities.some((row) => row.departmentName === "Plant Operations" && row.departmentKey.startsWith("OTHER_")), false);

        assert.equal(foodDetail.facilityInstallCount, food.facilityInstallCount);
        assert.equal(foodDetail.facilityInstallCount, beforeFood.facilityInstallCount + 3);
        assert.equal(foodDetail.versionLabel, CONSOLE_CATALOG_EMPTY);
        assert.equal(foodDetail.releasedLabel, CONSOLE_CATALOG_EMPTY);
        assert.equal(
          foodDetail.facilities.filter((row) => row.facilityId === dietary.facility.id && row.departmentKey === "DIETARY").length,
          1,
        );
        assert.equal(
          foodDetail.facilities.filter(
            (row) => row.facilityId === foodCanonical.facility.id && row.departmentKey === "HEALTHCARE_FOOD_NUTRITION",
          ).length,
          1,
        );
        assert.equal(items.filter((row) => row.stableKey === "DIETARY").length, 0);
        assert.equal(dietaryDepartment.key, "DIETARY");

        assert.equal(evsDetail.usersWithAccess, evsItem.usageCount);
        assert.equal(evsDetail.facilityInstallCount, beforeEvs.facilityInstallCount + 1);
        assert.equal(evsDetail.usersWithAccess, beforeEvs.usageCount);
        assert.equal(evsDetail.status, "DEVELOPMENT");
        assert.equal(evsDetail.versionLabel, CONSOLE_CATALOG_EMPTY);
        assert.equal(evsDetail.releasedLabel, CONSOLE_CATALOG_EMPTY);
        const evsRow = evsDetail.facilities.find((row) => row.facilityId === evs.facility.id);
        assert.ok(evsRow);
        assert.equal(evsRow.userCount, 0);
        assert.equal(evsRow.accessLabel, "Development/internal");

        assert.equal(workDetail.facilityInstallCount, round.facilityInstallCount);
        assert.equal(workDetail.publishedPlanCount, round.usageCount);
        assert.equal(workDetail.facilityInstallCount, beforeRound.facilityInstallCount + 2);
        assert.equal(workDetail.publishedPlanCount, (beforeRound.usageCount ?? 0) + 2);
        assert.equal(workDetail.versionLabel, CONSOLE_CATALOG_EMPTY);
        assert.equal(workDetail.statusLabel, CONSOLE_CATALOG_EMPTY);
        assert.equal(workDetail.owningProductName, "Facility Plant Operations");
        const hostPlans = workDetail.plans.filter((row) => row.facilityId === workHost.facility.id);
        assert.deepEqual(
          hostPlans.map((row) => `${row.version}:${row.status}:${row.planName}`),
          [
            "1:DRAFT:Night Mechanical Draft",
            "2:PUBLISHED:Night Mechanical Published",
            "3:DRAFT:Night Mechanical Successor",
          ],
        );
        assert.equal(workDetail.plans.some((row) => row.planName === "Customer Walk"), false);

        assert.equal(record.versionDisplay, "v1");
        assert.equal(record.statusLabel, "Published · Draft");
        assert.equal(record.facilityInstallCount, 1);
        assert.equal(record.usageCount, 2);
        assert.equal(recordAdoption.facilityInstallCount, record.facilityInstallCount);
        assert.equal(recordAdoption.activePlacementCount, record.usageCount);
        assert.equal(recordDetail.published?.version, 1);
        assert.equal(recordDetail.draft?.version, 2);

        assert.equal(await loadConsoleDepartmentProductDetail(prisma, "NOT_REAL"), null);
        assert.equal(await loadConsoleWorkPresetDetail(prisma, "NOT_REAL"), null);
      } finally {
        await prisma.$disconnect();
      }
    }),
);
