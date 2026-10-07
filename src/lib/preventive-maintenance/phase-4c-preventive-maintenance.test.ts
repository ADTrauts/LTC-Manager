/**
 * Phase 4C SQL-backed Preventive Maintenance Build tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
  publishKnowledgeArticle,
  saveKnowledgeArticleEditableContent,
} from "@/lib/knowledge/version-service";
import { assertPmPublishedVersionImmutable } from "./version-semantics";
import { generatePmForFacility } from "./generator";
import { isPmPlanGenerationEligible } from "./eligibility";
import {
  createPmPlanSuccessorDraft,
  createPmPlanWithDraft,
  publishPmPlanVersion,
  retirePmPlan,
  updatePmPlanDraft,
} from "./plan-service";

const databaseUrl =
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set ASSET_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

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
    name: overrides.name ?? "Phase 4C Test",
    email: overrides.email ?? "phase4c@example.com",
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
    data: { name: `Phase 4C Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 4C Facility ${suffix}`,
      timezone: "America/New_York",
    },
  });
  const plant = await prisma.department.create({
    data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
  });
  const unit = await prisma.unit.create({
    data: {
      facilityId: facility.id,
      name: `Unit ${suffix}`,
      unitType: "OTHER",
      hierarchyRole: "FLOOR",
    },
  });
  const managerRole = await ensureRole(prisma, "MANAGER");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const manager = await prisma.user.create({
    data: {
      email: `phase4c-mgr-${suffix}@example.com`,
      displayName: "Phase 4C Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase4c-sup-${suffix}@example.com`,
      displayName: "Phase 4C Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const employee = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Phase4C",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: cuidLike(),
      assetCode: `PM4C-${suffix}`,
      name: `Dishwasher ${suffix}`,
      equipmentType: "DISHWASHER",
      unitId: unit.id,
      departmentId: plant.id,
      status: "OPERATIONAL",
    },
  });
  const category = await prisma.maintenanceCategory.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      key: `hvac-${suffix}`,
      label: "HVAC",
    },
  });
  return { suffix, facility, plant, unit, manager, supervisor, employee, asset, category };
}

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test(
  "phase4c sql: publish, successor, pins, retire, occurrence freeze, asset pause",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";

    try {
      const fx = await createFacilityFixture(prisma);
      const mgr = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const now = new Date("2027-01-08T15:00:00.000Z");

      const sop = await createKnowledgeArticleWithInitialVersion(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        title: `Quarterly PM SOP ${fx.suffix}`,
        summary: "procedure",
        body: "Inspect and service.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
        createdByUserId: fx.manager.id,
      });
      const procedureV1 = await loadCurrentPublishedVersion(prisma, sop.id);
      assert.ok(procedureV1);

      const template = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.plant.id,
          name: `PM Inspection ${fx.suffix}`,
          purposeType: "INSPECTION",
          status: "PUBLISHED",
          version: 1,
          stableKey: `pm-insp-${fx.suffix}`,
          allowAdHoc: true,
          publishedAt: now,
        },
      });
      const templateV2 = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.plant.id,
          name: `PM Inspection ${fx.suffix}`,
          purposeType: "INSPECTION",
          status: "PUBLISHED",
          version: 2,
          stableKey: template.stableKey,
          allowAdHoc: true,
          publishedAt: now,
        },
      });

      const created = await createPmPlanWithDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        assetId: fx.asset.id,
        draft: {
          name: "Quarterly Dishwasher PM",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          generationLeadDays: 7,
          maintenanceCategoryId: null,
          procedureVersionId: procedureV1.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: template.id }],
          priority: "MEDIUM",
          effectiveDate: "2027-01-08",
        },
        client: prisma,
        now,
      });
      assert.equal(created.status, "DRAFT");
      assert.equal(created.versions[0]?.status, "DRAFT");

      await assert.rejects(
        () =>
          publishPmPlanVersion(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: created.id,
            client: prisma,
            now,
          }),
        /category/i,
      );

      await updatePmPlanDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        draft: {
          name: "Quarterly Dishwasher PM",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedureV1.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: template.id }],
          priority: "MEDIUM",
          effectiveDate: "2027-01-08",
        },
        client: prisma,
      });

      const published = await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now,
      });
      assert.equal(published.status, "PUBLISHED");
      assert.equal(published.version, 1);
      assert.equal(published.procedureVersionId, procedureV1.id);
      assert.equal(published.recordRequirements[0]?.templateId, template.id);
      assert.equal(published.recordRequirements[0]?.templateVersion, 1);

      const planAfterPublish = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.equal(planAfterPublish.status, "PUBLISHED");

      assert.throws(() => assertPmPublishedVersionImmutable(published.status));

      const generated = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now,
        timezone: fx.facility.timezone,
      });
      assert.equal(generated.occurrencesCreated >= 1, true);
      const occurrence = await prisma.preventiveMaintenanceOccurrence.findFirst({
        where: { planId: created.id },
      });
      assert.ok(occurrence);
      assert.equal(occurrence.planVersionId, published.id);

      await saveKnowledgeArticleEditableContent(prisma, {
        articleId: sop.id,
        title: `Quarterly PM SOP ${fx.suffix} v2`,
        body: "Inspect, service, and document.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "DRAFT",
        updatedByUserId: fx.manager.id,
      });
      await publishKnowledgeArticle(prisma, sop.id, fx.manager.id);
      const procedureV2 = await loadCurrentPublishedVersion(prisma, sop.id);
      assert.ok(procedureV2);
      assert.notEqual(procedureV2.id, procedureV1.id);

      const frozenAfterProc = await prisma.preventiveMaintenancePlanVersion.findUniqueOrThrow({
        where: { id: published.id },
      });
      assert.equal(frozenAfterProc.procedureVersionId, procedureV1.id);

      const successor = await createPmPlanSuccessorDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
      });
      assert.equal(successor.status, "DRAFT");
      assert.equal(successor.version, 2);
      assert.equal(successor.procedureVersionId, procedureV1.id);

      await updatePmPlanDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        draft: {
          name: "Annual Dishwasher PM",
          anchorDate: "2027-01-15",
          intervalMonths: 12,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedureV2.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: templateV2.id }],
          priority: "HIGH",
          effectiveDate: "2027-07-01",
        },
        client: prisma,
      });

      const v2 = await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now: new Date("2027-06-10T15:00:00.000Z"),
      });
      assert.equal(v2.status, "PUBLISHED");
      assert.equal(v2.version, 2);
      assert.equal(v2.procedureVersionId, procedureV2.id);
      assert.equal(v2.recordRequirements[0]?.templateId, templateV2.id);
      assert.equal(v2.recordRequirements[0]?.templateVersion, 2);

      const v1 = await prisma.preventiveMaintenancePlanVersion.findUniqueOrThrow({
        where: { id: published.id },
        include: { recordRequirements: true },
      });
      assert.equal(v1.status, "SUPERSEDED");
      assert.equal(v1.procedureVersionId, procedureV1.id);
      assert.equal(v1.recordRequirements[0]?.templateId, template.id);
      assert.equal(v1.intervalMonths, 3);

      const occurrenceAfter = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      assert.equal(occurrenceAfter.planVersionId, published.id);

      const workOrders = await prisma.repair.findMany({
        where: { pmOccurrenceId: occurrence.id },
      });
      for (const wo of workOrders) {
        assert.equal(wo.procedureVersionId, procedureV1.id);
      }

      await prisma.asset.update({
        where: { id: fx.asset.id },
        data: { status: "RETIRED" },
      });
      const retiredAssetPlan = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.equal(retiredAssetPlan.status, "PUBLISHED");
      assert.equal(
        isPmPlanGenerationEligible({ planStatus: retiredAssetPlan.status, assetStatus: "RETIRED" }),
        false,
      );
      const pausedGen = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: new Date("2027-10-01T15:00:00.000Z"),
        timezone: fx.facility.timezone,
      });
      assert.equal(pausedGen.skippedIneligible >= 1, true);

      await prisma.asset.update({
        where: { id: fx.asset.id },
        data: { status: "OPERATIONAL" },
      });
      assert.equal(
        isPmPlanGenerationEligible({ planStatus: "PUBLISHED", assetStatus: "OPERATIONAL" }),
        true,
      );

      const retired = await retirePmPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now,
      });
      assert.equal(retired.status, "RETIRED");
      const versions = await prisma.preventiveMaintenancePlanVersion.findMany({
        where: { planId: created.id },
      });
      assert.equal(versions.length >= 2, true);
      const occurrencePreserved = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: occurrence.id },
      });
      assert.equal(occurrencePreserved.id, occurrence.id);
      const afterRetire = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: new Date("2028-01-08T15:00:00.000Z"),
        timezone: fx.facility.timezone,
      });
      assert.equal(afterRetire.occurrencesCreated, 0);
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase4c sql: publishing without a Procedure is allowed",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    try {
      const fx = await createFacilityFixture(prisma);
      const mgr = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const now = new Date("2027-01-08T15:00:00.000Z");
      const created = await createPmPlanWithDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        assetId: fx.asset.id,
        draft: {
          name: "No Procedure Dishwasher PM",
          instructions: "Inspect spray arms.",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: null,
          recordRequirements: [],
          priority: "MEDIUM",
          effectiveDate: "2027-01-08",
        },
        client: prisma,
        now,
      });
      const published = await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now,
      });
      assert.equal(published.status, "PUBLISHED");
      assert.equal(published.procedureVersionId, null);
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);
