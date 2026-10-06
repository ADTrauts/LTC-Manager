/**
 * Phase 5B SQL-backed Plant starter configuration tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  installPlantStarterConfiguration,
  loadPlantStarterInstalledKeys,
} from "@/lib/department-products/plant-starter";
import {
  buildTemplatePresetDraft,
  publishTemplate,
  updateDraft,
} from "@/lib/operational-evidence";
import { createPmPlanWithDraft } from "@/lib/preventive-maintenance/plan-service";
import { applyPmCadencePresetDefaults } from "@/lib/preventive-maintenance/presentation";

const databaseUrl =
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set ASSET_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.PLANT_OPERATIONS_ENABLED = "true";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: overrides.authKind ?? "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    role: overrides.role,
    name: overrides.name ?? "Phase 5B Test",
    email: overrides.email ?? "phase5b@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function ensureRole(prisma: PrismaClient, key: "MANAGER" | "STAFF" | "SUPERVISOR") {
  return prisma.role.upsert({
    where: { key },
    update: {},
    create: { id: cuidLike(), key, name: key },
  });
}

async function createFacilityFixture(prisma: PrismaClient) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Phase 5B Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 5B Facility ${suffix}`,
      timezone: "America/New_York",
    },
  });
  const plant = await prisma.department.create({
    data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
  });
  const managerRole = await ensureRole(prisma, "MANAGER");
  const manager = await prisma.user.create({
    data: {
      email: `phase5b-mgr-${suffix}@example.com`,
      displayName: "Phase 5B Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  return { suffix, facility, plant, manager };
}

function actor(userId: string) {
  return { userId, label: "Phase 5B Manager" };
}

test("Facility Plant Operations remains DEVELOPMENT", () => {
  const plant = getDepartmentProduct("PLANT");
  assert.equal(plant?.status, "DEVELOPMENT");
  assert.equal(plant?.name, "Facility Plant Operations");
});

test(
  "selective starter install creates only selected Facility-owned drafts",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await createFacilityFixture(prisma);
      const sess = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const result = await installPlantStarterConfiguration(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        selectedIds: [
          "MECHANICAL_ROOM_ROUND",
          "BUILDING_WALKTHROUGH",
          "EQUIPMENT_CONDITION_INSPECTION",
          "MECHANICAL_ROOM_INSPECTION",
          "GENERATOR_INSPECTION",
        ],
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.equal(result.workAdded, 2);
      assert.equal(result.recordAdded, 3);
      assert.equal(result.alreadyExisted, 0);

      const work = await prisma.departmentWorkPlan.findMany({
        where: { facilityId: fx.facility.id, departmentId: fx.plant.id },
      });
      const records = await prisma.operationalTemplate.findMany({
        where: { facilityId: fx.facility.id, departmentId: fx.plant.id },
      });
      assert.equal(work.length, 2);
      assert.ok(work.every((row) => row.status === "DRAFT"));
      assert.deepEqual(
        work.map((row) => row.presetKey).sort(),
        ["BUILDING_WALKTHROUGH", "MECHANICAL_ROOM_ROUND"],
      );
      assert.equal(records.length, 3);
      assert.ok(records.every((row) => row.status === "DRAFT"));
      assert.equal(await prisma.asset.count({ where: { departmentId: fx.plant.id } }), 0);
      assert.equal(
        await prisma.preventiveMaintenancePlan.count({
          where: { facilityId: fx.facility.id, departmentId: fx.plant.id },
        }),
        0,
      );
      assert.equal(
        await prisma.knowledgeArticle.count({
          where: { facilityId: fx.facility.id, departmentId: fx.plant.id },
        }),
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "starter install is idempotent, supports partial second install, and does not overwrite",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await createFacilityFixture(prisma);
      const sess = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const first = await installPlantStarterConfiguration(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"],
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.equal(first.workAdded, 1);
      assert.equal(first.recordAdded, 1);

      const secondSame = await installPlantStarterConfiguration(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"],
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.equal(secondSame.workAdded, 0);
      assert.equal(secondSame.recordAdded, 0);
      assert.equal(secondSame.alreadyExisted, 2);

      const remaining = await installPlantStarterConfiguration(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        selectedIds: ["GENERATOR_VISUAL_CHECK", "GENERATOR_INSPECTION"],
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.equal(remaining.workAdded, 1);
      assert.equal(remaining.recordAdded, 1);
      assert.equal(remaining.alreadyExisted, 0);

      const installed = await loadPlantStarterInstalledKeys({
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        client: prisma,
      });
      assert.deepEqual(installed.workPresetKeys.sort(), [
        "GENERATOR_VISUAL_CHECK",
        "MECHANICAL_ROOM_ROUND",
      ]);
      assert.deepEqual(installed.recordPresetKeys.sort(), [
        "EQUIPMENT_CONDITION_INSPECTION",
        "GENERATOR_INSPECTION",
      ]);

      const record = await prisma.operationalTemplate.findFirst({
        where: {
          departmentId: fx.plant.id,
          presetKey: "EQUIPMENT_CONDITION_INSPECTION",
        },
      });
      assert.ok(record);
      const editedDraft = buildTemplatePresetDraft("EQUIPMENT_CONDITION_INSPECTION");
      editedDraft.name = "Facility-owned Equipment Condition";
      await updateDraft(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        templateId: record.id,
        draft: editedDraft,
        actor: actor(fx.manager.id),
        client: prisma,
      });
      await publishTemplate(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        templateId: record.id,
        actor: actor(fx.manager.id),
        client: prisma,
      });
      const successor = await updateDraft(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        templateId: record.id,
        draft: { ...editedDraft, name: "Facility successor Equipment Condition" },
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.notEqual(successor.id, record.id);
      assert.equal(successor.presetKey, "EQUIPMENT_CONDITION_INSPECTION");

      const afterEdit = await installPlantStarterConfiguration(sess, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        selectedIds: ["EQUIPMENT_CONDITION_INSPECTION"],
        actor: actor(fx.manager.id),
        client: prisma,
      });
      assert.equal(afterEdit.recordAdded, 0);
      assert.equal(afterEdit.alreadyExisted, 1);
      const rows = await prisma.operationalTemplate.findMany({
        where: {
          departmentId: fx.plant.id,
          OR: [
            { presetKey: "EQUIPMENT_CONDITION_INSPECTION" },
            { stableKey: "EQUIPMENT_CONDITION_INSPECTION" },
          ],
        },
        orderBy: { version: "asc" },
      });
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.name, "Facility-owned Equipment Condition");
      assert.equal(rows[1]?.name, "Facility successor Equipment Condition");
      assert.equal(rows[0]?.status, "PUBLISHED");
      assert.equal(rows[1]?.status, "DRAFT");
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "starter install is facility-scoped and PM presets require a real Asset",
  { skip: skipReason },
  async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const a = await createFacilityFixture(prisma);
      const b = await createFacilityFixture(prisma);
      const sessA = session({
        uid: a.manager.id,
        facilityId: a.facility.id,
        role: "MANAGER",
        primaryDepartmentId: a.plant.id,
      });
      await installPlantStarterConfiguration(sessA, {
        facilityId: a.facility.id,
        departmentId: a.plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"],
        actor: actor(a.manager.id),
        client: prisma,
      });
      const other = await loadPlantStarterInstalledKeys({
        facilityId: b.facility.id,
        departmentId: b.plant.id,
        client: prisma,
      });
      assert.deepEqual(other.workPresetKeys, []);
      assert.deepEqual(other.recordPresetKeys, []);

      const quarterly = applyPmCadencePresetDefaults("quarterly");
      assert.equal(quarterly.intervalMonths, 3);
      assert.equal(quarterly.generationLeadDays, 7);
      assert.equal(quarterly.priority, "ROUTINE");
      await assert.rejects(
        () =>
          createPmPlanWithDraft(sessA, {
            facilityId: a.facility.id,
            departmentId: a.plant.id,
            assetId: "not-a-real-asset",
            draft: {
              name: "Should not persist",
              intervalMonths: quarterly.intervalMonths,
              generationLeadDays: quarterly.generationLeadDays,
              priority: "MEDIUM",
              anchorDate: "2027-01-15",
            },
            client: prisma,
          }),
        /Asset not found/,
      );
      assert.equal(
        await prisma.preventiveMaintenancePlan.count({
          where: { facilityId: a.facility.id },
        }),
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
