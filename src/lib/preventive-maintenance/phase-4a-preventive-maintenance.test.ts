/**
 * Phase 4A SQL-backed Preventive Maintenance domain tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload, FacilitySession } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
} from "@/lib/knowledge/version-service";
import {
  createPmPlanSuccessorDraft,
  createPmPlanWithDraft,
  governingPlanVersionId,
  parseCivilDate,
  publishPmPlanVersion,
  retirePmPlan,
  updatePmPlanDraft,
} from "./index";

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
  overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId" | "role">,
): FacilitySession {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: overrides.authKind ?? "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    scopeKind: "facility",
    role: overrides.role,
    name: overrides.name ?? "Phase 4A Test",
    email: overrides.email ?? "phase4a@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as FacilitySession;
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
    data: { name: `Phase 4A Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 4A Facility ${suffix}`,
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
  const staffRole = await ensureRole(prisma, "STAFF");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const manager = await prisma.user.create({
    data: {
      email: `phase4a-mgr-${suffix}@example.com`,
      displayName: "Phase 4A Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase4a-sup-${suffix}@example.com`,
      displayName: "Phase 4A Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `phase4a-staff-${suffix}@example.com`,
      displayName: "Phase 4A Staff",
      facilityId: facility.id,
      roleId: staffRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const employee = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Phase4A",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: cuidLike(),
      assetCode: `PM-${suffix}`,
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
  return {
    suffix,
    facility,
    plant,
    unit,
    manager,
    supervisor,
    staff,
    employee,
    asset,
    category,
  };
}

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test(
  "phase4a sql: plan versioning, occurrence freeze, uniqueness, legacy untouched",
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
      const supervisor = session({
        uid: fx.supervisor.id,
        facilityId: fx.facility.id,
        role: "SUPERVISOR",
        primaryDepartmentId: fx.plant.id,
      });
      const now = new Date("2027-06-10T15:00:00.000Z");

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
      const procedure = await loadCurrentPublishedVersion(prisma, sop.id);
      assert.ok(procedure);

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

      const legacySchedule = await prisma.preventiveMaintenanceSchedule.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          assetId: fx.asset.id,
          departmentId: fx.plant.id,
          name: "Legacy rolling PM",
          cadence: "QUARTERLY",
          intervalCount: 1,
          nextDueAt: new Date("2027-04-01T00:00:00.000Z"),
          isActive: true,
        },
      });

      const supervisorDraft = await createPmPlanWithDraft(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        assetId: fx.asset.id,
        draft: {
          name: "Supervisor draft",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          maintenanceCategoryId: fx.category.id,
        },
        client: prisma,
      });
      assert.equal(supervisorDraft.status, "DRAFT");
      await assert.rejects(
        () =>
          publishPmPlanVersion(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: supervisorDraft.id,
            client: prisma,
            now,
          }),
        /publish|authority/i,
      );

      const created = await createPmPlanWithDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        assetId: fx.asset.id,
        draft: {
          name: "Quarterly Dishwasher PM",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedure.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: template.id }],
          priority: "EMERGENCY",
        },
        client: prisma,
        now,
      });
      assert.equal(created.status, "DRAFT");
      const v1Draft = created.versions[0];
      assert.ok(v1Draft);
      assert.equal(v1Draft.status, "DRAFT");
      assert.equal(v1Draft.version, 1);

      await assert.rejects(
        () =>
          publishPmPlanVersion(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: created.id,
            client: prisma,
            now,
          }),
        /EMERGENCY/,
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
          procedureVersionId: procedure.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: template.id }],
          priority: "MEDIUM",
          effectiveDate: "2027-01-01",
        },
        client: prisma,
      });

      await assert.rejects(
        () =>
          publishPmPlanVersion(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: created.id,
            client: prisma,
            now,
          }),
        /effectiveDate cannot be before facility today/,
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
          procedureVersionId: procedure.id,
          defaultAssignedEmployeeId: fx.employee.id,
          recordRequirements: [{ templateId: template.id }],
          priority: "MEDIUM",
        },
        client: prisma,
      });

      const publishedV1 = await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now,
      });
      assert.equal(publishedV1.status, "PUBLISHED");
      assert.equal(parseCivilDate(publishedV1.effectiveDate!), "2027-06-10");
      assert.equal(publishedV1.recordRequirements.length, 1);
      assert.equal(publishedV1.recordRequirements[0]?.templateStableKey, template.stableKey);
      assert.equal(publishedV1.recordRequirements[0]?.templateVersion, 1);

      const planAfterPublish = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.equal(planAfterPublish.status, "PUBLISHED");

      await assert.rejects(
        () =>
          updatePmPlanDraft(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: created.id,
            draft: {
              name: "Mutate published",
              anchorDate: "2027-01-15",
              intervalMonths: 3,
              maintenanceCategoryId: fx.category.id,
            },
            client: prisma,
          }),
        /successor draft/,
      );

      const julyOccurrence = await prisma.preventiveMaintenanceOccurrence.create({
        data: {
          id: cuidLike(),
          planId: created.id,
          planVersionId: publishedV1.id,
          scheduledDate: new Date("2027-07-15T00:00:00.000Z"),
          status: "OPEN",
        },
      });
      assert.equal(julyOccurrence.planVersionId, publishedV1.id);

      const successor = await createPmPlanSuccessorDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
      });
      assert.equal(successor.version, 2);
      assert.equal(successor.status, "DRAFT");
      assert.equal(successor.createdFromVersionId, publishedV1.id);

      await updatePmPlanDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        draft: {
          name: "Semiannual Dishwasher PM",
          anchorDate: "2027-08-05",
          intervalMonths: 6,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedure.id,
          effectiveDate: "2027-06-10",
          recordRequirements: [{ templateId: template.id }],
          priority: "HIGH",
        },
        client: prisma,
      });

      await assert.rejects(
        () =>
          publishPmPlanVersion(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            planId: created.id,
            client: prisma,
            now: new Date("2027-06-10T16:00:00.000Z"),
          }),
        /after the previous version effectiveDate/,
      );

      await updatePmPlanDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        draft: {
          name: "Semiannual Dishwasher PM",
          anchorDate: "2027-08-05",
          intervalMonths: 6,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedure.id,
          effectiveDate: "2027-08-01",
          recordRequirements: [{ templateId: template.id }],
          priority: "HIGH",
        },
        client: prisma,
      });

      const later = new Date("2027-07-10T15:00:00.000Z");
      const publishedV2 = await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now: later,
      });
      assert.equal(publishedV2.status, "PUBLISHED");

      const v1After = await prisma.preventiveMaintenancePlanVersion.findUniqueOrThrow({
        where: { id: publishedV1.id },
      });
      assert.equal(v1After.status, "SUPERSEDED");
      assert.equal(v1After.intervalMonths, 3);
      assert.equal(v1After.name, "Quarterly Dishwasher PM");

      const frozen = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: julyOccurrence.id },
      });
      assert.equal(frozen.planVersionId, publishedV1.id);
      assert.equal(
        governingPlanVersionId({
          occurrence: frozen,
          versions: [v1After, publishedV2],
          scheduledDate: "2027-07-15",
        }),
        publishedV1.id,
      );

      await assert.rejects(
        () =>
          prisma.preventiveMaintenanceOccurrence.create({
            data: {
              id: cuidLike(),
              planId: created.id,
              planVersionId: publishedV2.id,
              scheduledDate: new Date("2027-07-15T00:00:00.000Z"),
              status: "OPEN",
            },
          }),
        (err: unknown) => {
          assert.equal((err as { code?: string }).code, "P2002");
          return true;
        },
      );

      const woA = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `PM4A-A-${fx.suffix}`,
          unitId: fx.unit.id,
          title: "July PM",
          description: "First WO",
          workOrderKind: "PREVENTIVE",
          pmOccurrenceId: frozen.id,
          status: "CANCELLED",
        },
      });
      const woB = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `PM4A-B-${fx.suffix}`,
          unitId: fx.unit.id,
          title: "July PM replacement",
          description: "Replacement after cancel",
          workOrderKind: "PREVENTIVE",
          pmOccurrenceId: frozen.id,
        },
      });
      assert.equal(woA.pmOccurrenceId, frozen.id);
      assert.equal(woB.pmOccurrenceId, frozen.id);

      await prisma.asset.update({
        where: { id: fx.asset.id },
        data: { status: "RETIRED", retiredAt: later, retiredReason: "Replaced" },
      });
      const planStillPublished = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: created.id },
      });
      assert.equal(planStillPublished.status, "PUBLISHED");

      const retired = await retirePmPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: created.id,
        client: prisma,
        now: later,
      });
      assert.equal(retired.status, "RETIRED");
      const versionsAfterRetire = await prisma.preventiveMaintenancePlanVersion.findMany({
        where: { planId: created.id },
        orderBy: { version: "asc" },
      });
      assert.equal(versionsAfterRetire.length, 2);
      assert.equal(versionsAfterRetire[0]?.status, "SUPERSEDED");
      assert.equal(versionsAfterRetire[1]?.status, "PUBLISHED");
      const occurrenceAfterRetire = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: frozen.id },
      });
      assert.equal(occurrenceAfterRetire.status, "OPEN");
      assert.equal(occurrenceAfterRetire.planVersionId, publishedV1.id);

      const leftoverLegacy = await prisma.preventiveMaintenanceSchedule.findUniqueOrThrow({
        where: { id: legacySchedule.id },
      });
      assert.equal(leftoverLegacy.nextDueAt.toISOString(), legacySchedule.nextDueAt.toISOString());
      assert.equal(leftoverLegacy.cadence, "QUARTERLY");
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);
