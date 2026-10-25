/**
 * LEG-02 proofs on a disposable migrated database.
 * A facility-owned form is built, installed, filled, and invisible elsewhere.
 * A Plant work order closes against that Catalog form, and a supervisor can waive it.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  addWorkOrderLabor,
  addWorkOrderRecordRequirement,
  completeWorkOrder,
  createAsset,
  createWorkOrderFromIssue,
  reportIssue,
  satisfyWorkOrderRecordRequirement,
  waiveWorkOrderRecordRequirement,
} from "@/lib/asset-operations";
import type { FacilitySession } from "@/lib/auth";
import { createLogAttachment } from "@/lib/canonical-logs/attachment-service";
import { resolveLogRequirementsForAttachment } from "@/lib/canonical-logs/resolve-log-requirements";
import { performCanonicalLogSubmission } from "@/lib/canonical-logs/submit-canonical-log";
import {
  createFacilityCatalogForm,
  publishFacilityCatalogForm,
  publishedCatalogFormsAtFacility,
} from "@/lib/department-authority/catalog-forms";
const databaseUrl =
  process.env.LEG02_PROOF_DATABASE_URL ||
  process.env.VERIFY_DATABASE_URL ||
  process.env.ASSET_OPERATIONS_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run the LEG-02 proofs";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function session(
  overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId" | "role" | "uid">,
): FacilitySession {
  return {
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    name: overrides.name ?? "LEG-02 proof",
    email: overrides.email ?? "leg02-proof@example.com",
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
    ...overrides,
  } as FacilitySession;
}

test(
  "LEG-02 proof: facility form is filled and hidden, and a Plant work order closes on that form",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const previousCanonical = process.env.CANONICAL_LOGS_ENABLED;
    const previousPlant = process.env.PLANT_OPERATIONS_ENABLED;
    process.env.CANONICAL_LOGS_ENABLED = "true";
    process.env.PLANT_OPERATIONS_ENABLED = "true";
    const suffix = cuidLike().slice(-8);

    try {
      const role = await prisma.role.upsert({
        where: { key: "MANAGER" },
        update: {},
        create: { id: cuidLike(), key: "MANAGER", name: "Manager" },
      });
      const org = await prisma.organization.create({
        data: { name: `LEG-02 proof ${suffix}` },
      });
      const home = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `LEG-02 home ${suffix}`,
          timezone: "America/New_York",
        },
      });
      const other = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `LEG-02 other ${suffix}`,
          timezone: "America/New_York",
        },
      });
      const plant = await prisma.department.create({
        data: { facilityId: home.id, key: "PLANT", name: "Plant Operations" },
      });
      const otherPlant = await prisma.department.create({
        data: { facilityId: other.id, key: "PLANT", name: "Plant Operations" },
      });
      const supervisorUser = await prisma.user.create({
        data: {
          email: `leg02-sup-${suffix}@example.com`,
          displayName: "LEG-02 Supervisor",
          facilityId: home.id,
          roleId: role.id,
          primaryDepartmentId: plant.id,
          emailVerifiedAt: new Date(),
        },
      });
      const head = await prisma.employee.create({
        data: {
          facilityId: home.id,
          firstName: "Plant",
          lastName: "Head",
          roleType: "MANAGER",
          status: "ACTIVE",
          primaryDepartmentId: plant.id,
          userId: supervisorUser.id,
          employeeDepartments: { create: { departmentId: plant.id, roleType: "MANAGER" } },
        },
      });
      await prisma.department.update({
        where: { id: plant.id },
        data: { headEmployeeId: head.id },
      });
      const technician = await prisma.employee.create({
        data: {
          facilityId: home.id,
          firstName: "Plant",
          lastName: "Tech",
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: plant.id,
        },
      });
      const unit = await prisma.unit.create({
        data: {
          facilityId: home.id,
          name: `Mechanical ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const space = await prisma.unitSpace.create({
        data: {
          facilityId: home.id,
          unitId: unit.id,
          name: `Boiler room ${suffix}`,
          spaceType: "MECHANICAL",
        },
      });
      const supervisor = session({
        uid: supervisorUser.id,
        facilityId: home.id,
        role: "MANAGER",
        primaryDepartmentId: plant.id,
        name: "LEG-02 Supervisor",
      });

      const created = await createFacilityCatalogForm(prisma, {
        session: supervisor,
        facilityId: home.id,
        departmentId: plant.id,
        name: `Boiler check ${suffix}`,
        fieldLabel: "Gauge reading",
      });
      await publishFacilityCatalogForm(prisma, {
        session: supervisor,
        facilityId: home.id,
        departmentId: plant.id,
        definitionId: created.definitionId,
      });
      const form = await prisma.catalogLogDefinition.findUniqueOrThrow({
        where: { id: created.definitionId },
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      });
      assert.equal(form.status, "PUBLISHED");
      assert.equal(form.ownerKind, "FACILITY");
      assert.equal(form.ownerFacilityId, home.id);

      const visibleAtHome = await publishedCatalogFormsAtFacility(prisma, {
        facilityId: home.id,
        departmentId: plant.id,
      });
      const visibleElsewhere = await publishedCatalogFormsAtFacility(prisma, {
        facilityId: other.id,
        departmentId: otherPlant.id,
      });
      assert.equal(
        visibleAtHome.some((row) => row.id === form.id),
        true,
      );
      assert.equal(
        visibleElsewhere.some((row) => row.stableKey === form.stableKey),
        false,
      );

      const asset = await createAsset(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        unitId: unit.id,
        spaceId: space.id,
        name: `Boiler ${suffix}`,
        equipmentType: "Boiler",
        client: prisma,
      });
      const operationalDateKey = "2026-10-23";
      const attachment = await createLogAttachment(prisma, {
        facilityId: home.id,
        departmentId: plant.id,
        catalogDefinitionId: form.id,
        target: { kind: "ASSET", assetId: asset.id },
        timingMode: "DAILY_WINDOWS",
        dailyWindows: [{ label: "Day", startLocal: "00:00", endLocal: "23:59" }],
        effectiveFromKey: operationalDateKey,
      });
      const due = resolveLogRequirementsForAttachment({
        attachment: {
          ...attachment,
          catalogDefinition: {
            id: form.id,
            name: form.name,
            purposeType: form.purposeType,
            instructions: form.instructions,
            status: form.status,
            fields: form.fields,
          },
        },
        operationalDateKey,
        now: new Date("2026-10-23T16:00:00.000Z"),
        facilityTimezone: "America/New_York",
        publishedCycles: [],
        existingRecords: [],
      });
      assert.equal(due.length, 1);
      const record = await performCanonicalLogSubmission(
        { userId: supervisorUser.id, label: "LEG-02 Supervisor", employeeId: head.id },
        {
          facilityId: home.id,
          departmentId: plant.id,
          logAttachmentId: attachment.id,
          requirementKey: due[0]!.requirementKey,
          operationalDateKey,
          windowStartLocal: due[0]!.windowStartLocal,
          windowEndLocal: due[0]!.windowEndLocal,
          cycleLabel: due[0]!.cycleLabel,
          occurredAt: new Date("2026-10-23T16:05:00.000Z"),
          values: [{ fieldKey: form.fields[0]!.fieldKey, valueText: "120" }],
          clientCommandId: `leg02-${suffix}`,
          client: prisma,
        },
      );
      assert.equal(record.catalogDefinitionId, form.id);
      assert.equal(record.assetId, asset.id);
      assert.equal(record.status, "COMPLETED");

      const issue = await reportIssue(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        unitId: unit.id,
        spaceId: space.id,
        assetId: asset.id,
        summary: `Boiler down ${suffix}`,
        description: "Gauge is off",
        observedAt: new Date("2026-10-23T16:10:00.000Z"),
        client: prisma,
      });
      const satisfiedOrder = await createWorkOrderFromIssue(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        issueId: issue.issue.id,
        title: `Repair ${suffix}`,
        assignedEmployeeId: technician.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: satisfiedOrder.id,
        minutes: 20,
        employeeId: technician.id,
        client: prisma,
      });
      await addWorkOrderRecordRequirement(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: satisfiedOrder.id,
        catalogDefinitionId: form.id,
        client: prisma,
      });
      const satisfiedRequirement = await prisma.repairRecordRequirement.findFirstOrThrow({
        where: { repairId: satisfiedOrder.id },
      });
      assert.equal(satisfiedRequirement.catalogDefinitionId, form.id);
      assert.equal(satisfiedRequirement.templateId, null);
      await satisfyWorkOrderRecordRequirement(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: satisfiedOrder.id,
        requirementId: satisfiedRequirement.id,
        evidenceRecordId: record.id,
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: satisfiedOrder.id,
        workPerformed: "Gauge recorded and boiler restored",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const satisfiedRepair = await prisma.repair.findUniqueOrThrow({
        where: { id: satisfiedOrder.id },
      });
      assert.equal(satisfiedRepair.status, "COMPLETED");

      const waivedOrder = await createWorkOrderFromIssue(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        issueId: issue.issue.id,
        title: `Waiver ${suffix}`,
        assignedEmployeeId: technician.id,
        client: prisma,
      });
      await addWorkOrderLabor(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: waivedOrder.id,
        minutes: 10,
        employeeId: technician.id,
        client: prisma,
      });
      await addWorkOrderRecordRequirement(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: waivedOrder.id,
        catalogDefinitionId: form.id,
        client: prisma,
      });
      const waivedRequirement = await prisma.repairRecordRequirement.findFirstOrThrow({
        where: { repairId: waivedOrder.id },
      });
      const technicianSession = session({
        uid: technician.id,
        authKind: "employee",
        facilityId: home.id,
        role: "STAFF",
        primaryDepartmentId: plant.id,
        name: "Plant Tech",
      });
      await assert.rejects(
        () =>
          waiveWorkOrderRecordRequirement(technicianSession, {
            facilityId: home.id,
            departmentId: plant.id,
            repairId: waivedOrder.id,
            requirementId: waivedRequirement.id,
            waiveReason: "Cannot reach the gauge",
            client: prisma,
          }),
        /cannot waive/i,
      );
      await waiveWorkOrderRecordRequirement(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: waivedOrder.id,
        requirementId: waivedRequirement.id,
        waiveReason: "Gauge is behind a locked panel this shift",
        client: prisma,
      });
      await completeWorkOrder(supervisor, {
        facilityId: home.id,
        departmentId: plant.id,
        repairId: waivedOrder.id,
        workPerformed: "Closed with a supervisor waiver",
        assetConditionReview: "NO_CHANGE",
        client: prisma,
      });
      const waived = await prisma.repairRecordRequirement.findUniqueOrThrow({
        where: { id: waivedRequirement.id },
      });
      const waivedRepair = await prisma.repair.findUniqueOrThrow({ where: { id: waivedOrder.id } });
      assert.equal(waived.status, "WAIVED");
      assert.equal(waived.satisfiedByRecordId, null);
      assert.equal(waivedRepair.status, "COMPLETED");
    } finally {
      if (previousCanonical === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
      else process.env.CANONICAL_LOGS_ENABLED = previousCanonical;
      if (previousPlant === undefined) delete process.env.PLANT_OPERATIONS_ENABLED;
      else process.env.PLANT_OPERATIONS_ENABLED = previousPlant;
      await prisma.$disconnect();
    }
  },
);
