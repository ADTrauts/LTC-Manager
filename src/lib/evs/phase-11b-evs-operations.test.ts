/**
 * Phase 11B SQL-backed EVS operations tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL (same disposable wiring as Phase 11A).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, type SpaceType } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
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
import {
  createDraft as createTemplateDraft,
  publishTemplate,
} from "@/lib/operational-evidence/template-service";
import { submitEvidenceRecord } from "@/lib/operational-evidence/submit-evidence";

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
    name: overrides.name ?? "EVS Test",
    email: overrides.email ?? "evs-test@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

async function loadEvsFixture(prisma: PrismaClient) {
  const evs = await prisma.department.findFirst({
    where: { key: "EVS", isActive: true },
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

test(
  "phase11b sql: SPACE_TYPE PATIENT_ROOM expands per-space; historical occurrence keeps spaceId",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.EVS_OPERATIONS_ENABLED;
    process.env.EVS_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadEvsFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.evs.id,
      });
      const actor = { userId: fx.manager.id, label: "EVS Manager" };
      const operationalDate = "2026-08-07";

      const draft = await createDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        actor,
        client: prisma,
        draft: {
          name: `EVS Room Clean ${cuidLike().slice(0, 8)}`,
          description: "SPACE_TYPE expansion SQL",
          weekdays: [],
          applicabilities: [{ kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
          items: [
            {
              itemKey: "surfaces",
              label: "Clean high-touch surfaces",
              displaySequence: 10,
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            },
          ],
        },
      });
      const published = await publishWorkPlan(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        workPlanId: draft.id,
        actor,
        client: prisma,
      });

      const derived = resolveWorkRequirements({
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        operationalDateKey: operationalDate,
        now: new Date(`${operationalDate}T15:00:00.000Z`),
        facilityTimezone: fx.facility.timezone || "America/New_York",
        unitId: fx.unit.id,
        spaces: fx.spaces.map((s) => ({
          id: s.id,
          spaceType: s.spaceType,
          unitId: fx.unit.id,
        })),
        publishedPlans: [toPlanForResolve(published)],
        publishedCycles: [],
        confirmedAssignments: [
          {
            employeeId: fx.staffEmployee?.id ?? "e_sql",
            unitId: fx.unit.id,
            roleKey: null,
          },
        ],
        existingOccurrences: [],
      });

      const spaceIds = new Set(derived.map((r) => r.spaceId).filter(Boolean));
      assert.ok(spaceIds.size >= 3, `expected ≥3 space requirements, got ${spaceIds.size}`);
      assert.ok(derived.every((r) => r.workItemKey === "surfaces"));

      const target = derived.find((r) => r.spaceId === fx.spaces[0]!.id);
      assert.ok(target);

      const completed = await completeExplicit(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        requirement: target,
        operationalDate,
        actor: { ...actor, employeeId: fx.staffEmployee?.id ?? null },
        clientCommandId: `cmd_${cuidLike()}`,
        client: prisma,
      });
      assert.equal(completed.occurrence.spaceId, fx.spaces[0]!.id);

      await prisma.unitSpace.update({
        where: { id: fx.spaces[0]!.id },
        data: { spaceType: "PUBLIC_AREA" },
      });

      const afterTypeChange = await prisma.departmentWorkOccurrence.findUniqueOrThrow({
        where: { id: completed.occurrence.id },
      });
      assert.equal(afterTypeChange.spaceId, fx.spaces[0]!.id);
      assert.equal(afterTypeChange.status, "COMPLETED");

      // Restore for other tests / seed hygiene.
      await prisma.unitSpace.update({
        where: { id: fx.spaces[0]!.id },
        data: { spaceType: "PATIENT_ROOM" },
      });
    } finally {
      if (prev === undefined) delete process.env.EVS_OPERATIONS_ENABLED;
      else process.env.EVS_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11b sql: EVS cycle without mealType can publish; fixed window facility timezone",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.EVS_OPERATIONS_ENABLED;
    process.env.EVS_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadEvsFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.evs.id,
      });
      const actor = { userId: fx.manager.id, label: "EVS Manager" };
      const stableKey = `phase11b_evs_morning_${cuidLike().slice(-6)}`;

      const draft = await createCycleDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        actor,
        client: prisma,
        draft: {
          stableKey,
          label: "Morning Routine SQL",
          cycleType: "PREPARATION",
          displaySequence: 10,
          startLocal: "06:00",
          endLocal: "10:00",
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom: "2026-01-01",
          mealType: null,
          locationMode: "UNIT_TYPES",
          applicableUnitTypes: ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE"],
          expectedMilestones: [],
        },
      });
      assert.equal(draft.status, "DRAFT");
      assert.equal(draft.mealType, null);

      const published = await publishCycle(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        cycleId: draft.id,
        actor,
        client: prisma,
      });
      assert.equal(published.status, "PUBLISHED");
      assert.equal(published.mealType, null);
      assert.equal(published.startLocal, "06:00");
      assert.equal(published.endLocal, "10:00");
    } finally {
      if (prev === undefined) delete process.env.EVS_OPERATIONS_ENABLED;
      else process.env.EVS_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11b sql: inspection Needs Attention → rework complete leaves evidence unchanged",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const prev = process.env.EVS_OPERATIONS_ENABLED;
    process.env.EVS_OPERATIONS_ENABLED = "true";

    try {
      const fx = await loadEvsFixture(prisma);
      const mgr = session({
        facilityId: fx.facility.id,
        role: fx.manager.role.key as AppJwtPayload["role"],
        uid: fx.manager.id,
        primaryDepartmentId: fx.evs.id,
      });
      const actor = { userId: fx.manager.id, label: "EVS Manager" };
      const dateKey = "2026-08-07";
      const spaceId = fx.spaces[0]!.id;

      const templateDraft = await createTemplateDraft(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        actor,
        client: prisma,
        draft: {
          name: `EVS Room Inspection ${cuidLike().slice(0, 6)}`,
          purposeType: "INSPECTION",
          allowAdHoc: true,
          fields: [
            {
              fieldKey: "result",
              label: "Inspection result",
              fieldType: "PASS_NEEDS_ATTENTION",
              isRequired: true,
              displaySequence: 10,
              allowedSelections: ["PASS", "NEEDS_ATTENTION"],
              correctiveActionTrigger: true,
              // Allow NEEDS_REVIEW without corrective text on submit.
              correctiveActionRequired: false,
            },
          ],
          applicabilities: [{ kind: "SPECIFIC_SPACE", spaceId }],
          schedules: [{ kind: "ONCE_PER_OPERATIONAL_DATE" }],
        },
      });
      const published = await publishTemplate(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        templateId: templateDraft.id,
        actor,
        client: prisma,
      });

      const record = await submitEvidenceRecord(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        templateId: published.id,
        requirementKey: `insp|${published.stableKey}|${dateKey}|${fx.unit.id}|${spaceId}`,
        operationalDateKey: dateKey,
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
        unitId: fx.unit.id,
        spaceId,
        occurredAt: new Date(`${dateKey}T14:00:00.000Z`),
        recordedOnline: true,
        allowNeedsReview: true,
        values: [{ fieldKey: "result", valueText: "NEEDS_ATTENTION" }],
        client: prisma,
      });
      assert.equal(record.status, "NEEDS_REVIEW");
      const resultValue = record.values.find((v) => v.fieldKey === "result");
      assert.equal(resultValue?.valueText, "NEEDS_ATTENTION");

      const rework = await createOneOff(mgr, {
        work: {
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          operationalDate: dateKey,
          unitId: fx.unit.id,
          spaceId,
          title: "Rework after inspection",
          instructions: "Address Needs Attention findings",
          assignedEmployeeId: fx.staffEmployee?.id ?? null,
          priority: "URGENT",
        },
        actor,
        client: prisma,
      });
      assert.equal(rework.sourceKind, "ONE_OFF");

      const reworkReq: WorkRequirement = {
        occurrenceKey: rework.occurrenceKey,
        workPlanId: "",
        workPlanStableKey: "",
        workPlanVersion: 0,
        workPlanName: "",
        workItemId: "",
        workItemKey: "one_off_rework",
        label: rework.workItemLabelSnapshot,
        instructions: rework.instructionsSnapshot,
        priority: "URGENT",
        completionMode: "EXPLICIT_CONFIRMATION",
        responsibilityMode: "UNIT_SHARED",
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
        cycleStableKey: null,
        windowStartLocal: "00:00",
        windowEndLocal: "23:59",
        dueAt: null,
        windowStartsAt: null,
        windowEndsAt: null,
        unitId: fx.unit.id,
        unitName: null,
        spaceId,
        assetId: null,
        roleKeys: [],
        knowledgeArticleId: null,
        procedureTitle: null,
        linkedTemplateStableKey: null,
        linkedTemplateId: null,
        state: "DUE",
        occurrenceId: rework.id,
        occurrenceStatus: rework.status,
        assignedEmployeeId: rework.assignedEmployeeId,
        completedByLabel: null,
        completedAt: null,
        evidenceRecordId: null,
        sourceKind: "ONE_OFF",
        sourceHref: null,
      };

      await completeExplicit(mgr, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        requirement: reworkReq,
        operationalDate: dateKey,
        actor: { ...actor, employeeId: fx.staffEmployee?.id ?? null },
        clientCommandId: `cmd_rework_${cuidLike()}`,
        client: prisma,
      });

      const unchanged = await prisma.operationalEvidenceRecord.findUniqueOrThrow({
        where: { id: record.id },
        include: { values: true },
      });
      assert.equal(unchanged.status, "NEEDS_REVIEW");
      assert.equal(
        unchanged.values.find((v) => v.fieldKey === "result")?.valueText,
        "NEEDS_ATTENTION",
      );
    } finally {
      if (prev === undefined) delete process.env.EVS_OPERATIONS_ENABLED;
      else process.env.EVS_OPERATIONS_ENABLED = prev;
      await prisma.$disconnect();
    }
  },
);

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
