/**
 * Phase 3D SQL-backed Work Order closeout tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { getDepartmentProduct } from "@/lib/department-products";

import {
  addWorkOrderLabor,
  addWorkOrderPart,
  addWorkOrderRecordRequirement,
  changeAssetStatus,
  completeWorkOrder,
  createAsset,
  createWorkOrderFromIssue,
  reportIssue,
  satisfyWorkOrderRecordRequirement,
  setWorkOrderExternalCost,
  validateWorkOrderCloseout,
  waiveWorkOrderRecordRequirement,
} from "./index";
import { presentIssueAuthority } from "./issue-semantics";

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
    name: overrides.name ?? "Phase 3D Test",
    email: overrides.email ?? "phase3d@example.com",
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
    data: { name: `Phase 3D Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: { organizationId: org.id, displayName: `Phase 3D Facility ${suffix}` },
  });
  const dietary = await prisma.department.create({
    data: { facilityId: facility.id, key: "DIETARY", name: "Dietary" },
  });
  const plant = await prisma.department.create({
    data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
  });
  const unit = await prisma.unit.create({
    data: {
      facilityId: facility.id,
      name: `Unit 3D ${suffix}`,
      unitType: "OTHER",
      hierarchyRole: "FLOOR",
    },
  });
  const space = await prisma.unitSpace.create({
    data: {
      facilityId: facility.id,
      unitId: unit.id,
      name: `Space 3D ${suffix}`,
      spaceType: "MECHANICAL",
    },
  });
  const managerRole = await ensureRole(prisma, "MANAGER");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  await ensureRole(prisma, "STAFF");
  const manager = await prisma.user.create({
    data: {
      email: `phase3d-mgr-${suffix}@example.com`,
      displayName: "Phase 3D Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase3d-sup-${suffix}@example.com`,
      displayName: "Phase 3D Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const techA = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Tech",
      lastName: `A ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const techB = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Tech",
      lastName: `B ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      name: `ABC Mechanical ${suffix}`,
    },
  });
  return {
    facility,
    dietary,
    plant,
    unit,
    space,
    manager,
    supervisor,
    techA,
    techB,
    vendor,
  };
}

async function publishedTemplate(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  name: string,
) {
  return prisma.operationalTemplate.create({
    data: {
      id: cuidLike(),
      facilityId: fx.facility.id,
      departmentId: fx.plant.id,
      name,
      purposeType: "INSPECTION",
      status: "PUBLISHED",
      version: 1,
      stableKey: `sk-${cuidLike()}`,
      allowAdHoc: true,
      publishedAt: new Date(),
    },
  });
}

async function makeRecord(
  prisma: PrismaClient,
  fx: Awaited<ReturnType<typeof createFacilityFixture>>,
  template: { id: string; stableKey: string; version: number; name: string },
  status: "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION" | "NEEDS_REVIEW",
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
      status,
      outOfStandard: status === "COMPLETED_WITH_CORRECTIVE_ACTION",
    },
  });
}

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test(
  "phase3d sql: labor, parts, expense, evidence, waiver, asset review, legacy",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";

    try {
      const fx = await createFacilityFixture(prisma);
      const supervisor = session({
        facilityId: fx.facility.id,
        role: "SUPERVISOR",
        uid: fx.supervisor.id,
        primaryDepartmentId: fx.plant.id,
      });
      const techASession = session({
        facilityId: fx.facility.id,
        role: "STAFF",
        uid: fx.techA.id,
        authKind: "employee",
        primaryDepartmentId: fx.plant.id,
      });
      const mgr = session({
        facilityId: fx.facility.id,
        role: "MANAGER",
        uid: fx.manager.id,
        primaryDepartmentId: fx.plant.id,
      });

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unit.id,
        spaceId: fx.space.id,
        name: "Boiler",
        equipmentType: "Boiler",
        client: prisma,
      });
      await changeAssetStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        assetId: asset.id,
        toStatus: "OUT_OF_SERVICE",
        reason: "MANUAL",
        note: "Failed",
        client: prisma,
      });

      const issue = await reportIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unit.id,
        spaceId: fx.space.id,
        assetId: asset.id,
        summary: "Boiler down",
        description: "No heat",
        observedAt: new Date(),
        client: prisma,
      });

      // Scenario 1 — labor attribution survives reassignment
      const wo1 = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Repair boiler",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(techASession, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        minutes: 45,
        upsertOwn: true,
        client: prisma,
      });
      await prisma.repair.update({
        where: { id: wo1.id },
        data: { assignedEmployeeId: fx.techB.id },
      });
      const laborAfterReassign = await prisma.repairLaborEntry.findMany({
        where: { repairId: wo1.id },
      });
      assert.equal(laborAfterReassign.length, 1);
      assert.equal(laborAfterReassign[0]?.employeeId, fx.techA.id);
      assert.equal(laborAfterReassign[0]?.minutes, 45);

      // Scenario 2 — zero vs missing labor
      const missingWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Missing labor",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      const missing = validateWorkOrderCloseout({
        workPerformed: "Ready",
        laborEntryCount: 0,
        requirements: [],
        hasAsset: true,
        assetConditionReview: "NO_CHANGE",
      });
      assert.equal(missing.canComplete, false);
      await assert.rejects(
        () =>
          completeWorkOrder(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: missingWo.id,
            workPerformed: "Ready",
            assetConditionReview: "NO_CHANGE",
            client: prisma,
          }),
        /Labor time/,
      );
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: missingWo.id,
        minutes: 0,
        employeeId: fx.techB.id,
        client: prisma,
      });
      const withZero = await prisma.repairLaborEntry.count({ where: { repairId: missingWo.id } });
      assert.equal(withZero, 1);

      // Scenario 3 — parts + expense
      await addWorkOrderPart(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        description: "Drive belt",
        partNumber: "B-38",
        quantity: "1.500",
        lineCost: "42.50",
        client: prisma,
      });
      await addWorkOrderPart(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        description: "Gasket",
        quantity: "2",
        client: prisma,
      });
      const parts = await prisma.repairPartUsed.findMany({ where: { repairId: wo1.id } });
      assert.equal(parts.length, 2);
      const belt = parts.find((row) => row.partNumber === "B-38");
      assert.equal(belt?.quantity.toFixed(3), "1.500");
      assert.equal(belt?.lineCost?.toFixed(2), "42.50");

      // Scenario 5/8 later on a dedicated WO. Finish wo1 as vendor-adjacent later.

      const template = await publishedTemplate(prisma, fx, "Post-repair inspection");

      // Scenario 5 — pending evidence blocks
      const evidenceWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Evidence gate",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: evidenceWo.id,
        minutes: 10,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderRecordRequirement(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: evidenceWo.id,
        templateId: template.id,
        client: prisma,
      });
      await assert.rejects(
        () =>
          completeWorkOrder(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: evidenceWo.id,
            workPerformed: "Tried to close",
            assetConditionReview: "NO_CHANGE",
            client: prisma,
          }),
        /Post-repair inspection/,
      );

      // Scenario 9 — NEEDS_REVIEW does not satisfy
      const needsReview = await makeRecord(prisma, fx, template, "NEEDS_REVIEW");
      const requirement = await prisma.repairRecordRequirement.findFirstOrThrow({
        where: { repairId: evidenceWo.id },
      });
      await assert.rejects(
        () =>
          satisfyWorkOrderRecordRequirement(supervisor, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: evidenceWo.id,
            requirementId: requirement.id,
            evidenceRecordId: needsReview.id,
            client: prisma,
          }),
        /completed Record/,
      );
      assert.equal(
        (await prisma.repairRecordRequirement.findUniqueOrThrow({ where: { id: requirement.id } }))
          .status,
        "PENDING",
      );

      // Scenario 7 — failed-but-completed satisfies; Issue stays OPEN
      const failedCompleted = await makeRecord(
        prisma,
        fx,
        template,
        "COMPLETED_WITH_CORRECTIVE_ACTION",
      );
      await satisfyWorkOrderRecordRequirement(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: evidenceWo.id,
        requirementId: requirement.id,
        evidenceRecordId: failedCompleted.id,
        client: prisma,
      });
      const satisfied = await prisma.repairRecordRequirement.findUniqueOrThrow({
        where: { id: requirement.id },
      });
      assert.equal(satisfied.status, "SATISFIED");
      assert.equal(satisfied.satisfiedByRecordId, failedCompleted.id);
      assert.ok(
        await prisma.repairEvidenceLink.findFirst({
          where: { repairId: evidenceWo.id, evidenceRecordId: failedCompleted.id },
        }),
        "satisfying a requirement also links the Record to the Work Order",
      );
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: evidenceWo.id,
        workPerformed: "Inspection completed with corrective action",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const issueAfterFailed = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: issue.issue.id },
      });
      assert.equal(presentIssueAuthority(issueAfterFailed.status), "OPEN");

      // Scenario 6 + 8 — satisfy vs waive on a fresh WO
      const waiveWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Waiver path",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: waiveWo.id,
        minutes: 5,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderRecordRequirement(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: waiveWo.id,
        templateId: template.id,
        client: prisma,
      });
      const waiveReq = await prisma.repairRecordRequirement.findFirstOrThrow({
        where: { repairId: waiveWo.id },
      });
      await assert.rejects(
        () =>
          waiveWorkOrderRecordRequirement(techASession, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: waiveWo.id,
            requirementId: waiveReq.id,
            waiveReason: "Cannot complete today",
            client: prisma,
          }),
        /cannot waive/i,
      );
      await waiveWorkOrderRecordRequirement(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: waiveWo.id,
        requirementId: waiveReq.id,
        waiveReason: "Access not available this shift",
        client: prisma,
      });
      const waived = await prisma.repairRecordRequirement.findUniqueOrThrow({
        where: { id: waiveReq.id },
      });
      assert.equal(waived.status, "WAIVED");
      assert.equal(waived.satisfiedByRecordId, null);
      assert.ok(waived.waiveReason);
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: waiveWo.id,
        workPerformed: "Closed with waiver",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const waiverUpdate = await prisma.repairUpdate.findFirst({
        where: { repairId: waiveWo.id, updateText: { contains: "waived" } },
      });
      assert.ok(waiverUpdate);

      // Scenario 4 — vendor-only 0 minutes + external cost, no parts
      const vendorWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Vendor service",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: vendorWo.id,
        minutes: 0,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await setWorkOrderExternalCost(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: vendorWo.id,
        vendorId: fx.vendor.id,
        externalCost: "850.00",
        externalCostNote: "Contractor invoice",
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: vendorWo.id,
        workPerformed: "Vendor completed service",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const vendorRow = await prisma.repair.findUniqueOrThrow({ where: { id: vendorWo.id } });
      assert.equal(vendorRow.status, "COMPLETED");
      assert.equal(vendorRow.externalCost?.toFixed(2), "850.00");
      assert.equal(vendorRow.vendorId, fx.vendor.id);

      // Scenario 10 — NO_CHANGE preserves OUT_OF_SERVICE
      const noChangeWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "No change review",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: noChangeWo.id,
        minutes: 12,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await completeWorkOrder(techASession, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: noChangeWo.id,
        workPerformed: "Inspected only",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const assetNoChange = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(assetNoChange.status, "OUT_OF_SERVICE");
      const noChangeRow = await prisma.repair.findUniqueOrThrow({ where: { id: noChangeWo.id } });
      assert.equal(noChangeRow.assetConditionReview, "NO_CHANGE");
      assert.ok(noChangeRow.assetConditionReviewedAt);

      // Scenario 11 — OPERATIONAL via closeout; Issue and Request stay open
      const request = await prisma.operationalRequest.create({
        data: {
          id: cuidLike(),
          requestCode: `OR-3D-${cuidLike().slice(-6).toUpperCase()}`,
          facilityId: fx.facility.id,
          requestingDepartmentId: fx.plant.id,
          responsibleDepartmentId: fx.plant.id,
          unitId: fx.unit.id,
          assetId: asset.id,
          relatedAssetIssueId: issue.issue.id,
          summary: "Need heat restored",
          description: "Follow-up request",
          status: "UNDER_REVIEW",
          observedAt: new Date(),
          requesterVisibleStatusSummary: "Accepted",
        },
      });
      const opWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Return operational",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: opWo.id,
        minutes: 30,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await completeWorkOrder(techASession, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: opWo.id,
        workPerformed: "Element replaced and tested",
        assetConditionReview: "OPERATIONAL",
        client: prisma,
      });
      const assetOperational = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(assetOperational.status, "OPERATIONAL");
      const history = await prisma.assetStatusHistory.findFirst({
        where: { assetId: asset.id, toStatus: "OPERATIONAL", sourceRepairId: opWo.id },
      });
      assert.ok(history);
      const issueStillOpen = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: issue.issue.id },
      });
      assert.equal(presentIssueAuthority(issueStillOpen.status), "OPEN");
      const requestAfter = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      assert.notEqual(requestAfter.status, "CLOSED");
      assert.notEqual(requestAfter.status, "RESOLVED");

      // Scenario 12 — location-only, no asset review
      const locationIssue = await reportIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unit.id,
        spaceId: fx.space.id,
        summary: "Ceiling leak",
        description: "Location only",
        observedAt: new Date(),
        client: prisma,
      });
      const locationWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: locationIssue.issue.id,
        title: "Patch leak",
        assignedEmployeeId: fx.techA.id,
        client: prisma,
      });
      assert.equal(locationWo.assetId, null);
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: locationWo.id,
        minutes: 20,
        employeeId: fx.techA.id,
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: locationWo.id,
        workPerformed: "Patched ceiling",
        client: prisma,
      });
      const locationRow = await prisma.repair.findUniqueOrThrow({ where: { id: locationWo.id } });
      assert.equal(locationRow.status, "COMPLETED");
      assert.equal(locationRow.assetConditionReview, null);

      // Scenario 13 — legacy completed Work Order loads without new facts
      const legacy = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `R-L${cuidLike().slice(-6).toUpperCase()}`,
          unitId: fx.unit.id,
          title: "Pre-3D completed work",
          description: "Historical",
          status: "COMPLETED",
          completedAt: new Date(),
          responsibleDepartmentId: fx.plant.id,
        },
      });
      const loadedLegacy = await prisma.repair.findUniqueOrThrow({
        where: { id: legacy.id },
        include: { laborEntries: true, partsUsed: true, recordRequirements: true },
      });
      assert.equal(loadedLegacy.status, "COMPLETED");
      assert.equal(loadedLegacy.laborEntries.length, 0);
      assert.equal(loadedLegacy.partsUsed.length, 0);
      assert.equal(loadedLegacy.recordRequirements.length, 0);
      assert.equal(loadedLegacy.workPerformed, null);
      assert.equal(loadedLegacy.assetConditionReview, null);
      const idempotent = await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: legacy.id,
        client: prisma,
      });
      assert.equal(idempotent.status, "COMPLETED");
      const stillBare = await prisma.repairLaborEntry.count({ where: { repairId: legacy.id } });
      assert.equal(stillBare, 0);

      const wo1Parts = await prisma.repairPartUsed.findMany({ where: { repairId: wo1.id } });
      const expense = wo1Parts.reduce(
        (sum, part) => (part.lineCost ? sum.add(part.lineCost) : sum),
        new Prisma.Decimal(0),
      );
      assert.equal(expense.toFixed(2), "42.50");
    } finally {
      if (prevPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      await prisma.$disconnect();
    }
  },
);
