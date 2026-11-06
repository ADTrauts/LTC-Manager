/**
 * Adds synthetic people, assets, shifts, and Catalog Records at Terrace View.
 * Staging Neon only. Safe to run again: it stops when Main Kitchen already exists.
 *
 *   TERRACE_SAMPLE=1 npx tsx scripts/verify/terrace-view-sample-data.mts
 */
import { PrismaClient } from "@prisma/client";

import { randomBytes } from "node:crypto";

import { createLogAttachment } from "@/lib/canonical-logs/attachment-service";
import { ensureFacilityCatalogInstall } from "@/lib/canonical-logs/facility-catalog-install";
import { operatorPeriodIdForCreate } from "@/lib/department-authority/operator-period";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { createCanonicalShift } from "@/lib/scheduling/canonical-shift-service";

function fail(message: string): never {
  console.error(`terrace-sample: ${message}`);
  process.exit(1);
}

function assertStagingUrl(url: string) {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "");
  if (name === "ltc_manager" || name.startsWith("ltc_verify_") || name.startsWith("ltc_test_")) {
    fail(`refusing database ${name}`);
  }
  if (!parsed.hostname.endsWith(".neon.tech") || name !== "neondb") {
    fail("this sample runs only against the Neon staging database");
  }
}

async function main() {
  if (process.env.TERRACE_SAMPLE !== "1") fail("set TERRACE_SAMPLE=1");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is required");
  assertStagingUrl(url);
  process.env.CANONICAL_LOGS_ENABLED = "true";

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const facility = await db.facility.findFirst({
      where: { displayName: "Terrace View" },
      select: { id: true, timezone: true },
    });
    if (!facility) fail("Terrace View was not found");
    const already = await db.unit.findFirst({
      where: { facilityId: facility.id, name: "Main Kitchen" },
      select: { id: true },
    });
    if (already) {
      console.log("terrace-sample: Main Kitchen already exists; leaving Terrace View in place");
      return;
    }

    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY" },
      select: { id: true },
    });
    const plant = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "PLANT" },
      select: { id: true },
    });
    const actor = await db.user.findFirstOrThrow({
      where: { email: "plant.head@cda07.staging.test" },
      select: { id: true },
    });
    const dietaryPeriodId = await operatorPeriodIdForCreate(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
    });
    const serviceDate = toServiceDateKey(getFacilityServiceDate(facility.timezone || "America/New_York"));

    const kitchen = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: "Main Kitchen",
        unitType: "KITCHEN",
        hierarchyRole: "NEIGHBORHOOD",
        isActive: true,
        departmentResponsibilities: { create: { departmentId: dietary.id, kind: "PRIMARY" } },
      },
    });
    const servery = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: "Dining Room Servery",
        unitType: "SERVERY",
        hierarchyRole: "NEIGHBORHOOD",
        isActive: true,
        departmentResponsibilities: { create: { departmentId: dietary.id, kind: "PRIMARY" } },
      },
    });
    const mechanical = await db.unit.create({
      data: {
        facilityId: facility.id,
        name: "Mechanical Room",
        unitType: "MECHANICAL",
        hierarchyRole: "NEIGHBORHOOD",
        isActive: true,
        departmentResponsibilities: { create: { departmentId: plant.id, kind: "PRIMARY" } },
      },
    });

    const coolerSpace = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: kitchen.id,
        name: "Walk-in Cooler",
        spaceType: "STORAGE",
        isActive: true,
        responsibilities: { create: { departmentId: dietary.id } },
      },
    });
    const prepSpace = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: kitchen.id,
        name: "Prep Line",
        spaceType: "PRODUCTION_AREA",
        isActive: true,
        responsibilities: { create: { departmentId: dietary.id } },
      },
    });
    const boilerSpace = await db.unitSpace.create({
      data: {
        facilityId: facility.id,
        unitId: mechanical.id,
        name: "Boiler Room",
        spaceType: "MECHANICAL",
        isActive: true,
        responsibilities: { create: { departmentId: plant.id } },
      },
    });

    const person = async (
      firstName: string,
      lastName: string,
      roleType: "STAFF" | "SUPERVISOR",
      departmentId: string,
      periodId: string | null,
    ) => {
      const email = `${firstName}.${lastName}.terrace@cda07.staging.test`.toLowerCase();
      return db.employee.create({
        data: {
          facilityId: facility.id,
          firstName,
          lastName,
          email,
          roleType,
          status: "ACTIVE",
          primaryDepartmentId: departmentId,
          operatorPeriodId: periodId,
          employeeDepartments: { create: { departmentId, roleType } },
        },
      });
    };

    const jordan = await person("Jordan", "Hale", "STAFF", dietary.id, dietaryPeriodId);
    const priya = await person("Priya", "Shah", "STAFF", dietary.id, dietaryPeriodId);
    const elena = await person("Elena", "Ward", "SUPERVISOR", dietary.id, dietaryPeriodId);
    const marcus = await person("Marcus", "Bell", "STAFF", plant.id, null);
    const dana = await person("Dana", "Cho", "STAFF", plant.id, null);

    const asset = async (
      code: string,
      name: string,
      equipmentType: string,
      unitId: string,
      spaceId: string,
      departmentId: string,
    ) =>
      db.asset.create({
        data: {
          assetCode: code,
          name,
          equipmentType,
          unitId,
          spaceId,
          departmentId,
          status: "OPERATIONAL",
          criticality: equipmentType === "BOILER" ? "IMPORTANT" : "ROUTINE",
        },
      });

    const cooler = await asset("TV-COOLER-1", "Walk-in Cooler", "COOLER", kitchen.id, coolerSpace.id, dietary.id);
    await asset("TV-DISH-1", "Dishmachine", "DISHWASHER", kitchen.id, prepSpace.id, dietary.id);
    const boiler = await asset("TV-BOILER-1", "Domestic Boiler", "BOILER", mechanical.id, boilerSpace.id, plant.id);

    await db.repair.create({
      data: {
        repairCode: "TV-WO-1001",
        assetId: boiler.id,
        unitId: mechanical.id,
        spaceId: boilerSpace.id,
        title: "Boiler pilot will not stay lit",
        description: "The domestic boiler pilot drops out after a few minutes. Heat is still available on the backup.",
        priority: "HIGH",
        status: "OPEN",
        requestingDepartmentId: plant.id,
        responsibleDepartmentId: plant.id,
      },
    });

    for (const employee of [jordan, priya, elena]) {
      await createCanonicalShift({
        facilityId: facility.id,
        employeeId: employee.id,
        departmentId: dietary.id,
        serviceDate,
        plannedStart: "06:00",
        plannedEnd: "14:30",
        createdByUserId: actor.id,
      });
    }
    for (const employee of [marcus, dana]) {
      await createCanonicalShift({
        facilityId: facility.id,
        employeeId: employee.id,
        departmentId: plant.id,
        serviceDate,
        plannedStart: "07:00",
        plannedEnd: "15:30",
        createdByUserId: actor.id,
      });
    }

    const published = async (stableKey: string) => {
      const row = await db.catalogLogDefinition.findFirst({
        where: { stableKey, status: "PUBLISHED" },
        orderBy: { version: "desc" },
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      });
      if (!row) fail(`published catalog form ${stableKey} was not found`);
      await ensureFacilityCatalogInstall(db, {
        facilityId: facility.id,
        catalogDefinitionId: row.id,
        catalogStableKey: row.stableKey,
        catalogVersion: row.version,
      });
      return row;
    };

    const coolerForm = await published("cooler_temperature_log");
    const readingForm = await published("plant_basic_equipment_reading");
    const coolerAttachment = await createLogAttachment(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      catalogDefinitionId: coolerForm.id,
      target: { kind: "ASSET", assetId: cooler.id },
      effectiveFromKey: serviceDate,
    });
    await createLogAttachment(db, {
      facilityId: facility.id,
      departmentId: plant.id,
      catalogDefinitionId: readingForm.id,
      target: { kind: "ASSET", assetId: boiler.id },
      timingMode: "DAILY_WINDOWS",
      dailyWindows: [{ label: "Morning", startLocal: "06:00", endLocal: "12:00" }],
      effectiveFromKey: serviceDate,
    });

    const tempField = coolerForm.fields.find((field) => field.fieldType === "TEMPERATURE") ?? coolerForm.fields[0];
    if (!tempField) fail("cooler form has no field");
    const morning = await db.logAttachmentDailyWindow.findFirst({
      where: { attachmentId: coolerAttachment.id },
      orderBy: { displaySequence: "asc" },
    });
    await db.operationalEvidenceRecord.create({
      data: {
        id: `c${randomBytes(12).toString("hex")}`,
        facilityId: facility.id,
        departmentId: dietary.id,
        logAttachmentId: coolerAttachment.id,
        attachmentStableKey: coolerAttachment.stableKey,
        catalogDefinitionId: coolerForm.id,
        templateStableKey: coolerForm.stableKey,
        templateVersion: coolerForm.version,
        templateName: coolerForm.name,
        purposeType:
          coolerForm.purposeType === "CHECKLIST" || coolerForm.purposeType === "INSPECTION"
            ? coolerForm.purposeType
            : "LOG",
        requirementKey: `terrace-cooler-${serviceDate}-morning`,
        logRequirementKey: `terrace-cooler-${serviceDate}-morning`,
        operationalDate: new Date(`${serviceDate}T00:00:00.000Z`),
        scheduleKind: "FIXED_DAILY_WINDOW",
        cycleLabel: morning?.label ?? "Morning",
        windowStartLocal: morning?.startLocal ?? "06:00",
        windowEndLocal: morning?.endLocal ?? "12:00",
        assetId: cooler.id,
        status: "COMPLETED",
        occurredAt: new Date(),
        recordedByLabel: "Jordan Hale",
        recordedByEmployeeId: jordan.id,
        clientCommandId: `terrace-sample-cooler-${serviceDate}`,
        templateSnapshotJson: { name: coolerForm.name },
        values: {
          create: {
            id: `c${randomBytes(12).toString("hex")}`,
            fieldKey: tempField.fieldKey,
            label: tempField.label,
            fieldType: tempField.fieldType,
            valueNumber: 38,
          },
        },
      },
    });

    console.log(`terrace-sample: ready on ${serviceDate}`);
    console.log("terrace-sample: kitchen, servery, mechanical room");
    console.log("terrace-sample: 3 dietary people, 2 plant people, 3 assets, 1 open repair, cooler record filled");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "sample failed";
  console.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]"));
  process.exit(1);
});
