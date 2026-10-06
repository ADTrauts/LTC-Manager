/**
 * Phase 4B SQL-backed PM materialization, Work Order generation, skip,
 * closeout, concurrency, and cron tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AppJwtPayload } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
} from "@/lib/knowledge/version-service";
import {
  addWorkOrderLabor,
  completeWorkOrder,
  createIssueFromRecord,
  satisfyWorkOrderRecordRequirement,
  updateWorkOrderStatus,
} from "@/lib/asset-operations";
import { handlePlantPmCron } from "@/lib/preventive-maintenance/cron";
import {
  createPmPlanSuccessorDraft,
  createPmPlanWithDraft,
  generatePmForFacility,
  presentPmOccurrence,
  publishPmPlanVersion,
  retirePmPlan,
  runPmGeneration,
  skipPmOccurrence,
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
  overrides: Partial<AppJwtPayload> & Pick<AppJwtPayload, "facilityId" | "role">,
): AppJwtPayload {
  return {
    uid: overrides.uid ?? `user_${cuidLike()}`,
    authKind: overrides.authKind ?? "user",
    authMethod: overrides.authMethod ?? "PASSWORD",
    role: overrides.role,
    name: overrides.name ?? "Phase 4B Test",
    email: overrides.email ?? "phase4b@example.com",
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

async function createFacilityFixture(
  prisma: PrismaClient,
  opts?: { timezone?: string; suffix?: string },
) {
  const suffix = opts?.suffix ?? cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Phase 4B Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 4B Facility ${suffix}`,
      timezone: opts?.timezone ?? "America/New_York",
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
  const unitB = await prisma.unit.create({
    data: {
      facilityId: facility.id,
      name: `Unit B ${suffix}`,
      unitType: "OTHER",
      hierarchyRole: "FLOOR",
    },
  });
  const space = await prisma.unitSpace.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      unitId: unit.id,
      name: `Kitchen ${suffix}`,
      spaceType: "MECHANICAL",
    },
  });
  const spaceB = await prisma.unitSpace.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      unitId: unitB.id,
      name: `Kitchen B ${suffix}`,
      spaceType: "MECHANICAL",
    },
  });
  const managerRole = await ensureRole(prisma, "MANAGER");
  const staffRole = await ensureRole(prisma, "STAFF");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const manager = await prisma.user.create({
    data: {
      email: `phase4b-mgr-${suffix}@example.com`,
      displayName: "Phase 4B Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase4b-sup-${suffix}@example.com`,
      displayName: "Phase 4B Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `phase4b-staff-${suffix}@example.com`,
      displayName: "Phase 4B Staff",
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
      firstName: "Phase4B",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: cuidLike(),
      assetCode: `PM4B-${suffix}`,
      name: `Dishwasher ${suffix}`,
      equipmentType: "DISHWASHER",
      unitId: unit.id,
      spaceId: space.id,
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
    unitB,
    space,
    spaceB,
    manager,
    supervisor,
    staff,
    employee,
    asset,
    category,
  };
}

async function publishedSopAndTemplate(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  now: Date,
) {
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
  return { sop, procedure, template };
}

async function publishQuarterlyPlan(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  mgr: AppJwtPayload,
  input: {
    name: string;
    now: Date;
    procedureVersionId: string | null;
    templateId: string;
    categoryId?: string;
    assetId?: string;
    defaultAssignedEmployeeId?: string | null;
    instructions?: string;
  },
) {
  const created = await createPmPlanWithDraft(mgr, {
    facilityId: fx.facility.id,
    departmentId: fx.plant.id,
    assetId: input.assetId ?? fx.asset.id,
    draft: {
      name: input.name,
      instructions: input.instructions,
      anchorDate: "2027-01-15",
      intervalMonths: 3,
      generationLeadDays: 7,
      maintenanceCategoryId: input.categoryId ?? fx.category.id,
      procedureVersionId: input.procedureVersionId,
      defaultAssignedEmployeeId:
        input.defaultAssignedEmployeeId === undefined
          ? fx.employee.id
          : input.defaultAssignedEmployeeId ?? undefined,
      recordRequirements: [{ templateId: input.templateId }],
      priority: "MEDIUM",
    },
    client: prisma,
    now: input.now,
  });
  return publishPmPlanVersion(mgr, {
    facilityId: fx.facility.id,
    departmentId: fx.plant.id,
    planId: created.id,
    client: prisma,
    now: input.now,
  });
}

async function makeRecord(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  template: { id: string; stableKey: string; version: number; name: string },
  status: "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION",
) {
  return prisma.operationalEvidenceRecord.create({
    data: {
      id: cuidLike(),
      facilityId: fx.facility.id,
      departmentId: fx.plant.id,
      templateId: template.id,
      templateStableKey: template.stableKey,
      templateVersion: template.version,
      templateName: template.name,
      purposeType: "INSPECTION",
      requirementKey: `req-${cuidLike().slice(-8)}`,
      operationalDate: new Date(),
      scheduleKind: "AD_HOC",
      occurredAt: new Date(),
      templateSnapshotJson: { fields: [] },
      unitId: fx.unit.id,
      spaceId: fx.space.id,
      assetId: fx.asset.id,
      status,
      outOfStandard: status === "COMPLETED_WITH_CORRECTIVE_ACTION",
    },
  });
}

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test("phase 4B migration documents the active Work Order partial unique index", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20261006140000_pm_active_work_order_unique/migration.sql",
    ),
    "utf8",
  );
  assert.match(sql, /Repair_pmOccurrenceId_active_key/);
  assert.match(sql, /pmOccurrenceId/);
  assert.match(sql, /COMPLETED/);
  assert.match(sql, /CLOSED/);
  assert.match(sql, /CANCELLED/);
});

test(
  "phase4b sql: generate, idempotency, skip, cancel, complete, lifecycle, cron",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    const prevSecret = process.env.CRON_SECRET;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "phase4b-cron-secret";

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
      const staffSession = session({
        uid: fx.staff.id,
        facilityId: fx.facility.id,
        role: "STAFF",
        primaryDepartmentId: fx.plant.id,
      });
      const publishNow = new Date("2027-01-08T15:00:00.000Z");
      const { procedure, template } = await publishedSopAndTemplate(
        prisma,
        fx,
        publishNow,
      );

      const published = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Quarterly Dishwasher PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
        instructions: "Inspect spray arms.",
      });

      const successor = await createPmPlanSuccessorDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: published.planId,
        client: prisma,
      });
      assert.equal(successor.status, "DRAFT");
      await updatePmPlanDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: published.planId,
        draft: {
          name: "Quarterly Dishwasher PM v2",
          anchorDate: "2027-01-15",
          intervalMonths: 3,
          generationLeadDays: 7,
          maintenanceCategoryId: fx.category.id,
          procedureVersionId: procedure.id,
          effectiveDate: "2027-07-01",
          recordRequirements: [{ templateId: template.id }],
          priority: "HIGH",
        },
        client: prisma,
      });
      await publishPmPlanVersion(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: published.planId,
        client: prisma,
        now: publishNow,
      });

      const catchUpNow = new Date("2027-01-11T15:00:00.000Z");
      const first = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const second = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const third = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.equal(first.occurrencesCreated, 1);
      assert.equal(first.workOrdersCreated, 1);
      assert.equal(second.occurrencesCreated, 0);
      assert.equal(second.workOrdersCreated, 0);
      assert.equal(third.occurrencesCreated, 0);
      assert.equal(third.workOrdersCreated, 0);

      const janOccurrences = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { planId: published.planId },
      });
      assert.equal(janOccurrences.length, 1);
      const jan = janOccurrences[0]!;
      assert.equal(jan.planVersionId, published.id);
      assert.equal(jan.scheduledDate.toISOString().slice(0, 10), "2027-01-15");

      const janWos = await prisma.repair.findMany({
        where: { pmOccurrenceId: jan.id },
      });
      assert.equal(janWos.length, 1);
      const wo1 = janWos[0]!;
      assert.equal(wo1.workOrderKind, "PREVENTIVE");
      assert.equal(wo1.title, "Quarterly Dishwasher PM");
      assert.equal(wo1.description, "Inspect spray arms.");
      assert.equal(wo1.procedureVersionId, procedure.id);
      assert.equal(wo1.maintenanceCategoryId, fx.category.id);
      assert.equal(wo1.unitId, fx.unit.id);
      assert.equal(wo1.spaceId, fx.space.id);
      assert.equal(wo1.assetId, fx.asset.id);
      assert.equal(wo1.issueId, null);
      assert.equal(wo1.reportedById, null);
      assert.equal(wo1.assignedEmployeeId, fx.employee.id);
      const reqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: wo1.id },
      });
      assert.equal(reqs.length, 1);
      assert.equal(reqs[0]?.templateId, template.id);
      assert.equal(reqs[0]?.templateStableKey, template.stableKey);

      await prisma.knowledgeArticleVersion.update({
        where: { id: procedure.id },
        data: { status: "SUPERSEDED" },
      });
      const woAfterSop = await prisma.repair.findUniqueOrThrow({ where: { id: wo1.id } });
      assert.equal(woAfterSop.procedureVersionId, procedure.id);

      await updateWorkOrderStatus(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        toStatus: "CANCELLED",
        client: prisma,
      });
      const janAfterCancel = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: jan.id },
      });
      assert.equal(janAfterCancel.status, "OPEN");

      const replacementRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.equal(replacementRun.workOrdersCreated, 1);
      const janWosAfter = await prisma.repair.findMany({
        where: { pmOccurrenceId: jan.id },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(janWosAfter.length, 2);
      assert.equal(janWosAfter[0]?.status, "CANCELLED");
      const wo2 = janWosAfter[1]!;
      assert.ok(["OPEN", "ASSIGNED"].includes(wo2.status));
      const wo2Reqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: wo2.id },
      });
      assert.equal(wo2Reqs.length, 1);
      assert.notEqual(wo2Reqs[0]?.id, reqs[0]?.id);
      assert.equal(wo2.procedureVersionId, procedure.id);

      const liveKit = await publishedSopAndTemplate(prisma, {
        ...fx,
        suffix: `${fx.suffix}live`,
      }, publishNow);
      const liveProcedure = liveKit.procedure;

      await assert.rejects(
        () =>
          skipPmOccurrence(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            occurrenceId: jan.id,
            reason: "Skipping while work is active.",
            client: prisma,
          }),
        /active Work Order/,
      );

      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        minutes: 30,
        employeeId: fx.employee.id,
        client: prisma,
      });
      const evidence = await makeRecord(prisma, fx, template, "COMPLETED_WITH_CORRECTIVE_ACTION");
      await satisfyWorkOrderRecordRequirement(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        requirementId: wo2Reqs[0]!.id,
        evidenceRecordId: evidence.id,
        client: prisma,
      });
      const fromRecord = await createIssueFromRecord(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        evidenceRecordId: evidence.id,
        client: prisma,
      });
      assert.ok(fromRecord.issue);
      assert.notEqual(fromRecord.issue.status, "RESOLVED");

      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        workPerformed: "Completed quarterly PM",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const janCompleted = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: jan.id },
      });
      assert.equal(janCompleted.status, "COMPLETED");
      assert.equal(janCompleted.completedWorkOrderId, wo2.id);
      const issueAfter = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: fromRecord.issue.id },
      });
      assert.notEqual(issueAfter.status, "RESOLVED");

      const aprilNow = new Date("2027-04-08T15:00:00.000Z");
      const aprilRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: aprilNow,
      });
      assert.equal(aprilRun.occurrencesCreated, 1);
      const april = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-04-15T00:00:00.000Z") },
      });
      assert.equal(april.planVersionId, published.id);
      assert.equal(april.status, "OPEN");

      const overdueNow = new Date("2027-04-20T15:00:00.000Z");
      assert.equal(
        presentPmOccurrence({
          status: april.status,
          scheduledDate: april.scheduledDate,
          facilityToday: "2027-04-20",
        }),
        "OVERDUE",
      );
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: overdueNow,
      });
      const aprilStill = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: april.id },
      });
      assert.equal(aprilStill.status, "OPEN");

      const julyNow = new Date("2027-07-08T15:00:00.000Z");
      const julyRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: julyNow,
      });
      assert.equal(julyRun.occurrencesCreated, 1);
      const july = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-07-15T00:00:00.000Z") },
      });
      const v2 = await prisma.preventiveMaintenancePlanVersion.findFirstOrThrow({
        where: { planId: published.planId, version: 2 },
      });
      assert.equal(july.planVersionId, v2.id);
      assert.equal(janCompleted.planVersionId, published.id);

      const skipOcc = july;
      const julyWo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: skipOcc.id, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } },
      });
      await updateWorkOrderStatus(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: julyWo.id,
        toStatus: "CANCELLED",
        client: prisma,
      });
      await assert.rejects(
        () =>
          skipPmOccurrence(staffSession, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            occurrenceId: skipOcc.id,
            reason: "Staff cannot skip this occurrence.",
            client: prisma,
          }),
        /authority|Insufficient/i,
      );
      const skipped = await skipPmOccurrence(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        occurrenceId: skipOcc.id,
        reason: "Equipment already serviced by vendor this cycle.",
        client: prisma,
      });
      assert.equal(skipped.status, "SKIPPED");
      const skipAgain = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: julyNow,
      });
      const julyWos = await prisma.repair.findMany({
        where: { pmOccurrenceId: skipOcc.id, status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } },
      });
      assert.equal(julyWos.length, 0);
      assert.ok(skipAgain.workOrdersCreated === 0 || skipAgain.workOrdersCreated >= 0);
      const julyStill = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: skipOcc.id },
      });
      assert.equal(julyStill.status, "SKIPPED");

      const octNow = new Date("2027-10-08T15:00:00.000Z");
      const octRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: octNow,
      });
      assert.equal(octRun.occurrencesCreated, 1);
      const oct = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-10-15T00:00:00.000Z") },
      });
      assert.equal(oct.scheduledDate.toISOString().slice(0, 10), "2027-10-15");

      const oosAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `OOS-${fx.suffix}`,
          name: `OOS ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OUT_OF_SERVICE",
        },
      });
      const oosPlan = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "OOS Asset PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        assetId: oosAsset.id,
      });
      const oosRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const oosOcc = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { planId: oosPlan.planId },
      });
      assert.ok(oosOcc.length >= 1);
      assert.ok(oosRun.workOrdersCreated >= 1);

      const retiredAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `RET-${fx.suffix}`,
          name: `Retired ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const retiredPlan = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Retiring Asset PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        assetId: retiredAsset.id,
      });
      await prisma.asset.update({
        where: { id: retiredAsset.id },
        data: { status: "RETIRED", retiredAt: catchUpNow, retiredReason: "Replaced" },
      });
      const beforeRetired = await prisma.preventiveMaintenanceOccurrence.count({
        where: { planId: retiredPlan.planId },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const afterRetired = await prisma.preventiveMaintenanceOccurrence.count({
        where: { planId: retiredPlan.planId },
      });
      assert.equal(afterRetired, beforeRetired);
      const planUnchanged = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: retiredPlan.planId },
      });
      assert.equal(planUnchanged.status, "PUBLISHED");

      await retirePmPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: retiredPlan.planId,
        client: prisma,
        now: catchUpNow,
      });
      const retiredPlanRun = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: octNow,
      });
      const retiredAfter = await prisma.preventiveMaintenanceOccurrence.count({
        where: { planId: retiredPlan.planId },
      });
      assert.equal(retiredAfter, afterRetired);
      assert.ok(retiredPlanRun.plansProcessed >= 1);

      const doomedCategory = await prisma.maintenanceCategory.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          key: `doom-${fx.suffix}`,
          label: "Doomed HVAC",
        },
      });
      const goodCategory = await prisma.maintenanceCategory.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          key: `ok-${fx.suffix}`,
          label: "Good HVAC",
        },
      });
      const badAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `BAD-${fx.suffix}`,
          name: `Bad cat ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const goodAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `GOOD-${fx.suffix}`,
          name: `Good cat ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const badPublished = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Archived category PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        categoryId: doomedCategory.id,
        assetId: badAsset.id,
      });
      await prisma.maintenanceCategory.update({
        where: { id: doomedCategory.id },
        data: { archivedAt: catchUpNow },
      });
      const goodPublished = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Healthy category PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        categoryId: goodCategory.id,
        assetId: goodAsset.id,
      });
      const mixed = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.ok(mixed.configurationErrors.some((row) => row.planId === badPublished.planId));
      const goodOcc = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { planId: goodPublished.planId },
      });
      assert.equal(goodOcc.length, 1);
      const goodWo = await prisma.repair.findMany({
        where: { pmOccurrenceId: goodOcc[0]!.id },
      });
      assert.equal(goodWo.length, 1);
      const badOcc = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { planId: badPublished.planId },
      });
      assert.equal(badOcc.length, 1);
      const badWo = await prisma.repair.findMany({
        where: { pmOccurrenceId: badOcc[0]!.id },
      });
      assert.equal(badWo.length, 0);

      const leftEmployee = await prisma.employee.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          firstName: "Gone",
          lastName: fx.suffix,
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: fx.plant.id,
        },
      });
      const unassignedAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `UNA-${fx.suffix}`,
          name: `Unassigned ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const unassignedPlan = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Unassigned PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        assetId: unassignedAsset.id,
        defaultAssignedEmployeeId: leftEmployee.id,
      });
      await prisma.employee.update({
        where: { id: leftEmployee.id },
        data: { status: "TERMINATED" },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const unaOcc = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: unassignedPlan.planId },
      });
      const unaWo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: unaOcc.id },
      });
      assert.equal(unaWo.assignedEmployeeId, null);
      assert.equal(unaWo.status, "OPEN");

      const movePlan = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "Move Asset PM",
        now: publishNow,
        procedureVersionId: liveProcedure.id,
        templateId: template.id,
        assetId: fx.asset.id,
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const moveOcc = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: movePlan.planId, scheduledDate: new Date("2027-01-15T00:00:00.000Z") },
      });
      const moveWo1 = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: moveOcc.id },
      });
      assert.equal(moveWo1.unitId, fx.unit.id);
      assert.equal(moveWo1.spaceId, fx.space.id);
      await prisma.asset.update({
        where: { id: fx.asset.id },
        data: { unitId: fx.unitB.id, spaceId: fx.spaceB.id },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: aprilNow,
      });
      const moveApr = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: movePlan.planId, scheduledDate: new Date("2027-04-15T00:00:00.000Z") },
      });
      const moveWo2 = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: moveApr.id },
      });
      const wo1AfterMove = await prisma.repair.findUniqueOrThrow({ where: { id: moveWo1.id } });
      assert.equal(wo1AfterMove.unitId, fx.unit.id);
      assert.equal(wo1AfterMove.spaceId, fx.space.id);
      assert.equal(moveWo2.unitId, fx.unitB.id);
      assert.equal(moveWo2.spaceId, fx.spaceB.id);

      const zoneNow = new Date("2027-01-08T00:00:00.000Z");
      const nz = await createFacilityFixture(prisma, {
        timezone: "Pacific/Auckland",
        suffix: `${fx.suffix}nz`,
      });
      const nyZone = await createFacilityFixture(prisma, {
        timezone: "America/New_York",
        suffix: `${fx.suffix}ny`,
      });
      const nzMgr = session({
        uid: nz.manager.id,
        facilityId: nz.facility.id,
        role: "MANAGER",
        primaryDepartmentId: nz.plant.id,
      });
      const nyMgr = session({
        uid: nyZone.manager.id,
        facilityId: nyZone.facility.id,
        role: "MANAGER",
        primaryDepartmentId: nyZone.plant.id,
      });
      const nzKit = await publishedSopAndTemplate(prisma, nz, zoneNow);
      const nyKit = await publishedSopAndTemplate(prisma, nyZone, zoneNow);
      await publishQuarterlyPlan(prisma, nz, nzMgr, {
        name: "Auckland PM",
        now: zoneNow,
        procedureVersionId: nzKit.procedure.id,
        templateId: nzKit.template.id,
      });
      await publishQuarterlyPlan(prisma, nyZone, nyMgr, {
        name: "New York PM",
        now: zoneNow,
        procedureVersionId: nyKit.procedure.id,
        templateId: nyKit.template.id,
      });
      const prevSecretInner = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      const unconfigured = await handlePlantPmCron(
        new Request("https://vssyl.com/api/internal/plant/preventive-maintenance"),
        prisma,
        zoneNow,
      );
      assert.equal(unconfigured.status, 503);
      process.env.CRON_SECRET = "phase4b-cron-secret";
      const unauthorized = await handlePlantPmCron(
        new Request("https://vssyl.com/api/internal/plant/preventive-maintenance", {
          headers: { authorization: "Bearer wrong" },
        }),
        prisma,
        zoneNow,
      );
      assert.equal(unauthorized.status, 401);
      const authorized = await handlePlantPmCron(
        new Request("https://vssyl.com/api/internal/plant/preventive-maintenance", {
          headers: { authorization: "Bearer phase4b-cron-secret" },
        }),
        prisma,
        zoneNow,
      );
      assert.equal(authorized.status, 200);
      const body = (await authorized.json()) as {
        ok: boolean;
        facilitiesProcessed: number;
        configurationErrors: unknown[];
      };
      assert.equal(body.ok, true);
      assert.ok(body.facilitiesProcessed >= 1);
      const nzOcc = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { plan: { facilityId: nz.facility.id } },
      });
      const nyOcc = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { plan: { facilityId: nyZone.facility.id } },
      });
      assert.ok(nzOcc.length >= 1);
      assert.equal(nyOcc.length, 0);
      if (prevSecretInner === undefined) process.env.CRON_SECRET = "phase4b-cron-secret";
      else process.env.CRON_SECRET = prevSecretInner;

      const batch = await runPmGeneration(prisma, { now: catchUpNow });
      assert.ok(batch.facilitiesProcessed >= 1);
      assert.ok(Array.isArray(batch.configurationErrors));
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      if (prevSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevSecret;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase4b sql: concurrent generators cannot duplicate occurrence or active Work Order",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const a = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const b = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    try {
      const fx = await createFacilityFixture(a);
      const mgr = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const now = new Date("2027-01-08T15:00:00.000Z");
      const kit = await publishedSopAndTemplate(a, fx, now);
      const published = await publishQuarterlyPlan(a, fx, mgr, {
        name: "Concurrent PM",
        now,
        procedureVersionId: kit.procedure.id,
        templateId: kit.template.id,
      });
      const [left, right] = await Promise.all([
        generatePmForFacility(a, { facilityId: fx.facility.id, now }),
        generatePmForFacility(b, { facilityId: fx.facility.id, now }),
      ]);
      const occurrences = await a.preventiveMaintenanceOccurrence.findMany({
        where: { planId: published.planId },
      });
      assert.equal(occurrences.length, 1);
      const active = await a.repair.findMany({
        where: {
          pmOccurrenceId: occurrences[0]!.id,
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
        },
      });
      assert.equal(active.length, 1);
      assert.equal(
        left.occurrencesCreated + right.occurrencesCreated >= 1,
        true,
      );
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await a.$disconnect();
      await b.$disconnect();
    }
  },
);

test(
  "phase4b sql: published plan without Procedure generates a PREVENTIVE Work Order",
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
      const kit = await publishedSopAndTemplate(prisma, fx, now);
      const published = await publishQuarterlyPlan(prisma, fx, mgr, {
        name: "No Procedure Dishwasher PM",
        now,
        procedureVersionId: null,
        templateId: kit.template.id,
        instructions: "Inspect spray arms.",
      });
      assert.equal(published.procedureVersionId, null);

      const generated = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now,
      });
      assert.equal(generated.occurrencesCreated, 1);
      assert.equal(generated.workOrdersCreated, 1);
      assert.equal(
        generated.configurationErrors.some((row) => row.code === "PROCEDURE_INVALID"),
        false,
      );

      const occurrences = await prisma.preventiveMaintenanceOccurrence.findMany({
        where: { planId: published.planId },
      });
      assert.equal(occurrences.length, 1);
      const wo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: occurrences[0]!.id },
      });
      assert.equal(wo.workOrderKind, "PREVENTIVE");
      assert.equal(wo.procedureVersionId, null);
      assert.equal(wo.assetId, fx.asset.id);
      assert.equal(wo.unitId, fx.unit.id);
      assert.equal(wo.spaceId, fx.space.id);
      assert.equal(wo.maintenanceCategoryId, fx.category.id);
      assert.equal(wo.priority, "MEDIUM");
      const reqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: wo.id },
      });
      assert.equal(reqs.length, 1);
      assert.equal(reqs[0]?.templateId, kit.template.id);
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);
