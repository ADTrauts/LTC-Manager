/**
 * SQL-backed CDA-03 tests: the Facility Administrator view fix, the missing-head list and
 * head-allowed managers. Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";

import {
  listDepartmentsNeedingHead,
  loadDepartmentStaffManagerChoices,
  resolveDepartmentStaffManagerIds,
  resolveFacilityAdministratorView,
  setDepartmentStaffManager,
} from "./index";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

const suffixLike = () => randomBytes(6).toString("hex");
const serviceDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

function session(overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId">): FacilitySession {
  return {
    uid: `user_${suffixLike()}`,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "FACILITY_ADMINISTRATOR",
    name: "CDA-03 Test",
    email: "cda03-test@example.com",
    sessionVersion: 1,
    ...overrides,
  } as FacilitySession;
}

test(
  "CDA-03: view fix, missing heads and head-allowed managers",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = suffixLike();
    try {
      const ecmc = await prisma.organization.create({ data: { name: `CDA03 ECMC ${suffix}` } });
      const metz = await prisma.organization.create({ data: { name: `CDA03 Metz ${suffix}` } });
      const facility = await prisma.facility.create({
        data: { organizationId: ecmc.id, displayName: `CDA03 Terrace View ${suffix}`, timezone: "America/New_York" },
      });
      const other = await prisma.facility.create({
        data: { organizationId: ecmc.id, displayName: `CDA03 Other ${suffix}` },
      });
      const department = (key: string, name: string, facilityId = facility.id) =>
        prisma.department.create({ data: { facilityId, key: `${key}_${suffix}`, name } });
      const plant = await department("PLANT", "Plant Operations");
      const evs = await department("EVS", "Environmental Services");
      const dietary = await department("DIETARY", "Food & Nutrition");
      const laundry = await department("LAUNDRY", "Laundry");
      const housekeeping = await department("HOUSEKEEPING", "Housekeeping");
      const elsewhere = await department("EVS", "Elsewhere EVS", other.id);
      await prisma.departmentOperatorRelationship.createMany({
        data: [
          { departmentId: plant.id, organizationId: ecmc.id, effectiveFrom: serviceDate("2026-01-01") },
          { departmentId: dietary.id, organizationId: metz.id, effectiveFrom: serviceDate("2026-01-01") },
        ],
      });

      const fa = session({ facilityId: facility.id });

      // View fix: self-operated (with or without an operator row) yes; vendor-run, other facility, other roles no.
      const view = (departmentId: string, s: FacilitySession = fa) =>
        resolveFacilityAdministratorView(prisma, s, { facilityId: facility.id, departmentId });
      assert.equal(await view(plant.id), true);
      assert.equal(await view(evs.id), true);
      assert.equal(await view(dietary.id), false);
      assert.equal(await view(elsewhere.id), false);
      assert.equal(await view(plant.id, session({ facilityId: facility.id, role: "MANAGER" })), false);
      assert.equal(await view(plant.id, session({ facilityId: other.id })), false);
      assert.equal(await view(plant.id, session({ facilityId: facility.id, authKind: "harbor_staff" })), false);

      // Missing heads.
      const employee = (data: {
        firstName: string;
        roleType: "GM" | "MANAGER" | "SUPERVISOR" | "STAFF";
        primaryDepartmentId: string | null;
        status?: "ACTIVE" | "TERMINATED";
        additional?: string[];
      }) =>
        prisma.employee.create({
          data: {
            facilityId: facility.id,
            firstName: data.firstName,
            lastName: suffix,
            roleType: data.roleType,
            primaryDepartmentId: data.primaryDepartmentId,
            status: data.status ?? "ACTIVE",
            employeeDepartments: data.additional
              ? { create: data.additional.map((departmentId) => ({ departmentId })) }
              : undefined,
          },
        });
      const evsHead = await employee({ firstName: "Erin", roleType: "MANAGER", primaryDepartmentId: evs.id });
      await prisma.department.update({ where: { id: evs.id }, data: { headEmployeeId: evsHead.id } });
      await employee({ firstName: "Pat", roleType: "GM", primaryDepartmentId: plant.id });
      const departed = await employee({
        firstName: "Lee",
        roleType: "MANAGER",
        primaryDepartmentId: laundry.id,
        status: "TERMINATED",
      });
      await prisma.department.update({ where: { id: laundry.id }, data: { headEmployeeId: departed.id } });

      const needing = await listDepartmentsNeedingHead(prisma, { facilityId: facility.id });
      assert.deepEqual(
        needing.map((row) => [row.name, row.status, row.formerHeadName]),
        [
          ["Housekeeping", "NO_HEAD", null],
          ["Laundry", "HEAD_LEFT", `Lee ${suffix}`],
        ],
      );
      assert.ok(!needing.some((row) => row.departmentId === dietary.id), "vendor-run Departments get their head from the vendor");
      assert.deepEqual(
        (await listDepartmentsNeedingHead(prisma, { facilityId: facility.id, departmentIds: [housekeeping.id, evs.id] })).map(
          (row) => row.departmentId,
        ),
        [housekeeping.id],
      );

      // Head-allowed managers.
      const manager = await employee({ firstName: "Morgan", roleType: "MANAGER", primaryDepartmentId: evs.id });
      const floatManager = await employee({
        firstName: "Riley",
        roleType: "MANAGER",
        primaryDepartmentId: plant.id,
        additional: [evs.id],
      });
      const supervisor = await employee({ firstName: "Sam", roleType: "SUPERVISOR", primaryDepartmentId: evs.id });
      const outsider = await employee({ firstName: "Alex", roleType: "MANAGER", primaryDepartmentId: plant.id });

      const choices = await loadDepartmentStaffManagerChoices(prisma, { facilityId: facility.id, departmentId: evs.id });
      assert.deepEqual(
        choices.map((row) => row.employeeId).sort(),
        [manager.id, floatManager.id].sort(),
        "the head, Supervisors and non-members are not choices",
      );

      const set = (employeeId: string, allowed: boolean) =>
        setDepartmentStaffManager(prisma, {
          facilityId: facility.id,
          departmentId: evs.id,
          employeeId,
          allowed,
          grantedByEmployeeId: evsHead.id,
        });
      await set(manager.id, true);
      await set(manager.id, true);
      await set(floatManager.id, true);
      for (const refused of [supervisor.id, outsider.id, evsHead.id]) {
        await assert.rejects(set(refused, true), /Only an active Manager in this Department/);
      }
      const allowedIds = () =>
        resolveDepartmentStaffManagerIds(prisma, { facilityId: facility.id, departmentId: evs.id });
      assert.deepEqual((await allowedIds()).sort(), [manager.id, floatManager.id].sort());
      assert.equal(
        await prisma.departmentStaffManager.count({ where: { departmentId: evs.id, employeeId: manager.id } }),
        1,
      );

      // A mark stops counting when the manager leaves the Department, and removal deletes it.
      await prisma.employeeDepartment.deleteMany({ where: { employeeId: floatManager.id, departmentId: evs.id } });
      assert.deepEqual(await allowedIds(), [manager.id]);
      await set(manager.id, false);
      assert.deepEqual(await allowedIds(), []);
      assert.equal(await prisma.departmentStaffManager.count({ where: { departmentId: evs.id, employeeId: manager.id } }), 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);
