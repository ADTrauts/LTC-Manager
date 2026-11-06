/**
 * CDA-06 handover fixture. Opt in with VERIFY_DATABASE_URL (or
 * DEPARTMENT_WORK_TEST_DATABASE_URL) pointing at a disposable database that has
 * the operator-period migration. Loaders that use the shared Prisma client also
 * need DATABASE_URL set to that same database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { loadPublishedCyclesForLogsOnDate } from "@/lib/canonical-logs/load-published-cycles-for-logs";
import {
  assignDepartmentOperator,
  ensureInitialDepartmentOperator,
} from "@/lib/department-operators/service";
import { catalogFormsWhereForViewer } from "@/lib/department-authority/catalog-forms";
import {
  facilityWorkforcePeriodWhere,
  listVendorArchive,
  operatorPeriodIdForCreate,
  withOperatorPeriod,
} from "@/lib/department-authority/operator-period";
import { acceptVendorHead, assignVendorHead } from "@/lib/department-authority/vendor-heads";
import { listVendorDepartmentPeople } from "@/lib/department-authority/vendor-workforce";
import { createOrganizationMembership, createOrganizationOnlyUserAccount } from "@/lib/organization-membership";
import { searchEvidenceRecords } from "@/lib/operational-evidence/log-book";
import { getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { loadDepartmentDaySchedule } from "@/lib/scheduling/load-department-day-schedule";
import { listMenus } from "@/lib/menu-db";
import { loadPublishedWorkPlansForDate } from "@/lib/department-work/work-plan-service";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const sameDatabase = Boolean(databaseUrl) && process.env.DATABASE_URL === databaseUrl;
const skip = !databaseUrl
  ? "set VERIFY_DATABASE_URL to a disposable migrated database to run these"
  : !sameDatabase
    ? "set DATABASE_URL to the same disposable database so shared loaders see the fixture"
    : false;

const FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";
const LOGS = "CANONICAL_LOGS_ENABLED";

function tag() {
  return randomBytes(4).toString("hex");
}

function day(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

function shiftKey(key: string, days: number) {
  const date = day(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function session(partial: Pick<FacilitySession, "uid" | "facilityId" | "role">): FacilitySession {
  return {
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    name: "CDA-06",
    email: "cda06@example.com",
    sessionVersion: 1,
    ...partial,
  } as FacilitySession;
}

test("a vendor handover hides the previous period and keeps compliance Records", { skip }, async () => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const previousFlag = process.env[FLAG];
  const previousLogs = process.env[LOGS];
  process.env[FLAG] = "true";
  process.env[LOGS] = "true";
  const today = toServiceDateKey(getFacilityServiceDate("America/New_York"));
  const yesterday = shiftKey(today, -1);

  try {
    const parent = await prisma.organization.create({ data: { name: `CDA06 Parent ${suffix}` } });
    const metz = await prisma.organization.create({
      data: { name: `CDA06 Metz ${suffix}`, displayName: "Metz Culinary" },
    });
    const sodexo = await prisma.organization.create({
      data: { name: `CDA06 Sodexo ${suffix}`, displayName: "Sodexo" },
    });
    const facility = await prisma.facility.create({
      data: {
        organizationId: parent.id,
        displayName: `CDA06 Terrace ${suffix}`,
        timezone: "America/New_York",
      },
    });
    const department = await prisma.department.create({
      data: { facilityId: facility.id, key: `CDA06_${suffix}`, name: "Food & Nutrition" },
    });
    const managerUser = await prisma.user.create({
      data: {
        email: `cda06-manager-${suffix}@example.com`,
        displayName: "Department Manager",
        facilityId: facility.id,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Morgan",
        lastName: "Manager",
        roleType: "MANAGER",
        primaryDepartmentId: department.id,
        userId: managerUser.id,
      },
    });

    await ensureInitialDepartmentOperator(prisma, {
      departmentId: department.id,
      facilityId: facility.id,
      effectiveFrom: day("2020-01-01"),
    });
    await assignDepartmentOperator(prisma, {
      departmentId: department.id,
      facilityId: facility.id,
      organizationId: metz.id,
      effectiveFromKey: "2020-06-01",
    });

    const stamp = () =>
      operatorPeriodIdForCreate(prisma, { facilityId: facility.id, departmentId: department.id });
    const metzPeriodId = await stamp();
    assert.ok(metzPeriodId);

    const metzMenu = await prisma.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        name: "Metz menu",
        operatorPeriodId: metzPeriodId,
      },
    });
    await prisma.departmentWorkPlan.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        stableKey: `metz-plan-${suffix}`,
        name: "Metz plan",
        status: "PUBLISHED",
        operatorPeriodId: metzPeriodId,
      },
    });
    await prisma.departmentOperationalCycle.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        stableKey: `metz-cycle-${suffix}`,
        label: "Metz breakfast",
        cycleType: "CUSTOM",
        status: "PUBLISHED",
        startLocal: "07:00",
        endLocal: "09:00",
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: day("2020-01-01"),
        operatorPeriodId: metzPeriodId,
      },
    });
    const mina = await prisma.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Mina",
        lastName: "Metz",
        roleType: "STAFF",
        primaryDepartmentId: department.id,
        operatorPeriodId: metzPeriodId,
      },
    });
    await prisma.scheduleEntry.create({
      data: {
        employeeId: mina.id,
        departmentId: department.id,
        date: day(today),
        shift: "FULL_DAY",
        operatorPeriodId: metzPeriodId,
      },
    });
    const record = async (name: string, periodId: string | null) => {
      const template = await ({ id: "retired-template", name: "Retired template", version: 1, stableKey: "retired", purposeType: "LOG", status: "PUBLISHED", fields: [] });
      return prisma.operationalEvidenceRecord.create({
        data: {
          facilityId: facility.id,
          departmentId: department.id,
          operatorPeriodId: periodId,
          templateStableKey: template.stableKey,
          templateVersion: 1,
          templateName: name,
          purposeType: "LOG",
          requirementKey: `${name}-req-${suffix}`,
          operationalDate: day(today),
          scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
          occurredAt: new Date(),
          templateSnapshotJson: { name },
        },
      });
    };
    const metzEvidence = await record("Metz cooler", metzPeriodId);
    await prisma.catalogLogDefinition.create({
      data: {
        stableKey: `metz-form-${suffix}`,
        name: "Metz cooler form",
        purposeType: "LOG",
        ownerKind: "ORGANIZATION",
        ownerOrganizationId: metz.id,
        operatorPeriodId: metzPeriodId,
      },
    });

    const metzAdmin = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda06-metz-admin-${suffix}@example.com`,
      displayName: "Metz Admin",
      emailVerifiedAt: new Date(),
    });
    const metzHead = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda06-metz-head-${suffix}@example.com`,
      displayName: "Metz GM",
      emailVerifiedAt: new Date(),
    });
    await createOrganizationMembership(prisma, {
      userId: metzAdmin.id,
      organizationId: metz.id,
      role: "ORG_ADMIN",
    });
    await createOrganizationMembership(prisma, {
      userId: metzHead.id,
      organizationId: metz.id,
      role: "ORG_MEMBER",
    });
    const metzAssignment = await assignVendorHead(prisma, {
      actorUserId: metzAdmin.id,
      organizationId: metz.id,
      departmentId: department.id,
      assigneeUserId: metzHead.id,
    });
    await acceptVendorHead(prisma, { actorUserId: metzHead.id, assignmentId: metzAssignment.id });

    const fa = session({ uid: `fa-${suffix}`, facilityId: facility.id, role: "FACILITY_ADMINISTRATOR" });
    const manager = session({ uid: managerUser.id, facilityId: facility.id, role: "MANAGER" });
    const evidenceIds = async (who: FacilitySession) => {
      const book = await searchEvidenceRecords(who, {
        facilityId: facility.id,
        departmentId: department.id,
      });
      return book.records.map((record) => record.id).sort();
    };

    assert.deepEqual(await evidenceIds(fa), [metzEvidence.id]);
    assert.deepEqual(await evidenceIds(manager), [metzEvidence.id]);
    assert.deepEqual(
      (await listVendorDepartmentPeople(prisma, { facilityId: facility.id, departmentId: department.id })).map(
        (person) => person.name,
      ),
      ["Mina Metz"],
    );
    const duringMetz = await loadDepartmentDaySchedule({
      facilityId: facility.id,
      departmentId: department.id,
      serviceDate: today,
    });
    assert.ok(duringMetz.employees.some((row) => row.projection.employeeId === mina.id));

    await assignDepartmentOperator(prisma, {
      departmentId: department.id,
      facilityId: facility.id,
      organizationId: sodexo.id,
      effectiveFromKey: yesterday,
    });
    const sodexoPeriodId = await stamp();
    assert.ok(sodexoPeriodId);
    assert.notEqual(sodexoPeriodId, metzPeriodId);

    const retiredMenu = await prisma.menu.findUniqueOrThrow({ where: { id: metzMenu.id } });
    assert.equal(retiredMenu.status, "INACTIVE");
    assert.equal(retiredMenu.operatorPeriodId, metzPeriodId);
    assert.equal(
      (await prisma.departmentWorkPlan.findFirstOrThrow({ where: { operatorPeriodId: metzPeriodId } })).status,
      "RETIRED",
    );
    assert.equal(
      (await prisma.departmentOperationalCycle.findFirstOrThrow({ where: { operatorPeriodId: metzPeriodId } })).status,
      "RETIRED",
    );

    const sodexoMenu = await prisma.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        name: "Sodexo menu",
        operatorPeriodId: sodexoPeriodId,
      },
    });
    await prisma.catalogLogDefinition.create({
      data: {
        stableKey: `sodexo-form-${suffix}`,
        name: "Sodexo cooler form",
        purposeType: "LOG",
        ownerKind: "ORGANIZATION",
        ownerOrganizationId: sodexo.id,
        operatorPeriodId: sodexoPeriodId,
      },
    });
    const sara = await prisma.employee.create({
      data: {
        facilityId: facility.id,
        firstName: "Sara",
        lastName: "Sodexo",
        roleType: "STAFF",
        primaryDepartmentId: department.id,
        operatorPeriodId: sodexoPeriodId,
      },
    });
    const sodexoEvidence = await record("Sodexo cooler", sodexoPeriodId);

    const menusFor = async () =>
      (await listMenus(prisma, { facilityId: facility.id, departmentId: department.id })).menus.map((menu) => menu.name);
    assert.deepEqual(await menusFor(), ["Sodexo menu"]);
    assert.deepEqual(
      (
        await loadPublishedWorkPlansForDate({
          facilityId: facility.id,
          departmentId: department.id,
          operationalDate: today,
        })
      ).map((plan) => plan.name),
      [],
    );
    assert.deepEqual(
      (
        await loadPublishedCyclesForLogsOnDate({
          client: prisma,
          facilityId: facility.id,
          departmentId: department.id,
          operationalDateKey: today,
          timezone: "America/New_York",
        })
      ).map((cycle) => cycle.label),
      [],
    );
    assert.deepEqual(
      (await listVendorDepartmentPeople(prisma, { facilityId: facility.id, departmentId: department.id })).map(
        (person) => person.id,
      ),
      [sara.id],
    );
    const facilityPeople = async () =>
      (
        await prisma.employee.findMany({
          where: withOperatorPeriod(
            { facilityId: facility.id },
            await facilityWorkforcePeriodWhere(prisma, facility.id),
          ),
          select: { firstName: true },
        })
      ).map((person) => person.firstName);
    assert.deepEqual(await facilityPeople(), ["Morgan"]);
    const afterSodexo = await loadDepartmentDaySchedule({
      facilityId: facility.id,
      departmentId: department.id,
      serviceDate: today,
    });
    assert.equal(
      afterSodexo.employees.some((row) => row.projection.employeeId === mina.id),
      false,
    );

    const formNames = (
      await prisma.catalogLogDefinition.findMany({
        where: await catalogFormsWhereForViewer(prisma, manager, facility.id),
        select: { name: true },
      })
    ).map((form) => form.name);
    assert.ok(formNames.includes("Sodexo cooler form"));
    assert.equal(formNames.includes("Metz cooler form"), false);

    const sodexoAdmin = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda06-sodexo-admin-${suffix}@example.com`,
      displayName: "Sodexo Admin",
      emailVerifiedAt: new Date(),
    });
    const sodexoHead = await createOrganizationOnlyUserAccount(prisma, {
      email: `cda06-sodexo-head-${suffix}@example.com`,
      displayName: "Sodexo GM",
      emailVerifiedAt: new Date(),
    });
    await createOrganizationMembership(prisma, {
      userId: sodexoAdmin.id,
      organizationId: sodexo.id,
      role: "ORG_ADMIN",
    });
    await createOrganizationMembership(prisma, {
      userId: sodexoHead.id,
      organizationId: sodexo.id,
      role: "ORG_MEMBER",
    });
    const sodexoAssignment = await assignVendorHead(prisma, {
      actorUserId: sodexoAdmin.id,
      organizationId: sodexo.id,
      departmentId: department.id,
      assigneeUserId: sodexoHead.id,
    });
    await acceptVendorHead(prisma, { actorUserId: sodexoHead.id, assignmentId: sodexoAssignment.id });

    assert.deepEqual((await evidenceIds(fa)).sort(), [metzEvidence.id, sodexoEvidence.id].sort());
    assert.deepEqual(await evidenceIds(manager), [sodexoEvidence.id]);

    const metzArchive = await listVendorArchive(prisma, metz.id);
    assert.equal(metzArchive.length, 1);
    assert.equal(metzArchive[0]?.department.name, "Food & Nutrition");
    assert.equal(metzArchive[0]?._count.menus, 1);
    assert.equal(metzArchive[0]?._count.workPlans, 1);
    assert.equal(metzArchive[0]?._count.operationalCycles, 1);
    assert.equal(metzArchive[0]?._count.employees, 1);
    assert.equal(metzArchive[0]?._count.evidenceRecords, 1);
    assert.equal((await listVendorArchive(prisma, sodexo.id)).length, 0);

    await assignDepartmentOperator(prisma, {
      departmentId: department.id,
      facilityId: facility.id,
      organizationId: parent.id,
      effectiveFromKey: today,
    });
    assert.equal(await stamp(), null);
    await prisma.menu.create({
      data: {
        facilityId: facility.id,
        departmentId: department.id,
        name: "House menu",
        operatorPeriodId: null,
      },
    });
    const houseEvidence = await record("House cooler", null);

    assert.equal((await prisma.menu.findUniqueOrThrow({ where: { id: sodexoMenu.id } })).status, "INACTIVE");
    assert.deepEqual(await menusFor(), ["House menu"]);
    assert.deepEqual((await evidenceIds(manager)).sort(), [houseEvidence.id]);
    assert.deepEqual(
      (await evidenceIds(fa)).sort(),
      [metzEvidence.id, sodexoEvidence.id, houseEvidence.id].sort(),
    );
    assert.equal((await listVendorArchive(prisma, sodexo.id)).length, 1);
    assert.equal((await listVendorArchive(prisma, metz.id)).length, 1);
    assert.equal(await prisma.menu.count({ where: { departmentId: department.id } }), 3);

    process.env[FLAG] = "false";
    assert.deepEqual((await menusFor()).sort(), ["House menu", "Metz menu", "Sodexo menu"]);
    assert.deepEqual(await listVendorArchive(prisma, metz.id), []);
  } finally {
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
    if (previousLogs === undefined) delete process.env[LOGS];
    else process.env[LOGS] = previousLogs;
    await prisma.$disconnect();
  }
});
