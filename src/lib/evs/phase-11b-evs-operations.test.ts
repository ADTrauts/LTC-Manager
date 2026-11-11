/**
 * Phase 11B SQL-backed EVS operations tests.
 * Opt in via DEPARTMENT_WORK_TEST_DATABASE_URL (same disposable wiring as Phase 11A).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient, type SpaceType } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { FacilitySession } from "@/lib/auth";
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

test("phase11b sql: DEVELOPMENT denies cycle creation/publication and retains historical draft",
  { skip: skipReason }, async () => withEvsHistory(async (prisma, fx, mgr) => {
    const actor = { userId: fx.manager.id, label: "EVS Manager" };
    const draft = { stableKey: cuidLike(), label: "Retained EVS morning", cycleType: "PREPARATION" as const,
      startLocal: "06:00", endLocal: "10:00", applicableDaysOfWeek: [0,1,2,3,4,5,6],
      effectiveFrom: "2099-01-01", mealType: null, locationMode: "ALL_DEPARTMENT_UNITS" as const };
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

test("phase11b sql: DEVELOPMENT denies Records writes; retained Needs Attention evidence stays unchanged",
  { skip: skipReason }, async () => withEvsHistory(async (prisma, fx, mgr) => {
    // Retained legacy definition is required by the historical Record FK/check.
    // This is test history, not a new template creation service or forward writer.
    const definition = await ({ id: "retired-template", name: "Retired template", version: 1, stableKey: "retired", purposeType: "LOG", status: "PUBLISHED", fields: [] });
    const history = await prisma.operationalEvidenceRecord.create({ data: {
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
    assert.deepEqual(await prisma.operationalEvidenceRecord.findUniqueOrThrow({ where: { id: history.id }, include: { values: true } }), history);
  }));
