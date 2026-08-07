/**
 * Phase 11C EVS Assignment location scope, Zones, coverage, and sequencing tests.
 *
 * SQL-backed cases opt in via DEPARTMENT_WORK_TEST_DATABASE_URL (same disposable wiring
 * as Phase 11B). Sequencing and pure helpers always run hermetically.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import type { AppJwtPayload } from "@/lib/auth";
import {
  createDepartmentZone,
  retireDepartmentZone,
  updateDepartmentZone,
} from "@/lib/department-zones";
import type { WorkRequirement } from "@/lib/department-work/types";
import { resolveAssignmentAuthority } from "@/lib/scheduling/operational-assignments/assignment-authority";
import type { AssignmentAuthorityDecision } from "@/lib/scheduling/operational-assignments/assignment-authority";
import { ensureAssignmentPlan } from "@/lib/scheduling/operational-assignments/assignment-plan";
import { buildLocationCoverageSummary } from "@/lib/scheduling/operational-assignments/location-coverage";
import {
  assertNoLocationResponsibilityOverlaps,
  deriveAssignmentScopeKind,
  replaceAssignmentLocations,
  resolveAssignmentLocationWrites,
} from "@/lib/scheduling/operational-assignments/location-scope";
import {
  buildDeterministicLocationSequence,
  formatAssignedScopeSummary,
} from "@/lib/scheduling/operational-assignments/location-sequencing";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";

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
    name: overrides.name ?? "EVS 11C Test",
    email: overrides.email ?? "evs-11c@example.com",
    facilityId: overrides.facilityId,
    primaryDepartmentId: overrides.primaryDepartmentId,
    sessionVersion: 1,
  } as AppJwtPayload;
}

function stubWork(partial: Partial<WorkRequirement> & Pick<WorkRequirement, "spaceId" | "label" | "priority" | "state">): WorkRequirement {
  return {
    occurrenceKey: partial.occurrenceKey ?? `occ_${cuidLike()}`,
    workPlanId: "plan",
    workPlanStableKey: "plan",
    workPlanVersion: 1,
    workPlanName: "Plan",
    workItemId: "item",
    workItemKey: "surfaces",
    label: partial.label,
    instructions: null,
    priority: partial.priority,
    completionMode: "EXPLICIT_CONFIRMATION",
    responsibilityMode: "UNIT_SHARED",
    scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
    cycleStableKey: null,
    windowStartLocal: null,
    windowEndLocal: null,
    dueAt: partial.dueAt ?? null,
    windowStartsAt: null,
    windowEndsAt: null,
    unitId: null,
    unitName: null,
    spaceId: partial.spaceId,
    assetId: null,
    roleKeys: [],
    knowledgeArticleId: null,
    procedureTitle: null,
    linkedTemplateStableKey: null,
    linkedTemplateId: null,
    state: partial.state,
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

async function loadEvs11cFixture(prisma: PrismaClient) {
  let evs = await prisma.department.findFirst({
    where: { key: "EVS", isActive: true },
    include: { facility: true },
  });

  if (!evs) {
    let org = await prisma.organization.findFirst({ select: { id: true } });
    if (!org) {
      org = await prisma.organization.create({
        data: {
          id: cuidLike(),
          name: `11C Org ${cuidLike().slice(-6)}`,
          displayName: `11C Org ${cuidLike().slice(-6)}`,
        },
        select: { id: true },
      });
    }
    const facility = await prisma.facility.create({
      data: {
        id: cuidLike(),
        organizationId: org.id,
        displayName: `11C Facility ${cuidLike().slice(-6)}`,
        timezone: "America/New_York",
      },
    });
    const createdEvs = await prisma.department.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        key: "EVS",
        name: "Environmental Services",
        isActive: true,
      },
    });
    await prisma.department.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        key: "DIETARY",
        name: "Dietary",
        isActive: true,
      },
    });
    for (const key of ["MANAGER", "SUPERVISOR", "STAFF", "GM", "FACILITY_ADMINISTRATOR"] as const) {
      await prisma.role.upsert({
        where: { key },
        update: {},
        create: { key, name: key.replaceAll("_", " ") },
      });
    }
    evs = await prisma.department.findFirstOrThrow({
      where: { id: createdEvs.id },
      include: { facility: true },
    });
  }

  assert.ok(evs, "EVS department required");
  const facility = evs.facility;
  assert.ok(facility);
  const evsId = evs.id;

  const dietary = await prisma.department.findFirst({
    where: { facilityId: facility.id, key: "DIETARY", isActive: true },
  });
  assert.ok(dietary, "DIETARY department required");

  let unit = await prisma.unit.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      unitType: { in: ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE"] },
      departmentResponsibilities: { some: { departmentId: evsId } },
    },
  });
  if (!unit) {
    unit = await prisma.unit.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        name: `EVS 11C Unit ${cuidLike().slice(-6)}`,
        unitType: "RESIDENT_AREA",
        isActive: true,
        displayOrder: 510,
        departmentResponsibilities: {
          create: [{ id: cuidLike(), departmentId: evsId, kind: "PRIMARY" }],
        },
      },
    });
  } else {
    await prisma.unitDepartmentResponsibility.upsert({
      where: { unitId_departmentId: { unitId: unit.id, departmentId: evsId } },
      update: { kind: "PRIMARY" },
      create: { id: cuidLike(), unitId: unit.id, departmentId: evsId, kind: "PRIMARY" },
    });
  }

  const existingSpaces = await prisma.unitSpace.findMany({
    where: { unitId: unit.id, spaceType: "PATIENT_ROOM", isActive: true },
    select: { id: true, name: true, roomNumber: true, sortOrder: true, facilityId: true, unitId: true },
    orderBy: { sortOrder: "asc" },
  });
  const spaces = [...existingSpaces];
  while (spaces.length < 4) {
    const created = await prisma.unitSpace.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        unitId: unit.id,
        name: `11C Room ${spaces.length + 1}`,
        spaceType: "PATIENT_ROOM",
        roomNumber: `11C${spaces.length + 1}`,
        isActive: true,
        sortOrder: 20 + spaces.length,
      },
      select: { id: true, name: true, roomNumber: true, sortOrder: true, facilityId: true, unitId: true },
    });
    spaces.push(created);
  }

  let otherUnit = await prisma.unit.findFirst({
    where: {
      facilityId: facility.id,
      isActive: true,
      id: { not: unit.id },
      unitType: { in: ["RESIDENT_AREA", "COMMON_AREA"] },
    },
  });
  if (!otherUnit) {
    otherUnit = await prisma.unit.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        name: `EVS 11C Other ${cuidLike().slice(-6)}`,
        unitType: "RESIDENT_AREA",
        isActive: true,
        displayOrder: 511,
      },
    });
  }
  let otherSpace = await prisma.unitSpace.findFirst({
    where: { unitId: otherUnit.id, isActive: true },
    select: { id: true, name: true, roomNumber: true, unitId: true },
  });
  if (!otherSpace) {
    otherSpace = await prisma.unitSpace.create({
      data: {
        id: cuidLike(),
        facilityId: facility.id,
        unitId: otherUnit.id,
        name: "11C Other Room",
        spaceType: "PATIENT_ROOM",
        roomNumber: "X99",
        isActive: true,
        sortOrder: 1,
      },
      select: { id: true, name: true, roomNumber: true, unitId: true },
    });
  }

  let manager =
    (await prisma.user.findFirst({
      where: {
        facilityId: facility.id,
        isActive: true,
        role: { key: { in: ["MANAGER", "GM"] } },
      },
      include: { role: { select: { key: true } } },
    })) ?? null;
  if (!manager) {
    const managerRole = await prisma.role.findFirst({
      where: { key: "MANAGER" },
      select: { id: true, key: true },
    });
    assert.ok(managerRole);
    const id = cuidLike();
    manager = await prisma.user.create({
      data: {
        id,
        email: `evs-11c-manager-${id}@example.com`,
        displayName: "EVS 11C Manager",
        passwordHash: "not-a-usable-hash",
        facilityId: facility.id,
        roleId: managerRole.id,
        isActive: true,
        primaryDepartmentId: evsId,
      },
      include: { role: { select: { key: true } } },
    });
  }

  async function ensureStaff(suffix: string) {
    const email = `evs-11c-${suffix}@example.com`;
    let emp = await prisma.employee.findFirst({
      where: { facilityId: facility.id, email },
    });
    if (!emp) {
      emp = await prisma.employee.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          email,
          firstName: "EVS",
          lastName: `11C ${suffix}`,
          roleType: "STAFF",
          status: "ACTIVE",
          primaryDepartmentId: evsId,
        },
      });
    }
    return emp;
  }

  const staffA = await ensureStaff(`a-${cuidLike().slice(-4)}`);
  const staffB = await ensureStaff(`b-${cuidLike().slice(-4)}`);

  return { facility, evs, dietary, unit, spaces, otherUnit, otherSpace, manager, staffA, staffB };
}

test("phase11c hermetic: deriveAssignmentScopeKind UNIT vs SPACES", () => {
  assert.equal(deriveAssignmentScopeKind(0), "UNIT");
  assert.equal(deriveAssignmentScopeKind(3), "SPACES");
});

test("phase11c hermetic: deterministic sequencing is not route optimization", () => {
  const locations = [
    {
      unitSpaceId: "s3",
      unitId: "u1",
      label: "Room 103",
      sortOrder: 30,
      roomNumber: "103",
      spaceName: "Room 103",
      unitName: "East",
    },
    {
      unitSpaceId: "s1",
      unitId: "u1",
      label: "Room 101",
      sortOrder: 10,
      roomNumber: "101",
      spaceName: "Room 101",
      unitName: "East",
    },
    {
      unitSpaceId: "s2",
      unitId: "u1",
      label: "Room 102",
      sortOrder: 20,
      roomNumber: "102",
      spaceName: "Room 102",
      unitName: "East",
    },
  ];
  const work = [
    stubWork({ spaceId: "s3", label: "Routine wipe", priority: "ROUTINE", state: "CURRENT" }),
    stubWork({ spaceId: "s2", label: "Urgent spill", priority: "URGENT", state: "CURRENT" }),
    stubWork({ spaceId: "s1", label: "Done room", priority: "ROUTINE", state: "COMPLETED" }),
  ];
  const seq = buildDeterministicLocationSequence({ locations, workRequirements: work });
  assert.match(seq.sequencingNote, /not an optimized walking route/i);
  assert.equal(seq.now?.unitSpaceId, "s2", "urgent incomplete wins over lower sortOrder");
  assert.equal(seq.next?.unitSpaceId, "s3");
  assert.ok(seq.all.every((row) => row.unitSpaceId !== "route-optimizer"));

  const summary = formatAssignedScopeSummary({
    scopeKind: "SPACES",
    zoneName: "Floor 1 East",
    locations: locations.map((l) => ({ label: l.label, roomNumber: l.roomNumber })),
  });
  assert.match(summary.detail, /Floor 1 East/);
  assert.match(summary.detail, /3 Rooms/);
});

test(
  "phase11c sql: Dietary Unit Assignment unchanged (zero location rows)",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);
      const serviceDateKey = "2099-08-11";
      const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.dietary.id,
        serviceDateKey,
        actorUserId: null,
      });

      const dietaryUnit =
        (await prisma.unit.findFirst({
          where: {
            facilityId: fx.facility.id,
            isActive: true,
            departmentResponsibilities: { some: { departmentId: fx.dietary.id } },
          },
        })) ?? fx.unit;

      const created = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.dietary.id,
          planId: plan.id,
          employeeId: fx.staffA.id,
          serviceDate,
          roleKey: "SERVER",
          roleLabel: "Server",
          unitId: dietaryUnit.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
      const locs = await prisma.operationalAssignmentLocation.count({
        where: { assignmentId: created.id },
      });
      assert.equal(locs, 0);
      assert.equal(deriveAssignmentScopeKind(locs), "UNIT");

      await prisma.operationalAssignment.delete({ where: { id: created.id } });
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11c sql: EVS multi-room Assignment + overlap rejection",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);
      const serviceDateKey = "2099-08-12";
      const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDateKey,
        actorUserId: null,
      });

      const spaceIds = fx.spaces.slice(0, 3).map((s) => s.id);
      const writes = await resolveAssignmentLocationWrites(prisma, {
        facilityId: fx.facility.id,
        unitId: fx.unit.id,
        unitSpaceIds: spaceIds,
      });
      assert.equal(writes.length, 3);

      const assignment = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffA.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
          startsAt: null,
          endsAt: null,
        },
      });
      await replaceAssignmentLocations(prisma, assignment.id, writes);
      const stored = await prisma.operationalAssignmentLocation.count({
        where: { assignmentId: assignment.id },
      });
      assert.equal(stored, 3);
      assert.equal(deriveAssignmentScopeKind(stored), "SPACES");

      await assert.rejects(
        () =>
          assertNoLocationResponsibilityOverlaps(prisma, {
            facilityId: fx.facility.id,
            departmentId: fx.evs.id,
            serviceDate,
            employeeId: fx.staffB.id,
            unitId: fx.unit.id,
            unitSpaceIds: [spaceIds[0]!],
            startsAt: null,
            endsAt: null,
          }),
        /Overlapping Room \/ Space responsibility/i,
      );

      await prisma.operationalAssignmentLocation.deleteMany({
        where: { assignmentId: assignment.id },
      });
      await prisma.operationalAssignment.delete({ where: { id: assignment.id } });
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11c sql: Zone create/membership/retire; membership change does not rewrite Assignment locations",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);
      const zoneName = `11C Zone ${cuidLike().slice(-6)}`;
      const zone = await createDepartmentZone(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        name: zoneName,
        description: "Synthetic zone",
        unitSpaceIds: fx.spaces.slice(0, 2).map((s) => s.id),
        actorUserId: fx.manager.id,
        activate: true,
      });
      assert.equal(zone.status, "ACTIVE");
      assert.equal(zone.locationCount, 2);

      const serviceDateKey = "2099-08-13";
      const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDateKey,
        actorUserId: fx.manager.id,
      });
      const writes = await resolveAssignmentLocationWrites(prisma, {
        facilityId: fx.facility.id,
        unitId: fx.unit.id,
        unitSpaceIds: fx.spaces.slice(0, 2).map((s) => s.id),
      });
      const assignment = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffA.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          sourceZoneId: zone.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
      await replaceAssignmentLocations(prisma, assignment.id, writes);
      const before = (
        await prisma.operationalAssignmentLocation.findMany({
          where: { assignmentId: assignment.id },
          select: { unitSpaceId: true },
          orderBy: { sortOrder: "asc" },
        })
      ).map((l) => l.unitSpaceId);

      await updateDepartmentZone(prisma, {
        facilityId: fx.facility.id,
        zoneId: zone.id,
        unitSpaceIds: [fx.spaces[2]!.id, fx.spaces[3]!.id],
        actorUserId: fx.manager.id,
      });

      const after = (
        await prisma.operationalAssignmentLocation.findMany({
          where: { assignmentId: assignment.id },
          select: { unitSpaceId: true },
          orderBy: { sortOrder: "asc" },
        })
      ).map((l) => l.unitSpaceId);
      assert.deepEqual(after, before);

      await retireDepartmentZone(prisma, {
        facilityId: fx.facility.id,
        zoneId: zone.id,
        actorUserId: fx.manager.id,
      });
      const retired = await prisma.departmentOperationalZone.findUniqueOrThrow({
        where: { id: zone.id },
      });
      assert.equal(retired.status, "RETIRED");

      await prisma.operationalAssignmentLocation.deleteMany({
        where: { assignmentId: assignment.id },
      });
      await prisma.operationalAssignment.delete({ where: { id: assignment.id } });
    } finally {
      await prisma.$disconnect();
    }
  },
);

test("phase11c hermetic: Zone is not an authority grant (decision shape)", () => {
  // Zones never appear on AssignmentAuthorityDecision — management is role × department only.
  const staff: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason: null,
  };
  assert.equal("zoneId" in staff, false);
  assert.equal(staff.canManage, false);
});

test(
  "phase11c sql: Zone membership does not elevate STAFF Assignment authority",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    // resolveAssignmentAuthority uses the process Prisma client — pin DATABASE_URL for this suite.
    const prevDb = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);
      await createDepartmentZone(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        name: `11C Auth Zone ${cuidLike().slice(-6)}`,
        unitSpaceIds: [fx.spaces[0]!.id],
        actorUserId: fx.manager.id,
        activate: true,
      });

      const staffDecision = await resolveAssignmentAuthority({
        session: session({
          facilityId: fx.facility.id,
          role: "STAFF",
          uid: `user_${fx.staffA.id}`,
          primaryDepartmentId: fx.evs.id,
        }),
        departmentId: fx.evs.id,
        facilityId: fx.facility.id,
      });
      assert.equal(staffDecision.canManage, false);
      assert.equal(staffDecision.canConfirm, false);

      const cross = await resolveAssignmentAuthority({
        session: session({
          facilityId: "other_facility_id",
          role: "MANAGER",
          uid: fx.manager.id,
          primaryDepartmentId: fx.evs.id,
        }),
        departmentId: fx.evs.id,
        facilityId: fx.facility.id,
      });
      assert.equal(cross.canManage, false);
      assert.match(String(cross.reason), /Cross-facility/i);
    } finally {
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11c sql: coverage COVERED/UNCOVERED/OVERLAPPING; work completion does not change coverage",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);
      const serviceDateKey = "2099-08-14";
      const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
      await prisma.operationalAssignment.deleteMany({
        where: { facilityId: fx.facility.id, departmentId: fx.evs.id, serviceDate },
      });

      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDateKey,
        actorUserId: null,
      });

      const coveredSpace = fx.spaces[0]!;
      const overlapSpace = fx.spaces[1]!;
      // spaces[2+] remain UNCOVERED for this synthetic date

      const a1 = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffA.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
      await replaceAssignmentLocations(prisma, a1.id, [
        {
          unitSpaceId: coveredSpace.id,
          unitId: fx.unit.id,
          labelSnapshot: coveredSpace.name,
          sortOrder: 1,
        },
        {
          unitSpaceId: overlapSpace.id,
          unitId: fx.unit.id,
          labelSnapshot: overlapSpace.name,
          sortOrder: 2,
        },
      ]);

      const a2 = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffB.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
      await replaceAssignmentLocations(prisma, a2.id, [
        {
          unitSpaceId: overlapSpace.id,
          unitId: fx.unit.id,
          labelSnapshot: overlapSpace.name,
          sortOrder: 1,
        },
      ]);

      const before = await buildLocationCoverageSummary(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDate,
      });
      const coveredRow = before.rows.find((r) => r.unitSpaceId === coveredSpace.id);
      const overlapRow = before.rows.find((r) => r.unitSpaceId === overlapSpace.id);
      const uncoveredRow = before.rows.find((r) => r.unitSpaceId === fx.spaces[2]!.id);
      assert.equal(coveredRow?.state, "COVERED");
      assert.equal(overlapRow?.state, "OVERLAPPING");
      assert.equal(uncoveredRow?.state, "UNCOVERED");

      // Completing work must not flip Assignment coverage (create a COMPLETED occurrence).
      await prisma.departmentWorkOccurrence.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          operationalDate: serviceDate,
          occurrenceKey: `occ_${cuidLike()}`,
          status: "COMPLETED",
          sourceKind: "WORK_PLAN",
          workPlanStableKey: "synthetic",
          workPlanVersion: 1,
          workItemKey: "surfaces",
          workItemLabelSnapshot: "Clean",
          unitId: fx.unit.id,
          spaceId: coveredSpace.id,
          completedAt: new Date(),
          completedByLabel: "Synthetic",
        },
      });

      const after = await buildLocationCoverageSummary(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDate,
      });
      assert.equal(
        after.rows.find((r) => r.unitSpaceId === coveredSpace.id)?.state,
        "COVERED",
      );
      assert.equal(
        after.rows.find((r) => r.unitSpaceId === overlapSpace.id)?.state,
        "OVERLAPPING",
      );
      assert.equal(
        after.rows.find((r) => r.unitSpaceId === fx.spaces[2]!.id)?.state,
        "UNCOVERED",
      );

      await prisma.departmentWorkOccurrence.deleteMany({
        where: { facilityId: fx.facility.id, departmentId: fx.evs.id, operationalDate: serviceDate },
      });
      await prisma.operationalAssignmentLocation.deleteMany({
        where: { assignmentId: { in: [a1.id, a2.id] } },
      });
      await prisma.operationalAssignment.deleteMany({
        where: { id: { in: [a1.id, a2.id] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);

test(
  "phase11c sql: cross-facility / wrong-unit room rejected; temporary coverage preserves original",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const fx = await loadEvs11cFixture(prisma);

      await assert.rejects(
        () =>
          resolveAssignmentLocationWrites(prisma, {
            facilityId: fx.facility.id,
            unitId: fx.unit.id,
            unitSpaceIds: [fx.otherSpace.id],
          }),
        /not under the selected Unit/i,
      );

      await assert.rejects(
        () =>
          resolveAssignmentLocationWrites(prisma, {
            facilityId: fx.facility.id,
            unitSpaceIds: ["missing_space_id_not_in_facility"],
          }),
        /not found in this Facility/i,
      );

      const serviceDateKey = "2099-08-15";
      const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);
      const plan = await ensureAssignmentPlan(prisma, {
        facilityId: fx.facility.id,
        departmentId: fx.evs.id,
        serviceDateKey,
        actorUserId: null,
      });

      const originalWrites = await resolveAssignmentLocationWrites(prisma, {
        facilityId: fx.facility.id,
        unitId: fx.unit.id,
        unitSpaceIds: fx.spaces.slice(0, 2).map((s) => s.id),
      });
      const original = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffA.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          status: "PLANNED",
          source: "MANUAL_ADDITION",
        },
      });
      await replaceAssignmentLocations(prisma, original.id, originalWrites);
      const originalLocs = (
        await prisma.operationalAssignmentLocation.findMany({
          where: { assignmentId: original.id },
          select: { unitSpaceId: true },
        })
      )
        .map((l) => l.unitSpaceId)
        .sort();

      // Temporary coverage = new CALL_OFF_REPLACEMENT Assignment; original untouched.
      const coverage = await prisma.operationalAssignment.create({
        data: {
          id: cuidLike(),
          facilityId: fx.facility.id,
          departmentId: fx.evs.id,
          planId: plan.id,
          employeeId: fx.staffB.id,
          serviceDate,
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          unitId: fx.unit.id,
          status: "PLANNED",
          source: "CALL_OFF_REPLACEMENT",
          changeReason: "Temporary coverage test",
          startsAt: new Date("2099-08-15T18:00:00.000Z"),
          endsAt: new Date("2099-08-15T22:00:00.000Z"),
        },
      });
      await replaceAssignmentLocations(prisma, coverage.id, [
        {
          unitSpaceId: fx.spaces[0]!.id,
          unitId: fx.unit.id,
          labelSnapshot: fx.spaces[0]!.name,
          sortOrder: 1,
        },
      ]);

      const originalAfter = await prisma.operationalAssignment.findUniqueOrThrow({
        where: { id: original.id },
        select: {
          status: true,
          locations: { select: { unitSpaceId: true } },
        },
      });
      assert.equal(originalAfter.status, "PLANNED");
      assert.deepEqual(
        originalAfter.locations.map((l) => l.unitSpaceId).sort(),
        originalLocs,
      );

      await prisma.operationalAssignmentLocation.deleteMany({
        where: { assignmentId: { in: [original.id, coverage.id] } },
      });
      await prisma.operationalAssignment.deleteMany({
        where: { id: { in: [original.id, coverage.id] } },
      });
    } finally {
      await prisma.$disconnect();
    }
  },
);
