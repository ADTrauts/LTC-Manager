import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { requireAssignmentEligibility, recordAssignmentEligibilityOverride } from "@/lib/employee-operational-qualifications/assignment-eligibility";
import { replaceEmployeeOperationalQualifications } from "@/lib/employee-operational-qualifications/replace";
import { applyAssignmentTemplate } from "./apply-assignment-template";
import { buildDietaryCoverageSummary } from "./build-coverage-summary";
import { loadAssignmentTemplatePreview } from "./load-assignment-template-preview";
import { requireAssignmentLocationScope, resolveAssignmentLocationWrites } from "./location-scope";
import type { TemplatePreviewPosition } from "./template-types";

const url = process.env.VERIFY_DATABASE_URL;
if (url) {
  assertDisposableDatabaseUrl(url);
  if (url !== process.env.DATABASE_URL) throw new Error("Assignment tests require matching disposable database URLs.");
}

test("canonical Assignment eligibility and published Space Coverage", { skip: url ? false : "set VERIFY_DATABASE_URL" }, async t => {
  const tag = randomBytes(5).toString("hex");
  try {
    const organization = await prisma.organization.create({ data: { name: `Assignment ${tag}` } });
    const facility = await prisma.facility.create({ data: { organizationId: organization.id, displayName: `Assignment ${tag}`, timezone: "America/New_York" } });
    const foreign = await prisma.facility.create({ data: { organizationId: organization.id, displayName: `Foreign ${tag}` } });
    const department = await prisma.department.create({ data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition" } });
    const evs = await prisma.department.create({ data: { facilityId: facility.id, key: "EVS", name: "Environmental Services" } });
    const unit = await prisma.unit.create({ data: { facilityId: facility.id, name: "Assigned neighborhood", unitType: "SERVERY", hierarchyRole: "NEIGHBORHOOD" } });
    const unrelatedUnit = await prisma.unit.create({ data: { facilityId: facility.id, name: "Unrelated neighborhood", unitType: "SERVERY", hierarchyRole: "NEIGHBORHOOD" } });
    const target = await prisma.unitSpace.create({ data: { facilityId: facility.id, unitId: unit.id, name: "Explicit Space", spaceType: "SERVICE_AREA", responsibilities: { create: { departmentId: department.id } } } });
    const sibling = await prisma.unitSpace.create({ data: { facilityId: facility.id, unitId: unit.id, name: "Sibling Space", spaceType: "SERVICE_AREA", responsibilities: { create: { departmentId: department.id } } } });
    const employee = await prisma.employee.create({ data: { facilityId: facility.id, primaryDepartmentId: department.id, roleType: "STAFF", firstName: "Qualified", lastName: tag } });
    const unqualified = await prisma.employee.create({ data: { facilityId: facility.id, primaryDepartmentId: department.id, roleType: "STAFF", firstName: "Unqualified", lastName: tag } });
    const wrongDepartment = await prisma.employee.create({ data: { facilityId: facility.id, primaryDepartmentId: evs.id, roleType: "STAFF", firstName: "Other", lastName: tag } });
    const foreignEmployee = await prisma.employee.create({ data: { facilityId: foreign.id, roleType: "STAFF", firstName: "Foreign", lastName: tag } });
    const eligibility = { facilityId: facility.id, departmentId: department.id, employeeId: employee.id, roleKey: "COOK", canOverride: false };

    await t.test("titles and membership do not grant eligibility; explicit qualifications do", async () => {
      await assert.rejects(requireAssignmentEligibility(prisma, eligibility), /not eligible/);
      await replaceEmployeeOperationalQualifications(prisma, { ...eligibility, roleKeys: ["COOK"] });
      assert.equal(await requireAssignmentEligibility(prisma, eligibility), null);
      await assert.rejects(requireAssignmentEligibility(prisma, { ...eligibility, roleKey: "WORK_ORDER_RESPONSE" }), /registry/);
      await assert.rejects(requireAssignmentEligibility(prisma, { ...eligibility, employeeId: wrongDepartment.id, canOverride: true, exceptionReason: "Override" }), /active employee/);
      await assert.rejects(requireAssignmentEligibility(prisma, { ...eligibility, employeeId: foreignEmployee.id, canOverride: true, exceptionReason: "Override" }), /active employee/);
    });
    await t.test("authorized eligibility exceptions append history without qualifying the employee", async () => {
      const input = { ...eligibility, employeeId: unqualified.id, exceptionReason: "Supervisor reviewed the temporary placement" };
      await assert.rejects(requireAssignmentEligibility(prisma, input), /authority/);
      const reason = await requireAssignmentEligibility(prisma, { ...input, canOverride: true });
      const assignment = await prisma.operationalAssignment.create({ data: { facilityId: facility.id, departmentId: department.id, employeeId: unqualified.id, unitId: unit.id, serviceDate: new Date("2026-11-11T00:00:00Z"), roleKey: "COOK", roleLabel: "Cook" } });
      for (const message of [reason, "Second explicit authorization"]) await recordAssignmentEligibilityOverride(prisma, { ...input, assignmentId: assignment.id, actorUserId: null, actorRole: "SUPERVISOR", reason: message });
      assert.equal(await prisma.operationalAssignmentEvent.count({ where: { assignmentId: assignment.id, eventType: "OVERRIDE" } }), 2);
      assert.equal(await prisma.employeeOperationalRoleQualification.count({ where: { employeeId: unqualified.id } }), 0);
    });
    await t.test("location writes require active responsible places in this Facility", async () => {
      const scope = { facilityId: facility.id, departmentId: department.id, unitId: unit.id, spaceIds: [] };
      await requireAssignmentLocationScope(prisma, scope);
      await assert.rejects(requireAssignmentLocationScope(prisma, { ...scope, unitId: null }), /Choose a Unit/);
      await assert.rejects(requireAssignmentLocationScope(prisma, { ...scope, unitId: unrelatedUnit.id }), /responsible/);
      await assert.rejects(resolveAssignmentLocationWrites(prisma, { ...scope, departmentId: evs.id, unitSpaceIds: [target.id] }), /not assigned/);
      await assert.rejects(resolveAssignmentLocationWrites(prisma, { ...scope, facilityId: foreign.id, unitSpaceIds: [target.id] }), /not found/);
      await prisma.unit.update({ where: { id: unit.id }, data: { isActive: false } });
      await assert.rejects(resolveAssignmentLocationWrites(prisma, { ...scope, unitSpaceIds: [target.id] }), /inactive/);
      await prisma.unit.update({ where: { id: unit.id }, data: { isActive: true } });
    });

    const template = await prisma.operationalAssignmentTemplate.create({ data: { facilityId: facility.id, departmentId: department.id, stableKey: tag, name: "Published Space need", status: "PUBLISHED", effectiveFrom: new Date("2026-11-10T00:00:00Z"), items: { create: { roleKey: "COOK", roleLabel: "Stale title is not authority", spaceId: target.id, startsAtLocal: "07:00", endsAtLocal: "15:00", requiredCount: 2, notes: "Prepare the service station and record completion." } } }, include: { items: true } });
    const position: TemplatePreviewPosition = { itemId: template.items[0].id, roleKey: "WORK_ORDER_RESPONSE", roleLabel: "Forged", unitId: unrelatedUnit.id, unitName: null, startsAtLocal: null, endsAtLocal: null, notes: null, positionIndex: 0, assignedEmployeeId: null, assignedEmployeeName: null, existingAssignmentId: null, suggestedEmployeeId: employee.id, suggestedEmployeeName: null, suggestedReason: null };
    const apply = (positions = [position], serviceDate = "2026-11-10", departmentId = department.id) => applyAssignmentTemplate({ facilityId: facility.id, departmentId, departmentKey: "DIETARY", serviceDate, positions, createdByUserId: null });
    await t.test("application rejects draft, future, foreign Department and unqualified placement", async () => {
      assert.equal((await apply([position], "2026-11-09")).created, 0);
      assert.equal((await apply([position], "2026-11-10", evs.id)).created, 0);
      assert.equal((await apply([{ ...position, suggestedEmployeeId: unqualified.id }])).created, 0);
      await prisma.operationalAssignmentTemplate.update({ where: { id: template.id }, data: { status: "DRAFT" } });
      assert.equal((await apply()).created, 0);
      await prisma.operationalAssignmentTemplate.update({ where: { id: template.id }, data: { status: "PUBLISHED" } });
    });
    await t.test("published apply persists the real role, Space, facility-local window and plan; retry is idempotent", async () => {
      const result = await apply(); assert.equal(result.created, 1, result.warnings.join(" "));
      assert.equal((await apply()).created, 0);
      const assignment = await prisma.operationalAssignment.findFirstOrThrow({ where: { employeeId: employee.id, templateItemId: template.items[0].id }, include: { locations: true, plan: true } });
      assert.equal(assignment.roleKey, "COOK"); assert.equal(assignment.roleLabel, "Cook");
      assert.deepEqual(assignment.locations.map(row => row.unitSpaceId), [target.id]);
      assert.equal(assignment.unitId, unit.id); assert.equal(assignment.notes, template.items[0].notes);
      assert.equal(assignment.startsAt?.toISOString(), "2026-11-10T12:00:00.000Z");
      assert.equal(assignment.endsAt?.toISOString(), "2026-11-10T20:00:00.000Z");
      assert.equal(assignment.plan?.status, "DRAFT");
      const summary = await buildDietaryCoverageSummary(prisma, { facilityId: facility.id, departmentId: department.id, serviceDateKey: "2026-11-10", planStatus: "CONFIRMED", assignments: [{ id: assignment.id, unitId: assignment.unitId, unitName: unit.name, roleKey: assignment.roleKey, status: assignment.status, startsAt: assignment.startsAt, endsAt: assignment.endsAt, coveredSpaceIds: assignment.locations.map(row => row.unitSpaceId) }], scheduledEmployeeIds: [employee.id], assignedEmployeeIds: [employee.id], callOffEmployeeIds: [], facilityTimezone: "America/New_York" });
      assert.equal(summary.rows.length, 1); assert.equal(summary.rows[0].spaceId, target.id);
      assert.equal(summary.rows[0].filledCount, 1); assert.equal(summary.rows[0].state, "AT_RISK");
      assert(!summary.rows.some(row => row.spaceId === sibling.id));
      const preview = await loadAssignmentTemplatePreview({ templateId: template.id, facilityId: facility.id, departmentId: evs.id, serviceDate: "2026-11-10" }, [], []);
      assert.equal(preview.positions.length, 0);
    });
  } finally { await prisma.$disconnect(); }
});
