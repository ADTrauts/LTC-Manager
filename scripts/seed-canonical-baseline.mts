import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { installResolvedDepartmentProduct, resolveDepartmentProductForInstall } from "@/lib/department-products/install";
import { createFacilityRoomType } from "@/lib/facility-builder/facility-room-types";
import { legacyFieldsForFacilityRoomType, requireFacilityBaseType } from "@/lib/facility-builder/facility-base-types";
import { upsertPublishedCatalogSeeds } from "../prisma/apply-catalog-log-seeds.mjs";

const migrationName = "20261111120000_canonical_baseline";

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Set ${name}.`);
  return value;
}

async function main() {
  const url = new URL(required("VSSYL_BASELINE_DATABASE_URL"));
  const expectedDatabase = required("VSSYL_BASELINE_DATABASE_NAME");
  const facilityName = required("VSSYL_BASELINE_FACILITY_NAME").trim();
  const timezone = process.env.VSSYL_BASELINE_TIMEZONE?.trim() || "America/New_York";
  const ownerEmail = required("VSSYL_BASELINE_OWNER_EMAIL").trim().toLowerCase();
  const ownerName = required("VSSYL_BASELINE_OWNER_NAME").trim();
  const password = required("VSSYL_BASELINE_OWNER_PASSWORD");
  const floorName = required("VSSYL_BASELINE_FLOOR_NAME").trim();
  const neighborhoodName = required("VSSYL_BASELINE_NEIGHBORHOOD_NAME").trim();
  const roomName = required("VSSYL_BASELINE_ROOM_NAME").trim();
  const roomBaseType = requireFacilityBaseType(process.env.VSSYL_BASELINE_ROOM_TYPE_KEY?.trim() || "dining_area");
  const roomTypeLabel = process.env.VSSYL_BASELINE_ROOM_TYPE_LABEL?.trim() || roomBaseType.label;

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase ||
    (url.searchParams.get("schema") ?? "public") !== "public"
  ) {
    throw new Error("The connection does not match the expected database and schema.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error("Enter a valid owner email.");
  if (password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new Error("The owner password must be at least 12 characters and at most 72 bytes.");
  }
  new Intl.DateTimeFormat("en-US", { timeZone: timezone });

  const passwordHash = await bcrypt.hash(password, 12);
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  try {
    const result = await db.$transaction(async (tx) => {
      const [identity] = await tx.$queryRaw<Array<{ database: string; schema: string }>>`
        SELECT current_database() AS "database", current_schema() AS "schema"
      `;
      const migrations = await tx.$queryRaw<Array<{ name: string; finished: boolean }>>`
        SELECT migration_name AS "name", finished_at IS NOT NULL AND rolled_back_at IS NULL AS "finished"
        FROM "_prisma_migrations"
      `;
      if (
        identity?.database !== expectedDatabase ||
        identity.schema !== "public" ||
        migrations.length !== 1 ||
        migrations[0]?.name !== migrationName ||
        !migrations[0].finished
      ) {
        throw new Error("The target must have exactly the applied canonical baseline.");
      }

      await tx.$executeRaw`LOCK TABLE "Facility" IN SHARE ROW EXCLUSIVE MODE`;
      if (await tx.facility.count() || await tx.user.count() || await tx.organization.count()) {
        throw new Error("The canonical database already contains application setup.");
      }

      const now = new Date();
      const organization = await tx.organization.create({
        data: {
          name: `${facilityName} Organization`,
          organizationType: "LONG_TERM_CARE",
        },
      });
      const facility = await tx.facility.create({
        data: {
          displayName: facilityName,
          timezone,
          billingEmail: ownerEmail,
          organizationId: organization.id,
        },
      });
      const role = await tx.role.findUniqueOrThrow({ where: { key: "FACILITY_ADMINISTRATOR" } });
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          displayName: ownerName,
          passwordHash,
          emailVerifiedAt: now,
          roleId: role.id,
          facilityId: facility.id,
        },
      });
      await tx.userFacilityAccess.create({
        data: {
          userId: owner.id,
          facilityId: facility.id,
          rolePeriods: { create: { roleKey: "FACILITY_ADMINISTRATOR", startsAt: now } },
        },
      });
      await tx.userOrganizationMembership.create({
        data: {
          userId: owner.id,
          organizationId: organization.id,
          rolePeriods: { create: { role: "ORG_ADMIN", startsAt: now } },
        },
      });

      const departments = await Promise.all(["DIETARY", "PLANT"].map((key) =>
        installResolvedDepartmentProduct({
          facilityId: facility.id,
          product: resolveDepartmentProductForInstall(key),
          prisma: tx,
        }),
      ));
      const dietary = departments.find((department) => department.key === "DIETARY");
      if (!dietary) throw new Error("Food and Nutrition was not installed.");

      const names = ownerName.split(/\s+/);
      const employee = await tx.employee.create({
        data: {
          userId: owner.id,
          facilityId: facility.id,
          email: ownerEmail,
          firstName: names[0]!,
          lastName: names.slice(1).join(" "),
          roleType: "FACILITY_ADMINISTRATOR",
          primaryDepartmentId: dietary.id,
          employeeDepartments: {
            create: departments.filter((department) => department.id !== dietary.id).map(({ id }) => ({
              departmentId: id,
            })),
          },
        },
      });
      await tx.department.updateMany({
        where: { facilityId: facility.id, id: { in: departments.map(({ id }) => id) } },
        data: { headEmployeeId: employee.id },
      });

      const floor = await tx.unit.create({
        data: { facilityId: facility.id, name: floorName, unitType: "OTHER", hierarchyRole: "FLOOR" },
      });
      const neighborhood = await tx.unit.create({
        data: {
          facilityId: facility.id,
          name: neighborhoodName,
          unitType: "OTHER",
          hierarchyRole: "NEIGHBORHOOD",
          parentUnitId: floor.id,
        },
      });
      const roomType = await createFacilityRoomType({
        facilityId: facility.id,
        baseTypeKey: roomBaseType.key,
        displayName: roomTypeLabel,
      }, tx);
      const room = await tx.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: roomName,
          facilityRoomTypeId: roomType.id,
          ...legacyFieldsForFacilityRoomType(roomType),
          responsibilities: { create: { departmentId: dietary.id } },
        },
      });

      await upsertPublishedCatalogSeeds(tx);
      return {
        database: identity.database,
        facilityId: facility.id,
        ownerId: owner.id,
        departmentIds: departments.map(({ key, id }) => ({ key, id })),
        roomId: room.id,
      };
    }, { timeout: 60_000 });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && !("clientVersion" in error)
    ? error.message
    : "Database setup failed. Check the target and its migration status.";
  console.error(message);
  process.exitCode = 1;
});
