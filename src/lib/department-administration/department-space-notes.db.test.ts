/**
 * Phase 2D-3 Department × Space notes — disposable DB only.
 * Opt in via VERIFY_DATABASE_URL / DEPARTMENT_WORK_TEST_DATABASE_URL.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { evaluateDatabaseTarget, redactDatabaseUrl } from "@/lib/verify/database-target";

import {
  loadDepartmentSpaceNotes,
  updateDepartmentSpaceNote,
} from "./department-space-notes";

const databaseUrl =
  process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

test(
  "department space notes: independent membership-bound notes without operational inference",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const target = evaluateDatabaseTarget(databaseUrl);
    if (!target.ok) {
      throw new Error(
        `refusing non-disposable database: ${target.reason} (${redactDatabaseUrl(databaseUrl)})`,
      );
    }

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = cuidLike().slice(-8);

    try {
      const org = await prisma.organization.create({
        data: { name: `2D3 Notes Org ${suffix}` },
      });
      const facility = await prisma.facility.create({
        data: {
          organizationId: org.id,
          displayName: `2D3 Notes Facility ${suffix}`,
        },
      });
      const dietary = await prisma.department.create({
        data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Dietary" },
      });
      const evs = await prisma.department.create({
        data: { facilityId: facility.id, key: `EVS_${suffix}`, name: "Environmental Services" },
      });
      const floor = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Floor 2 ${suffix}`,
          unitType: "OTHER",
          hierarchyRole: "FLOOR",
        },
      });
      const neighborhood = await prisma.unit.create({
        data: {
          facilityId: facility.id,
          name: `Neighborhood 2A ${suffix}`,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "NEIGHBORHOOD",
          parentUnitId: floor.id,
        },
      });
      const roomType = await prisma.facilityRoomType.create({
        data: {
          facilityId: facility.id,
          baseTypeKey: "guest_room",
          displayName: `Resident Room ${suffix}`,
        },
      });
      const shared = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "2A202",
          spaceType: "PATIENT_ROOM",
          facilityRoomTypeId: roomType.id,
          roomNumber: "202",
          description: "Facility physical description",
        },
      });
      const sibling = await prisma.unitSpace.create({
        data: {
          facilityId: facility.id,
          unitId: neighborhood.id,
          name: "2A203",
          spaceType: "PATIENT_ROOM",
          facilityRoomTypeId: roomType.id,
          roomNumber: "203",
        },
      });

      await prisma.unitSpaceResponsibility.createMany({
        data: [
          { spaceId: shared.id, departmentId: dietary.id, capabilities: [] },
          { spaceId: shared.id, departmentId: evs.id, capabilities: [] },
          { spaceId: sibling.id, departmentId: dietary.id, capabilities: [] },
        ],
      });

      await updateDepartmentSpaceNote(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        spaceId: shared.id,
        notes: "Dietary: tray pass staging",
      });
      await updateDepartmentSpaceNote(prisma, {
        facilityId: facility.id,
        departmentId: evs.id,
        spaceId: shared.id,
        notes: "EVS: cart parking only",
      });

      const dietaryNotes = await loadDepartmentSpaceNotes(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        spaceIds: [shared.id, sibling.id],
      });
      const evsNotes = await loadDepartmentSpaceNotes(prisma, {
        facilityId: facility.id,
        departmentId: evs.id,
        spaceIds: [shared.id, sibling.id],
      });

      assert.equal(dietaryNotes.get(shared.id), "Dietary: tray pass staging");
      assert.equal(evsNotes.get(shared.id), "EVS: cart parking only");
      assert.equal(dietaryNotes.get(sibling.id), null);
      assert.equal(evsNotes.has(sibling.id), false);

      await updateDepartmentSpaceNote(prisma, {
        facilityId: facility.id,
        departmentId: dietary.id,
        spaceId: shared.id,
        notes: "   ",
      });

      const dietaryRow = await prisma.unitSpaceResponsibility.findUniqueOrThrow({
        where: {
          spaceId_departmentId: { spaceId: shared.id, departmentId: dietary.id },
        },
      });
      const evsRow = await prisma.unitSpaceResponsibility.findUniqueOrThrow({
        where: { spaceId_departmentId: { spaceId: shared.id, departmentId: evs.id } },
      });
      const space = await prisma.unitSpace.findUniqueOrThrow({ where: { id: shared.id } });

      assert.equal(dietaryRow.notes, null);
      assert.equal(evsRow.notes, "EVS: cart parking only");
      assert.equal(space.description, "Facility physical description");

      await prisma.unitSpaceResponsibility.delete({
        where: {
          spaceId_departmentId: { spaceId: sibling.id, departmentId: dietary.id },
        },
      });
      await assert.rejects(
        () =>
          updateDepartmentSpaceNote(prisma, {
            facilityId: facility.id,
            departmentId: dietary.id,
            spaceId: sibling.id,
            notes: "orphan",
          }),
        /not responsible/,
      );

      assert.equal(
        await prisma.logAttachment.count({ where: { facilityId: facility.id, spaceId: shared.id } }),
        0,
      );
      assert.equal(
        await prisma.departmentOperationalCycleLocation.count({ where: { spaceId: shared.id } }),
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
