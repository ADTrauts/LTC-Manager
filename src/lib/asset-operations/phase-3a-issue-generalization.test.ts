/**
 * Phase 3A SQL-backed Issue generalization tests.
 * Opt in via ASSET_OPERATIONS_TEST_DATABASE_URL / PLANT_OPERATIONS_TEST_DATABASE_URL /
 * DEPARTMENT_WORK_TEST_DATABASE_URL (disposable migrated DB only).
 *
 * loadLocationHistory uses the shared Prisma client — set DATABASE_URL to the same
 * disposable URL when certifying Location History.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import { loadLocationHistory } from "@/lib/audit/location-history";
import { createRequest } from "@/lib/operational-requests";
import { getDepartmentProduct } from "@/lib/department-products";
import {
  completeWorkOrder,
  createIssueFromRequest,
  createWorkOrderFromIssue,
  linkRequestToIssue,
  presentIssueAuthority,
  reportAssetIssue,
  reportIssue,
  resolveIssue,
  reopenIssue,
  loadAssetTimeline,
  createAsset,
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
    name: overrides.name ?? "Phase 3A Test",
    email: overrides.email ?? "phase3a@example.com",
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

async function createFixture(prisma: PrismaClient) {
  const suffix = cuidLike().slice(-8);
  const org = await prisma.organization.create({
    data: { name: `Phase 3A Org ${suffix}` },
  });
  const facility = await prisma.facility.create({
    data: { organizationId: org.id, displayName: `Phase 3A Facility ${suffix}` },
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
      email: `phase3a-mgr-${suffix}@example.com`,
      displayName: "Phase 3A Manager",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: plant.id,
      emailVerifiedAt: new Date(),
    },
  });
  const staff = await prisma.user.create({
    data: {
      email: `phase3a-staff-${suffix}@example.com`,
      displayName: "Phase 3A Staff",
      facilityId: facility.id,
      roleId: staffRole.id,
      primaryDepartmentId: dietary.id,
      emailVerifiedAt: new Date(),
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
  return { facility, dietary, plant, unitA, unitB, spaceA, spaceB, manager, staff };
}

test("Facility Plant Operations remains DEVELOPMENT", () => {
  assert.equal(getDepartmentProduct("PLANT")?.status, "DEVELOPMENT");
});

test(
  "phase3a sql: location-only Issue, many WOs, duplicate Requests, resolve, asset move, backfill",
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
      const fx = await createFixture(prisma);
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

      const beforeIssueCount = await prisma.operationalRequest.count({
        where: { facilityId: fx.facility.id },
      });

      const locationOnly = await reportIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Ceiling leak over hallway",
        description: "Water staining on ceiling tiles",
        observedAt: new Date(),
        client: prisma,
      });
      assert.equal(locationOnly.issue.assetId, null);
      assert.equal(locationOnly.issue.unitId, fx.unitA.id);
      assert.equal(locationOnly.issue.spaceId, fx.spaceA.id);
      assert.equal(presentIssueAuthority(locationOnly.issue.status), "OPEN");
      assert.equal(locationOnly.issue.id, locationOnly.issue.id);

      await assert.rejects(
        () =>
          reportIssue(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.plant.id,
            summary: "Missing unit",
            description: "Should fail without location",
            observedAt: new Date(),
            client: prisma,
          }),
        /unit is required/i,
      );

      const woA = await createWorkOrderFromIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: locationOnly.issue.id,
        title: "Diagnose leak source",
        client: prisma,
      });
      const woB = await createWorkOrderFromIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: locationOnly.issue.id,
        title: "Replace damaged tiles",
        client: prisma,
      });
      assert.notEqual(woA.id, woB.id);
      assert.equal(woA.issueId, locationOnly.issue.id);
      assert.equal(woB.issueId, locationOnly.issue.id);
      const issueAfterWos = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: locationOnly.issue.id },
      });
      assert.equal(issueAfterWos.workOrderId, woA.id);
      assert.notEqual(issueAfterWos.workOrderId, woB.id);
      const linkedWos = await prisma.repair.findMany({
        where: { issueId: locationOnly.issue.id },
      });
      assert.equal(linkedWos.length, 2);

      const unlinkedWo = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `R-${cuidLike().slice(-8).toUpperCase()}`,
          unitId: fx.unitA.id,
          title: "Direct known work",
          description: "No Issue",
        },
      });
      assert.equal(unlinkedWo.issueId, null);

      await completeWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        repairId: woA.id,
        workPerformed: "Traced to roof",
        client: prisma,
      });
      const stillOpen = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: locationOnly.issue.id },
      });
      assert.equal(presentIssueAuthority(stillOpen.status), "OPEN");
      assert.equal(stillOpen.resolvedAt, null);

      const resolved = await resolveIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: locationOnly.issue.id,
        resolutionReason: "Leak repaired and tiles replaced",
        client: prisma,
      });
      assert.equal(presentIssueAuthority(resolved.status), "RESOLVED");
      assert.ok(resolved.resolvedAt);
      assert.equal(resolved.resolutionReason, "Leak repaired and tiles replaced");

      const reopened = await reopenIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.plant.id,
        issueId: locationOnly.issue.id,
        client: prisma,
      });
      assert.equal(presentIssueAuthority(reopened.status), "OPEN");
      assert.equal(reopened.resolvedAt, null);

      const reqA = await createRequest(staff, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Sink leaking",
        description: "Nursing noticed dripping sink",
        observedAt: new Date(),
        client: prisma,
      });
      assert.equal(reqA.relatedAssetIssueId, null);
      const afterSubmitCount = await prisma.assetIssue.count({
        where: { facilityId: fx.facility.id, summary: "Sink leaking" },
      });
      assert.equal(afterSubmitCount, 0);

      const fromRequest = await createIssueFromRequest(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: reqA.id,
        client: prisma,
      });
      assert.equal(fromRequest.created, true);
      assert.equal(fromRequest.issue.unitId, fx.unitA.id);
      assert.equal(fromRequest.request.status, reqA.status);
      const reqALinked = await prisma.operationalRequest.findUniqueOrThrow({
        where: { id: reqA.id },
      });
      assert.equal(reqALinked.relatedAssetIssueId, fromRequest.issue.id);
      assert.equal(["WORK_ASSIGNED", "WORK_IN_PROGRESS"].includes(reqALinked.status), false);

      const reqB = await createRequest(staff, {
        facilityId: fx.facility.id,
        requestingDepartmentId: fx.dietary.id,
        responsibleDepartmentId: fx.plant.id,
        unitId: fx.unitA.id,
        summary: "Same sink still leaking",
        description: "Dietary also reporting the sink",
        observedAt: new Date(),
        allowObviousDuplicate: true,
        client: prisma,
      });
      await linkRequestToIssue(mgr, {
        facilityId: fx.facility.id,
        plantDepartmentId: fx.plant.id,
        requestId: reqB.id,
        issueId: fromRequest.issue.id,
        client: prisma,
      });
      const duplicates = await prisma.operationalRequest.findMany({
        where: { relatedAssetIssueId: fromRequest.issue.id },
      });
      assert.equal(duplicates.length, 2);
      const issueLocationUnchanged = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: fromRequest.issue.id },
      });
      assert.equal(issueLocationUnchanged.unitId, fx.unitA.id);
      assert.equal(issueLocationUnchanged.spaceId, fx.spaceA.id);

      await assert.rejects(
        () =>
          createIssueFromRequest(staff, {
            facilityId: fx.facility.id,
            plantDepartmentId: fx.plant.id,
            requestId: reqB.id,
            client: prisma,
          }),
        /triage|denied/i,
      );

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        name: "Phase 3A Oven",
        equipmentType: "Oven",
        client: prisma,
      });
      const assetIssue = await reportAssetIssue(staff, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        unitId: fx.unitA.id,
        spaceId: fx.spaceA.id,
        summary: "Oven not heating",
        description: "No heat on bake cycle",
        observedAt: new Date(),
        allowDuplicateOpen: true,
        client: prisma,
      });
      assert.equal(assetIssue.issue.assetId, asset.id);
      assert.equal(assetIssue.issue.unitId, fx.unitA.id);
      assert.equal(assetIssue.issue.spaceId, fx.spaceA.id);

      await prisma.asset.update({
        where: { id: asset.id },
        data: { unitId: fx.unitB.id, spaceId: fx.spaceB.id },
      });
      const issueAfterMove = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: assetIssue.issue.id },
      });
      assert.equal(issueAfterMove.unitId, fx.unitA.id);
      assert.equal(issueAfterMove.spaceId, fx.spaceA.id);

      const timeline = await loadAssetTimeline(asset.id);
      assert.ok(timeline.some((event) => event.id === `issue:${assetIssue.issue.id}`));
      assert.equal(
        timeline.some((event) => event.id === `issue:${locationOnly.issue.id}`),
        false,
      );

      const historyA = await loadLocationHistory({
        facilityId: fx.facility.id,
        unitId: fx.unitA.id,
        limit: 80,
      });
      assert.ok(historyA.some((event) => event.sourceId === locationOnly.issue.id));
      assert.ok(historyA.some((event) => event.sourceId === assetIssue.issue.id));
      const historyB = await loadLocationHistory({
        facilityId: fx.facility.id,
        unitId: fx.unitB.id,
        limit: 80,
      });
      assert.equal(
        historyB.some((event) => event.sourceId === assetIssue.issue.id),
        false,
      );

      const legacyRepair = await prisma.repair.create({
        data: {
          id: cuidLike(),
          repairCode: `LEG-${cuidLike().slice(-8).toUpperCase()}`,
          unitId: fx.unitA.id,
          title: "Legacy 1:1 WO",
          description: "Pre-Phase-3A link",
          assetId: asset.id,
        },
      });
      const legacyIssue = await prisma.assetIssue.create({
        data: {
          id: cuidLike(),
          issueCode: `AI-LEG-${cuidLike().slice(-6).toUpperCase()}`,
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          assetId: asset.id,
          unitId: fx.unitA.id,
          summary: "Legacy linked issue",
          description: "workOrderId compatibility",
          observedAt: new Date(),
          workOrderId: legacyRepair.id,
        },
      });
      const legacyIssueId = legacyIssue.id;
      const legacyRepairId = legacyRepair.id;
      await prisma.$executeRawUnsafe(`
        UPDATE "Repair" AS r
        SET "issueId" = ai.id
        FROM "AssetIssue" AS ai
        WHERE ai."workOrderId" = r.id
          AND r."issueId" IS NULL
      `);
      const backfilledRepair = await prisma.repair.findUniqueOrThrow({
        where: { id: legacyRepairId },
      });
      const backfilledIssue = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: legacyIssueId },
      });
      assert.equal(backfilledRepair.issueId, legacyIssueId);
      assert.equal(backfilledIssue.id, legacyIssueId);
      assert.equal(backfilledIssue.workOrderId, legacyRepairId);
      assert.equal(backfilledRepair.id, legacyRepairId);

      const afterIssueCount = await prisma.operationalRequest.count({
        where: { facilityId: fx.facility.id },
      });
      assert.ok(afterIssueCount >= beforeIssueCount);
    } finally {
      process.env.PLANT_OPERATIONS_ENABLED = prevPlant;
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prevDietary;
      process.env.DIETARY_JOB_FLOW_ENABLED = prevJob;
      await prisma.$disconnect();
    }
  },
);
