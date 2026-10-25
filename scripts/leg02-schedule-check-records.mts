/**
 * Schedule checks that have no repair work as Records on the room or asset.
 * Mechanical room inspections, boiler and gauge readings, restroom rounds,
 * and dry-storage temperatures. An attachment that already covers the place
 * is left as it is. No work order is created.
 *
 * Requires LEG02_APPLY=1 to write.
 */
import { PrismaClient } from "@prisma/client";

import { createLogAttachment } from "../src/lib/canonical-logs/attachment-service";
import {
  DRY_STORAGE_AMBIENT,
  EQUIPMENT_READING,
  isDryStorage,
  isGaugeEquipment,
  isMechanicalRoom,
  isRestroom,
  MECHANICAL_ROOM_INSPECTION,
  RESTROOM_ROUND,
} from "../src/lib/canonical-logs/schedule-check";
import { isCanonicalLogsEnabled } from "../src/lib/feature-flags";
import { loadFacilityTimezone } from "../src/lib/operational-time/load-facility-timezone";
import { getFacilityServiceDate, toServiceDateKey } from "../src/lib/operational-time/service-date";
import { redactDatabaseUrl } from "./verify/lib/database-target.mjs";

const url = process.env.DATABASE_URL ?? "";
const target = redactDatabaseUrl(url);
if (!url) {
  console.error("leg02 checks: DATABASE_URL is unset.");
  process.exit(1);
}
if (!isCanonicalLogsEnabled()) {
  console.error("leg02 checks: CANONICAL_LOGS_ENABLED must be on.");
  process.exit(1);
}

const prisma = new PrismaClient();
const departments = await prisma.department.findMany({
  where: { isActive: true, key: { in: ["PLANT", "EVS", "DIETARY"] } },
  select: { id: true, facilityId: true, key: true },
});

type Place = {
  facilityId: string;
  departmentId: string;
  catalogStableKey: string;
  assetId?: string;
  spaceId?: string;
};

const places: Place[] = [];

for (const department of departments) {
  const spaces = await prisma.unitSpace.findMany({
    where: {
      facilityId: department.facilityId,
      isActive: true,
      OR: [
        { responsibilities: { some: { departmentId: department.id } } },
        { unit: { departmentResponsibilities: { some: { departmentId: department.id } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      facilityRoomType: { select: { baseTypeKey: true } },
    },
  });
  for (const space of spaces) {
    const room = { roomTypeKey: space.facilityRoomType?.baseTypeKey ?? null, name: space.name };
    const catalogStableKey =
      department.key === "PLANT" && isMechanicalRoom(room)
        ? MECHANICAL_ROOM_INSPECTION
        : department.key === "EVS" && isRestroom(room)
          ? RESTROOM_ROUND
          : department.key === "DIETARY" && isDryStorage(room)
            ? DRY_STORAGE_AMBIENT
            : null;
    if (!catalogStableKey) continue;
    places.push({
      facilityId: department.facilityId,
      departmentId: department.id,
      catalogStableKey,
      spaceId: space.id,
    });
  }

  if (department.key !== "PLANT") continue;
  const assets = await prisma.asset.findMany({
    where: { retiredAt: null, unit: { facilityId: department.facilityId } },
    select: { id: true, name: true, equipmentType: true, departmentId: true },
  });
  for (const asset of assets) {
    if (asset.departmentId && asset.departmentId !== department.id) continue;
    if (!isGaugeEquipment(asset)) continue;
    places.push({
      facilityId: department.facilityId,
      departmentId: department.id,
      catalogStableKey: EQUIPMENT_READING,
      assetId: asset.id,
    });
  }
}

const catalogByKey = new Map<string, { id: string } | null>();
async function catalog(stableKey: string) {
  if (catalogByKey.has(stableKey)) return catalogByKey.get(stableKey) ?? null;
  const row = await prisma.catalogLogDefinition.findFirst({
    where: { stableKey, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  catalogByKey.set(stableKey, row);
  return row;
}

const dates = new Map<string, string>();
async function effectiveFrom(facilityId: string) {
  const cached = dates.get(facilityId);
  if (cached) return cached;
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const key = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
  dates.set(facilityId, key);
  return key;
}

let scheduled = 0;
let already = 0;
let missingForm = 0;

if (process.env.LEG02_APPLY !== "1") {
  console.log(
    `leg02 checks: dry run at ${target}. ${places.length} rooms or assets match a check. Set LEG02_APPLY=1 to write.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

for (const place of places) {
  const form = await catalog(place.catalogStableKey);
  if (!form) {
    missingForm += 1;
    continue;
  }
  const existing = await prisma.logAttachment.findFirst({
    where: {
      facilityId: place.facilityId,
      departmentId: place.departmentId,
      catalogStableKey: place.catalogStableKey,
      status: "ACTIVE",
      ...(place.assetId ? { assetId: place.assetId } : { spaceId: place.spaceId }),
    },
    select: { id: true },
  });
  if (existing) {
    already += 1;
    continue;
  }
  try {
    await createLogAttachment(prisma, {
      facilityId: place.facilityId,
      departmentId: place.departmentId,
      catalogDefinitionId: form.id,
      effectiveFromKey: await effectiveFrom(place.facilityId),
      target: place.assetId
        ? { kind: "ASSET", assetId: place.assetId }
        : { kind: "SPACE", spaceId: place.spaceId },
    });
    scheduled += 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already exists")) {
      already += 1;
      continue;
    }
    throw error;
  }
}

console.log(
  `leg02 checks: scheduled ${scheduled} Records at ${target}. ${already} places were already covered. ${missingForm} checks had no published form.`,
);
await prisma.$disconnect();
