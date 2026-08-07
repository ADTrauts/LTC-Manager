#!/usr/bin/env node
/**
 * Phase 11C EVS Assignment / Zones scale fixtures (synthetic, no PHI).
 * Disposable VERIFY_DATABASE_URL only.
 *
 * Seeds ~4 floors, multiple units, 40–60 rooms, 15–25 EVS staff + ≥2 supervisors,
 * ACTIVE zones, under-coverage + overlap hooks, offline staff PIN, work plans,
 * inspection template, and asset issue target.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(
  ROOT,
  "tmp",
  process.env.EVS_ASSIGNMENT_BROWSER_ARTIFACT_DIR_NAME || "evs-assignment-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.EVS_ASSIGNMENT_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`evs-assignment-browser-fixtures: FAIL — ${message}`);
  process.exit(1);
}

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function upsertUser(db, { email, displayName, roleKey, facilityId, primaryDepartmentId }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);
  return db.user.upsert({
    where: { email },
    update: {
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
      sessionVersion: 0,
    },
    create: {
      email,
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
    },
    select: { id: true, email: true },
  });
}

async function ensureEmployee(db, {
  facilityId,
  email,
  firstName,
  lastName,
  departmentId,
  roleType = "STAFF",
  pinDigestValue = null,
}) {
  const existing = await db.employee.findFirst({
    where: { facilityId, email },
    select: { id: true },
  });
  if (existing) {
    return db.employee.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        status: "ACTIVE",
        primaryDepartmentId: departmentId,
        roleType,
        ...(pinDigestValue ? { pinDigest: pinDigestValue, sessionVersion: 0 } : {}),
      },
      select: { id: true },
    });
  }
  return db.employee.create({
    data: {
      facilityId,
      email,
      firstName,
      lastName,
      status: "ACTIVE",
      primaryDepartmentId: departmentId,
      roleType,
      ...(pinDigestValue ? { pinDigest: pinDigestValue } : {}),
    },
    select: { id: true },
  });
}

async function ensureDeptMembership(db, employeeId, departmentId) {
  await db.employeeDepartment.upsert({
    where: { employeeId_departmentId: { employeeId, departmentId } },
    update: {},
    create: { employeeId, departmentId, roleType: "STAFF" },
  });
}

/**
 * 4 Floors + wing/public Units with 48 PATIENT_ROOM spaces (synthetic names only).
 */
async function ensureScaleFloorsUnitsRooms(db, facilityId, evsId) {
  const floorSpecs = [
    {
      floorName: "EVS Scale Floor 1",
      wings: [
        { name: "Floor 1 East", rooms: 8, roomPrefix: "1E" },
        { name: "Floor 1 West", rooms: 8, roomPrefix: "1W" },
      ],
    },
    {
      floorName: "EVS Scale Floor 2",
      wings: [
        { name: "Floor 2 North", rooms: 8, roomPrefix: "2N" },
        { name: "Floor 2 South", rooms: 8, roomPrefix: "2S" },
      ],
    },
    {
      floorName: "EVS Scale Floor 3",
      wings: [{ name: "Floor 3 Wing A", rooms: 8, roomPrefix: "3A" }],
    },
    {
      floorName: "EVS Scale Floor 4",
      wings: [{ name: "Public Areas", rooms: 8, roomPrefix: "4P" }],
    },
  ];

  const floors = [];
  const units = [];
  const roomsByUnitName = {};

  for (let fi = 0; fi < floorSpecs.length; fi += 1) {
    const spec = floorSpecs[fi];
    let floor = await db.unit.findFirst({
      where: { facilityId, name: spec.floorName },
      select: { id: true, name: true },
    });
    if (!floor) {
      floor = await db.unit.create({
        data: {
          facilityId,
          name: spec.floorName,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "FLOOR",
          displayOrder: 400 + fi,
          isActive: true,
        },
        select: { id: true, name: true },
      });
    }
    floors.push(floor);

    for (let wi = 0; wi < spec.wings.length; wi += 1) {
      const wing = spec.wings[wi];
      let unit = await db.unit.findFirst({
        where: { facilityId, name: wing.name },
        select: { id: true, name: true },
      });
      if (!unit) {
        unit = await db.unit.create({
          data: {
            facilityId,
            name: wing.name,
            unitType: wing.name === "Public Areas" ? "COMMON_AREA" : "RESIDENT_AREA",
            hierarchyRole: "NEIGHBORHOOD",
            parentUnitId: floor.id,
            displayOrder: 410 + fi * 10 + wi,
            isActive: true,
          },
          select: { id: true, name: true },
        });
      } else {
        unit = await db.unit.update({
          where: { id: unit.id },
          data: { parentUnitId: floor.id, isActive: true },
          select: { id: true, name: true },
        });
      }

      await db.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: evsId } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: evsId, kind: "PRIMARY" },
      });

      const existingRooms = await db.unitSpace.findMany({
        where: { unitId: unit.id, spaceType: "PATIENT_ROOM", isActive: true },
        select: { id: true, name: true, roomNumber: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });
      for (let i = existingRooms.length; i < wing.rooms; i += 1) {
        const roomNumber = `${wing.roomPrefix}${String(i + 1).padStart(2, "0")}`;
        const created = await db.unitSpace.create({
          data: {
            facilityId,
            unitId: unit.id,
            name: `${wing.name} Room ${i + 1}`,
            spaceType: "PATIENT_ROOM",
            roomNumber,
            isActive: true,
            sortOrder: 10 + i,
          },
          select: { id: true, name: true, roomNumber: true, sortOrder: true },
        });
        existingRooms.push(created);
      }

      units.push(unit);
      roomsByUnitName[unit.name] = existingRooms;
    }
  }

  return { floors, units, roomsByUnitName };
}

