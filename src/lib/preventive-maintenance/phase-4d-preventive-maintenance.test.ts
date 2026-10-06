/**
 * Phase 4D SQL-backed Preventive Maintenance Run tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  addWorkOrderLabor,
  completeWorkOrder,
  createIssueFromRecord,
  satisfyWorkOrderRecordRequirement,
  updateWorkOrderStatus,
} from "@/lib/asset-operations";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
} from "@/lib/knowledge/version-service";
import { facilityCivilToday } from "./civil-date";
import { generatePmForFacility } from "./generator";
import {
  createPmPlanSuccessorDraft,
  createPmPlanWithDraft,
  publishPmPlanVersion,
  updatePmPlanDraft,
} from "./plan-service";
import { loadPmRunBoard } from "./run-load";
import { skipPmOccurrence } from "./skip";
import { presentPmOccurrence } from "./version-semantics";

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
    name: overrides.name ?? "Phase 4D Test",
    email: overrides.email ?? "phase4d@example.com",
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

async function createFacilityFixture(prisma: PrismaClient, timezone = "America/New_York") {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Phase 4D Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `Phase 4D Facility ${suffix}`,
      timezone,
    },
  });
  const plant = await prisma.department.create({
    data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
  });
  const unit = await prisma.unit.create({
    data: {
      facilityId: facility.id,
      name: `Unit A ${suffix}`,
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
      name: `Space A ${suffix}`,
      spaceType: "MECHANICAL",
    },
  });
  const spaceB = await prisma.unitSpace.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      unitId: unitB.id,
      name: `Space B ${suffix}`,
      spaceType: "MECHANICAL",
    },
  });
  const managerRole = await ensureRole(prisma, "MANAGER");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const staffRole = await ensureRole(prisma, "STAFF");
  const manager = await prisma.user.create({
    data: {
      email: `phase4d-mgr-${suffix}@example.com`,
      displayName: "Phase 4D Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase4d-sup-${suffix}@example.com`,
      displayName: "Phase 4D Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `phase4d-staff-${suffix}@example.com`,
      displayName: "Phase 4D Staff",
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
      firstName: "Phase4D",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const otherEmployee = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Other",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const asset = await prisma.asset.create({
    data: {
      id: cuidLike(),
      assetCode: `PM4D-${suffix}`,
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
    otherEmployee,
    asset,
    category,
  };
}

async function publishedSopAndTemplate(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  now: Date,
  title = `Quarterly PM SOP ${fx.suffix}`,
) {
  const sop = await createKnowledgeArticleWithInitialVersion(prisma, {
    facilityId: fx.facility.id,
    departmentId: fx.plant.id,
    title,
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
      name: `PM Inspection ${fx.suffix}-${title.slice(-6)}`,
      purposeType: "INSPECTION",
      status: "PUBLISHED",
      version: 1,
      stableKey: `pm-insp-${cuidLike().slice(-8)}`,
      allowAdHoc: true,
      publishedAt: now,
    },
  });
  return { sop, procedure, template };
}

async function publishPlan(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  mgr: AppJwtPayload,
  input: {
    name: string;
    now: Date;
    procedureVersionId: string | null;
    templateId: string;
    assetId?: string;
    defaultAssignedEmployeeId?: string | null;
    categoryId?: string;
  },
) {
  const created = await createPmPlanWithDraft(mgr, {
    facilityId: fx.facility.id,
    departmentId: fx.plant.id,
    assetId: input.assetId ?? fx.asset.id,
    draft: {
      name: input.name,
      instructions: "Inspect spray arms.",
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
      status: "COMPLETED_WITH_CORRECTIVE_ACTION",
      outOfStandard: true,
    },
  });
}

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test(
  "phase4d sql: run board, skip, config, assignment isolation, scenarios 1-12",
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
      const staffSession = session({
        uid: fx.staff.id,
        facilityId: fx.facility.id,
        role: "STAFF",
        primaryDepartmentId: fx.plant.id,
      });
      const publishNow = new Date("2027-01-08T15:00:00.000Z");
      const { procedure, template } = await publishedSopAndTemplate(prisma, fx, publishNow);

      const published = await publishPlan(prisma, fx, mgr, {
        name: "Quarterly Dishwasher PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
      });
      const defaultAssignee = await prisma.preventiveMaintenancePlanVersion.findUniqueOrThrow({
        where: { id: published.id },
        select: { defaultAssignedEmployeeId: true },
      });

      // Scenario 2 + 3: missed lead date, later generator, then idempotent reruns.
      const catchUpNow = new Date("2027-01-11T15:00:00.000Z");
      const first = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const second = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.equal(first.occurrencesCreated, 1);
      assert.equal(first.workOrdersCreated, 1);
      assert.equal(second.occurrencesCreated, 0);
      assert.equal(second.workOrdersCreated, 0);

      const jan = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-01-15T00:00:00.000Z") },
      });
      const janWos = await prisma.repair.findMany({ where: { pmOccurrenceId: jan.id } });
      assert.equal(janWos.length, 1);
      const wo1 = janWos[0]!;
      assert.equal(wo1.workOrderKind, "PREVENTIVE");
      assert.equal(wo1.procedureVersionId, procedure.id);
      const reqs = await prisma.repairRecordRequirement.findMany({ where: { repairId: wo1.id } });
      assert.equal(reqs.length, 1);

      const dueSoonBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: catchUpNow,
        client: prisma,
      });
      assert.equal(dueSoonBoard.counts.dueSoon, 1);
      assert.equal(dueSoonBoard.grouped.dueSoon[0]?.planName, "Quarterly Dishwasher PM");
      assert.equal(dueSoonBoard.grouped.dueSoon[0]?.locationIsPreview, false);

      await prisma.repair.update({
        where: { id: wo1.id },
        data: { assignedEmployeeId: fx.otherEmployee.id },
      });
      const versionAfterAssign = await prisma.preventiveMaintenancePlanVersion.findUniqueOrThrow({
        where: { id: published.id },
        select: { defaultAssignedEmployeeId: true },
      });
      assert.equal(versionAfterAssign.defaultAssignedEmployeeId, defaultAssignee.defaultAssignedEmployeeId);
      assert.equal(versionAfterAssign.defaultAssignedEmployeeId, fx.employee.id);

      await updateWorkOrderStatus(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        toStatus: "CANCELLED",
        client: prisma,
      });
      const afterCancel = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: jan.id },
      });
      assert.equal(afterCancel.status, "OPEN");
      const replacement = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.equal(replacement.workOrdersCreated, 1);
      const janHistory = await prisma.repair.findMany({
        where: { pmOccurrenceId: jan.id },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(janHistory.length, 2);
      assert.equal(janHistory[0]?.status, "CANCELLED");
      const wo2 = janHistory[1]!;
      const cancelBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: catchUpNow,
        client: prisma,
      });
      const janRow = cancelBoard.grouped.dueSoon.find((item) => item.occurrenceId === jan.id);
      assert.equal(janRow?.workOrders.length, 2);
      assert.equal(
        janRow?.workOrders.filter((item) => item.status !== "CANCELLED").length,
        1,
      );

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

      const wo2Reqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: wo2.id },
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        minutes: 30,
        employeeId: fx.employee.id,
        client: prisma,
      });
      await assert.rejects(
        () =>
          completeWorkOrder(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: wo2.id,
            workPerformed: "Completed quarterly PM",
            assetConditionReview: "NO_CHANGE",
            client: prisma,
          }),
        /required|evidence|Record/i,
      );
      const evidence = await makeRecord(prisma, fx, template);
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
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        workPerformed: "Completed quarterly PM",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const janDone = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: jan.id },
      });
      assert.equal(janDone.status, "COMPLETED");
      const issueAfter = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: fromRecord.issue.id },
      });
      assert.notEqual(issueAfter.status, "RESOLVED");

      const v2Kit = await publishedSopAndTemplate(prisma, fx, publishNow, `SOP v2 ${fx.suffix}`);
      const successor = await createPmPlanSuccessorDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        planId: published.planId,
        client: prisma,
      });
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
          procedureVersionId: v2Kit.procedure.id,
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
      assert.equal(successor.status, "DRAFT");
      assert.equal(wo2.procedureVersionId, procedure.id);

      // Scenario 1 + 4 + 5: April stays April/overdue; July still generates.
      const aprilNow = new Date("2027-04-20T15:00:00.000Z");
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: aprilNow,
      });
      const april = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-04-15T00:00:00.000Z") },
      });
      assert.equal(april.status, "OPEN");
      assert.equal(
        presentPmOccurrence({
          status: april.status,
          scheduledDate: april.scheduledDate,
          facilityToday: "2027-04-20",
        }),
        "OVERDUE",
      );
      const overdueBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: aprilNow,
        client: prisma,
      });
      assert.ok(overdueBoard.grouped.overdue.some((item) => item.occurrenceId === april.id));
      assert.ok(overdueBoard.grouped.completed.some((item) => item.occurrenceId === jan.id));

      const julyNow = new Date("2027-07-08T15:00:00.000Z");
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: julyNow,
      });
      const july = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-07-15T00:00:00.000Z") },
      });
      assert.equal(july.scheduledDate.toISOString().slice(0, 10), "2027-07-15");
      assert.equal(april.scheduledDate.toISOString().slice(0, 10), "2027-04-15");
      const julyWo = await prisma.repair.findFirstOrThrow({
        where: {
          pmOccurrenceId: july.id,
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
        },
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
            occurrenceId: july.id,
            reason: "Staff cannot skip this occurrence.",
            client: prisma,
          }),
        /authority|Insufficient/i,
      );
      const skipped = await skipPmOccurrence(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        occurrenceId: july.id,
        reason: "Equipment already serviced by vendor this cycle.",
        client: prisma,
      });
      assert.equal(skipped.status, "SKIPPED");
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: julyNow,
      });
      const julyAfterSkip = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: july.id },
      });
      assert.equal(julyAfterSkip.status, "SKIPPED");
      const julyActive = await prisma.repair.findMany({
        where: {
          pmOccurrenceId: july.id,
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
        },
      });
      assert.equal(julyActive.length, 0);
      const skipBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: julyNow,
        client: prisma,
      });
      assert.ok(skipBoard.grouped.skipped.some((item) => item.occurrenceId === july.id));
      assert.ok(skipBoard.grouped.overdue.some((item) => item.occurrenceId === april.id));

      const octNow = new Date("2027-10-08T15:00:00.000Z");
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: octNow,
      });
      const oct = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId, scheduledDate: new Date("2027-10-15T00:00:00.000Z") },
      });
      assert.equal(oct.scheduledDate.toISOString().slice(0, 10), "2027-10-15");
      const octWo = await prisma.repair.findFirstOrThrow({ where: { pmOccurrenceId: oct.id } });
      const v2 = await prisma.preventiveMaintenancePlanVersion.findFirstOrThrow({
        where: { planId: published.planId, version: 2 },
      });
      assert.equal(oct.planVersionId, v2.id);
      assert.equal(octWo.procedureVersionId, v2Kit.procedure.id);
      assert.equal(wo2.procedureVersionId, procedure.id);

      // Scenario 11: move Asset; historical WO stays at A; next WO at B.
      const moveAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `MOVE-${fx.suffix}`,
          name: `Move ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          spaceId: fx.space.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const movePlan = await publishPlan(prisma, fx, mgr, {
        name: "Move Asset PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
        assetId: moveAsset.id,
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const moveJan = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: movePlan.planId, scheduledDate: new Date("2027-01-15T00:00:00.000Z") },
      });
      const moveWo1 = await prisma.repair.findFirstOrThrow({ where: { pmOccurrenceId: moveJan.id } });
      assert.equal(moveWo1.unitId, fx.unit.id);
      await prisma.asset.update({
        where: { id: moveAsset.id },
        data: { unitId: fx.unitB.id, spaceId: fx.spaceB.id },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: aprilNow,
      });
      const moveApr = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: movePlan.planId, scheduledDate: new Date("2027-04-15T00:00:00.000Z") },
      });
      const moveWo2 = await prisma.repair.findFirstOrThrow({ where: { pmOccurrenceId: moveApr.id } });
      const wo1AfterMove = await prisma.repair.findUniqueOrThrow({ where: { id: moveWo1.id } });
      assert.equal(wo1AfterMove.unitId, fx.unit.id);
      assert.equal(moveWo2.unitId, fx.unitB.id);
      const moveBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: aprilNow,
        client: prisma,
      });
      const historicalMove = moveBoard.grouped.overdue.find((item) => item.occurrenceId === moveJan.id);
      const laterMove = [...moveBoard.grouped.overdue, ...moveBoard.grouped.dueSoon].find(
        (item) => item.occurrenceId === moveApr.id,
      );
      assert.ok(historicalMove);
      assert.equal(historicalMove?.locationIsPreview, false);

      // Scenario 12: retired Asset suppresses generation; Plan stays PUBLISHED.
      await prisma.asset.update({
        where: { id: moveAsset.id },
        data: { status: "RETIRED" },
      });
      const beforeRetire = await prisma.preventiveMaintenanceOccurrence.count({
        where: { planId: movePlan.planId },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: octNow,
      });
      const afterRetire = await prisma.preventiveMaintenanceOccurrence.count({
        where: { planId: movePlan.planId },
      });
      assert.equal(afterRetire, beforeRetire);
      const movedPlan = await prisma.preventiveMaintenancePlan.findUniqueOrThrow({
        where: { id: movePlan.planId },
      });
      assert.equal(movedPlan.status, "PUBLISHED");

      // Configuration exception + unassigned.
      const doomedCategory = await prisma.maintenanceCategory.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          key: `doomed-${fx.suffix}`,
          label: "Doomed",
        },
      });
      const badAsset = await prisma.asset.create({
        data: {
          id: cuidLike(),
          assetCode: `BAD-${fx.suffix}`,
          name: `Bad ${fx.suffix}`,
          equipmentType: "DISHWASHER",
          unitId: fx.unit.id,
          departmentId: fx.plant.id,
          status: "OPERATIONAL",
        },
      });
      const badPlan = await publishPlan(prisma, fx, mgr, {
        name: "Needs configuration PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
        categoryId: doomedCategory.id,
        assetId: badAsset.id,
      });
      await prisma.maintenanceCategory.update({
        where: { id: doomedCategory.id },
        data: { archivedAt: catchUpNow },
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const configBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: catchUpNow,
        client: prisma,
      });
      assert.ok(
        configBoard.grouped.needsConfiguration.some((item) => item.planId === badPlan.planId),
      );
      assert.ok(
        configBoard.grouped.needsConfiguration.some(
          (item) => item.configurationIssue?.code === "ARCHIVED_CATEGORY",
        ),
      );

      const unaAsset = await prisma.asset.create({
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
      const unaPlan = await publishPlan(prisma, fx, mgr, {
        name: "Unassigned PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
        assetId: unaAsset.id,
        defaultAssignedEmployeeId: null,
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      const unaBoard = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: catchUpNow,
        client: prisma,
      });
      assert.ok(unaBoard.grouped.unassigned.some((item) => item.planId === unaPlan.planId));
      void laterMove;
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase4d sql: Facility timezone projection, not UTC calendar date",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    try {
      const fx = await createFacilityFixture(prisma, "America/Los_Angeles");
      const mgr = session({
        uid: fx.manager.id,
        facilityId: fx.facility.id,
        role: "MANAGER",
        primaryDepartmentId: fx.plant.id,
      });
      const publishNow = new Date("2027-04-08T15:00:00.000Z");
      const { procedure, template } = await publishedSopAndTemplate(prisma, fx, publishNow);
      await publishPlan(prisma, fx, mgr, {
        name: "Timezone PM",
        now: publishNow,
        procedureVersionId: procedure.id,
        templateId: template.id,
      });
      await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: new Date("2027-04-10T15:00:00.000Z"),
      });
      const utcBoundary = new Date("2027-04-16T06:30:00.000Z");
      assert.equal(facilityCivilToday("America/Los_Angeles", utcBoundary), "2027-04-15");
      const board = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: utcBoundary,
        client: prisma,
      });
      assert.equal(board.facilityToday, "2027-04-15");
      assert.equal(board.counts.dueToday, 1);
      assert.equal(String(board.grouped.dueToday[0]?.scheduledDate), "2027-04-15");
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase4d sql: no-Procedure PM generates and is not Needs configuration",
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
      const publishNow = new Date("2027-01-08T15:00:00.000Z");
      const { template } = await publishedSopAndTemplate(prisma, fx, publishNow);
      const published = await publishPlan(prisma, fx, mgr, {
        name: "No Procedure Run PM",
        now: publishNow,
        procedureVersionId: null,
        templateId: template.id,
      });
      assert.equal(published.procedureVersionId, null);

      const catchUpNow = new Date("2027-01-11T15:00:00.000Z");
      const generated = await generatePmForFacility(prisma, {
        facilityId: fx.facility.id,
        now: catchUpNow,
      });
      assert.equal(generated.occurrencesCreated, 1);
      assert.equal(generated.workOrdersCreated, 1);
      assert.equal(
        generated.configurationErrors.some((row) => row.code === "PROCEDURE_INVALID"),
        false,
      );

      const occurrence = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: published.planId },
      });
      const wo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: occurrence.id },
      });
      assert.equal(wo.workOrderKind, "PREVENTIVE");
      assert.equal(wo.procedureVersionId, null);
      assert.equal(wo.assetId, fx.asset.id);
      assert.equal(wo.maintenanceCategoryId, fx.category.id);

      const board = await loadPmRunBoard(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        now: catchUpNow,
        client: prisma,
      });
      assert.equal(
        board.grouped.needsConfiguration.some((item) => item.planId === published.planId),
        false,
      );
      const row = [
        ...board.grouped.overdue,
        ...board.grouped.dueToday,
        ...board.grouped.dueSoon,
        ...board.grouped.unassigned,
      ].find((item) => item.planId === published.planId);
      assert.ok(row);
      assert.equal(row.procedureLabel, null);
      assert.equal(row.configurationIssue, null);
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);
