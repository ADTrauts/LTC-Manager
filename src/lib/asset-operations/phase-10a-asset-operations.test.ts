/**
 * Phase 10A SQL-backed Dietary Asset Operations tests.
 * Opt in via ASSET_OPERATIONS_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";

import {
  changeAssetStatus,
  createAsset,
  createWorkOrderDirect,
  createWorkOrderFromIssue,
  decideAssetOperationsAuthority,
  getAssetProfile,
  linkEvidenceToIssue,
  reportAssetIssue,
  reopenIssue,
  resolveIssue,
  retireAsset,
  returnAssetToService,
  triageIssue,
  updateAssetIdentity,
  updateWorkOrderStatus,
  completeWorkOrder,
  assignVendor,
  markReturnToServiceReady,
} from "./index";

const databaseUrl = process.env.ASSET_OPERATIONS_TEST_DATABASE_URL;

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
    name: overrides.name ?? "Test",
    email: overrides.email ?? "test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function loadFixture(prisma: PrismaClient) {
  const dietary = await prisma.department.findFirst({
    where: { key: "DIETARY", isActive: true },
    include: { facility: true },
  });
  assert.ok(dietary, "dietary department required");
  const facility = dietary.facility;
  assert.ok(facility);
  const unit = await prisma.unit.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      unitType: "SERVERY",
      departmentResponsibilities: { some: { departmentId: dietary.id } },
    },
  });
  assert.ok(unit, "servery unit with Dietary responsibility required");
  const manager =
    (await prisma.user.findFirst({
      where: {
        facilityId: facility.id,
        isActive: true,
        role: { key: { in: ["MANAGER", "GM"] } },
      },
      include: { role: { select: { key: true } } },
    })) ??
    (await prisma.user.findFirst({
      where: {
        facilityId: facility.id,
        isActive: true,
        role: { key: "FACILITY_ADMINISTRATOR" },
        primaryDepartmentId: dietary.id,
      },
      include: { role: { select: { key: true } } },
    }));
  assert.ok(manager, "manager or dietary FA user required");
  const supervisorUser = await prisma.user.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      role: { key: "SUPERVISOR" },
    },
    include: { role: { select: { key: true } } },
  });
  const staffUser = await prisma.user.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      role: { key: "STAFF" },
    },
    include: { role: { select: { key: true } } },
  });
  const staffEmployee = await prisma.employee.findFirst({
    where: {
      facilityId: facility.id,
      roleType: "STAFF",
      status: "ACTIVE",
    },
  });
  const supervisorEmployee = await prisma.employee.findFirst({
    where: {
      facilityId: facility.id,
      roleType: "SUPERVISOR",
      status: "ACTIVE",
    },
  });
  const vendor = await prisma.vendor.findFirst({
    where: { facilityId: facility.id },
  });
  return {
    facility,
    dietary,
    unit,
    manager,
    supervisorUser,
    staffUser,
    staffEmployee,
    supervisorEmployee,
    vendor,
  };
}

test(
  "phase10a sql: asset create edit scope status history retirement foreign reject",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unit.id,
        name: "SQL Fridge 10A",
        equipmentType: "Refrigerator",
        manufacturer: "ColdCo",
        status: "OPERATIONAL",
      });
      assert.equal(asset.status, "OPERATIONAL");

      const historyAfterCreate = await prisma.assetStatusHistory.findMany({
        where: { assetId: asset.id },
      });
      assert.ok(historyAfterCreate.length >= 1);

      await updateAssetIdentity(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        name: "SQL Fridge 10A Renamed",
        model: "X1",
      });
      const renamed = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(renamed.name, "SQL Fridge 10A Renamed");

      await changeAssetStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        toStatus: "DEGRADED",
        reason: "MANUAL",
        note: "Compressor noisy",
      });
      const degraded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(degraded.status, "DEGRADED");
      const statusHistory = await prisma.assetStatusHistory.findMany({
        where: { assetId: asset.id },
        orderBy: { changedAt: "asc" },
      });
      assert.ok(statusHistory.some((h) => h.toStatus === "DEGRADED"));

      await retireAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        reason: "End of life",
      });
      const retired = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(retired.status, "RETIRED");
      assert.ok(retired.retiredAt);

      await assert.rejects(
        () =>
          updateAssetIdentity(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            assetId: asset.id,
            name: "Should fail",
          }),
        /Retired/,
      );

      const foreignFacility = await prisma.facility.findFirst({
        where: { id: { not: fx.facility.id } },
      });
      if (foreignFacility) {
        await assert.rejects(
          () =>
            createAsset(mgr, {
              facilityId: foreignFacility.id,
              departmentId: fx.dietary.id,
              unitId: fx.unit.id,
              name: "Foreign",
              equipmentType: "Cooler",
            }),
          /denied|not found|Cross-facility/i,
        );
      }

      if (fx.vendor) {
        const vendorAsset = await createAsset(mgr, {
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          unitId: fx.unit.id,
          name: "Vendor Scope Asset",
          equipmentType: "Cooler",
        });
        await assert.rejects(
          () =>
            updateAssetIdentity(mgr, {
              facilityId: fx.facility.id,
              departmentId: fx.dietary.id,
              assetId: vendorAsset.id,
              vendorId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
            }),
          /Vendor not found/,
        );
      }
    } finally {
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase10a sql: issue report idempotency evidence triage resolve reopen separate from WO",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });
      assert.ok(fx.staffEmployee || fx.staffUser, "staff actor required");
      const staff = fx.staffUser
        ? session({
            facilityId: fx.facility.id,
            role: fx.staffUser.role.key as AppJwtPayload["role"],
            uid: fx.staffUser.id,
            primaryDepartmentId: fx.dietary.id,
          })
        : session({
            facilityId: fx.facility.id,
            role: "STAFF",
            uid: fx.staffEmployee!.id,
            authKind: "employee",
            authMethod: "QUICK_PIN",
            primaryDepartmentId: fx.dietary.id,
            name: "Staff Employee",
          });

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unit.id,
        name: "Issue Cooler",
        equipmentType: "Cooler",
      });

      const clientCommandId = `cmd-${cuidLike()}`;
      const first = await reportAssetIssue(staff, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        unitId: fx.unit.id,
        summary: "Cooler warm",
        description: "Walk-in reading high",
        observedAt: new Date(),
        operationalImpact: "SERVICE_AT_RISK",
        equipmentRemainsUsable: true,
        clientCommandId,
      });
      assert.equal(first.idempotent, false);
      assert.equal(first.issue.status, "REPORTED");
      assert.equal(first.issue.workOrderId, null);

      const again = await reportAssetIssue(staff, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        unitId: fx.unit.id,
        summary: "Cooler warm",
        description: "Walk-in reading high",
        observedAt: new Date(),
        clientCommandId,
      });
      assert.equal(again.idempotent, true);
      assert.equal(again.issue.id, first.issue.id);

      const dup = await reportAssetIssue(staff, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        unitId: fx.unit.id,
        summary: "Cooler warm",
        description: "Same condition again",
        observedAt: new Date(),
      });
      assert.ok(dup.duplicateOf);

      const template =
        (await prisma.operationalTemplate.findFirst({
          where: {
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            status: "PUBLISHED",
          },
          select: {
            id: true,
            name: true,
            version: true,
            purposeType: true,
            stableKey: true,
          },
        })) ??
        (await prisma.operationalTemplate.create({
          data: {
            id: cuidLike(),
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            name: "10A Link Template",
            purposeType: "LOG",
            status: "PUBLISHED",
            version: 1,
            stableKey: `sk-${cuidLike()}`,
            allowAdHoc: true,
            publishedAt: new Date(),
          },
          select: {
            id: true,
            name: true,
            version: true,
            purposeType: true,
            stableKey: true,
          },
        }));

      const evidence = await prisma.operationalEvidenceRecord.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          templateId: template.id,
          templateStableKey: template.stableKey,
          templateName: template.name,
          templateVersion: template.version,
          purposeType: template.purposeType,
          requirementKey: `req-${cuidLike()}`,
          scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
          operationalDate: new Date(),
          unitId: fx.unit.id,
          assetId: asset.id,
          status: "COMPLETED",
          occurredAt: new Date(),
          recordedAt: new Date(),
          recordedOnline: true,
          templateSnapshotJson: { fields: [] },
        },
      });

      await linkEvidenceToIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        issueId: first.issue.id,
        evidenceRecordId: evidence.id,
      });
      const links = await prisma.assetIssueEvidenceLink.findMany({
        where: { issueId: first.issue.id },
      });
      assert.equal(links.length, 1);

      const supervisor = fx.supervisorUser
        ? session({
            facilityId: fx.facility.id,
            role: "SUPERVISOR",
            uid: fx.supervisorUser.id,
            primaryDepartmentId: fx.dietary.id,
          })
        : fx.supervisorEmployee
          ? session({
              facilityId: fx.facility.id,
              role: "SUPERVISOR",
              uid: fx.supervisorEmployee.id,
              authKind: "employee",
              authMethod: "QUICK_PIN",
              primaryDepartmentId: fx.dietary.id,
              name: "Supervisor Employee",
            })
          : mgr;

      await triageIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        issueId: first.issue.id,
        triageNote: "Needs repair",
      });
      await resolveIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        issueId: first.issue.id,
        resolutionReason: "Temporary fix",
      });
      const resolved = await prisma.assetIssue.findUniqueOrThrow({ where: { id: first.issue.id } });
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(resolved.workOrderId, null);

      await reopenIssue(supervisor, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        issueId: first.issue.id,
      });
      const reopened = await prisma.assetIssue.findUniqueOrThrow({ where: { id: first.issue.id } });
      assert.equal(reopened.status, "REPORTED");

      // Cross-scope: wrong unit without override
      await assert.rejects(
        () =>
          reportAssetIssue(staff, {
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            assetId: asset.id,
            unitId: cuidLike(),
            summary: "Wrong unit",
            description: "Should fail unit scope",
            observedAt: new Date(),
          }),
        /unit scope|Unit not found/i,
      );
    } finally {
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase10a sql: work order from issue direct vendor lifecycle return to service",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;
    process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });

      const asset = await createAsset(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unit.id,
        name: "WO Asset",
        equipmentType: "Oven",
      });

      const reported = await reportAssetIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        unitId: fx.unit.id,
        summary: "Oven not heating",
        description: "Element failed",
        observedAt: new Date(),
        operationalImpact: "EQUIPMENT_UNAVAILABLE",
        equipmentRemainsUsable: false,
        allowDuplicateOpen: true,
      });

      await changeAssetStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        toStatus: "OUT_OF_SERVICE",
        reason: "TRIAGE",
        note: "Oven unavailable pending repair",
        sourceIssueId: reported.issue.id,
      });

      const woFromIssue = await createWorkOrderFromIssue(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        issueId: reported.issue.id,
      });
      assert.ok(woFromIssue.id);
      const linked = await prisma.assetIssue.findUniqueOrThrow({
        where: { id: reported.issue.id },
      });
      assert.equal(linked.workOrderId, woFromIssue.id);

      const direct = await createWorkOrderDirect(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        unitId: fx.unit.id,
        assetId: asset.id,
        title: "Direct WO",
        description: "Manager-opened without prior Issue",
      });
      assert.ok(direct.id);

      if (fx.vendor) {
        await assignVendor(mgr, {
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          repairId: woFromIssue.id,
          vendorId: fx.vendor.id,
        });
      }
      await assert.rejects(
        () =>
          assignVendor(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            repairId: woFromIssue.id,
            vendorId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
          }),
        /Vendor not found/,
      );

      await updateWorkOrderStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        repairId: woFromIssue.id,
        toStatus: "IN_PROGRESS",
      });
      await updateWorkOrderStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        repairId: woFromIssue.id,
        toStatus: "WAITING_ON_VENDOR",
      });
      await updateWorkOrderStatus(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        repairId: woFromIssue.id,
        toStatus: "IN_PROGRESS",
      });
      await completeWorkOrder(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        repairId: woFromIssue.id,
        workPerformed: "Replaced element",
        resolution: "Heating restored",
      });

      const afterComplete = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(afterComplete.status, "OUT_OF_SERVICE");
      assert.notEqual(afterComplete.status, "OPERATIONAL");

      await markReturnToServiceReady(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        repairId: woFromIssue.id,
      });

      await returnAssetToService(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
        note: "Verified operational",
        sourceRepairId: woFromIssue.id,
      });
      const back = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
      assert.equal(back.status, "OPERATIONAL");

      const profile = await getAssetProfile(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        assetId: asset.id,
      });
      assert.ok(profile.history.some((h) => h.kind === "WORK_ORDER_OPENED" || h.kind === "STATUS_CHANGED" || h.title.length > 0));
    } finally {
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase10a sql: authority STAFF supervisor FA quick pin and flag disabled",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_ASSET_OPERATIONS_ENABLED;

    try {
      const fx = await loadFixture(prisma);

      const staffDec = decideAssetOperationsAuthority({
        flagEnabled: true,
        role: "STAFF",
        authMethod: "PASSWORD",
        sessionFacilityId: fx.facility.id,
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        departmentExists: true,
        departmentKey: "DIETARY",
        primaryDepartmentId: fx.dietary.id,
      });
      assert.equal(staffDec.canReportIssue, true);
      assert.equal(staffDec.canManageWorkOrders, false);
      assert.equal(staffDec.canManageAssets, false);
      assert.equal(staffDec.canViewVendorDetails, false);

      const pinMgr = decideAssetOperationsAuthority({
        flagEnabled: true,
        role: "MANAGER",
        authMethod: "QUICK_PIN",
        sessionFacilityId: fx.facility.id,
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        departmentExists: true,
        departmentKey: "DIETARY",
        primaryDepartmentId: fx.dietary.id,
      });
      assert.equal(pinMgr.canReportIssue, true);
      assert.equal(pinMgr.canManageAssets, false);
      assert.equal(pinMgr.canManageWorkOrders, false);

      const faDenied = decideAssetOperationsAuthority({
        flagEnabled: true,
        role: "FACILITY_ADMINISTRATOR",
        authMethod: "PASSWORD",
        sessionFacilityId: fx.facility.id,
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        departmentExists: true,
        departmentKey: "DIETARY",
        primaryDepartmentId: null,
      });
      assert.equal(faDenied.canManageAssets, false);
      assert.ok(faDenied.reason);

      const disabled = decideAssetOperationsAuthority({
        flagEnabled: false,
        role: "MANAGER",
        authMethod: "PASSWORD",
        sessionFacilityId: fx.facility.id,
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        departmentExists: true,
        departmentKey: "DIETARY",
        primaryDepartmentId: fx.dietary.id,
      });
      assert.equal(disabled.canReportIssue, false);

      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = "false";
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });
      await assert.rejects(
        () =>
          createAsset(mgr, {
            facilityId: fx.facility.id,
            departmentId: fx.dietary.id,
            unitId: fx.unit.id,
            name: "Flag Off",
            equipmentType: "Cooler",
          }),
        /not enabled|denied/i,
      );
    } finally {
      process.env.DIETARY_ASSET_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
