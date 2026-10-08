/**
 * Phase 3B SQL-backed Work Order domain tests.
 * Opt in via disposable migrated DB only. Never target ltc_manager.
 *
 * loadLocationHistory uses the shared Prisma client — set DATABASE_URL
 * to the same disposable URL when certifying Location History.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload, FacilitySession } from "@/lib/auth";
import { loadLocationHistory } from "@/lib/audit/location-history";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  createKnowledgeArticleWithInitialVersion,
  loadCurrentPublishedVersion,
  loadKnowledgeVersionById,
  publishKnowledgeArticle,
  saveKnowledgeArticleEditableContent,
} from "@/lib/knowledge/version-service";
import { createRequest } from "@/lib/operational-requests";

import {
  addWorkOrderLabor,
  completeWorkOrder,
  createWorkOrder,
  createWorkOrderFromIssue,
  ensureDefaultMaintenanceCategories,
  holdWorkOrder,
  linkEvidenceToWorkOrder,
  presentWorkOrder,
  presentWorkOrderPriority,
  presentWorkOrderStatus,
  reportIssue,
  resolveIssue,
  updateWorkOrderStatus,
} from "./index";
import { createAsset } from "./asset-service";

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
    name: overrides.name ?? "Phase 3B Test",
    email: overrides.email ?? "phase3b@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

async function ensureRole(prisma: PrismaClient, key: "MANAGER" | "STAFF") {
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
  const staffRole = await ensureRole(prisma, "STAFF");
  const manager = await prisma.user.create({
    data: {
      email: `phase3b-mgr-${suffix}@example.com`,
      displayName: "Phase 3B Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `phase3b-staff-${suffix}@example.com`,
      displayName: "Phase 3B Staff",
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
      firstName: "Phase3B",
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
  return { facility, dietary, plant, unitA, unitB, spaceA, spaceB, manager, staff, tech };
}

test("Facility Plant Operations is AVAILABLE", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "AVAILABLE");
});

test(
  "phase3b sql: location snapshot, procedure pin, hold, priority, category, many WOs, invariants",
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
      const fx = await createFacilityFixture(prisma, "Phase3B-A");
      const other = await createFacilityFixture(prisma, "Phase3B-B");
      const mgr = session({
        facilityId: fx.facility.id,
        role: "MANAGER",
        uid: fx.manager.id,
        primaryDepartmentId: fx.plant.id,
      });
      const staff = session({
        facilityId: fx.facility.id,
        role: "STAFF",
        uid: fx.staff.id,
        primaryDepartmentId: fx.dietary.id,
      });

      const catsA = await ensureDefaultMaintenanceCategories(fx.facility.id, prisma);
      const catsB = await ensureDefaultMaintenanceCategories(other.facility.id, prisma);
      const catsAAgain = await ensureDefaultMaintenanceCategories(fx.facility.id, prisma);
      assert.equal(catsA.length, 8);
      assert.equal(catsAAgain.length, 8);
      assert.equal(catsA[0].id, catsAAgain[0].id);
      assert.notEqual(catsA.find((c) => c.key === "PLUMBING")?.id, catsB.find((c) => c.key === "PLUMBING")?.id);

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        name: "Phase 3B Pump",
        equipmentType: "Pump",
        client: prisma,
      });

      const roomAccurate = await createWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        assetId: asset.id,
        title: "Align pump coupling",
        description: "Room-accurate WO",
        priority: "EMERGENCY",
        categoryKey: "HVAC",
        client: prisma,
      });
      assert.equal(roomAccurate.unitId, fx.unitA.id);
      assert.equal(roomAccurate.spaceId, fx.spaceA.id);
      assert.equal(roomAccurate.priority, "EMERGENCY");
      assert.equal(presentWorkOrderPriority(roomAccurate.priority), "EMERGENCY");

      await prisma.asset.update({
        where: { id: asset.id },
        data: { unitId: fx.unitB.id, spaceId: fx.spaceB.id },
      });
      const afterMove = await prisma.repair.findUniqueOrThrow({ where: { id: roomAccurate.id } });
      assert.equal(afterMove.unitId, fx.unitA.id);
      assert.equal(afterMove.spaceId, fx.spaceA.id);

      const locationOnly = await createWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        title: "Hallway leak",
        description: "Location-only WO",
        client: prisma,
      });
      assert.equal(locationOnly.assetId, null);
      assert.equal(locationOnly.unitId, fx.unitA.id);
      assert.equal(locationOnly.spaceId, fx.spaceA.id);

      const article = await createKnowledgeArticleWithInitialVersion(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        title: `Pump alignment ${cuidLike().slice(-6)}`,
        summary: "v1",
        body: "Procedure version 1",
        category: "SOP",
        sourceType: "MANUAL",
        status: "PUBLISHED",
      });
      const v1 = await loadCurrentPublishedVersion(prisma, article.id);
      assert.ok(v1);

      const draftOnly = await createKnowledgeArticleWithInitialVersion(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        title: `Draft SOP ${cuidLike().slice(-6)}`,
        summary: "draft",
        body: "Not published",
        category: "SOP",
        sourceType: "MANUAL",
        status: "DRAFT",
      });
      const draftVersion = await prisma.knowledgeArticleVersion.findFirstOrThrow({
        where: { articleId: draftOnly.id, status: "DRAFT" },
      });
      await assert.rejects(
        () =>
          createWorkOrder(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            unitId: fx.unitA.id,
            title: "Draft pin",
            description: "Should fail",
            procedureVersionId: draftVersion.id,
            client: prisma,
          }),
        /PUBLISHED Procedure/i,
      );

      const pinned = await createWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        title: "Follow v1 procedure",
        description: "Pinned procedure",
        procedureVersionId: v1.id,
        client: prisma,
      });
      assert.equal(pinned.procedureVersionId, v1.id);

      await saveKnowledgeArticleEditableContent(prisma, {
        articleId: article.id,
        title: `Pump alignment ${cuidLike().slice(-6)} v2`,
        summary: "v2",
        body: "Procedure version 2",
        category: "SOP",
        sourceType: "MANUAL",
        status: "DRAFT",
      });
      await publishKnowledgeArticle(prisma, article.id);
      const v1After = await loadKnowledgeVersionById(prisma, v1.id);
      assert.equal(v1After?.status, "SUPERSEDED");
      const stillPinned = await prisma.repair.findUniqueOrThrow({ where: { id: pinned.id } });
      assert.equal(stillPinned.procedureVersionId, v1.id);

      const held = await holdWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: locationOnly.id,
        holdReason: "WAITING_FOR_VENDOR",
        client: prisma,
      });
      assert.equal(held.status, "ON_HOLD");
      assert.equal(held.holdReason, "WAITING_FOR_VENDOR");
      assert.equal(presentWorkOrderStatus(held.status), "ON_HOLD");
      assert.equal(presentWorkOrder(held).holdReason, "WAITING_FOR_VENDOR");

      const legacyWaiting = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `LEG-${cuidLike().slice(-8).toUpperCase()}`,
          unitId: fx.unitA.id,
          title: "Legacy waiting",
          description: "Pre-3B WAITING_ON_VENDOR",
          status: "WAITING_ON_VENDOR",
          priority: "MEDIUM",
          repairTrade: "PLUMBING",
        },
      });
      const legacyView = presentWorkOrder(legacyWaiting);
      assert.equal(legacyView.status, "ON_HOLD");
      assert.equal(legacyView.holdReason, "WAITING_FOR_VENDOR");
      assert.equal(legacyView.priority, "ROUTINE");
      assert.equal(legacyView.categoryKey, "PLUMBING");
      const unchangedLegacy = await prisma.repair.findUniqueOrThrow({
        where: { id: legacyWaiting.id },
      });
      assert.equal(unchangedLegacy.status, "WAITING_ON_VENDOR");
      assert.equal(unchangedLegacy.priority, "MEDIUM");
      assert.equal(unchangedLegacy.spaceId, null);
      assert.equal(unchangedLegacy.holdReason, null);

      const plumbingA = catsA.find((c) => c.key === "PLUMBING");
      const plumbingB = catsB.find((c) => c.key === "PLUMBING");
      assert.ok(plumbingA && plumbingB);
      await assert.rejects(
        () =>
          createWorkOrder(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            unitId: fx.unitA.id,
            title: "Cross facility category",
            description: "Must fail",
            maintenanceCategoryId: plumbingB.id,
            client: prisma,
          }),
        /category not found/i,
      );

      const currentPublished = await loadCurrentPublishedVersion(prisma, article.id);
      assert.ok(currentPublished);

      const issue = await reportIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Bearing noise",
        description: "Abnormal noise",
        observedAt: new Date(),
        client: prisma,
      });
      const woA = await createWorkOrderFromIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Diagnose bearing",
        categoryKey: "HVAC",
        procedureVersionId: currentPublished.id,
        client: prisma,
      });
      const woB = await createWorkOrderFromIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        title: "Replace bearing",
        categoryKey: "GENERAL_REPAIR",
        client: prisma,
      });
      assert.equal(woA.issueId, issue.issue.id);
      assert.equal(woB.issueId, issue.issue.id);
      assert.equal(woA.spaceId, fx.spaceA.id);
      assert.equal(woB.spaceId, fx.spaceA.id);
      assert.notEqual(woA.maintenanceCategoryId, woB.maintenanceCategoryId);
      assert.equal(woA.procedureVersionId, currentPublished.id);
      assert.equal(woB.procedureVersionId, null);

      const request = await createRequest(staff, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Same bearing",
        description: "Dietary heard it too",
        observedAt: new Date(),
        client: prisma,
      });
      const assetBefore = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      await addWorkOrderLabor(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: woA.id,
        minutes: 25,
        employeeId: fx.tech.id,
        client: prisma,
      });
      await completeWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: woA.id,
        workPerformed: "Diagnosed",
        client: prisma,
      });
      const issueAfter = await prisma.assetIssue.findUniqueOrThrow({ where: { id: issue.issue.id } });
      const requestAfter = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      const assetAfter = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(presentWorkOrderStatus(issueAfter.status) === "COMPLETED", false);
      assert.notEqual(issueAfter.status, "RESOLVED");
      assert.equal(issueAfter.resolvedAt, null);
      assert.notEqual(requestAfter.status, "CLOSED");
      assert.equal(assetAfter.status, assetBefore.status);

      const resolved = await resolveIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: issue.issue.id,
        resolutionReason: "Explicit later",
        client: prisma,
      });
      assert.equal(resolved.status, "RESOLVED");

      const templateA = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.plant.id,
          name: "Phase 3B diagnostic",
          purposeType: "LOG",
          status: "PUBLISHED",
          version: 1,
          stableKey: `sk-${cuidLike()}`,
          allowAdHoc: true,
          publishedAt: new Date(),
        },
      });
      const templateB = await prisma.operationalTemplate.create({
        data: {
          id: cuidLike(),
          facilityId: other.facility.id,
          departmentId: other.plant.id,
          name: "Phase 3B foreign",
          purposeType: "LOG",
          status: "PUBLISHED",
          version: 1,
          stableKey: `sk-${cuidLike()}`,
          allowAdHoc: true,
          publishedAt: new Date(),
        },
      });
      const evidence = await prisma.operationalEvidenceRecord.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.plant.id,
          templateId: templateA.id,
          templateStableKey: templateA.stableKey,
          templateVersion: templateA.version,
          templateName: templateA.name,
          purposeType: "LOG",
          requirementKey: `req-${cuidLike().slice(-8)}`,
          operationalDate: new Date(),
          scheduleKind: "AD_HOC",
          occurredAt: new Date(),
          templateSnapshotJson: { fields: [] },
        },
      });
      const foreignEvidence = await prisma.operationalEvidenceRecord.create({
        data: {
          id: cuidLike(),
          facilityId: other.facility.id,
          departmentId: other.plant.id,
          templateId: templateB.id,
          templateStableKey: templateB.stableKey,
          templateVersion: templateB.version,
          templateName: templateB.name,
          purposeType: "LOG",
          requirementKey: `req-x-${cuidLike().slice(-8)}`,
          operationalDate: new Date(),
          scheduleKind: "AD_HOC",
          occurredAt: new Date(),
          templateSnapshotJson: { fields: [] },
        },
      });
      const link = await linkEvidenceToWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: woB.id,
        evidenceRecordId: evidence.id,
        client: prisma,
      });
      assert.equal(link.repairId, woB.id);
      await assert.rejects(
        () =>
          linkEvidenceToWorkOrder(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            repairId: woB.id,
            evidenceRecordId: foreignEvidence.id,
            client: prisma,
          }),
        /Evidence record not found/,
      );

      const historyA = await loadLocationHistory({
        facilityId: fx.facility.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        limit: 80,
      });
      assert.ok(historyA.some((event) => event.sourceId === roomAccurate.id && event.spaceId === fx.spaceA.id));
      assert.ok(historyA.some((event) => event.sourceId === locationOnly.id));
      const historyB = await loadLocationHistory({
        facilityId: fx.facility.id,
        unitId: fx.unitB.id,
        spaceId: fx.spaceB.id,
        limit: 80,
      });
      assert.equal(
        historyB.some((event) => event.sourceId === roomAccurate.id),
        false,
      );

      const replay = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `PRE3B-${cuidLike().slice(-6).toUpperCase()}`,
          unitId: fx.unitA.id,
          title: "Pre-3B repair",
          description: "No space, no procedure, no category",
          priority: "LOW",
          status: "WAITING_PARTS",
          repairTrade: "ELECTRICAL",
        },
      });
      assert.equal(replay.spaceId, null);
      assert.equal(replay.procedureVersionId, null);
      assert.equal(replay.maintenanceCategoryId, null);
      assert.equal(replay.holdReason, null);
      assert.equal(replay.priority, "LOW");
      assert.equal(replay.status, "WAITING_PARTS");
      assert.equal(presentWorkOrder(replay).priority, "ROUTINE");
      assert.equal(presentWorkOrder(replay).status, "ON_HOLD");
      assert.equal(presentWorkOrder(replay).categoryKey, "ELECTRICAL");

      await updateWorkOrderStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: locationOnly.id,
        toStatus: "IN_PROGRESS",
        client: prisma,
      });
      const resumed = await prisma.repair.findUniqueOrThrow({ where: { id: locationOnly.id } });
      assert.equal(resumed.holdReason, null);
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prevDietary;
      process.env.DIETARY_JOB_FLOW_ENABLED = prevJob;
      await prisma.$disconnect();
    }
  },
);
