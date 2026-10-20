/**
 * Phase 11B SQL-backed EVS operations tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL (same disposable wiring as Phase 11A).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, type SpaceType } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
import {
  completeExplicit,
  createDraft,
  createOneOff,
  publishWorkPlan,
  resolveWorkRequirements,
} from "@/lib/department-work";
import type { PublishedWorkPlanForResolve, WorkRequirement } from "@/lib/department-work/types";
import { processSyncCommand } from "@/lib/offline/process-sync-command";
import type { OfflineCommandEnvelope } from "@/lib/offline/types";
import { createDraft as createCycleDraft, publishCycle } from "@/lib/operational-cycles/cycle-service";
import { resolveEvidenceAuthority } from "@/lib/operational-evidence/evidence-authority";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set DEPARTMENT_WORK_TEST_DATABASE_URL to a disposable migrated database to run these";

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
    name: overrides.name ?? "EVS Test",
    email: overrides.email ?? "evs-test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as FacilitySession;
}

async function loadEvsFixture(prisma: PrismaClient) {
  const evs = await prisma.department.findFirst({
    where: { facilityId: "cmfacseed0000000000000001", key: "EVS", isActive: true },
    include: { facility: true },
  });
  assert.ok(evs, "EVS department required");
  const facility = evs.facility;
  assert.ok(facility);

  let unit = await prisma.unit.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      unitType: { in: ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE"] },
      departmentResponsibilities: { some: { departmentId: evs.id } },
    },
  });
  if (!unit) {
    unit = await prisma.unit.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        name: `EVS SQL Unit ${cuidLike().slice(-6)}`,
        unitType: "RESIDENT_AREA",
        isActive: true,
        displayOrder: 500,
        departmentResponsibilities: {
          create: [{ id: cuidLike(), departmentId: evs.id, kind: "PRIMARY" }],
        },
      },
    });
  } else {
    await prisma.unitDepartmentResponsibility.upsert({
      where: { unitId_departmentId: { unitId: unit.id, departmentId: evs.id } },
      update: { kind: "PRIMARY" },
      create: { id: cuidLike(), unitId: unit.id, departmentId: evs.id, kind: "PRIMARY" },
    });
  }

  const existingSpaces = await prisma.unitSpace.findMany({
    where: { unitId: unit.id, spaceType: "PATIENT_ROOM", isActive: true },
    select: { id: true, name: true, spaceType: true },
  });
  const spaces = [...existingSpaces];
  while (spaces.length < 3) {
    const created = await prisma.unitSpace.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        unitId: unit.id,
        name: `SQL Room ${spaces.length + 1}`,
        spaceType: "PATIENT_ROOM",
        roomNumber: `S${spaces.length + 1}`,
        isActive: true,
        sortOrder: 10 + spaces.length,
      },
      select: { id: true, name: true, spaceType: true },
    });
    spaces.push(created);
  }

  let manager =
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
        primaryDepartmentId: evs.id,
      },
      include: { role: { select: { key: true } } },
    }));

  if (!manager) {
    const managerRole =
      (await prisma.role.findFirst({ where: { key: "MANAGER" }, select: { id: true, key: true } })) ??
      (await prisma.role.findFirst({ where: { key: "GM" }, select: { id: true, key: true } }));
    assert.ok(managerRole, "MANAGER or GM role required to seed EVS SQL manager");
    const id = cuidLike();
    manager = await prisma.user.create({
      data: {
        id,
        email: `evs-sql-manager-${id}@example.com`,
        displayName: "EVS SQL Manager",
        // Suite never authenticates; only needs uid/role for sessions.
        passwordHash: "not-a-usable-hash",
        facilityId: facility.id,
        roleId: managerRole.id,
        isActive: true,
        primaryDepartmentId: evs.id,
      },
      include: { role: { select: { key: true } } },
    });
  }

  let staffEmployee = await prisma.employee.findFirst({
    where: {
      facilityId: facility.id,
      roleType: "STAFF",
      status: "ACTIVE",
      OR: [{ primaryDepartmentId: evs.id }, { primaryDepartmentId: null }],
    },
  });
  if (!staffEmployee) {
    staffEmployee = await prisma.employee.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        firstName: "EVS",
        lastName: `SQL Staff ${cuidLike().slice(-6)}`,
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: evs.id,
      },
    });
  } else if (!staffEmployee.primaryDepartmentId) {
    staffEmployee = await prisma.employee.update({
      where: { id: staffEmployee.id },
      data: { primaryDepartmentId: evs.id },
    });
  }

  return { facility, evs, unit, spaces, manager, staffEmployee };
}

function toPlanForResolve(published: {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  status: string;
  items: Array<{
    id: string;
    itemKey: string;
    label: string;
    instructions: string | null;
    displaySequence: number;
    priority: string;
    completionMode: string;
    responsibilityMode: string;
    scheduleKind: string;
    cycleStableKeys: string[];
    windowStartLocal: string | null;
    windowEndLocal: string | null;
    dueOffsetKind: string | null;
    dueOffsetMinutes: number | null;
    roleKeys: string[];
    unitId: string | null;
    spaceId: string | null;
    assetId: string | null;
    knowledgeArticleId: string | null;
    procedureTitleSnapshot: string | null;
    linkedTemplateStableKey: string | null;
    linkedTemplateId: string | null;
    supervisorVisible: boolean;
  }>;
  applicabilities: Array<{
    kind: string;
    unitId: string | null;
    spaceId: string | null;
    spaceType: string | null;
    assetId: string | null;
    assetType: string | null;
  }>;
}) : PublishedWorkPlanForResolve {
  return {
    id: published.id,
    stableKey: published.stableKey,
    version: published.version,
    name: published.name,
    status: "PUBLISHED",
    effectiveStartDate: null,
    effectiveEndDate: null,
    weekdays: [],
    applicabilities: published.applicabilities.map((a) => ({
      kind: a.kind as PublishedWorkPlanForResolve["applicabilities"][number]["kind"],
      unitId: a.unitId,
      spaceId: a.spaceId,
      spaceType: (a.spaceType as SpaceType | null) ?? null,
      assetId: a.assetId,
      assetType: a.assetType,
    })),
    items: published.items.map((i) => ({
      id: i.id,
      itemKey: i.itemKey,
      label: i.label,
      instructions: i.instructions,
      displaySequence: i.displaySequence,
      priority: i.priority as WorkRequirement["priority"],
      completionMode: i.completionMode as WorkRequirement["completionMode"],
      responsibilityMode: i.responsibilityMode as WorkRequirement["responsibilityMode"],
      scheduleKind: i.scheduleKind as WorkRequirement["scheduleKind"],
      cycleStableKeys: i.cycleStableKeys,
      windowStartLocal: i.windowStartLocal,
      windowEndLocal: i.windowEndLocal,
      dueOffsetKind: i.dueOffsetKind as PublishedWorkPlanForResolve["items"][number]["dueOffsetKind"],
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
  };
}

// DEVELOPMENT does not grant customer operation, even with the engine flag enabled.
// Direct SQL below represents retained pre-restriction history, never a product install
// or a customer creation path. Positive shared-owner SQL coverage lives in AVAILABLE
// Dietary/Plant suites; pure EVS expansion/timezone coverage remains in hermetic tests.
async function withEvsHistory(run: (prisma: PrismaClient, fx: Awaited<ReturnType<typeof loadEvsFixture>>, mgr: FacilitySession) => Promise<void>) {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previous = process.env.EVS_OPERATIONS_ENABLED;
  process.env.EVS_OPERATIONS_ENABLED = "true";
  try {
    const fx = await loadEvsFixture(prisma);
    const mgr = session({ facilityId: fx.facility.id, uid: fx.manager.id,
      role: fx.manager.role!.key as FacilitySession["role"], primaryDepartmentId: fx.evs.id });
    await run(prisma, fx, mgr);
  } finally {
    if (previous === undefined) delete process.env.EVS_OPERATIONS_ENABLED;
    else process.env.EVS_OPERATIONS_ENABLED = previous;
    await prisma.$disconnect();
  }
}

test("phase11b sql: historical SPACE_TYPE expansion survives; DEVELOPMENT blocks new Work and completion",
  { skip: skipReason }, async () => withEvsHistory(async (prisma, fx, mgr) => {
    const actor = { userId: fx.manager.id, label: "EVS Manager" };
    const draft = { name: `EVS history ${cuidLike()}`, weekdays: [],
      applicabilities: [{ kind: "SPACE_TYPE" as const, spaceType: "PATIENT_ROOM" as const }],
      items: [{ itemKey: "surfaces", label: "Clean high-touch surfaces", displaySequence: 10,
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE" as const }] };
    const before = await prisma.departmentWorkPlan.count({ where: { departmentId: fx.evs.id } });
    await assert.rejects(createDraft(mgr, { facilityId: fx.facility.id, departmentId: fx.evs.id,
      actor, client: prisma, draft }), /commercial access is unavailable/);
    assert.equal(await prisma.departmentWorkPlan.count({ where: { departmentId: fx.evs.id } }), before);
    const published = await prisma.departmentWorkPlan.create({ data: {
      facilityId: fx.facility.id, departmentId: fx.evs.id, stableKey: cuidLike(),
      name: draft.name, status: "PUBLISHED", publishedAt: new Date("2026-08-01T12:00:00Z"),
      items: { create: draft.items }, applicabilities: { create: draft.applicabilities },
    }, include: { items: true, applicabilities: true } });
    await assert.rejects(publishWorkPlan(mgr, { facilityId: fx.facility.id, departmentId: fx.evs.id,
      workPlanId: published.id, actor, client: prisma }), /commercial access is unavailable/);
    const derived = resolveWorkRequirements({ facilityId: fx.facility.id, departmentId: fx.evs.id,
      operationalDateKey: "2026-08-07", now: new Date("2026-08-07T15:00:00Z"),
      facilityTimezone: fx.facility.timezone || "America/New_York", unitId: fx.unit.id,
      spaces: fx.spaces.map(s => ({ ...s, unitId: fx.unit.id })),
      publishedPlans: [toPlanForResolve(published)], publishedCycles: [],
      confirmedAssignments: [{ employeeId: fx.staffEmployee.id, unitId: fx.unit.id, roleKey: null }],
      existingOccurrences: [] });
    assert.ok(new Set(derived.map(r => r.spaceId)).size >= 3);
    const target = derived.find(r => r.spaceId === fx.spaces[0]!.id)!;
    assert.ok(target);
    await assert.rejects(completeExplicit(mgr, { facilityId: fx.facility.id, departmentId: fx.evs.id,
      requirement: target, operationalDate: "2026-08-07", actor, client: prisma,
      clientCommandId: cuidLike() }), /commercial access is unavailable/);
    assert.equal(await prisma.departmentWorkOccurrence.count({ where: { workPlanId: published.id } }), 0);
    const history = await prisma.departmentWorkOccurrence.create({ data: {
      facilityId: fx.facility.id, departmentId: fx.evs.id, occurrenceKey: target.occurrenceKey,
      operationalDate: new Date("2026-08-07T00:00:00Z"), workPlanId: published.id,
      workItemId: published.items[0]!.id, workItemLabelSnapshot: target.label,
      spaceId: fx.spaces[0]!.id, unitId: fx.unit.id, status: "COMPLETED",
      completedAt: new Date("2026-08-07T15:00:00Z") } });
    try {
      await prisma.unitSpace.update({ where: { id: fx.spaces[0]!.id }, data: { spaceType: "PUBLIC_AREA" } });
      assert.deepEqual(await prisma.departmentWorkOccurrence.findUniqueOrThrow({ where: { id: history.id } }), history);
    } finally {
      await prisma.unitSpace.update({ where: { id: fx.spaces[0]!.id }, data: { spaceType: "PATIENT_ROOM" } });
    }
  }));

test("phase11b sql: DEVELOPMENT denies cycle creation/publication and retains historical draft",
  { skip: skipReason }, async () => withEvsHistory(async (prisma, fx, mgr) => {
    const actor = { userId: fx.manager.id, label: "EVS Manager" };
    const draft = { stableKey: cuidLike(), label: "Retained EVS morning", cycleType: "PREPARATION" as const,
      startLocal: "06:00", endLocal: "10:00", applicableDaysOfWeek: [0,1,2,3,4,5,6],
      effectiveFrom: "2099-01-01", mealType: null, locationMode: "UNIT_TYPES" as const,
      applicableUnitTypes: ["RESIDENT_AREA" as const], expectedMilestones: [] };
    await assert.rejects(createCycleDraft(mgr, { facilityId: fx.facility.id, departmentId: fx.evs.id,
      actor, client: prisma, draft }), /commercial access is unavailable/);
    assert.equal(await prisma.departmentOperationalCycle.count({ where: { departmentId: fx.evs.id, stableKey: draft.stableKey } }), 0);
    const history = await prisma.departmentOperationalCycle.create({ data: { ...draft,
      effectiveFrom: new Date("2099-01-01T00:00:00Z"), facilityId: fx.facility.id, departmentId: fx.evs.id } });
    await assert.rejects(publishCycle(mgr, { facilityId: fx.facility.id, departmentId: fx.evs.id,
      cycleId: history.id, actor, client: prisma }), /commercial access is unavailable/);
    assert.deepEqual(await prisma.departmentOperationalCycle.findUniqueOrThrow({ where: { id: history.id } }), history);
    assert.equal(await prisma.departmentOperationalCycleEvent.count({ where: { cycleId: history.id } }), 0);
  }));

test("phase11b sql: DEVELOPMENT denies new rework/Records; retained Needs Attention evidence stays unchanged",
  { skip: skipReason }, async () => withEvsHistory(async (prisma, fx, mgr) => {
    // Retained legacy definition is required by the historical Record FK/check.
    // This is test history, not a new template creation service or forward writer.
    const definition = await prisma.operationalTemplate.create({ data: {
      facilityId: fx.facility.id, departmentId: fx.evs.id, stableKey: cuidLike(),
      name: "Historical room inspection", purposeType: "INSPECTION", status: "PUBLISHED",
      publishedAt: new Date("2026-08-01T12:00:00Z"),
    } });
    const history = await prisma.operationalEvidenceRecord.create({ data: {
      templateId: definition.id,
      facilityId: fx.facility.id, departmentId: fx.evs.id, templateStableKey: definition.stableKey,
      templateVersion: 1, templateName: "Historical room inspection", purposeType: "INSPECTION",
      requirementKey: cuidLike(), operationalDate: new Date("2026-08-07T00:00:00Z"),
      scheduleKind: "ONCE_PER_OPERATIONAL_DATE", occurredAt: new Date("2026-08-07T14:00:00Z"),
      unitId: fx.unit.id, spaceId: fx.spaces[0]!.id, status: "NEEDS_REVIEW", outOfStandard: true,
      templateSnapshotJson: { name: "Historical room inspection", fields: [] },
      values: { create: { fieldKey: "result", label: "Inspection result", fieldType: "PASS_NEEDS_ATTENTION",
        valueText: "NEEDS_ATTENTION", outOfStandard: true } },
    }, include: { values: true } });
    const authority = await resolveEvidenceAuthority(mgr, fx.facility.id, fx.evs.id);
    assert.equal(authority.canSubmit, false);
    assert.match(authority.reason!, /commercial access is unavailable/);
    const title = `Denied rework ${cuidLike()}`;
    await assert.rejects(createOneOff(mgr, { work: { facilityId: fx.facility.id, departmentId: fx.evs.id,
      operationalDate: "2026-08-07", unitId: fx.unit.id, spaceId: fx.spaces[0]!.id,
      title, instructions: "Address Needs Attention", priority: "URGENT" },
      actor: { userId: fx.manager.id, label: "EVS Manager" }, client: prisma }), /commercial access is unavailable/);
    assert.equal(await prisma.departmentWorkOccurrence.count({ where: { departmentId: fx.evs.id, workItemLabelSnapshot: title } }), 0);
    assert.deepEqual(await prisma.operationalEvidenceRecord.findUniqueOrThrow({ where: { id: history.id }, include: { values: true } }), history);
  }));

test(
  "phase11b sql: offline process-sync Work completion gated by EVS flag",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.EVS_OPERATIONS_ENABLED;
    delete process.env.EVS_OPERATIONS_ENABLED;

    try {
      const fx = await loadEvsFixture(prisma);
      const staffSession = session({
        facilityId: fx.facility.id,
        role: "STAFF",
        uid: fx.staffEmployee?.id ?? fx.manager.id,
        authMethod: "QUICK_PIN",
        primaryDepartmentId: fx.evs.id,
      });

      const command: OfflineCommandEnvelope = {
        clientCommandId: `cmd_evs_offline_${cuidLike()}`,
        commandType: "COMPLETE_OPERATIONAL_TASK",
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        unitId: fx.unit.id,
        operationalDate: "2026-08-07",
        mealType: "LUNCH",
        occurredAt: new Date().toISOString(),
        locallyRecordedAt: new Date().toISOString(),
        deviceBoundUnitId: fx.unit.id,
        actorRef: staffSession.uid,
        authMethod: "QUICK_PIN",
        role: "STAFF",
        bundleVersion: "1",
        expectedServerRevision: "0",
        deviceTimezoneOffsetMinutes: 240,
        workCompletion: {
          occurrenceKey: `plan|evs_offline|1|surfaces|2026-08-07|${fx.unit.id}|${fx.spaces[0]!.id}|||00:00|23:59|`,
          workPlanId: cuidLike(),
          workPlanStableKey: "evs_offline",
          workPlanVersion: 1,
          workItemId: cuidLike(),
          workItemKey: "surfaces",
          label: "Clean high-touch surfaces",
          spaceId: fx.spaces[0]!.id,
        },
      };

      const rejected = await processSyncCommand(
        {
          session: staffSession,
          command,
          deviceFacilityId: fx.facility.id,
          deviceBoundUnitId: fx.unit.id,
        },
        prisma,
      );
      assert.equal(rejected.category, "REJECTED");
      assert.equal(rejected.reasonCode, "WORK_PLANS_FLAG_DISABLED");
    } finally {
      if (prev === undefined) delete process.env.EVS_OPERATIONS_ENABLED;
      else process.env.EVS_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);
