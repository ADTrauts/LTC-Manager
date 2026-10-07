/**
 * Facility Plant Operations V1 — whole-Product SQL certification.
 * Disposable migrated DB only. Never target ltc_manager.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import {
  addWorkOrderLabor,
  addWorkOrderPart,
  completeWorkOrder,
  createAsset,
  createIssueFromRecord,
  createWorkOrderFromIssue,
  presentIssueAuthority,
  resolveIssueOptionallyRequests,
  satisfyWorkOrderRecordRequirement,
  startWorkOrder,
  triageRequestCreateIssueAndWorkOrder,
  updateAssetIdentity,
} from "@/lib/asset-operations";
import {
  getCommittedDepartmentProductStatus,
  getDepartmentProduct,
  installDepartmentProduct,
  installDepartmentProductForInternalDevelopment,
  overrideDepartmentProductStatusForTest,
  resetDepartmentProductStatusOverridesForTest,
} from "@/lib/department-products";
import { DepartmentProductInstallError } from "@/lib/department-products/install";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import {
  installPlantStarterConfiguration,
  loadPlantStarterInstalledKeys,
} from "@/lib/department-products/plant-starter";
import {
  createRequest,
  presentRequestAuthority,
  presentRequesterStatus,
} from "@/lib/operational-requests";
import {
  applyPmCadencePresetDefaults,
  persistPmPriority,
} from "@/lib/preventive-maintenance/presentation";
import {
  createPmPlanWithDraft,
  generatePmForFacility,
  presentPmOccurrence,
  publishPmPlanVersion,
} from "@/lib/preventive-maintenance";

const databaseUrl =
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL ||
  process.env.PLANT_OPERATIONS_TEST_DATABASE_URL ||
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL;

if (process.env.CI && !databaseUrl) {
  throw new Error(
    "Release-critical Plant SQL tests must not skip in CI. Set VERIFY_DATABASE_URL.",
  );
}

const skipReason = databaseUrl
  ? false
  : "set ASSET_OPERATIONS_TEST_DATABASE_URL to a disposable migrated database to run these";

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
}

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
    name: overrides.name ?? "Plant Release",
    email: overrides.email ?? "plant-release@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function ensureRole(
  prisma: PrismaClient,
  key: "MANAGER" | "STAFF" | "SUPERVISOR" | "FACILITY_ADMINISTRATOR",
) {
  return prisma.role.upsert({
    where: { key },
    update: {},
    create: { id: cuidLike(), key, name: key },
  });
}

async function createBareFacility(prisma: PrismaClient, label: string) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `${label} Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: {
      organizationId: org.id,
      displayName: `${label} Facility ${suffix}`,
      timezone: "America/New_York",
    },
  });
  return { suffix, org, facility };
}

async function createUsers(
  prisma: PrismaClient,
  facilityId: string,
  plantId: string | null,
  dietaryId: string | null,
  suffix: string,
) {
  const managerRole = await ensureRole(prisma, "MANAGER");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const staffRole = await ensureRole(prisma, "STAFF");
  const faRole = await ensureRole(prisma, "FACILITY_ADMINISTRATOR");
  const manager = await prisma.user.create({
    data: {
      email: `release-mgr-${suffix}@example.com`,
      displayName: "Release Manager",
      facilityId,
      roleId: managerRole.id,
      primaryDepartmentId: plantId,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `release-sup-${suffix}@example.com`,
      displayName: "Release Supervisor",
      facilityId,
      roleId: supervisorRole.id,
      primaryDepartmentId: plantId,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `release-staff-${suffix}@example.com`,
      displayName: "Release Technician",
      facilityId,
      roleId: staffRole.id,
      primaryDepartmentId: plantId,
      emailVerifiedAt: new Date(),
    },
  });
  const requester = await prisma.user.create({
    data: {
      email: `release-req-${suffix}@example.com`,
      displayName: "Release Requester",
      facilityId,
      roleId: staffRole.id,
      primaryDepartmentId: dietaryId,
      emailVerifiedAt: new Date(),
    },
  });
  const fa = await prisma.user.create({
    data: {
      email: `release-fa-${suffix}@example.com`,
      displayName: "Release FA",
      facilityId,
      roleId: faRole.id,
      primaryDepartmentId: dietaryId,
      emailVerifiedAt: new Date(),
    },
  });
  const tech = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId,
      firstName: "Release",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plantId,
    },
  });
  return { manager, supervisor, staff, requester, fa, tech };
}

async function countPlantContent(
  prisma: PrismaClient,
  facilityId: string,
  departmentId: string,
) {
  const [work, records, assets, pms, procedures] = await Promise.all([
    prisma.departmentWorkPlan.count({ where: { facilityId, departmentId } }),
    prisma.operationalTemplate.count({ where: { facilityId, departmentId } }),
    prisma.asset.count({ where: { departmentId } }),
    prisma.preventiveMaintenancePlan.count({ where: { facilityId, departmentId } }),
    prisma.knowledgeArticle.count({ where: { facilityId, departmentId } }),
  ]);
  return { work, records, assets, pms, procedures };
}

test.afterEach(() => {
  resetDepartmentProductStatusOverridesForTest();
});

test("Facility Plant Operations committed status remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
});

test(
  "DEVELOPMENT blocks customer install; internal install creates Product only",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevFlag = process.env.PLANT_OPERATIONS_ENABLED;
    delete process.env.PLANT_OPERATIONS_ENABLED;
    try {
      const { facility } = await createBareFacility(prisma, "ReleaseDev");
      await assert.rejects(
        () =>
          installDepartmentProduct({
            facilityId: facility.id,
            productKey: "PLANT",
            prisma,
          }),
        (err: unknown) =>
          err instanceof DepartmentProductInstallError && err.code === "UNAVAILABLE_PRODUCT",
      );
      const installed = await installDepartmentProductForInternalDevelopment({
        facilityId: facility.id,
        productKey: "PLANT",
        prisma,
      });
      assert.equal(installed.created, true);
      assert.equal(installed.key, "PLANT");
      assert.equal(installed.name, "Plant Operations");
      const counts = await countPlantContent(prisma, facility.id, installed.id);
      assert.deepEqual(counts, { work: 0, records: 0, assets: 0, pms: 0, procedures: 0 });
      assert.equal(await isPlantRuntimeEnabled(facility.id, { authKind: "user" }), false);
      assert.equal(await isPlantRuntimeEnabled(facility.id, { authKind: "harbor_staff" }), true);
    } finally {
      if (prevFlag === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevFlag;
      await prisma.$disconnect();
    }
  },
);

test(
  "controlled AVAILABLE customer can install and operate without env flag or Harbor",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevFlag = process.env.PLANT_OPERATIONS_ENABLED;
    delete process.env.PLANT_OPERATIONS_ENABLED;
    try {
      const { facility, suffix } = await createBareFacility(prisma, "ReleaseAvail");
      overrideDepartmentProductStatusForTest("PLANT", "AVAILABLE");
      assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
      assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");

      const installed = await installDepartmentProduct({
        facilityId: facility.id,
        productKey: "PLANT",
        prisma,
      });
      assert.equal(installed.created, true);
      assert.equal(installed.key, "PLANT");
      const counts = await countPlantContent(prisma, facility.id, installed.id);
      assert.deepEqual(counts, { work: 0, records: 0, assets: 0, pms: 0, procedures: 0 });

      const users = await createUsers(prisma, facility.id, installed.id, null, suffix);
      const runtime = await isPlantRuntimeEnabled(facility.id, {
        authKind: "user",
      });
      assert.equal(runtime, true, "installed AVAILABLE Plant must run without PLANT_OPERATIONS_ENABLED");
      assert.equal(users.manager.primaryDepartmentId, installed.id);
    } finally {
      resetDepartmentProductStatusOverridesForTest();
      if (prevFlag === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevFlag;
      await prisma.$disconnect();
    }
  },
);

test(
  "new Facility setup: starter, real Asset, quarterly PM, corrective, location-only, finding, history, roles",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevFlag = process.env.PLANT_OPERATIONS_ENABLED;
    const prevDietaryJob = process.env.DIETARY_JOB_FLOW_ENABLED;
    delete process.env.PLANT_OPERATIONS_ENABLED;
    process.env.DIETARY_JOB_FLOW_ENABLED = "true";
    try {
      const { facility, suffix } = await createBareFacility(prisma, "ReleaseJourney");
      overrideDepartmentProductStatusForTest("PLANT", "AVAILABLE");
      const dietary = await installDepartmentProduct({
        facilityId: facility.id,
        productKey: "HEALTHCARE_FOOD_NUTRITION",
        prisma,
      });
      const plant = await installDepartmentProduct({
        facilityId: facility.id,
        productKey: "PLANT",
        prisma,
      });
      const users = await createUsers(prisma, facility.id, plant.id, dietary.id, suffix);
      const unitA = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Location A ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const unitB = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Location B ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const spaceA = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: unitA.id,
          name: `Space A ${suffix}`,
          spaceType: "MECHANICAL",
        },
      });
      const spaceB = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: unitB.id,
          name: `Space B ${suffix}`,
          spaceType: "MECHANICAL",
        },
      });
      await prisma.departmentRequestRoute.create({
        data: {
          facilityId: facility.id,
          requestingDepartmentId: dietary.id,
          responsibleDepartmentId: plant.id,
          isActive: true,
        },
      });
      const category = await prisma.maintenanceCategory.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          key: `release-${suffix}`,
          label: "HVAC",
        },
      });

      const mgr = session({
        uid: users.manager.id,
        facilityId: facility.id,
        role: "MANAGER",
        primaryDepartmentId: plant.id,
      });
      const supervisor = session({
        uid: users.supervisor.id,
        facilityId: facility.id,
        role: "SUPERVISOR",
        primaryDepartmentId: plant.id,
      });
      const tech = session({
        uid: users.tech.id,
        facilityId: facility.id,
        role: "STAFF",
        authKind: "employee",
        primaryDepartmentId: plant.id,
      });
      const requester = session({
        uid: users.requester.id,
        facilityId: facility.id,
        role: "STAFF",
        primaryDepartmentId: dietary.id,
      });
      const fa = session({
        uid: users.fa.id,
        facilityId: facility.id,
        role: "FACILITY_ADMINISTRATOR",
        primaryDepartmentId: dietary.id,
      });
      const actor = { userId: users.manager.id, label: "Release Manager" };

      assert.equal(await isPlantRuntimeEnabled(facility.id, { authKind: "user" }), true);

      const firstStarter = await installPlantStarterConfiguration(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"],
        actor,
        client: prisma,
      });
      assert.equal(firstStarter.workAdded, 1);
      assert.equal(firstStarter.recordAdded, 1);
      const afterFirst = await countPlantContent(prisma, facility.id, plant.id);
      assert.equal(afterFirst.assets, 0);
      assert.equal(afterFirst.pms, 0);
      assert.equal(afterFirst.procedures, 0);
      const workDrafts = await prisma.departmentWorkPlan.findMany({
        where: { facilityId: facility.id, departmentId: plant.id },
      });
      assert.ok(workDrafts.every((row) => row.status === "DRAFT"));

      const remaining = await installPlantStarterConfiguration(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        selectedIds: ["BUILDING_WALKTHROUGH", "GENERATOR_INSPECTION"],
        actor,
        client: prisma,
      });
      assert.equal(remaining.workAdded, 1);
      assert.equal(remaining.recordAdded, 1);
      const again = await installPlantStarterConfiguration(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND", "EQUIPMENT_CONDITION_INSPECTION"],
        actor,
        client: prisma,
      });
      assert.equal(again.alreadyExisted, 2);
      assert.equal(again.workAdded, 0);
      const edited = await prisma.departmentWorkPlan.update({
        where: { id: workDrafts[0]!.id },
        data: { name: "Facility-owned Mechanical Room Round" },
      });
      const afterEdit = await installPlantStarterConfiguration(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        selectedIds: ["MECHANICAL_ROOM_ROUND"],
        actor,
        client: prisma,
      });
      assert.equal(afterEdit.alreadyExisted, 1);
      const kept = await prisma.departmentWorkPlan.findUniqueOrThrow({
        where: { id: edited.id },
      });
      assert.equal(kept.name, "Facility-owned Mechanical Room Round");

      const asset = await createAsset(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
        name: `Chiller ${suffix}`,
        equipmentType: "HVAC",
        client: prisma,
      });
      assert.equal(asset.unitId, unitA.id);

      const quarterly = applyPmCadencePresetDefaults("quarterly");
      assert.equal(quarterly.intervalMonths, 3);
      assert.equal(quarterly.generationLeadDays, 7);
      assert.equal(quarterly.priority, "ROUTINE");
      const template = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: plant.id,
          name: `Release Inspection ${suffix}`,
          purposeType: "INSPECTION",
          status: "PUBLISHED",
          version: 1,
          stableKey: `release-insp-${suffix}`,
          allowAdHoc: true,
          publishedAt: new Date("2027-01-08T15:00:00.000Z"),
        },
      });
      const pmNow = new Date("2027-01-08T15:00:00.000Z");
      const createdPlan = await createPmPlanWithDraft(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        assetId: asset.id,
        draft: {
          name: `Quarterly Chiller ${suffix}`,
          instructions: "Inspect belts.",
          anchorDate: "2027-01-15",
          intervalMonths: quarterly.intervalMonths,
          generationLeadDays: quarterly.generationLeadDays,
          maintenanceCategoryId: category.id,
          procedureVersionId: null,
          defaultAssignedEmployeeId: users.tech.id,
          recordRequirements: [{ templateId: template.id }],
          priority: persistPmPriority(quarterly.priority),
        },
        client: prisma,
        now: pmNow,
      });
      const published = await publishPmPlanVersion(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        planId: createdPlan.id,
        client: prisma,
        now: pmNow,
      });
      assert.equal(published.procedureVersionId, null);
      assert.equal(
        await prisma.repair.count({
          where: { unit: { facilityId: facility.id }, workOrderKind: "PREVENTIVE" },
        }),
        0,
        "publishing a Plan must not create a Work Order",
      );

      await assert.rejects(
        () =>
          publishPmPlanVersion(tech, {
            facilityId: facility.id,
            departmentId: plant.id,
            planId: createdPlan.id,
            client: prisma,
            now: pmNow,
          }),
        /publish|authority|denied|Insufficient/i,
      );

      const janRun = await generatePmForFacility(prisma, {
        facilityId: facility.id,
        now: pmNow,
      });
      assert.equal(janRun.occurrencesCreated, 1);
      assert.equal(janRun.workOrdersCreated, 1);
      const jan = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: { planId: createdPlan.id, scheduledDate: new Date("2027-01-15T00:00:00.000Z") },
      });
      const janWo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: jan.id },
      });
      assert.equal(janWo.workOrderKind, "PREVENTIVE");
      assert.equal(janWo.assetId, asset.id);
      assert.equal(janWo.unitId, unitA.id);
      assert.equal(janWo.procedureVersionId, null);
      assert.equal(janWo.assignedEmployeeId, users.tech.id);

      const janReqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: janWo.id },
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: janWo.id,
        minutes: 20,
        employeeId: users.tech.id,
        client: prisma,
      });
      const janEvidence = await prisma.operationalEvidenceRecord.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: plant.id,
          templateId: template.id,
          templateStableKey: template.stableKey,
          templateVersion: template.version,
          templateName: template.name,
          purposeType: "INSPECTION",
          requirementKey: `req-${suffix}-jan`,
          operationalDate: pmNow,
          scheduleKind: "AD_HOC",
          occurredAt: pmNow,
          templateSnapshotJson: { fields: [] },
          unitId: unitA.id,
          spaceId: spaceA.id,
          assetId: asset.id,
          status: "COMPLETED_WITH_CORRECTIVE_ACTION",
          outOfStandard: true,
        },
      });
      await satisfyWorkOrderRecordRequirement(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: janWo.id,
        requirementId: janReqs[0]!.id,
        evidenceRecordId: janEvidence.id,
        client: prisma,
      });
      const finding = await createIssueFromRecord(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        evidenceRecordId: janEvidence.id,
        client: prisma,
      });
      assert.ok(finding.issue);
      assert.notEqual(finding.issue.status, "RESOLVED");
      await completeWorkOrder(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: janWo.id,
        workPerformed: "Completed January PM",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const janDone = await prisma.preventiveMaintenanceOccurrence.findUniqueOrThrow({
        where: { id: jan.id },
      });
      const janWoDone = await prisma.repair.findUniqueOrThrow({ where: { id: janWo.id } });
      const findingOpen = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: finding.issue.id },
      });
      assert.equal(janDone.status, "COMPLETED");
      assert.equal(janWoDone.status, "COMPLETED");
      assert.equal(presentIssueAuthority(findingOpen.status), "OPEN");

      const followUp = await createWorkOrderFromIssue(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        issueId: finding.issue.id,
        title: "Corrective follow-up from PM",
        client: prisma,
      });
      assert.notEqual(followUp.id, janWo.id);
      assert.equal(followUp.workOrderKind !== "PREVENTIVE", true);
      const janStill = await prisma.repair.findUniqueOrThrow({ where: { id: janWo.id } });
      assert.equal(janStill.status, "COMPLETED");
      assert.equal(janStill.workOrderKind, "PREVENTIVE");

      const request = await createRequest(requester, {
        facilityId: facility.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
        assetId: asset.id,
        summary: "Chiller alarm",
        description: "Loud alarm in mechanical room",
        observedAt: new Date(),
        client: prisma,
      });
      assert.equal(request.relatedAssetIssueId, null);
      assert.equal(request.workOrderId, null);
      assert.equal(presentRequesterStatus({ status: request.status }), "RECEIVED");
      await assert.rejects(
        () =>
          triageRequestCreateIssueAndWorkOrder(requester, {
            facilityId: facility.id,
            plantDepartmentId: plant.id,
            requestId: request.id,
            client: prisma,
          }),
        /triage denied|denied/i,
      );
      await assert.rejects(
        () =>
          triageRequestCreateIssueAndWorkOrder(fa, {
            facilityId: facility.id,
            plantDepartmentId: plant.id,
            requestId: request.id,
            client: prisma,
          }),
        /denied|authority|Facility Administrator/i,
      );
      const accepted = await triageRequestCreateIssueAndWorkOrder(supervisor, {
        facilityId: facility.id,
        plantDepartmentId: plant.id,
        requestId: request.id,
        assignedEmployeeId: users.tech.id,
        client: prisma,
      });
      assert.notEqual(accepted.issue.id, request.id);
      assert.notEqual(accepted.workOrder.id, accepted.issue.id);
      const requestAccepted = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      assert.equal(
        presentRequesterStatus({
          status: requestAccepted.status,
          workOrderId: requestAccepted.workOrderId,
        }),
        "ACCEPTED",
      );
      await startWorkOrder(tech, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: accepted.workOrder.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: accepted.workOrder.id,
        minutes: 15,
        employeeId: users.tech.id,
        client: prisma,
      });
      await addWorkOrderPart(tech, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: accepted.workOrder.id,
        description: "Contactor",
        quantity: "1",
        client: prisma,
      });
      const inProgress = await prisma.repair.findUniqueOrThrow({
        where: { id: accepted.workOrder.id },
      });
      assert.equal(
        presentRequesterStatus({
          status: requestAccepted.status,
          workOrderId: inProgress.id,
          workOrderStatus: inProgress.status,
        }),
        "IN_PROGRESS",
      );
      await completeWorkOrder(tech, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: accepted.workOrder.id,
        workPerformed: "Reset alarm and replaced contactor",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const woDone = await prisma.repair.findUniqueOrThrow({
        where: { id: accepted.workOrder.id },
      });
      const issueStillOpen = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: accepted.issue.id },
      });
      const requestAfterWo = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      assert.equal(woDone.status, "COMPLETED");
      assert.equal(presentIssueAuthority(issueStillOpen.status), "OPEN");
      assert.notEqual(requestAfterWo.status, "CLOSED");
      const recovery = await resolveIssueOptionallyRequests(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        issueId: accepted.issue.id,
        resolutionReason: "Alarm cleared",
        resolveLinkedRequests: true,
        client: prisma,
      });
      assert.equal(presentIssueAuthority(recovery.issue.status), "RESOLVED");
      assert.equal(
        presentRequesterStatus({ status: "CLOSED" }),
        "RESOLVED",
      );

      const leak = await createRequest(requester, {
        facilityId: facility.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
        unitId: unitA.id,
        spaceId: spaceA.id,
        summary: "Ceiling leak near window",
        description: "Location-only maintenance need",
        observedAt: new Date(),
        client: prisma,
      });
      assert.equal(leak.assetId, null);
      const leakFlow = await triageRequestCreateIssueAndWorkOrder(supervisor, {
        facilityId: facility.id,
        plantDepartmentId: plant.id,
        requestId: leak.id,
        assignedEmployeeId: users.tech.id,
        client: prisma,
      });
      assert.equal(leakFlow.issue.assetId, null);
      assert.equal(leakFlow.workOrder.assetId, null);
      await startWorkOrder(tech, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: leakFlow.workOrder.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: leakFlow.workOrder.id,
        minutes: 10,
        employeeId: users.tech.id,
        client: prisma,
      });
      await completeWorkOrder(tech, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: leakFlow.workOrder.id,
        workPerformed: "Dried ceiling and sealed penetration",
        client: prisma,
      });
      assert.equal(
        await prisma.asset.count({
          where: { departmentId: plant.id, name: { contains: "fake" } },
        }),
        0,
      );

      const historicalWo = accepted.workOrder;
      await updateAssetIdentity(mgr, {
        facilityId: facility.id,
        departmentId: plant.id,
        assetId: asset.id,
        unitId: unitB.id,
        spaceId: spaceB.id,
        client: prisma,
      });
      const oldWo = await prisma.repair.findUniqueOrThrow({ where: { id: historicalWo.id } });
      assert.equal(oldWo.unitId, unitA.id);
      assert.equal(oldWo.spaceId, spaceA.id);

      const aprilNow = new Date("2027-04-08T15:00:00.000Z");
      const aprilRun = await generatePmForFacility(prisma, {
        facilityId: facility.id,
        now: aprilNow,
      });
      assert.equal(aprilRun.occurrencesCreated, 1);
      const april = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: {
          planId: createdPlan.id,
          scheduledDate: new Date("2027-04-15T00:00:00.000Z"),
        },
      });
      const aprilWo = await prisma.repair.findFirstOrThrow({
        where: { pmOccurrenceId: april.id },
      });
      assert.equal(aprilWo.unitId, unitB.id);
      assert.equal(aprilWo.spaceId, spaceB.id);
      const aprilReqs = await prisma.repairRecordRequirement.findMany({
        where: { repairId: aprilWo.id },
      });
      assert.equal(aprilReqs[0]?.templateId, template.id);
      await addWorkOrderLabor(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: aprilWo.id,
        minutes: 15,
        employeeId: users.tech.id,
        client: prisma,
      });
      const aprilEvidence = await prisma.operationalEvidenceRecord.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: plant.id,
          templateId: template.id,
          templateStableKey: template.stableKey,
          templateVersion: template.version,
          templateName: template.name,
          purposeType: "INSPECTION",
          requirementKey: `req-${suffix}-apr`,
          operationalDate: new Date("2027-04-20T15:00:00.000Z"),
          scheduleKind: "AD_HOC",
          occurredAt: new Date("2027-04-20T15:00:00.000Z"),
          templateSnapshotJson: { fields: [] },
          unitId: unitB.id,
          spaceId: spaceB.id,
          assetId: asset.id,
          status: "COMPLETED",
        },
      });
      await satisfyWorkOrderRecordRequirement(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: aprilWo.id,
        requirementId: aprilReqs[0]!.id,
        evidenceRecordId: aprilEvidence.id,
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: facility.id,
        departmentId: plant.id,
        repairId: aprilWo.id,
        workPerformed: "April PM completed late",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
        now: new Date("2027-04-20T15:00:00.000Z"),
      });
      assert.equal(
        presentPmOccurrence({
          status: "OPEN",
          scheduledDate: new Date("2027-04-15T00:00:00.000Z"),
          facilityToday: "2027-04-20",
        }),
        "OVERDUE",
      );

      const julyNow = new Date("2027-07-08T15:00:00.000Z");
      const julyRun = await generatePmForFacility(prisma, {
        facilityId: facility.id,
        now: julyNow,
      });
      assert.equal(julyRun.occurrencesCreated, 1);
      const july = await prisma.preventiveMaintenanceOccurrence.findFirstOrThrow({
        where: {
          planId: createdPlan.id,
          scheduledDate: new Date("2027-07-15T00:00:00.000Z"),
        },
      });
      assert.equal(july.scheduledDate.toISOString().slice(0, 10), "2027-07-15");
      const keys = await loadPlantStarterInstalledKeys({
        facilityId: facility.id,
        departmentId: plant.id,
        client: prisma,
      });
      assert.ok(keys.workPresetKeys.includes("MECHANICAL_ROOM_ROUND"));
      assert.equal(presentRequestAuthority(request.status), "RECEIVED");
    } finally {
      resetDepartmentProductStatusOverridesForTest();
      if (prevFlag === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = prevFlag;
      if (prevDietaryJob === undefined) delete process.env.DIETARY_JOB_FLOW_ENABLED;
      else process.env.DIETARY_JOB_FLOW_ENABLED = prevDietaryJob;
      await prisma.$disconnect();
    }
  },
);

test("after SQL journeys committed Product status is DEVELOPMENT", () => {
  resetDepartmentProductStatusOverridesForTest();
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
  assert.equal(getCommittedDepartmentProductStatus("PLANT"), "DEVELOPMENT");
});
