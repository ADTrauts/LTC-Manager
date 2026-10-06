/**
 * Phase 3C SQL-backed corrective-maintenance tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 *
 * loadLocationHistory uses the shared Prisma client — set DATABASE_URL
 * to the same disposable URL when certifying history.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { loadLocationHistory } from "@/lib/audit/location-history";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
  publishKnowledgeArticle,
  saveKnowledgeArticleEditableContent,
} from "@/lib/knowledge/version-service";
import {
  createRequest,
  loadRequesterVisibleStatus,
  presentRequestAuthority,
  presentRequesterStatus,
} from "@/lib/operational-requests";

import {
  changeAssetStatus,
  createAsset,
  createIssueFromRecord,
  createWorkOrderFromIssue,
  declineRequest,
  holdAssignedWorkOrder,
  loadAssetTimeline,
  presentIssueAuthority,
  reportIssue,
  resolveIssueOptionallyRequests,
  resolveRequestWithoutWork,
  resumeWorkOrder,
  returnAssetToService,
  startWorkOrder,
  triageRequestCreateIssue,
  triageRequestCreateIssueAndWorkOrder,
  triageRequestLinkIssue,
} from "./index";
import { completeWorkOrder } from "./work-order-service";
import { addWorkOrderLabor } from "./work-order-closeout";
import { assignResponsibleEmployee } from "./work-order-service";

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
    name: overrides.name ?? "Phase 3C Test",
    email: overrides.email ?? "phase3c@example.com",
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

async function createFacilityFixture(prisma: PrismaClient, label: string) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `${label} Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: { organizationId: org.id, displayName: `${label} Facility ${suffix}` },
  });
  const dietary = await prisma.department.create({
    data: { facilityId: facility.id, key: "DIETARY", name: "Dietary" },
  });
  const plant = await prisma.department.create({
    data: { facilityId: facility.id, key: "PLANT", name: "Plant Operations" },
  });
  const unitA = await prisma.unit.create({
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
  const managerRole = await ensureRole(prisma, "MANAGER");
  const supervisorRole = await ensureRole(prisma, "SUPERVISOR");
  const staffRole = await ensureRole(prisma, "STAFF");
  const manager = await prisma.user.create({
    data: {
      email: `phase3c-mgr-${suffix}@example.com`,
      displayName: "Phase 3C Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const supervisor = await prisma.user.create({
    data: {
      email: `phase3c-sup-${suffix}@example.com`,
      displayName: "Phase 3C Supervisor",
      facilityId: facility.id,
      roleId: supervisorRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const dietaryUser = await prisma.user.create({
    data: {
      email: `phase3c-diet-${suffix}@example.com`,
      displayName: "Phase 3C Dietary",
      facilityId: facility.id,
      roleId: staffRole.id,
      primaryDepartmentId: dietary.id,
      emailVerifiedAt: new Date(),
    },
  });
  const tech = await prisma.employee.create({
    data: {
      id: cuidLike(),
      facilityId: facility.id,
      firstName: "Plant",
      lastName: `Tech ${suffix}`,
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: plant.id,
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
  return {
    facility,
    dietary,
    plant,
    unitA,
    unitB,
    spaceA,
    spaceB,
    manager,
    supervisor,
    dietaryUser,
    tech,
  };
}

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test(
  "phase3c sql: dishwasher, leak, duplicates, multi-WO, hold/resume, asset move, procedure pin, record origin",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prevPlant = process.env.PLANT_OPERATIONS_ENABLED;
    const prevDietary = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
    const prevJob = process.env.DIETARY_JOB_FLOW_ENABLED;
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";
    process.env.DIETARY_JOB_FLOW_ENABLED = "true";

    try {
      const fx = await createFacilityFixture(prisma, "Phase3C");
      const mgr = session({
        facilityId: fx.facility.id,
        role: "MANAGER",
        uid: fx.manager.id,
        primaryDepartmentId: fx.plant.id,
      });
      const supervisor = session({
        facilityId: fx.facility.id,
        role: "SUPERVISOR",
        uid: fx.supervisor.id,
        primaryDepartmentId: fx.plant.id,
      });
      const requester = session({
        facilityId: fx.facility.id,
        role: "STAFF",
        uid: fx.dietaryUser.id,
        primaryDepartmentId: fx.dietary.id,
      });
      const tech = session({
        facilityId: fx.facility.id,
        role: "STAFF",
        uid: fx.tech.id,
        authKind: "employee",
        primaryDepartmentId: fx.plant.id,
      });

      const dishwasher = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        name: "Dishwasher",
        equipmentType: "Dishwasher",
        client: prisma,
      });
      await changeAssetStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: dishwasher.id,
        toStatus: "OUT_OF_SERVICE",
        reason: "MANUAL",
        note: "Not heating",
        client: prisma,
      });

      const request1 = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        assetId: dishwasher.id,
        summary: "Dishwasher not heating",
        description: "Racks come out cold",
        observedAt: new Date(),
        client: prisma,
      });
      assert.equal(request1.relatedAssetIssueId, null);
      assert.equal(request1.workOrderId, null);
      assert.equal(presentRequestAuthority(request1.status), "RECEIVED");

      await assert.rejects(
        () =>
          triageRequestCreateIssue(requester, {
            facilityId: fx.facility.id,
            plantDepartmentId: fx.plant.id,
            requestId: request1.id,
            client: prisma,
          }),
        /triage denied|denied/i,
      );

      const accepted = await triageRequestCreateIssueAndWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: request1.id,
        assignedEmployeeId: fx.tech.id,
        client: prisma,
      });
      assert.equal(accepted.created, true);
      assert.equal(accepted.issue.assetId, dishwasher.id);
      assert.equal(accepted.workOrder.issueId, accepted.issue.id);
      assert.equal(accepted.workOrder.assignedEmployeeId, fx.tech.id);
      const requestAfterTriage = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request1.id },
      });
      assert.equal(requestAfterTriage.relatedAssetIssueId, accepted.issue.id);
      assert.equal(requestAfterTriage.workOrderId, accepted.workOrder.id);
      assert.equal(presentRequestAuthority(requestAfterTriage.status, requestAfterTriage.workOrderId), "ACCEPTED");
      assert.equal(
        ["ASSIGNED", "IN_PROGRESS", "ON_HOLD", "WORK_ASSIGNED", "WORK_IN_PROGRESS"].includes(
          requestAfterTriage.status,
        ),
        false,
      );

      await startWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: accepted.workOrder.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: accepted.workOrder.id,
        minutes: 15,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: accepted.workOrder.id,
        workPerformed: "Replaced heating element",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });

      const issueAfterComplete = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: accepted.issue.id },
      });
      const requestAfterComplete = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request1.id },
      });
      const assetAfterComplete = await prisma.asset.findUniqueOrThrow({
        where: { id: dishwasher.id },
      });
      assert.equal(presentIssueAuthority(issueAfterComplete.status), "OPEN");
      assert.equal(presentRequestAuthority(requestAfterComplete.status, requestAfterComplete.workOrderId), "ACCEPTED");
      assert.equal(assetAfterComplete.status, "OUT_OF_SERVICE");

      const recovery = await resolveIssueOptionallyRequests(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: accepted.issue.id,
        resolutionReason: "Heating restored",
        resolveLinkedRequests: true,
        client: prisma,
      });
      assert.equal(presentIssueAuthority(recovery.issue.status), "RESOLVED");
      assert.deepEqual(recovery.resolvedRequests, [request1.id]);
      await returnAssetToService(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: dishwasher.id,
        note: "Returned after element replacement",
        client: prisma,
      });
      const requestResolved = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request1.id },
      });
      const assetRestored = await prisma.asset.findUniqueOrThrow({ where: { id: dishwasher.id } });
      assert.equal(requestResolved.status, "CLOSED");
      assert.equal(assetRestored.status, "OPERATIONAL");

      const leakRequest = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Ceiling leak in Room 218",
        description: "Water staining above the pass-through",
        observedAt: new Date(),
        client: prisma,
      });
      const leak = await triageRequestCreateIssueAndWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: leakRequest.id,
        client: prisma,
      });
      assert.equal(leak.issue.assetId, null);
      assert.equal(leak.workOrder.assetId, null);
      await assignResponsibleEmployee(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: leak.workOrder.id,
        assignedEmployeeId: fx.tech.id,
        client: prisma,
      });
      await startWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: leak.workOrder.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: leak.workOrder.id,
        minutes: 15,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: leak.workOrder.id,
        workPerformed: "Sealed leak",
        client: prisma,
      });
      const leakIssueOpen = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: leak.issue.id },
      });
      assert.equal(presentIssueAuthority(leakIssueOpen.status), "OPEN");
      await resolveIssueOptionallyRequests(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: leak.issue.id,
        resolutionReason: "Leak sealed",
        resolveLinkedRequests: true,
        client: prisma,
      });

      const dupA = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Hall light flicker",
        description: "First report",
        observedAt: new Date(),
        client: prisma,
      });
      const dupIssue = await triageRequestCreateIssue(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: dupA.id,
        client: prisma,
      });
      const dupB = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Hall light still flickering",
        description: "Second report",
        observedAt: new Date(),
        allowObviousDuplicate: true,
        client: prisma,
      });
      await triageRequestLinkIssue(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: dupB.id,
        issueId: dupIssue.issue.id,
        client: prisma,
      });
      const issueCount = await prisma.assetIssue.count({
        where: { facilityId: fx.facility.id, summary: dupIssue.issue.summary },
      });
      assert.equal(issueCount, 1);
      const woDup = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: dupIssue.issue.id,
        title: "Diagnose lighting",
        client: prisma,
      });
      await startWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: woDup.id,
        client: prisma,
      });
      const projA = await loadRequesterVisibleStatus(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        requestId: dupA.id,
      });
      const projB = await loadRequesterVisibleStatus(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        requestId: dupB.id,
      });
      assert.equal(projA.projectedStatus, "IN_PROGRESS");
      assert.equal(projB.projectedStatus, "IN_PROGRESS");

      const multiIssue = await reportIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Worn belt found",
        description: "Technician discovered wear",
        observedAt: new Date(),
        allowDuplicateOpen: true,
        client: prisma,
      });
      const wo1 = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: multiIssue.issue.id,
        title: "Diagnose belt",
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        minutes: 15,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo1.id,
        workPerformed: "Diagnosed belt",
        client: prisma,
      });
      assert.equal(
        presentIssueAuthority(
          (await prisma.assetIssue.findUniqueOrThrow({ where: { id: multiIssue.issue.id } })).status,
        ),
        "OPEN",
      );
      const wo2 = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: multiIssue.issue.id,
        title: "Replace belt",
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        minutes: 15,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: wo2.id,
        workPerformed: "Replaced belt",
        client: prisma,
      });
      assert.equal(
        presentIssueAuthority(
          (await prisma.assetIssue.findUniqueOrThrow({ where: { id: multiIssue.issue.id } })).status,
        ),
        "OPEN",
      );

      const holdRequest = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Door closer damaged",
        description: "Closer slams",
        observedAt: new Date(),
        client: prisma,
      });
      const holdFlow = await triageRequestCreateIssueAndWorkOrder(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: holdRequest.id,
        assignedEmployeeId: fx.tech.id,
        client: prisma,
      });
      await startWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: holdFlow.workOrder.id,
        client: prisma,
      });
      await holdAssignedWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: holdFlow.workOrder.id,
        holdReason: "WAITING_FOR_PART",
        client: prisma,
      });
      const held = await prisma.repair.findUniqueOrThrow({ where: { id: holdFlow.workOrder.id } });
      assert.equal(held.status, "ON_HOLD");
      assert.equal(held.holdReason, "WAITING_FOR_PART");
      const requestDuringHold = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: holdRequest.id },
      });
      assert.equal(presentRequestAuthority(requestDuringHold.status, requestDuringHold.workOrderId), "ACCEPTED");
      assert.notEqual(requestDuringHold.status, "WAITING_ON_PARTS");
      await resumeWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: holdFlow.workOrder.id,
        client: prisma,
      });
      const resumed = await prisma.repair.findUniqueOrThrow({ where: { id: holdFlow.workOrder.id } });
      assert.equal(resumed.status, "IN_PROGRESS");
      assert.equal(resumed.holdReason, null);
      await addWorkOrderLabor(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: holdFlow.workOrder.id,
        minutes: 15,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(tech, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: holdFlow.workOrder.id,
        workPerformed: "Part installed",
        client: prisma,
      });

      await prisma.asset.update({
        where: { id: dishwasher.id },
        data: { unitId: fx.unitB.id, spaceId: fx.spaceB.id },
      });
      const historicalIssue = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: accepted.issue.id },
      });
      const historicalWo = await prisma.repair.findUniqueOrThrow({
        where: { id: accepted.workOrder.id },
      });
      assert.equal(historicalIssue.unitId, fx.unitA.id);
      assert.equal(historicalIssue.spaceId, fx.spaceA.id);
      assert.equal(historicalWo.unitId, fx.unitA.id);
      assert.equal(historicalWo.spaceId, fx.spaceA.id);

      const article = await createKnowledgeArticleWithInitialVersion(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        title: "Heating element replacement",
        summary: "v1",
        body: "Step 1 isolate power",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
      });
      const v1 = await loadCurrentPublishedVersion(prisma, article.id);
      assert.ok(v1);
      const pinWo = await createWorkOrderFromIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: multiIssue.issue.id,
        title: "Follow-up with procedure",
        procedureVersionId: v1.id,
        client: prisma,
      });
      await saveKnowledgeArticleEditableContent(prisma, {
        articleId: article.id,
        title: "Heating element replacement v2",
        summary: "v2",
        body: "Step 1 isolate power. Step 2 verify element.",
        category: "SOP",
        sourceType: "MANUAL",
        status: "DRAFT",
      });
      await publishKnowledgeArticle(prisma, article.id);
      const pinned = await prisma.repair.findUniqueOrThrow({ where: { id: pinWo.id } });
      assert.equal(pinned.procedureVersionId, v1.id);

      const template = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.plant.id,
          name: "Inspection",
          purposeType: "INSPECTION",
          status: "PUBLISHED",
          version: 1,
          stableKey: `sk-${cuidLike()}`,
          allowAdHoc: true,
          publishedAt: new Date(),
        },
      });
      const record = await prisma.operationalEvidenceRecord.create({
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
          unitId: fx.unitA.id,
          spaceId: fx.spaceA.id,
          assetId: dishwasher.id,
          outOfStandard: true,
        },
      });
      const fromRecord = await createIssueFromRecord(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        evidenceRecordId: record.id,
        client: prisma,
      });
      assert.equal(fromRecord.issue.originEvidenceRecordId, record.id);
      assert.equal(fromRecord.workOrder, null);

      const declined = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Need a new ice machine someday",
        description: "Not an actual failure",
        observedAt: new Date(),
        client: prisma,
      });
      const declinedRow = await declineRequest(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: declined.id,
        reason: "Capital request, not maintenance",
        client: prisma,
      });
      assert.equal(presentRequestAuthority(declinedRow.status), "DECLINED");
      assert.equal(declinedRow.relatedAssetIssueId, null);

      const noWork = await createRequest(requester, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Switch was off",
        description: "Someone flipped the breaker",
        observedAt: new Date(),
        client: prisma,
      });
      const resolvedNoWork = await resolveRequestWithoutWork(supervisor, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: noWork.id,
        resolutionReason: "Breaker restored. No condition remains.",
        client: prisma,
      });
      assert.equal(presentRequestAuthority(resolvedNoWork.status, resolvedNoWork.workOrderId), "RESOLVED_WITHOUT_WORK");

      const historyA = await loadLocationHistory({
        facilityId: fx.facility.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        limit: 120,
      });
      assert.ok(historyA.some((event) => event.sourceId === accepted.issue.id));
      assert.ok(historyA.some((event) => event.sourceId === accepted.workOrder.id));
      assert.ok(historyA.some((event) => event.sourceId === leak.issue.id));
      const timeline = await loadAssetTimeline(dishwasher.id, { limit: 80 });
      assert.ok(
        timeline.some(
          (event) =>
            event.kind === "ISSUE_REPORTED" ||
            event.kind === "WORK_ORDER_OPENED" ||
            event.kind === "WORK_COMPLETED",
        ),
      );

      assert.equal(
        presentRequesterStatus({
          status: requestAfterComplete.status,
          workOrderId: requestAfterComplete.workOrderId,
          workOrderStatus: "COMPLETED",
        }),
        "ACCEPTED",
      );
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prevDietary;
      process.env.DIETARY_JOB_FLOW_ENABLED = prevJob;
      await prisma.$disconnect();
    }
  },
);