async function ensureActiveZone(db, {
  facilityId,
  departmentId,
  name,
  description,
  spaces,
  actorUserId,
}) {
  let zone = await db.departmentOperationalZone.findFirst({
    where: { facilityId, departmentId, name },
    select: { id: true, name: true, status: true },
  });
  if (!zone) {
    zone = await db.departmentOperationalZone.create({
      data: {
        facilityId,
        departmentId,
        name,
        description,
        status: "ACTIVE",
        createdByUserId: actorUserId,
        lastChangedByUserId: actorUserId,
        lastChangedAt: new Date(),
        locations: {
          create: spaces.map((s, index) => ({
            unitSpaceId: s.id,
            unitId: s.unitId ?? null,
            sortOrder: s.sortOrder ?? index + 1,
          })),
        },
      },
      select: { id: true, name: true, status: true },
    });
  } else if (zone.status !== "ACTIVE") {
    zone = await db.departmentOperationalZone.update({
      where: { id: zone.id },
      data: { status: "ACTIVE", retiredAt: null },
      select: { id: true, name: true, status: true },
    });
  }

  const existingLocCount = await db.departmentOperationalZoneLocation.count({
    where: { zoneId: zone.id },
  });
  if (existingLocCount === 0 && spaces.length > 0) {
    await db.departmentOperationalZoneLocation.createMany({
      data: spaces.map((s, index) => ({
        zoneId: zone.id,
        unitSpaceId: s.id,
        unitId: s.unitId ?? null,
        sortOrder: s.sortOrder ?? index + 1,
      })),
      skipDuplicates: true,
    });
  }

  return zone;
}

