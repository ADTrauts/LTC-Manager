/**
 * SQL-backed Contracted Department Authority resolver tests (CDA-01).
 * Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";

import { syncEmployeeDepartmentMembership } from "@/lib/employee-membership/department";

import {
  loadDepartmentVisibility,
  resolveDepartmentAccessMap,
  resolveLedDepartmentIds,
  WORKFORCE_SPLIT_REASON,
} from "./index";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";

function suffixLike() {
  return randomBytes(6).toString("hex");
}

function session(overrides: Partial<FacilitySession> & Pick<FacilitySession, "facilityId">): FacilitySession {
  return {
    uid: `user_${suffixLike()}`,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role: "FACILITY_ADMINISTRATOR",
    name: "CDA Test",
    email: "cda-test@example.com",
    sessionVersion: 1,
    ...overrides,
  } as FacilitySession;
}

const serviceDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

test(
  "department authority: operator periods follow the facility service date, and access follows the flag",
  { skip: skipReason },
  async () => {
    assert.ok(databaseUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = suffixLike();
    const previousFlag = process.env[FLAG];

    try {
      const ecmc = await prisma.organization.create({ data: { name: `CDA ECMC ${suffix}` } });
      const metz = await prisma.organization.create({
        data: { name: `CDA Metz ${suffix}`, displayName: "Metz Culinary" },
      });
      const facility = await prisma.facility.create({
        data: { organizationId: ecmc.id, displayName: `CDA Terrace View ${suffix}`, timezone: "America/New_York" },
      });
      const otherFacility = await prisma.facility.create({
        data: { organizationId: ecmc.id, displayName: `CDA Other ${suffix}` },
      });
      const foodAndNutrition = await prisma.department.create({
        data: { facilityId: facility.id, key: `DIETARY_${suffix}`, name: "Food & Nutrition" },
      });
      const evs = await prisma.department.create({
        data: { facilityId: facility.id, key: `EVS_${suffix}`, name: "Environmental Services" },
      });
      const plant = await prisma.department.create({
        data: { facilityId: facility.id, key: `PLANT_${suffix}`, name: "Plant Operations" },
      });
      const elsewhere = await prisma.department.create({
        data: { facilityId: otherFacility.id, key: `EVS_${suffix}`, name: "Elsewhere EVS" },
      });

      const selfOperated = await prisma.departmentOperatorRelationship.create({
        data: {
          departmentId: foodAndNutrition.id,
          organizationId: ecmc.id,
          effectiveFrom: serviceDate("2026-01-01"),
          effectiveTo: serviceDate("2026-06-30"),
        },
      });
      const metzPeriod = await prisma.departmentOperatorRelationship.create({
        data: {
          departmentId: foodAndNutrition.id,
          organizationId: metz.id,
          effectiveFrom: serviceDate("2026-07-01"),
        },
      });
      const evsPeriod = await prisma.departmentOperatorRelationship.create({
        data: { departmentId: evs.id, organizationId: ecmc.id, effectiveFrom: serviceDate("2026-01-01") },
      });

      const evsHeadUser = await prisma.user.create({
        data: { email: `cda-evs-head-${suffix}@example.com`, displayName: "EVS Head" },
      });
      const evsHead = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Erin",
          lastName: "Head",
          roleType: "MANAGER",
          primaryDepartmentId: evs.id,
          userId: evsHeadUser.id,
        },
      });
      await prisma.department.update({ where: { id: evs.id }, data: { headEmployeeId: evsHead.id } });
      const plantGm = await prisma.employee.create({
        data: { facilityId: facility.id, firstName: "Pat", lastName: "Gm", roleType: "GM", primaryDepartmentId: plant.id },
      });
      const dietaryAide = await prisma.employee.create({
        data: {
          facilityId: facility.id,
          firstName: "Dana",
          lastName: "Aide",
          roleType: "STAFF",
          primaryDepartmentId: foodAndNutrition.id,
          employeeDepartments: { create: [{ departmentId: evs.id }] },
        },
      });

      const ids = [foodAndNutrition.id, evs.id, plant.id, elsewhere.id];
      const admin = session({ facilityId: facility.id });
      const lastSelfOperatedEvening = new Date("2026-07-01T03:30:00.000Z"); // June 30, 23:30 New York
      const firstMetzMorning = new Date("2026-07-01T04:30:00.000Z"); // July 1, 00:30 New York

      process.env[FLAG] = "true";

      const june30 = await resolveDepartmentAccessMap(prisma, admin, {
        facilityId: facility.id,
        departmentIds: ids,
        now: lastSelfOperatedEvening,
      });
      assert.equal(june30.has(elsewhere.id), false, "other facility's Department omitted");
      const fnJune30 = june30.get(foodAndNutrition.id)!;
      assert.equal(fnJune30.operatingModel, "FACILITY_OPERATED");
      assert.equal(fnJune30.operatorPeriodId, selfOperated.id);
      assert.equal(fnJune30.operatorName, null);
      assert.equal(fnJune30.mode, "VIEW");

      const july1 = await resolveDepartmentAccessMap(prisma, admin, {
        facilityId: facility.id,
        departmentIds: ids,
        now: firstMetzMorning,
      });
      const fnJuly1 = july1.get(foodAndNutrition.id)!;
      assert.equal(fnJuly1.operatingModel, "CONTRACTED");
      assert.equal(fnJuly1.operatorPeriodId, metzPeriod.id);
      assert.equal(fnJuly1.operatorName, "Metz Culinary");
      assert.equal(fnJuly1.vendorHeadAccepted, false);
      assert.equal(fnJuly1.mode, "MANAGE", "Facility Administrator manages until Metz's head accepts");
      assert.equal(july1.get(evs.id)!.operatorPeriodId, evsPeriod.id);
      assert.equal(july1.get(evs.id)!.mode, "VIEW");
      assert.equal(july1.get(plant.id)!.operatorPeriodId, null, "no operator row counts as self-operated");
      assert.equal(july1.get(plant.id)!.operatingModel, "FACILITY_OPERATED");
      assert.equal(july1.get(plant.id)!.mode, "VIEW");

      const headAccess = await resolveDepartmentAccessMap(
        prisma,
        session({ facilityId: facility.id, uid: evsHeadUser.id, role: "MANAGER" }),
        { facilityId: facility.id, departmentIds: ids, now: firstMetzMorning },
      );
      assert.equal(headAccess.get(evs.id)!.isHead, true);
      assert.equal(headAccess.get(evs.id)!.mode, "MANAGE");
      assert.equal(headAccess.get(plant.id)!.mode, "NONE");
      assert.equal(headAccess.get(foodAndNutrition.id)!.mode, "NONE");

      const gmAccess = await resolveDepartmentAccessMap(
        prisma,
        session({ facilityId: facility.id, uid: plantGm.id, authKind: "employee", authMethod: "QUICK_PIN", role: "GM" }),
        { facilityId: facility.id, departmentIds: ids, now: firstMetzMorning },
      );
      assert.equal(gmAccess.get(plant.id)!.isHead, true);
      assert.equal(gmAccess.get(plant.id)!.mode, "MANAGE");
      assert.equal(gmAccess.get(evs.id)!.mode, "NONE");

      const aideAccess = await resolveDepartmentAccessMap(
        prisma,
        session({ facilityId: facility.id, uid: dietaryAide.id, authKind: "employee", authMethod: "QUICK_PIN", role: "STAFF" }),
        { facilityId: facility.id, departmentIds: ids, now: firstMetzMorning },
      );
      assert.equal(aideAccess.get(foodAndNutrition.id)!.isMember, true);
      assert.equal(aideAccess.get(foodAndNutrition.id)!.mode, "MANAGE");
      assert.equal(aideAccess.get(evs.id)!.isMember, true, "additional Department membership");
      assert.equal(aideAccess.get(plant.id)!.mode, "NONE");

      const headSession = session({ facilityId: facility.id, uid: evsHeadUser.id, role: "MANAGER" });
      const headVisible = await loadDepartmentVisibility(prisma, headSession, facility.id);
      assert.ok(headVisible);
      assert.equal(headVisible.departmentIds.has(evs.id), true);
      assert.equal(headVisible.departmentIds.has(foodAndNutrition.id), false);
      assert.equal(headVisible.departmentIds.has(plant.id), false);
      assert.equal(headVisible.seesEveryAsset, false);
      const adminVisible = await loadDepartmentVisibility(prisma, admin, facility.id);
      assert.equal(adminVisible?.coversEveryDepartment, true);
      assert.equal(adminVisible?.seesEveryAsset, true);
      assert.equal(adminVisible?.departmentIds.has(elsewhere.id), false);

      await assert.rejects(
        () =>
          syncEmployeeDepartmentMembership(prisma, {
            employeeId: dietaryAide.id,
            facilityId: facility.id,
            primaryDepartmentId: foodAndNutrition.id,
            additionalDepartmentIds: [evs.id],
          }),
        new Error(WORKFORCE_SPLIT_REASON),
      );

      process.env[FLAG] = "false";
      const saved = await syncEmployeeDepartmentMembership(prisma, {
        employeeId: dietaryAide.id,
        facilityId: facility.id,
        primaryDepartmentId: foodAndNutrition.id,
        additionalDepartmentIds: [evs.id],
      });
      assert.deepEqual(saved.membership.additionalDepartmentIds, [evs.id]);
      assert.equal(await loadDepartmentVisibility(prisma, headSession, facility.id), null);
      const flagOff = await resolveDepartmentAccessMap(prisma, admin, {
        facilityId: facility.id,
        departmentIds: ids,
        now: firstMetzMorning,
      });
      for (const access of flagOff.values()) {
        assert.equal(access.mode, "MANAGE");
        assert.equal(access.reason, null);
      }
      assert.equal(flagOff.get(foodAndNutrition.id)!.operatorPeriodId, metzPeriod.id);

      assert.deepEqual(await resolveLedDepartmentIds(prisma, { facilityId: facility.id, employeeId: evsHead.id }), [
        evs.id,
      ]);
      assert.deepEqual(await resolveLedDepartmentIds(prisma, { facilityId: facility.id, employeeId: plantGm.id }), [
        plant.id,
      ]);
      assert.deepEqual(
        await resolveLedDepartmentIds(prisma, { facilityId: facility.id, employeeId: dietaryAide.id }),
        [],
      );
    } finally {
      if (previousFlag === undefined) delete process.env[FLAG];
      else process.env[FLAG] = previousFlag;

      const inTestFacilities = { facility: { organization: { name: { contains: suffix } } } };
      await prisma.department.updateMany({ where: inTestFacilities, data: { headEmployeeId: null } });
      await prisma.employeeDepartment.deleteMany({ where: { employee: inTestFacilities } });
      await prisma.employee.deleteMany({ where: inTestFacilities });
      await prisma.user.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.departmentOperatorRelationship.deleteMany({ where: { department: inTestFacilities } });
      await prisma.department.deleteMany({ where: inTestFacilities });
      await prisma.facility.deleteMany({ where: { organization: { name: { contains: suffix } } } });
      await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
      await prisma.$disconnect();
    }
  },
);
