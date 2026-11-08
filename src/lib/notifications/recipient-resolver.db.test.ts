/**
 * SQL-backed N1B recipient resolution.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient, RepairPriority, RoleKey } from "@prisma/client";

import { createOrganizationMembership, createOrganizationOnlyUserAccount } from "@/lib/organization-membership";
import { acceptVendorHead, assignVendorHead } from "@/lib/department-authority/vendor-heads";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { evaluateAttentionPolicy } from "./policy-registry";
import {
  RECIPIENT_UNRESOLVED_CAUSE,
  resolveNotificationRecipients,
  type RecipientResolution,
} from "./recipient-resolver";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";
const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";

function tag() {
  return randomBytes(4).toString("hex");
}

test("recipient resolution follows authority and leaves missing responsibilities unresolved", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previous = process.env[FLAG];
  process.env[FLAG] = "true";

  const userIds: string[] = [];
  try {
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const administratorRole = await db.role.findUniqueOrThrow({
      where: { key: RoleKey.FACILITY_ADMINISTRATOR },
    });

    const parent = await db.organization.create({ data: { name: `N1B Parent ${suffix}` } });
    const vendorOrg = await db.organization.create({ data: { name: `N1B Vendor ${suffix}` } });
    const facility = await db.facility.create({
      data: {
        organizationId: parent.id,
        displayName: `N1B Terrace ${suffix}`,
        timezone: "America/New_York",
      },
    });
    const otherFacility = await db.facility.create({
      data: {
        organizationId: parent.id,
        displayName: `N1B Other ${suffix}`,
        timezone: "America/New_York",
      },
    });

    async function person(input: {
      facilityId: string;
      label: string;
      roleKey: RoleKey | null;
      departmentId?: string | null;
      linkUser?: boolean;
    }) {
      const user = await db.user.create({
        data: {
          email: `n1b-${input.label}-${suffix}@example.test`,
          displayName: `N1B ${input.label}`,
          facilityId: input.facilityId,
          roleId: managerRole.id,
          passwordHash: "hash",
          emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });
      userIds.push(user.id);
      const access = await db.userFacilityAccess.create({
        data: { userId: user.id, facilityId: input.facilityId, isActive: true },
      });
      if (input.roleKey) {
        await db.userFacilityRolePeriod.create({
          data: {
            userFacilityAccessId: access.id,
            roleKey: input.roleKey,
            startsAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });
      }
      const employee = await db.employee.create({
        data: {
          facilityId: input.facilityId,
          userId: input.linkUser === false ? null : user.id,
          firstName: "N1B",
          lastName: input.label,
          email: user.email,
          roleType: input.roleKey ?? RoleKey.STAFF,
          primaryDepartmentId: input.departmentId ?? null,
        },
      });
      return { user, employee };
    }

    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Food and Nutrition" },
    });
    const contracted = await db.department.create({
      data: { facilityId: facility.id, key: `CONTRACT_${suffix}`, name: "Food and Nutrition" },
    });
    const orphan = await db.department.create({
      data: { facilityId: facility.id, key: `ORPHAN_${suffix}`, name: "Unheaded" },
    });

    const administrator = await person({
      facilityId: facility.id,
      label: "admin",
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
      departmentId: dietary.id,
    });
    await db.user.update({
      where: { id: administrator.user.id },
      data: { roleId: managerRole.id },
    });
    const decoy = await db.user.create({
      data: {
        email: `n1b-decoy-${suffix}@example.test`,
        displayName: "N1B Decoy",
        facilityId: facility.id,
        roleId: administratorRole.id,
        passwordHash: "hash",
      },
    });
    userIds.push(decoy.id);

    const head = await person({
      facilityId: facility.id,
      label: "head",
      roleKey: RoleKey.MANAGER,
      departmentId: dietary.id,
    });
    await db.department.update({ where: { id: dietary.id }, data: { headEmployeeId: head.employee.id } });

    const legacyVendorHead = await person({
      facilityId: facility.id,
      label: "legacy-head",
      roleKey: RoleKey.MANAGER,
      departmentId: contracted.id,
    });
    await db.department.update({
      where: { id: contracted.id },
      data: { headEmployeeId: legacyVendorHead.employee.id },
    });

    const assignee = await person({
      facilityId: facility.id,
      label: "assignee",
      roleKey: RoleKey.STAFF,
      departmentId: dietary.id,
    });
    const unlinked = await db.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Pin",
        lastName: "Only",
        roleType: RoleKey.STAFF,
        primaryDepartmentId: dietary.id,
      },
    });
    const outsider = await person({
      facilityId: facility.id,
      label: "outsider",
      roleKey: RoleKey.STAFF,
    });
    const supervisor = await person({
      facilityId: facility.id,
      label: "supervisor",
      roleKey: RoleKey.SUPERVISOR,
      departmentId: dietary.id,
    });
    const staffManager = await person({
      facilityId: facility.id,
      label: "staff-manager",
      roleKey: RoleKey.SUPERVISOR,
      departmentId: orphan.id,
    });
    await db.departmentStaffManager.create({
      data: { departmentId: orphan.id, employeeId: staffManager.employee.id },
    });
    const otherAdministrator = await person({
      facilityId: otherFacility.id,
      label: "other-admin",
      roleKey: RoleKey.FACILITY_ADMINISTRATOR,
    });
    const otherEmployee = await person({
      facilityId: otherFacility.id,
      label: "other-employee",
      roleKey: RoleKey.STAFF,
    });

    const unit = await db.unit.create({
      data: { facilityId: facility.id, name: `Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    const repair = await db.repair.create({
      data: {
        repairCode: `N1B-${suffix}`,
        unitId: unit.id,
        title: "Oven",
        description: "Heat",
        priority: RepairPriority.EMERGENCY,
        assignedEmployeeId: assignee.employee.id,
        responsibleDepartmentId: dietary.id,
      },
    });
    const asset = await db.asset.create({
      data: {
        assetCode: `N1B-ASSET-${suffix}`,
        name: "Oven",
        equipmentType: "COOKING",
        unitId: unit.id,
        departmentId: dietary.id,
      },
    });
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: supervisor.employee.id,
        unitId: unit.id,
        serviceDate: new Date("2026-10-29T00:00:00.000Z"),
        roleKey: "ON_CALL_COVERAGE",
        roleLabel: "On-Call Coverage",
      },
    });

    const relationship = await db.departmentOperatorRelationship.create({
      data: {
        departmentId: contracted.id,
        organizationId: vendorOrg.id,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const vendorAdmin = await createOrganizationOnlyUserAccount(db, {
      email: `n1b-vendor-admin-${suffix}@example.test`,
      displayName: "N1B Vendor Admin",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const vendorHead = await createOrganizationOnlyUserAccount(db, {
      email: `n1b-vendor-head-${suffix}@example.test`,
      displayName: "N1B Vendor Head",
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    userIds.push(vendorAdmin.id, vendorHead.id);
    await createOrganizationMembership(db, {
      userId: vendorAdmin.id,
      organizationId: vendorOrg.id,
      role: "ORG_ADMIN",
    });
    await createOrganizationMembership(db, {
      userId: vendorHead.id,
      organizationId: vendorOrg.id,
      role: "ORG_MEMBER",
    });
    const pendingHead = await assignVendorHead(db, {
      actorUserId: vendorAdmin.id,
      organizationId: vendorOrg.id,
      departmentId: contracted.id,
      assigneeUserId: vendorHead.id,
    });

    async function attentionCount() {
      const facilityIds = [facility.id, otherFacility.id];
      const [notifications, outbox, recipients, deliveries] = await Promise.all([
        db.notification.count({ where: { facilityId: { in: facilityIds } } }),
        db.notificationOutbox.count({ where: { facilityId: { in: facilityIds } } }),
        db.notificationRecipient.count({
          where: { notification: { facilityId: { in: facilityIds } } },
        }),
        db.notificationDelivery.count({
          where: {
            notificationRecipient: { notification: { facilityId: { in: facilityIds } } },
          },
        }),
      ]);
      return { notifications, outbox, recipients, deliveries };
    }

    const before = await attentionCount();
    const ids = (result: RecipientResolution) => result.resolved.map((row) => row.userId);

    const assigneeResult = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
      assigneeEmployeeId: assignee.employee.id,
    });
    assert.deepEqual(ids(assigneeResult), [assignee.user.id]);
    assert.equal(
      assigneeResult.resolved[0]?.explanation,
      "You received this because this work is assigned to you.",
    );
    assert.equal(assigneeResult.unresolved.length, 0);

    const unlinkedWithAdmin = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE", "FACILITY_ADMIN"],
      assigneeEmployeeId: unlinked.id,
    });
    assert.deepEqual(ids(unlinkedWithAdmin), [administrator.user.id]);
    assert.equal(unlinkedWithAdmin.resolved[0]?.explanation, "You received this because you are the Facility Administrator.");
    assert.deepEqual(unlinkedWithAdmin.unresolved, [
      {
        reason: "CURRENT_ASSIGNEE",
        source: "reason",
        cause: RECIPIENT_UNRESOLVED_CAUSE.employeeNotLinked,
      },
    ]);
    assert.equal(ids(unlinkedWithAdmin).includes(decoy.id), false);

    const missingAssignee = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
    });
    assert.equal(missingAssignee.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.assigneeNotProvided);

    const crossFacilityEmployee = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
      assigneeEmployeeId: otherEmployee.employee.id,
    });
    assert.equal(crossFacilityEmployee.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.assigneeNotInFacility);

    const crossFacilityUser = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
      assigneeEmployeeId: (
        await db.employee.create({
          data: {
            facilityId: facility.id,
            userId: otherEmployee.user.id,
            firstName: "Cross",
            lastName: "Grant",
            roleType: RoleKey.STAFF,
            primaryDepartmentId: dietary.id,
          },
        })
      ).id,
    });
    assert.equal(crossFacilityUser.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.facilityAccessDenied);

    const deniedDepartment = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
      assigneeEmployeeId: outsider.employee.id,
    });
    assert.equal(deniedDepartment.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.departmentAccessDenied);

    const onDuty = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_DUTY_SUPERVISOR"],
    });
    assert.deepEqual(onDuty.resolved, []);
    assert.equal(onDuty.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityNotAvailable);
    assert.equal(ids(onDuty).includes(supervisor.user.id), false);
    assert.equal("explanation" in (onDuty.unresolved[0] ?? {}), false);

    const onCall = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_CALL_RESPONDER"],
    });
    assert.equal(onCall.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.onCallResponsibilityNotAvailable);
    assert.equal(ids(onCall).includes(supervisor.user.id), false);

    const escalation = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ESCALATION_TARGET"],
    });
    assert.equal(escalation.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.escalationPolicyNotPublished);

    const manager = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["DEPARTMENT_MANAGER", "DEPARTMENT_MANAGER"],
    });
    assert.deepEqual(ids(manager), [head.user.id]);
    assert.equal(
      manager.resolved[0]?.explanation,
      "You received this because you are the Department Manager for Food and Nutrition.",
    );

    const orphanManager = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: orphan.id,
      audience: "floor",
      reasons: ["DEPARTMENT_MANAGER"],
    });
    assert.deepEqual(orphanManager.resolved, []);
    assert.equal(orphanManager.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.departmentHeadNotAssigned);
    assert.equal(ids(orphanManager).includes(staffManager.user.id), false);

    const assetOwner = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ASSET_OWNER"],
      assetId: asset.id,
    });
    assert.deepEqual(assetOwner.resolved, []);
    assert.equal(assetOwner.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.assetOwnerIsOrganization);
    assert.equal(ids(assetOwner).includes(head.user.id), false);

    const otherAsset = await resolveNotificationRecipients(db, {
      facilityId: otherFacility.id,
      audience: "floor",
      reasons: ["ASSET_OWNER"],
      assetId: asset.id,
    });
    assert.equal(otherAsset.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.assetNotInFacility);

    const workOrder = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["WORK_ORDER_ASSIGNEE"],
      repairId: repair.id,
    });
    assert.deepEqual(ids(workOrder), [assignee.user.id]);
    assert.equal(
      workOrder.resolved[0]?.explanation,
      "You received this because this Work Order is assigned to you.",
    );
    assert.equal("priority" in workOrder, false);
    assert.equal("priority" in (workOrder.resolved[0] ?? {}), false);

    const otherWorkOrder = await resolveNotificationRecipients(db, {
      facilityId: otherFacility.id,
      audience: "floor",
      reasons: ["WORK_ORDER_ASSIGNEE"],
      repairId: repair.id,
    });
    assert.equal(otherWorkOrder.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.workOrderNotInFacility);
    assert.equal(ids(otherWorkOrder).includes(assignee.user.id), false);

    const mismatchedWorkOrder = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: orphan.id,
      audience: "floor",
      reasons: ["WORK_ORDER_ASSIGNEE"],
      repairId: repair.id,
    });
    assert.equal(
      mismatchedWorkOrder.unresolved[0]?.cause,
      RECIPIENT_UNRESOLVED_CAUSE.workOrderDepartmentMismatch,
    );

    const seat = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["FACILITY_ADMIN", "FACILITY_ADMIN"],
    });
    assert.deepEqual(ids(seat), [administrator.user.id]);
    assert.equal(ids(seat).includes(decoy.id), false);
    assert.equal(ids(seat).includes(otherAdministrator.user.id), false);

    const pendingVendor = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: contracted.id,
      audience: "floor",
      reasons: ["DEPARTMENT_MANAGER"],
    });
    assert.deepEqual(pendingVendor.resolved, []);
    assert.equal(pendingVendor.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.vendorHeadNotAccepted);
    assert.equal(ids(pendingVendor).includes(legacyVendorHead.user.id), false);

    await acceptVendorHead(db, { actorUserId: vendorHead.id, assignmentId: pendingHead.id });

    const vendorManager = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: contracted.id,
      audience: "floor",
      reasons: ["DEPARTMENT_MANAGER"],
    });
    assert.deepEqual(ids(vendorManager), [vendorHead.id]);
    assert.equal(
      vendorManager.resolved[0]?.explanation,
      "You received this because you are the Department Manager for Food and Nutrition.",
    );
    assert.equal(ids(vendorManager).includes(legacyVendorHead.user.id), false);

    const vendorFloorAdmin = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: contracted.id,
      audience: "floor",
      reasons: ["FACILITY_ADMIN"],
    });
    assert.deepEqual(vendorFloorAdmin.resolved, []);
    assert.equal(
      vendorFloorAdmin.unresolved[0]?.cause,
      RECIPIENT_UNRESOLVED_CAUSE.facilityAdministratorNotAFloorRecipient,
    );

    const publication = evaluateAttentionPolicy({ eventType: "publication.failed" });
    assert.equal(publication.outcome, "notify");
    if (publication.outcome === "notify") {
      const published = await resolveNotificationRecipients(db, {
        facilityId: facility.id,
        departmentId: contracted.id,
        audience: publication.audience,
        reasons: publication.recipientReasons,
      });
      assert.deepEqual(
        published.resolved.map((row) => row.userId).sort(),
        [administrator.user.id, vendorHead.id].sort(),
      );
      assert.equal(ids(published).includes(legacyVendorHead.user.id), false);
    }

    const coverage = evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "active" },
    });
    assert.equal(coverage.outcome, "notify");
    if (coverage.outcome === "notify") {
      const covered = await resolveNotificationRecipients(db, {
        facilityId: facility.id,
        departmentId: dietary.id,
        audience: coverage.audience,
        reasons: coverage.recipientReasons,
      });
      assert.deepEqual(covered.resolved, []);
      assert.equal(covered.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.onDutyResponsibilityNotAvailable);
    }

    const syncActor = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["ON_DUTY_SUPERVISOR"],
      syncActorUserId: assignee.user.id,
    });
    assert.deepEqual(syncActor.namedUsers, [
      {
        userId: assignee.user.id,
        source: "sync_actor",
        explanation: "You received this because this synchronization conflict is yours to resolve.",
      },
    ]);
    assert.equal(syncActor.resolved.length, 0);
    const foreignActor = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: [],
      syncActorUserId: otherEmployee.user.id,
    });
    assert.deepEqual(foreignActor.namedUsers, []);
    assert.equal(foreignActor.unresolved[0]?.cause, RECIPIENT_UNRESOLVED_CAUSE.facilityAccessDenied);
    assert.equal(foreignActor.unresolved[0]?.reason, null);

    process.env[FLAG] = "false";
    const enforcementOff = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      audience: "floor",
      reasons: ["CURRENT_ASSIGNEE"],
      assigneeEmployeeId: outsider.employee.id,
    });
    assert.deepEqual(ids(enforcementOff), [outsider.user.id]);
    const vendorWithoutEnforcement = await resolveNotificationRecipients(db, {
      facilityId: facility.id,
      departmentId: contracted.id,
      audience: "floor",
      reasons: ["DEPARTMENT_MANAGER"],
    });
    assert.deepEqual(ids(vendorWithoutEnforcement), [legacyVendorHead.user.id]);

    assert.deepEqual(await attentionCount(), before);
    assert.equal(relationship.organizationId, vendorOrg.id);
  } finally {
    if (previous === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previous;
    await db.repair.deleteMany({ where: { repairCode: { contains: suffix } } });
    await db.asset.deleteMany({ where: { assetCode: { contains: suffix } } });
    await db.operationalAssignment.deleteMany({
      where: { facility: { displayName: { contains: suffix } } },
    });
    await db.department.updateMany({
      where: { facility: { displayName: { contains: suffix } } },
      data: { headEmployeeId: null },
    });
    await db.employee.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.departmentVendorHeadAssignment.deleteMany({
      where: { department: { facility: { displayName: { contains: suffix } } } },
    });
    await db.departmentOperatorRelationship.deleteMany({
      where: { department: { facility: { displayName: { contains: suffix } } } },
    });
    await db.department.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.unit.deleteMany({ where: { facility: { displayName: { contains: suffix } } } });
    await db.userOrganizationRolePeriod.deleteMany({
      where: { membership: { organization: { name: { contains: suffix } } } },
    });
    await db.userOrganizationMembership.deleteMany({
      where: { organization: { name: { contains: suffix } } },
    });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.facility.deleteMany({ where: { displayName: { contains: suffix } } });
    await db.organization.deleteMany({ where: { name: { contains: suffix } } });
    await db.$disconnect();
  }
});