async function main() {
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");

  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`evs-assignment-browser-fixtures: target ${target.databaseName}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, timezone: true, displayName: true },
    });
    const evs = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true, name: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true },
    });

    const manager = await upsertUser(db, {
      email: "evs.assign.manager@ltc.local",
      displayName: "EVS Assign Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const faWithEvs = await upsertUser(db, {
      email: "evs.assign.fa@ltc.local",
      displayName: "EVS Assign Facility Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const supervisor = await upsertUser(db, {
      email: "evs.assign.supervisor@ltc.local",
      displayName: "EVS Assign Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const supervisor2 = await upsertUser(db, {
      email: "evs.assign.supervisor2@ltc.local",
      displayName: "EVS Assign Supervisor Two",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const staff = await upsertUser(db, {
      email: "evs.assign.staff@ltc.local",
      displayName: "EVS Assign Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const dietaryStaff = await upsertUser(db, {
      email: "evs.assign.dietary@ltc.local",
      displayName: "EVS Gate Dietary Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const staffPin = "246810";
    const managerEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "Evs",
      lastName: "AssignMgrEmp",
      departmentId: evs.id,
      roleType: "MANAGER",
    });
    await ensureDeptMembership(db, managerEmp.id, evs.id);

    const supervisorEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "Evs",
      lastName: "AssignSupEmp",
      departmentId: evs.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmp.id, evs.id);

    const supervisor2Emp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor2.email,
      firstName: "Evs",
      lastName: "AssignSup2Emp",
      departmentId: evs.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisor2Emp.id, evs.id);

    const staffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Evs",
      lastName: "AssignStaffEmp",
      departmentId: evs.id,
      pinDigestValue: pinDigest(facility.id, staffPin),
    });
    await ensureDeptMembership(db, staffEmp.id, evs.id);

    const dietaryStaffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: dietaryStaff.email,
      firstName: "Dietary",
      lastName: "AssignOnlyEmp",
      departmentId: dietary.id,
    });
    await ensureDeptMembership(db, dietaryStaffEmp.id, dietary.id);

    // Scale roster: 18 additional synthetic EVS aides (total staff-like ≥19 + managers/supervisors).
    const scaleStaff = [];
    for (let i = 1; i <= 18; i += 1) {
      const email = `evs.assign.aide${String(i).padStart(2, "0")}@ltc.local`;
      const user = await upsertUser(db, {
        email,
        displayName: `EVS Scale Aide ${i}`,
        roleKey: "STAFF",
        facilityId: facility.id,
        primaryDepartmentId: evs.id,
      });
      const emp = await ensureEmployee(db, {
        facilityId: facility.id,
        email,
        firstName: "Scale",
        lastName: `Aide${String(i).padStart(2, "0")}`,
        departmentId: evs.id,
      });
      await ensureDeptMembership(db, emp.id, evs.id);
      scaleStaff.push({ email: user.email, employeeId: emp.id });
    }

    const { floors, units, roomsByUnitName } = await ensureScaleFloorsUnitsRooms(
      db,
      facility.id,
      evs.id,
    );
    const eastUnit = units.find((u) => u.name === "Floor 1 East");
    const westUnit = units.find((u) => u.name === "Floor 1 West");
    const publicUnit = units.find((u) => u.name === "Public Areas");
    if (!eastUnit || !westUnit) fail("Floor 1 East/West units missing after seed");

    const eastRooms = (roomsByUnitName["Floor 1 East"] || []).map((r) => ({
      ...r,
      unitId: eastUnit.id,
    }));
    const westRooms = (roomsByUnitName["Floor 1 West"] || []).map((r) => ({
      ...r,
      unitId: westUnit.id,
    }));

    const roomCount = await db.unitSpace.count({
      where: {
        facilityId: facility.id,
        unitId: { in: units.map((u) => u.id) },
        spaceType: "PATIENT_ROOM",
        isActive: true,
      },
    });
    if (roomCount < 40 || roomCount > 60) {
      fail(`expected 40–60 PATIENT_ROOM spaces, got ${roomCount}`);
    }

    const zoneEast = await ensureActiveZone(db, {
      facilityId: facility.id,
      departmentId: evs.id,
      name: "Floor 1 East",
      description: "Synthetic Zone — Floor 1 East rooms",
      spaces: eastRooms,
      actorUserId: manager.id,
    });
    const zoneWest = await ensureActiveZone(db, {
      facilityId: facility.id,
      departmentId: evs.id,
      name: "Floor 1 West",
      description: "Synthetic Zone — Floor 1 West rooms",
      spaces: westRooms,
      actorUserId: manager.id,
    });

    const serviceDateKey = new Date().toISOString().slice(0, 10);
    const serviceDate = serviceDateUtc(serviceDateKey);

    // Published EVS cycle (no mealType)
    const cycleStable = "evs_assign_morning";
    let cycle = await db.departmentOperationalCycle.findFirst({
      where: { departmentId: evs.id, stableKey: cycleStable, version: 1 },
    });
    const cycleData = {
      facilityId: facility.id,
      departmentId: evs.id,
      stableKey: cycleStable,
      version: 1,
      label: "Assign Morning Routine",
      description: "EVS morning cleaning window (scale fixture)",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "06:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: serviceDateUtc("2026-01-01"),
      effectiveTo: null,
      mealType: null,
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE"],
      expectedMilestones: [],
      status: "PUBLISHED",
      publishedAt: new Date(),
    };
    if (cycle) {
      cycle = await db.departmentOperationalCycle.update({
        where: { id: cycle.id },
        data: cycleData,
      });
    } else {
      cycle = await db.departmentOperationalCycle.create({ data: cycleData });
    }

    const article =
      (await db.knowledgeArticle.findFirst({
        where: {
          facilityId: facility.id,
          status: "PUBLISHED",
          OR: [{ departmentId: evs.id }, { departmentId: null }],
        },
        select: { id: true, title: true },
      })) ??
      (await db.knowledgeArticle.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: evs.id,
          title: "EVS Scale Room Clean Procedure",
          summary: "Synthetic EVS procedure",
          body: "Step 1. Enter room.\nStep 2. Clean surfaces.\nStep 3. Exit.",
          status: "PUBLISHED",
          category: "SOP",
          publishedAt: new Date(),
        },
        select: { id: true, title: true },
      }));

    // Multiple Work Plans: routine + one-off-oriented second plan
    const routinePlanId = cuidLike();
    const routineItemId = cuidLike();
    const routineItemKey = "surfaces";
    await db.departmentWorkPlan.create({
      data: {
        id: routinePlanId,
        facilityId: facility.id,
        departmentId: evs.id,
        stableKey: `evs_assign_room_clean_${routinePlanId.slice(-6)}`,
        version: 1,
        name: "Assign Gate EVS Room Clean",
        description: "Published EVS Work Plan for assignment browser gate",
        status: "PUBLISHED",
        publishedAt: new Date(),
        weekdays: [],
        applicabilities: {
          create: [{ id: cuidLike(), kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
        },
        items: {
          create: [
            {
              id: routineItemId,
              itemKey: routineItemKey,
              label: "Clean high-touch surfaces",
              instructions: "Wipe high-touch surfaces per procedure.",
              displaySequence: 10,
              priority: "ROUTINE",
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
              knowledgeArticleId: article.id,
              procedureTitleSnapshot: article.title,
              supervisorVisible: true,
            },
          ],
        },
      },
    });

    const oneOffPlanId = cuidLike();
    await db.departmentWorkPlan.create({
      data: {
        id: oneOffPlanId,
        facilityId: facility.id,
        departmentId: evs.id,
        stableKey: `evs_assign_discharge_${oneOffPlanId.slice(-6)}`,
        version: 1,
        name: "Assign Gate Discharge Ready",
        description: "Second published EVS plan for scale fixture",
        status: "PUBLISHED",
        publishedAt: new Date(),
        weekdays: [],
        applicabilities: {
          create: [{ id: cuidLike(), kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
        },
        items: {
          create: [
            {
              id: cuidLike(),
              itemKey: "discharge_wipe",
              label: "Discharge wipe-down",
              instructions: "Synthetic discharge clean checklist.",
              displaySequence: 10,
              priority: "TIME_SENSITIVE",
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
              supervisorVisible: true,
            },
          ],
        },
      },
    });

    // Confirmed plan + multi-room assignment for primary staff (east rooms 1–4)
    let plan = await db.operationalAssignmentPlan.findFirst({
      where: { facilityId: facility.id, departmentId: evs.id, serviceDate },
    });
    if (!plan) {
      plan = await db.operationalAssignmentPlan.create({
        data: {
          facilityId: facility.id,
          departmentId: evs.id,
          serviceDate,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedByUserId: manager.id,
        },
      });
    } else if (plan.status !== "CONFIRMED") {
      plan = await db.operationalAssignmentPlan.update({
        where: { id: plan.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedByUserId: manager.id,
        },
      });
    }

    const multiRoomSpaces = eastRooms.slice(0, 4);
    let multiAssign = await db.operationalAssignment.findFirst({
      where: {
        planId: plan.id,
        employeeId: staffEmp.id,
        roleKey: "CLEANING_ROUND",
      },
      select: { id: true },
    });
    if (!multiAssign) {
      multiAssign = await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: evs.id,
          planId: plan.id,
          serviceDate,
          employeeId: staffEmp.id,
          unitId: eastUnit.id,
          sourceZoneId: zoneEast.id,
          status: "PLANNED",
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          source: "MANUAL_ADDITION",
          startsAt: null,
          endsAt: null,
          locations: {
            create: multiRoomSpaces.map((s, index) => ({
              unitSpaceId: s.id,
              unitId: eastUnit.id,
              labelSnapshot: s.roomNumber
                ? `Room ${s.roomNumber}`
                : s.name,
              sortOrder: s.sortOrder ?? index + 1,
            })),
          },
        },
        select: { id: true },
      });
    } else {
      const locCount = await db.operationalAssignmentLocation.count({
        where: { assignmentId: multiAssign.id },
      });
      if (locCount === 0) {
        await db.operationalAssignmentLocation.createMany({
          data: multiRoomSpaces.map((s, index) => ({
            assignmentId: multiAssign.id,
            unitSpaceId: s.id,
            unitId: eastUnit.id,
            labelSnapshot: s.roomNumber ? `Room ${s.roomNumber}` : s.name,
            sortOrder: s.sortOrder ?? index + 1,
          })),
        });
      }
    }

    // Under-coverage hook: Floor 2 North has no assignment (rooms remain UNCOVERED).
    // Overlap scenario hook: two PLANNED assignments on west room 1 for same window.
    const westRoom1 = westRooms[0];
    const aideA = scaleStaff[0];
    const aideB = scaleStaff[1];
    if (westRoom1 && aideA && aideB) {
      const existingOverlap = await db.operationalAssignment.count({
        where: {
          planId: plan.id,
          locations: { some: { unitSpaceId: westRoom1.id } },
        },
      });
      if (existingOverlap < 2) {
        for (const aide of [aideA, aideB]) {
          const already = await db.operationalAssignment.findFirst({
            where: {
              planId: plan.id,
              employeeId: aide.employeeId,
              locations: { some: { unitSpaceId: westRoom1.id } },
            },
          });
          if (already) continue;
          await db.operationalAssignment.create({
            data: {
              facilityId: facility.id,
              departmentId: evs.id,
              planId: plan.id,
              serviceDate,
              employeeId: aide.employeeId,
              unitId: westUnit.id,
              status: "PLANNED",
              roleKey: "CLEANING_ROUND",
              roleLabel: "Cleaning Round",
              source: "MANUAL_ADDITION",
              startsAt: null,
              endsAt: null,
              notes: "overlap-hook",
              locations: {
                create: [
                  {
                    unitSpaceId: westRoom1.id,
                    unitId: westUnit.id,
                    labelSnapshot: westRoom1.roomNumber
                      ? `Room ${westRoom1.roomNumber}`
                      : westRoom1.name,
                    sortOrder: 1,
                  },
                ],
              },
            },
          });
        }
      }
    }

    // Schedule entries for primary staff + a few scale aides
    const scheduleExisting = await db.scheduleEntry.findFirst({
      where: { employeeId: staffEmp.id, date: serviceDate },
    });
    if (!scheduleExisting) {
      await db.scheduleEntry.create({
        data: {
          employeeId: staffEmp.id,
          date: serviceDate,
          shift: "FULL_DAY",
          roleType: "STAFF",
          unitId: eastUnit.id,
          plannedStart: "06:00",
          plannedEnd: "14:00",
        },
      });
    }
    for (const aide of scaleStaff.slice(0, 8)) {
      const exists = await db.scheduleEntry.findFirst({
        where: { employeeId: aide.employeeId, date: serviceDate },
      });
      if (!exists) {
        await db.scheduleEntry.create({
          data: {
            employeeId: aide.employeeId,
            date: serviceDate,
            shift: "FULL_DAY",
            roleType: "STAFF",
            unitId: eastUnit.id,
            plannedStart: "06:00",
            plannedEnd: "14:00",
          },
        });
      }
    }

    // EVS INSPECTION template (rework path available)
    const inspId = cuidLike();
    await db.operationalTemplate.create({
      data: {
        id: inspId,
        facilityId: facility.id,
        departmentId: evs.id,
        stableKey: `evs_assign_inspection_${inspId.slice(-6)}`,
        version: 1,
        name: "EVS Assign Room Inspection",
        purposeType: "INSPECTION",
        status: "PUBLISHED",
        publishedAt: new Date(),
        allowAdHoc: true,
        fields: {
          create: [
            {
              id: cuidLike(),
              fieldKey: "result",
              label: "Inspection result",
              fieldType: "PASS_NEEDS_ATTENTION",
              isRequired: true,
              displaySequence: 10,
              allowedSelections: ["PASS", "NEEDS_ATTENTION"],
              correctiveActionTrigger: true,
              correctiveActionRequired: false,
            },
          ],
        },
        applicabilities: {
          create: [{ id: cuidLike(), kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
        },
        schedules: {
          create: [{ id: cuidLike(), kind: "ONCE_PER_OPERATIONAL_DATE" }],
        },
      },
    });

    const asset = await db.asset.create({
      data: {
        id: cuidLike(),
        assetCode: `EVS-ASG-${cuidLike().slice(1, 7).toUpperCase()}`,
        name: "EVS Assign Supply Cart",
        equipmentType: "Cart",
        unitId: eastUnit.id,
        departmentId: evs.id,
        status: "OPERATIONAL",
        statusHistory: {
          create: {
            id: cuidLike(),
            fromStatus: null,
            toStatus: "OPERATIONAL",
            reason: "INITIAL",
            note: "EVS assignment browser fixture",
          },
        },
      },
      select: { id: true, assetCode: true, name: true },
    });

    const dietaryUnit =
      (await db.unit.findFirst({
        where: {
          facilityId: facility.id,
          isActive: true,
          unitType: { in: ["SERVERY", "KITCHEN", "RESIDENT_AREA"] },
          departmentResponsibilities: { some: { departmentId: dietary.id } },
        },
        select: { id: true, name: true },
      })) ??
      (await db.unit.findFirst({
        where: { facilityId: facility.id, name: "1A Naval Park", isActive: true },
        select: { id: true, name: true },
      }));

    const evsEmployeeCount = await db.employee.count({
      where: {
        facilityId: facility.id,
        status: "ACTIVE",
        OR: [
          { primaryDepartmentId: evs.id },
          { employeeDepartments: { some: { departmentId: evs.id } } },
        ],
      },
    });
    const supervisorCount = 2;

    const out = {
      facilityId: facility.id,
      facilityTimezone: facility.timezone || "America/New_York",
      departmentId: evs.id,
      dietaryDepartmentId: dietary.id,
      unitId: eastUnit.id,
      unitName: eastUnit.name,
      westUnitId: westUnit.id,
      westUnitName: westUnit.name,
      publicUnitId: publicUnit?.id ?? null,
      publicUnitName: publicUnit?.name ?? null,
      secondaryUnitId: westUnit.id,
      secondaryUnitName: westUnit.name,
      dietaryUnitId: dietaryUnit?.id ?? eastUnit.id,
      dietaryUnitName: dietaryUnit?.name ?? "Dietary Unit",
      floorIds: floors.map((f) => f.id),
      floorNames: floors.map((f) => f.name),
      unitIds: units.map((u) => u.id),
      roomCount,
      multiRoomSpaceIds: multiRoomSpaces.map((s) => s.id),
      multiRoomLabels: multiRoomSpaces.map((s) =>
        s.roomNumber ? `Room ${s.roomNumber}` : s.name,
      ),
      uncoveredUnitId: units.find((u) => u.name === "Floor 2 North")?.id ?? null,
      overlapSpaceId: westRoom1?.id ?? null,
      zoneEastId: zoneEast.id,
      zoneEastName: zoneEast.name,
      zoneWestId: zoneWest.id,
      zoneWestName: zoneWest.name,
      activeZoneCount: 2,
      serviceDateKey,
      managerEmail: manager.email,
      faWithEvsEmail: faWithEvs.email,
      supervisorEmail: supervisor.email,
      supervisor2Email: supervisor2.email,
      staffEmail: staff.email,
      dietaryStaffEmail: dietaryStaff.email,
      staffEmployeeId: staffEmp.id,
      supervisorEmployeeId: supervisorEmp.id,
      scaleAideEmployeeIds: scaleStaff.map((s) => s.employeeId),
      scaleEmployeeCount: evsEmployeeCount,
      supervisorCount,
      multiRoomAssignmentId: multiAssign.id,
      workPlanId: routinePlanId,
      workPlanItemId: routineItemId,
      workPlanItemKey: routineItemKey,
      workPlanName: "Assign Gate EVS Room Clean",
      secondaryWorkPlanId: oneOffPlanId,
      cycleId: cycle.id,
      cycleLabel: cycle.label,
      procedureArticleId: article.id,
      procedureTitle: article.title,
      inspectionTemplateId: inspId,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      assignmentsPath: "/staffing/assignments",
      workPlansPath: "/staffing/work-plans",
      cyclesPath: "/staffing/cycles",
      operationsBoardPath: "/staffing/operations",
      logBookPath: "/staffing/log-book",
      assetsPath: "/assets",
      unitWorkspacePath: `/unit/${eastUnit.id}`,
      dietaryUnitWorkspacePath: dietaryUnit ? `/unit/${dietaryUnit.id}` : `/unit/${eastUnit.id}`,
      staffPin,
      hooks: {
        underCoverageUnitName: "Floor 2 North",
        overlapNote: "overlap-hook",
        offlineStaffEmail: staff.email,
      },
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(out, null, 2));
    writeFileSync(
      PINS_PATH,
      [
        `EVS_ASSIGN_STAFF_PIN=${staffPin}`,
        `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`,
      ].join("\n") + "\n",
    );
    console.log(
      `evs-assignment-browser-fixtures: wrote ${FIXTURE_PATH} (rooms=${roomCount}, employees≈${evsEmployeeCount}, zones=2)`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
