#!/usr/bin/env node
/**
 * Phase 12A Plant browser fixtures (synthetic names only, no PHI).
 * Disposable VERIFY_DATABASE_URL only.
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
  process.env.PLANT_BROWSER_ARTIFACT_DIR_NAME || "plant-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.PLANT_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`plant-browser-fixtures: FAIL — ${message}`);
  process.exit(1);
}

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
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

async function main() {
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");

  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`plant-browser-fixtures: target ${target.databaseName}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, timezone: true, displayName: true },
    });
    const plant = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "PLANT", isActive: true },
      select: { id: true, name: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    });
    const evs = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true, name: true },
    });

    const manager = await upsertUser(db, {
      email: "plant.manager@ltc.local",
      displayName: "Plant Browser Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: plant.id,
    });
    const supervisor = await upsertUser(db, {
      email: "plant.supervisor@ltc.local",
      displayName: "Plant Browser Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: plant.id,
    });
    const staff = await upsertUser(db, {
      email: "plant.staff@ltc.local",
      displayName: "Plant Browser Technician",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: plant.id,
    });
    const dietaryStaff = await upsertUser(db, {
      email: "plant.dietary.staff@ltc.local",
      displayName: "Plant Gate Dietary Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const faWithout = await upsertUser(db, {
      email: "plant.fa.no-plant@ltc.local",
      displayName: "Plant FA Without Plant",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    const techPin = "246810";
    const techEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Plant",
      lastName: "TechOne",
      departmentId: plant.id,
      roleType: "STAFF",
      pinDigestValue: pinDigest(facility.id, techPin),
    });

    const techEmployees = [techEmp];
    for (let i = 2; i <= 10; i += 1) {
      const emp = await ensureEmployee(db, {
        facilityId: facility.id,
        email: `plant.tech${i}@ltc.local`,
        firstName: "Plant",
        lastName: `Tech${String(i).padStart(2, "0")}`,
        departmentId: plant.id,
        roleType: "STAFF",
      });
      techEmployees.push(emp);
    }

    await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "Plant",
      lastName: "SupervisorEmp",
      departmentId: plant.id,
      roleType: "SUPERVISOR",
    });

    // Floors / mechanical units
    const floors = [];
    for (const name of ["Plant Floor A", "Plant Floor B"]) {
      let unit = await db.unit.findFirst({ where: { facilityId: facility.id, name } });
      if (!unit) {
        unit = await db.unit.create({
          data: {
            facilityId: facility.id,
            name,
            unitType: "MECHANICAL",
            hierarchyRole: "FLOOR",
            displayOrder: 400 + floors.length,
            isActive: true,
          },
        });
      }
      await db.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: plant.id } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: plant.id, kind: "PRIMARY" },
      });
      floors.push(unit);
    }

    const servery = await db.unit.findFirst({
      where: { facilityId: facility.id, unitType: "SERVERY", isActive: true },
    });
    if (servery) {
      await db.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: servery.id, departmentId: plant.id } },
        update: {},
        create: { unitId: servery.id, departmentId: plant.id, kind: "SUPPORT" },
      });
    }

    // Routes Dietary/EVS → Plant
    for (const requesting of [dietary, evs]) {
      await db.departmentRequestRoute.upsert({
        where: {
          facilityId_requestingDepartmentId_responsibleDepartmentId: {
            facilityId: facility.id,
            requestingDepartmentId: requesting.id,
            responsibleDepartmentId: plant.id,
          },
        },
        update: { isActive: true, sortOrder: 10 },
        create: {
          id: cuidLike(),
          facilityId: facility.id,
          requestingDepartmentId: requesting.id,
          responsibleDepartmentId: plant.id,
          isActive: true,
          sortOrder: 10,
          note: "Synthetic Plant route",
        },
      });
    }

    // Zones
    let zone = await db.departmentOperationalZone.findFirst({
      where: { facilityId: facility.id, departmentId: plant.id, name: "Plant Zone North" },
    });
    if (!zone) {
      zone = await db.departmentOperationalZone.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: plant.id,
          name: "Plant Zone North",
          status: "ACTIVE",
          createdByUserId: manager.id,
        },
      });
    }

    // Assets (40)
    const assets = [];
    for (let i = 0; i < 40; i += 1) {
      const code = `PLT-A${String(i + 1).padStart(3, "0")}`;
      let asset = await db.asset.findFirst({ where: { assetCode: code } });
      if (!asset) {
        asset = await db.asset.create({
          data: {
            assetCode: code,
            name: `Synthetic Plant Asset ${i + 1}`,
            equipmentType: i % 5 === 0 ? "HVAC" : i % 3 === 0 ? "PLUMBING" : "ELECTRICAL",
            unitId: floors[i % floors.length].id,
            departmentId: plant.id,
            status: i === 3 ? "OUT_OF_SERVICE" : i === 7 ? "DEGRADED" : "OPERATIONAL",
            criticality: i < 5 ? "CRITICAL" : "ROUTINE",
            createdByUserId: manager.id,
          },
        });
      }
      assets.push(asset);
    }

    const vendor =
      (await db.vendor.findFirst({ where: { facilityId: facility.id } })) ??
      (await db.vendor.create({
        data: {
          facilityId: facility.id,
          name: "Synthetic Plant Vendor Co",
          contactName: "Vendor Contact",
        },
      }));

    // Foreign vendor on another facility if present — for reject tests
    const otherFacility = await db.facility.findFirst({
      where: { id: { not: facility.id } },
      select: { id: true },
    });
    let foreignVendorId = null;
    if (otherFacility) {
      const fv = await db.vendor.create({
        data: {
          facilityId: otherFacility.id,
          name: `Foreign Vendor ${cuidLike().slice(0, 6)}`,
        },
      });
      foreignVendorId = fv.id;
    }

    // Seed requests + WOs
    const dietaryRequest = await db.operationalRequest.create({
      data: {
        id: cuidLike(),
        requestCode: `OR-PLT-${cuidLike().slice(1, 7).toUpperCase()}`,
        facilityId: facility.id,
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: plant.id,
        unitId: servery?.id ?? floors[0].id,
        assetId: assets[0].id,
        summary: "Dish machine leak — dietary reported",
        description: "Standing water under dishwasher",
        status: "REPORTED",
        priority: "URGENT",
        operationalImpact: "SERVICE_AT_RISK",
        equipmentRemainsUsable: false,
        observedAt: new Date(),
        reportedByUserId: dietaryStaff.id,
        reportedByLabel: "Plant Gate Dietary Staff",
        requesterVisibleStatusSummary: "Reported",
      },
    });

    const assignedWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-PLT-${cuidLike().slice(1, 7).toUpperCase()}`,
        unitId: floors[0].id,
        assetId: assets[1].id,
        title: "Assigned HVAC filter WO",
        description: "Replace filter",
        priority: "HIGH",
        status: "ASSIGNED",
        requestingDepartmentId: plant.id,
        responsibleDepartmentId: plant.id,
        assignedEmployeeId: techEmp.id,
        reportedById: supervisor.id,
      },
    });

    const waitingVendorWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-PLT-V${cuidLike().slice(1, 6).toUpperCase()}`,
        unitId: floors[0].id,
        assetId: assets[2].id,
        title: "Waiting vendor compressor",
        description: "Awaiting vendor",
        priority: "MEDIUM",
        status: "WAITING_ON_VENDOR",
        requestingDepartmentId: plant.id,
        responsibleDepartmentId: plant.id,
        vendorId: vendor.id,
        reportedById: manager.id,
      },
    });

    const waitingPartsWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-PLT-P${cuidLike().slice(1, 6).toUpperCase()}`,
        unitId: floors[1].id,
        title: "Waiting parts faucet",
        description: "Parts on order",
        priority: "LOW",
        status: "WAITING_PARTS",
        requestingDepartmentId: plant.id,
        responsibleDepartmentId: plant.id,
        reportedById: manager.id,
      },
    });

    const completedWo = await db.repair.create({
      data: {
        id: cuidLike(),
        repairCode: `R-PLT-C${cuidLike().slice(1, 6).toUpperCase()}`,
        unitId: floors[0].id,
        assetId: assets[3].id,
        title: "Completed pump seal — RTS pending",
        description: "Seal replaced",
        priority: "HIGH",
        status: "COMPLETED",
        requestingDepartmentId: plant.id,
        responsibleDepartmentId: plant.id,
        assignedEmployeeId: techEmp.id,
        completedAt: new Date(),
        workPerformed: "Replaced seal",
        reportedById: manager.id,
      },
    });

    // Procedure / work plan / evidence stubs via KnowledgeArticle if table exists
    let procedureId = null;
    try {
      const article = await db.knowledgeArticle.create({
        data: {
          facilityId: facility.id,
          departmentId: plant.id,
          title: "Synthetic Plant Lockout Procedure",
          body: "Synthetic procedure body for browser gate.",
          status: "PUBLISHED",
          category: "SAFETY",
          createdByUserId: manager.id,
          updatedByUserId: manager.id,
          publishedAt: new Date(),
        },
      });
      procedureId = article.id;
    } catch {
      // optional
    }

    const fixtures = {
      facilityId: facility.id,
      facilityName: facility.displayName,
      plantDepartmentId: plant.id,
      dietaryDepartmentId: dietary.id,
      evsDepartmentId: evs.id,
      floors: floors.map((f) => ({ id: f.id, name: f.name })),
      serveryUnitId: servery?.id ?? null,
      assets: assets.slice(0, 12).map((a) => ({
        id: a.id,
        assetCode: a.assetCode,
        name: a.name,
        status: a.status,
      })),
      oosAssetId: assets[3].id,
      vendorId: vendor.id,
      foreignVendorId,
      dietaryRequestId: dietaryRequest.id,
      dietaryRequestCode: dietaryRequest.requestCode,
      assignedWorkOrderId: assignedWo.id,
      assignedWorkOrderCode: assignedWo.repairCode,
      waitingVendorWorkOrderId: waitingVendorWo.id,
      waitingPartsWorkOrderId: waitingPartsWo.id,
      completedWorkOrderId: completedWo.id,
      procedureId,
      zoneId: zone.id,
      users: {
        manager: { email: manager.email, password: SYNTHETIC_PASSWORD },
        supervisor: { email: supervisor.email, password: SYNTHETIC_PASSWORD },
        staff: { email: staff.email, password: SYNTHETIC_PASSWORD },
        dietaryStaff: { email: dietaryStaff.email, password: SYNTHETIC_PASSWORD },
        faWithout: { email: faWithout.email, password: SYNTHETIC_PASSWORD },
      },
      techEmployeeId: techEmp.id,
      techCount: techEmployees.length,
    };

    writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
    writeFileSync(
      PINS_PATH,
      [
        `PLANT_BROWSER_TECH_PIN=${techPin}`,
        `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`,
      ].join("\n"),
    );
    console.log(`plant-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
