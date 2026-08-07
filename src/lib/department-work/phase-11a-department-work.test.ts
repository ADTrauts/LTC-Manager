/**
 * Phase 11A SQL-backed Department Work Plans tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL (disposable migrated DB only).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";

import {
  cancelOneOff,
  completeExplicit,
  createDraft,
  createOneOff,
  decideWorkAuthority,
  markNotRequired,
  publishWorkPlan,
  reassignOccurrence,
  reopenOccurrence,
  resolveWorkRequirements,
  retireWorkPlan,
  updateDraft,
} from "./index";
import type { WorkRequirement } from "./types";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set DEPARTMENT_WORK_TEST_DATABASE_URL to a disposable migrated database to run these";

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
  return {
    facility,
    dietary,
    unit,
    manager,
    staffEmployee,
    supervisorEmployee,
  };
}

function requirementFromPlan(opts: {
  planId: string;
  stableKey: string;
  version: number;
  itemId: string;
  itemKey: string;
  label: string;
  unitId: string;
  operationalDate: string;
}): WorkRequirement {
  const occurrenceKey = [
    "plan",
    opts.stableKey,
    String(opts.version),
    opts.itemKey,
    opts.operationalDate,
    opts.unitId,
    "",
    "",
    "00:00",
    "23:59",
    "",
  ].join("|");
  return {
    occurrenceKey,
    workPlanId: opts.planId,
    workPlanStableKey: opts.stableKey,
    workPlanVersion: opts.version,
    workPlanName: "Test Plan",
    workItemId: opts.itemId,
    workItemKey: opts.itemKey,
    label: opts.label,
    instructions: null,
    priority: "ROUTINE",
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: "00:00",
    windowEndLocal: "23:59",
    dueAt: null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: opts.unitId,
    unitName: null,
    spaceId: null,
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    state: "DUE",
    occurrenceId: null,
    occurrenceStatus: null,
    assignedEmployeeId: null,
    completedByLabel: null,
    completedAt: null,
    evidenceRecordId: null,
    sourceKind: "WORK_PLAN",
    sourceHref: null,
  };
}

test(
  "phase11a sql: ownership publish responsibility completion not-required reopen reassign one-off cross-facility",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.DIETARY_WORK_PLANS_ENABLED;
    process.env.DIETARY_WORK_PLANS_ENABLED = "true";

    try {
      const fx = await loadFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.dietary.id,
      });
      const actor = { userId: fx.manager.id, label: "Manager" };
      const operationalDate = "2026-08-06";

      // Ownership: NEW family, not Task.
      const draft = await createDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        actor,
        draft: {
          name: `Phase11A Plan ${cuidLike().slice(0, 8)}`,
          description: "SQL coverage",
          weekdays: [],
          applicabilities: [{ kind: "SPECIFIC_UNIT", unitId: fx.unit.id }],
          items: [
            {
              itemKey: "opening_check",
              label: "Opening check",
              displaySequence: 10,
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            },
          ],
        },
      });
      assert.equal(draft.status, "DRAFT");
      assert.ok(draft.stableKey);

      const published = await publishWorkPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        workPlanId: draft.id,
        actor,
      });
      assert.equal(published.status, "PUBLISHED");

      // Published immutable — update creates successor draft.
      const successor = await updateDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        workPlanId: published.id,
        actor,
        draft: {
          name: `${published.name} v2`,
          stableKey: published.stableKey,
          weekdays: [],
          applicabilities: [{ kind: "SPECIFIC_UNIT", unitId: fx.unit.id }],
          items: [
            {
              itemKey: "opening_check",
              label: "Opening check revised",
              displaySequence: 10,
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            },
          ],
        },
      });
      assert.equal(successor.status, "DRAFT");
      assert.equal(successor.stableKey, published.stableKey);
      assert.ok(successor.version > published.version);

      const item = published.items[0]!;
      const req = requirementFromPlan({
        planId: published.id,
        stableKey: published.stableKey,
        version: published.version,
        itemId: item.id,
        itemKey: item.itemKey,
        label: item.label,
        unitId: fx.unit.id,
        operationalDate,
      });

      // Completion idempotent by clientCommandId.
      const cmd = `cmd_${cuidLike()}`;
      const first = await completeExplicit(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        requirement: req,
        operationalDate,
        actor: { ...actor, employeeId: fx.staffEmployee?.id ?? null },
        clientCommandId: cmd,
        note: "done",
      });
      assert.equal(first.deduplicated, false);
      assert.equal(first.occurrence.status, "COMPLETED");

      const second = await completeExplicit(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        requirement: req,
        operationalDate,
        actor,
        clientCommandId: cmd,
      });
      assert.equal(second.deduplicated, true);
      assert.equal(second.occurrence.id, first.occurrence.id);

      await reopenOccurrence(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        occurrenceId: first.occurrence.id,
        actor,
      });
      const reopened = await prisma.departmentWorkOccurrence.findUniqueOrThrow({
        where: { id: first.occurrence.id },
      });
      assert.equal(reopened.status, "REOPENED");

      if (fx.supervisorEmployee) {
        await reassignOccurrence(mgr, {
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          requirement: { ...req, occurrenceId: first.occurrence.id },
          operationalDate,
          assignedEmployeeId: fx.supervisorEmployee.id,
          actor,
        });
        const reassigned = await prisma.departmentWorkOccurrence.findUniqueOrThrow({
          where: { id: first.occurrence.id },
        });
        assert.equal(reassigned.assignedEmployeeId, fx.supervisorEmployee.id);
      }

      await markNotRequired(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        requirement: req,
        operationalDate,
        actor,
        reason: "Unit closed",
      });
      const notRequired = await prisma.departmentWorkOccurrence.findUniqueOrThrow({
        where: { id: first.occurrence.id },
      });
      assert.equal(notRequired.status, "NOT_REQUIRED");

      const oneOff = await createOneOff(mgr, {
        work: {
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          operationalDate,
          unitId: fx.unit.id,
          title: "Ad-hoc tray count",
          instructions: "Count trays",
          assignedEmployeeId: fx.staffEmployee?.id ?? null,
        },
        actor,
      });
      assert.equal(oneOff.sourceKind, "ONE_OFF");
      assert.equal(oneOff.status, "OPEN");

      await cancelOneOff(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        occurrenceId: oneOff.id,
        actor,
        reason: "No longer needed",
      });
      const cancelled = await prisma.departmentWorkOccurrence.findUniqueOrThrow({
        where: { id: oneOff.id },
      });
      assert.equal(cancelled.status, "CANCELLED");

      // Cross-facility deny
      const foreign = decideWorkAuthority({
        flagEnabled: true,
        role: "MANAGER",
        authMethod: "PASSWORD",
        sessionFacilityId: fx.facility.id,
        facilityId: "other_facility",
        departmentId: fx.dietary.id,
        departmentExists: true,
        primaryDepartmentId: fx.dietary.id,
      });
      assert.equal(foreign.canManage, false);

      // Pure resolve still derives UNIT_SHARED for published plan with assignment
      const derived = resolveWorkRequirements({
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        operationalDateKey: operationalDate,
        now: new Date(`${operationalDate}T15:00:00.000Z`),
        facilityTimezone: "America/New_York",
        unitId: fx.unit.id,
        publishedPlans: [
          {
            id: published.id,
            stableKey: published.stableKey,
            version: published.version,
            name: published.name,
            status: "PUBLISHED",
            effectiveStartDate: null,
            effectiveEndDate: null,
            weekdays: [],
            applicabilities: [
              {
                kind: "SPECIFIC_UNIT",
                unitId: fx.unit.id,
                spaceId: null,
                spaceType: null,
                assetId: null,
                assetType: null,
              },
            ],
            items: published.items.map((i) => ({
              id: i.id,
              itemKey: i.itemKey,
              label: i.label,
              instructions: i.instructions,
              displaySequence: i.displaySequence,
              priority: i.priority,
              completionMode: i.completionMode,
              responsibilityMode: i.responsibilityMode,
              scheduleKind: i.scheduleKind,
              cycleStableKeys: i.cycleStableKeys,
              windowStartLocal: i.windowStartLocal,
              windowEndLocal: i.windowEndLocal,
              dueOffsetKind: i.dueOffsetKind,
              dueOffsetMinutes: i.dueOffsetMinutes,
              roleKeys: i.roleKeys,
              unitId: i.unitId,
              spaceId: i.spaceId,
              assetId: i.assetId,
              knowledgeArticleId: i.knowledgeArticleId,
              procedureTitleSnapshot: i.procedureTitleSnapshot,
              linkedTemplateStableKey: i.linkedTemplateStableKey,
              linkedTemplateId: i.linkedTemplateId,
              supervisorVisible: i.supervisorVisible,
            })),
          },
        ],
        publishedCycles: [],
        confirmedAssignments: [
          {
            employeeId: fx.staffEmployee?.id ?? "e1",
            unitId: fx.unit.id,
            roleKey: null,
          },
        ],
        existingOccurrences: [],
      });
      assert.ok(derived.some((r) => r.workItemKey === "opening_check"));

      await retireWorkPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        workPlanId: published.id,
        actor,
      });
      const retired = await prisma.departmentWorkPlan.findUniqueOrThrow({
        where: { id: published.id },
      });
      assert.equal(retired.status, "RETIRED");

      // Ensure Wave Task was not written
      const taskCount = await prisma.task.count({
        where: {
          facilityId: fx.facility.id,
          title: { contains: "Opening check" },
        },
      });
      assert.equal(taskCount, 0);
    } finally {
      if (prev === undefined) delete process.env.DIETARY_WORK_PLANS_ENABLED;
      else process.env.DIETARY_WORK_PLANS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
