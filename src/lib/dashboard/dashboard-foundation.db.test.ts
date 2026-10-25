/**
 * SQL-backed Dashboard foundation tests (DSH-01).
 * Opt in via VERIFY_DATABASE_URL pointing at a disposable migrated database. Loaders that use the
 * shared Prisma client also need DATABASE_URL to be that database, as `verify:db` and `test:db` set it.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { loadWorkspaceNonOperationalExtras } from "@/lib/dashboard/activity";
import { resolveLedDepartmentIds } from "@/lib/department-authority";
import { canManageDepartmentHeadSettings } from "@/lib/dept-settings-access";
import { presentExceptionFirstLocationBoard } from "@/lib/locations/exception-first/from-runtime-state";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";
import { loadPresenceCallOffs } from "@/lib/scheduling/load-presence-call-offs";
import type { TodaysExpectedWorkView } from "@/lib/work/expected/types";

import { attentionFromRuntimeLocations } from "./attention-mappers";
import { loadAttention, loadExpectedWork } from "./cards/load";
import { presentExpectedWork } from "./cards/present";
import { isDashboardEngineAdmitted, resolveDepartmentDashboardCapabilities } from "./capabilities";
import { createDashboardFactPack } from "./facts";
import { resolveDashboardViewer } from "./viewer";
import type { DashboardViewer } from "./viewer/types";

const databaseUrl = process.env.DEPARTMENT_WORK_TEST_DATABASE_URL || process.env.VERIFY_DATABASE_URL;

const skipReason = databaseUrl
  ? false
  : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";
const sharedClientSkip =
  databaseUrl && process.env.DATABASE_URL === databaseUrl
    ? false
    : "shared-client loaders need DATABASE_URL to be the disposable database";

const CDA_FLAG = "CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED";
const LAST_SELF_OPERATED_EVENING = new Date("2026-07-01T03:30:00.000Z"); // June 30, 23:30 New York
const FIRST_METZ_MORNING = new Date("2026-07-01T04:30:00.000Z"); // July 1, 00:30 New York

function suffixLike() {
  return randomBytes(6).toString("hex");
}

const serviceDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

function assertExpectedCounts(view: TodaysExpectedWorkView, card: Awaited<ReturnType<typeof loadExpectedWork>>) {
  const items = [...view.currentGroups.flatMap((group) => group.locations), ...view.otherWork].flatMap((location) =>
    location.plans.flatMap((plan) => plan.items),
  );
  const late = items.filter((item) => item.state === "PAST_DUE_NOT_CONFIRMED" || item.state === "CONFLICT_REVIEW").length;
  const due = items.filter((item) => item.state === "DUE" || item.state === "CURRENT").length;
  if (late + due === 0) {
    assert.equal(card.state, "quiet");
    return;
  }
  assert.equal(card.state, "ready");
  if (card.state !== "ready") return;
  assert.equal(card.model.metrics.find((metric) => metric.label === "Late")?.value, late);
  assert.equal(card.model.metrics.find((metric) => metric.label === "Due")?.value, due);
}

function userSession(facilityId: string, role: FacilitySession["role"]): FacilitySession {
  return {
    uid: `user_${suffixLike()}`,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    role,
    name: "DSH Test",
    email: "dsh-test@example.com",
    facilityId,
    sessionVersion: 1,
  } as FacilitySession;
}

function employeeSession(facilityId: string, employeeId: string, role: FacilitySession["role"]): FacilitySession {
  return {
    uid: employeeId,
    authKind: "employee",
    authMethod: "QUICK_PIN",
    scopeKind: "facility",
    role,
    name: "DSH Employee",
    email: "dsh-employee@example.com",
    facilityId,
    sessionVersion: 1,
  } as FacilitySession;
}

test("dashboard foundation against the real schema", { skip: skipReason }, async (t) => {
  assert.ok(databaseUrl);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = suffixLike();
  const previousFlag = process.env[CDA_FLAG];
  const inTestFacility = { facility: { organization: { name: { contains: suffix } } } };

  try {
    const owner = await prisma.organization.create({ data: { name: `DSH Owner ${suffix}` } });
    const metz = await prisma.organization.create({
      data: { name: `DSH Metz ${suffix}`, displayName: "Metz Culinary" },
    });
    const facility = await prisma.facility.create({
      data: { organizationId: owner.id, displayName: `DSH Facility ${suffix}`, timezone: "America/New_York" },
    });
    const facilityId = facility.id;
    const department = (key: string, name: string, sortOrder: number) =>
      prisma.department.create({ data: { facilityId, key, name, sortOrder } });
    const fn = await department("DIETARY", "Food & Nutrition", 1);
    const plant = await department("PLANT", "Plant Operations", 2);
    const evs = await department("EVS", "Environmental Services", 3);
    const activities = await department("ACTIVITIES", "Activities", 4);

    const unit = await prisma.unit.create({ data: { facilityId, name: "North Wing", unitType: "RESIDENT_AREA" } });
    const space = (name: string, departmentId: string) =>
      prisma.unitSpace.create({
        data: {
          facilityId,
          unitId: unit.id,
          name,
          spaceType: "SERVICE_AREA",
          responsibilities: { create: [{ departmentId }] },
        },
      });
    await space("North Servery", fn.id);
    const dayRoom = await space("Day Room", activities.id);

    const employee = (firstName: string, roleType: "MANAGER" | "GM" | "SUPERVISOR" | "STAFF", primaryDepartmentId: string) =>
      prisma.employee.create({ data: { facilityId, firstName, lastName: suffix, roleType, primaryDepartmentId } });
    const fnHead = await employee("Fran", "MANAGER", fn.id);
    await prisma.department.update({ where: { id: fn.id }, data: { headEmployeeId: fnHead.id } });
    const plantGm = await employee("Pat", "GM", plant.id);
    const supervisor = await employee("Sam", "SUPERVISOR", fn.id);
    const fnAide = await employee("Dana", "STAFF", fn.id);
    const activitiesAide = await employee("Alex", "STAFF", activities.id);

    await prisma.departmentOperatorRelationship.createMany({
      data: [
        {
          departmentId: fn.id,
          organizationId: owner.id,
          effectiveFrom: serviceDate("2026-01-01"),
          effectiveTo: serviceDate("2026-06-30"),
        },
        { departmentId: fn.id, organizationId: metz.id, effectiveFrom: serviceDate("2026-07-01") },
      ],
    });
    await prisma.departmentWorkPlan.create({
      data: {
        facilityId,
        departmentId: activities.id,
        stableKey: `afternoon-${suffix}`,
        name: "Afternoon program",
        status: "PUBLISHED",
      },
    });
    await prisma.departmentRequestRoute.create({
      data: { facilityId, requestingDepartmentId: fn.id, responsibleDepartmentId: plant.id },
    });

    const viewerDeps = (now: Date, employeeId: string | null) => ({
      db: prisma,
      now,
      resolveEmployeeId: async () => employeeId,
      plantRuntimeEnabled: async () => true,
      routeFlags: {},
    });
    const viewerOf = async (session: FacilitySession, now: Date, employeeId: string | null) => {
      const resolution = await resolveDashboardViewer(session, {}, viewerDeps(now, employeeId));
      assert.equal(resolution.kind, "viewer");
      return (resolution as { viewer: DashboardViewer }).viewer;
    };

    await t.test("leaders: the recorded head and the GM's primary Department", async () => {
      assert.deepEqual(await resolveLedDepartmentIds(prisma, { facilityId, employeeId: fnHead.id }), [fn.id]);
      assert.deepEqual(await resolveLedDepartmentIds(prisma, { facilityId, employeeId: plantGm.id }), [plant.id]);
      assert.deepEqual(await resolveLedDepartmentIds(prisma, { facilityId, employeeId: supervisor.id }), []);

      delete process.env[CDA_FLAG];
      const head = await viewerOf(employeeSession(facilityId, fnHead.id, "MANAGER"), FIRST_METZ_MORNING, fnHead.id);
      assert.equal(head.authority, "DEPARTMENT_LEADER");
      assert.deepEqual(head.scope, { kind: "DEPARTMENT", departmentId: fn.id });
      assert.deepEqual(head.ledDepartmentIds, [fn.id]);

      const gm = await viewerOf(employeeSession(facilityId, plantGm.id, "GM"), FIRST_METZ_MORNING, plantGm.id);
      assert.equal(gm.authority, "DEPARTMENT_LEADER");
      assert.deepEqual(gm.scope, { kind: "DEPARTMENT", departmentId: plant.id });

      const sup = await viewerOf(employeeSession(facilityId, supervisor.id, "SUPERVISOR"), FIRST_METZ_MORNING, supervisor.id);
      assert.equal(sup.authority, "SUPERVISOR");
      assert.equal(sup.scope && "departmentId" in sup.scope ? sup.scope.departmentId : null, fn.id);
    });

    await t.test("head settings keep the Product gate and the leader rule", { skip: sharedClientSkip }, async () => {
      const head = employeeSession(facilityId, fnHead.id, "MANAGER");
      assert.equal(await canManageDepartmentHeadSettings(head, fn.id), true);
      assert.equal(await canManageDepartmentHeadSettings(head, plant.id), false);
      assert.equal(await canManageDepartmentHeadSettings(employeeSession(facilityId, plantGm.id, "GM"), plant.id), true);
      assert.equal(
        await canManageDepartmentHeadSettings(employeeSession(facilityId, supervisor.id, "SUPERVISOR"), fn.id),
        false,
      );
      const admin = userSession(facilityId, "FACILITY_ADMINISTRATOR");
      assert.equal(await canManageDepartmentHeadSettings(admin, fn.id), true);
      assert.equal(await canManageDepartmentHeadSettings(admin, evs.id), false, "EVS is not customer-operable");
    });

    await t.test("Facility Administrator: scope Departments and operator periods by service date", async () => {
      const admin = userSession(facilityId, "FACILITY_ADMINISTRATOR");

      delete process.env[CDA_FLAG];
      const flagOff = await viewerOf(admin, FIRST_METZ_MORNING, null);
      assert.deepEqual(flagOff.scope, { kind: "FACILITY" });
      assert.deepEqual(flagOff.scopeDepartmentIds, [fn.id, plant.id, activities.id], "EVS is not sold yet");
      assert.equal(flagOff.departmentAccess[fn.id], "MANAGE");

      process.env[CDA_FLAG] = "true";
      const june30 = await viewerOf(admin, LAST_SELF_OPERATED_EVENING, null);
      assert.equal(june30.serviceDate, "2026-06-30");
      assert.equal(june30.departmentAccess[fn.id], "VIEW");
      assert.equal(june30.operators[fn.id]?.operatingModel, "SELF_OPERATED");

      const july1 = await viewerOf(admin, FIRST_METZ_MORNING, null);
      assert.equal(july1.serviceDate, "2026-07-01");
      assert.equal(july1.departmentAccess[fn.id], "MANAGE", "manages until Metz's head accepts");
      assert.deepEqual(july1.operators[fn.id], {
        operatingModel: "VENDOR_RUN",
        operatorName: "Metz Culinary",
        vendorHeadAccepted: false,
      });
      delete process.env[CDA_FLAG];
    });

    await t.test("capabilities: Food & Nutrition, Plant and a custom Department", async () => {
      const admin = await viewerOf(userSession(facilityId, "FACILITY_ADMINISTRATOR"), FIRST_METZ_MORNING, null);
      const capabilities = await resolveDepartmentDashboardCapabilities(admin, {
        db: prisma,
        plantRuntimeEnabled: true,
        canonicalLogsEnabled: false,
        operationalAssignmentsEnabled: false,
      });
      const has = (departmentId: string) => [...(capabilities.get(departmentId)?.has ?? [])].sort();
      const missing = (departmentId: string) =>
        capabilities.get(departmentId)?.notConfigured.map((reason) => reason.capability);

      const withoutShared = (departmentId: string) => has(departmentId).filter((c) => c !== "maintenance.shared");
      for (const row of [fn, plant, activities]) {
        assert.equal(
          has(row.id).includes("maintenance.shared"),
          isDashboardEngineAdmitted("asset", row.key, true),
          `${row.key} shared maintenance follows engine admission`,
        );
      }

      assert.deepEqual(withoutShared(fn.id), [
        "locations.runtime",
        "meal.milestones",
        "people.roster",
        "plant.requests.filed",
        "records.legacy",
      ]);
      assert.deepEqual(missing(fn.id), ["cycles.published", "work.expected", "coverage.planned", "menus", "records.legacy"]);

      assert.ok(has(plant.id).includes("plant.maintenance"));
      assert.equal(has(plant.id).includes("locations.runtime"), false);

      assert.equal(capabilities.get(activities.id)?.productKey, null);
      assert.deepEqual(withoutShared(activities.id), ["locations.runtime", "people.roster", "records.legacy", "work.expected"]);
      assert.deepEqual(missing(activities.id), ["coverage.planned", "records.legacy"]);
    });

    await t.test("runtime: a custom Department location composes without a Product", { skip: sharedClientSkip }, async () => {
      const { states } = await loadRuntimeLocationStates({
        facilityId,
        spaceRefs: [{ spaceId: dayRoom.id, departmentId: activities.id, unitId: unit.id, displayName: dayRoom.name }],
        now: FIRST_METZ_MORNING,
        operationalAssignmentsEnabled: false,
        canonicalLogsEnabled: false,
      });
      assert.equal(states.length, 1);
      assert.equal(states[0]!.identity.location.spaceId, dayRoom.id);
      assert.equal(states[0]!.identity.location.departmentId, activities.id);
      for (const item of attentionFromRuntimeLocations(states)) {
        assert.equal(item.departmentId, activities.id);
      }
    });

    await t.test("call-offs: two Departments see only their own", { skip: sharedClientSkip }, async () => {
      const today = new Date();
      const shift = (employeeId: string, departmentId: string | null, kind: "BREAKFAST" | "LUNCH" | "DINNER") =>
        prisma.scheduleEntry.create({ data: { employeeId, date: today, shift: kind, departmentId } });
      const fnShift = await shift(fnAide.id, fn.id, "BREAKFAST");
      const activitiesShiftForFnAide = await shift(fnAide.id, activities.id, "LUNCH");
      const unboundShift = await shift(fnAide.id, null, "DINNER");
      const mark = (id: string, reason: string) =>
        prisma.scheduleEntry.update({
          where: { id },
          data: { calledOffAt: today, callOffReason: reason },
          select: { id: true },
        });
      const activitiesShift = await shift(activitiesAide.id, activities.id, "BREAKFAST");
      const fnByShift = await mark(fnShift.id, "[call-down:call-off] sick");
      const activitiesByPrimary = await mark(activitiesShift.id, "[call-down:call-off]");
      const activitiesByShift = await mark(activitiesShiftForFnAide.id, "[call-down:late-arrival]");
      const fnByPrimary = await mark(unboundShift.id, "[call-down:no-call-no-show]");

      const ids = async (departmentId?: string) =>
        (await loadPresenceCallOffs(facilityId, departmentId ? { departmentId } : {})).items.map((item) => item.id).sort();
      assert.deepEqual(await ids(fn.id), [fnByShift.id, fnByPrimary.id].sort());
      assert.deepEqual(await ids(activities.id), [activitiesByPrimary.id, activitiesByShift.id].sort());
      assert.deepEqual(await ids(plant.id), []);
      assert.equal((await ids()).length, 4, "no Department: the whole facility");
    });

    await t.test("recent activity: two Departments see only their own", { skip: sharedClientSkip }, async () => {
      const repair = (code: string, requestingDepartmentId: string) =>
        prisma.repair.create({
          data: {
            repairCode: `DSH-${suffix}-${code}`,
            unitId: unit.id,
            title: `Repair ${code}`,
            description: "Test",
            priority: "HIGH",
            requestingDepartmentId,
            responsibleDepartmentId: plant.id,
          },
          select: { id: true },
        });
      const fnRepair = await repair("FN", fn.id);
      const activitiesRepair = await repair("ACT", activities.id);
      const article = (title: string, departmentId: string | null) =>
        prisma.knowledgeArticle.create({
          data: { facilityId, title, body: "Test", category: "SOP", status: "PUBLISHED", departmentId },
          select: { id: true },
        });
      const fnArticle = await article("Tray line SOP", fn.id);
      await article("Program SOP", activities.id);
      await article("Facility SOP", null);

      const fnOnly = await loadWorkspaceNonOperationalExtras({
        facilityId,
        departmentIds: [fn.id],
        includeLegacyInspections: false,
      });
      assert.deepEqual(fnOnly.activity.repairsOpened.map((row) => row.id), [fnRepair.id]);
      assert.deepEqual(fnOnly.activity.knowledgePublished.map((row) => row.id), [fnArticle.id]);
      assert.deepEqual(fnOnly.activity.inspectionsCompleted, []);

      const plantView = await loadWorkspaceNonOperationalExtras({ facilityId, departmentIds: [plant.id] });
      assert.deepEqual(
        plantView.activity.repairsOpened.map((row) => row.id).sort(),
        [fnRepair.id, activitiesRepair.id].sort(),
        "Plant is responsible for both",
      );
      assert.deepEqual(plantView.activity.knowledgePublished, []);

      const none = await loadWorkspaceNonOperationalExtras({ facilityId, departmentIds: [] });
      assert.deepEqual(none.activity.repairsOpened, []);
      assert.deepEqual(none.activity.knowledgePublished, []);

      const whole = await loadWorkspaceNonOperationalExtras({ facilityId });
      assert.equal(whole.activity.repairsOpened.length, 2);
      assert.equal(whole.activity.knowledgePublished.length, 3);
    });

    await t.test("card counts match Locations and Expected work, one Department at a time", { skip: sharedClientSkip }, async () => {
      delete process.env[CDA_FLAG];
      const admin = await viewerOf(userSession(facilityId, "FACILITY_ADMINISTRATOR"), FIRST_METZ_MORNING, null);
      const scoped = (departmentId: string) => ({ ...admin, scope: { kind: "DEPARTMENT" as const, departmentId } });
      const activitiesViewer = scoped(activities.id);
      const fnViewer = scoped(fn.id);
      const activitiesPack = createDashboardFactPack(activitiesViewer);
      const fnPack = createDashboardFactPack(fnViewer);

      const activitiesStates = await activitiesPack.runtimeLocations();
      const fnStates = await fnPack.runtimeLocations();
      assert.deepEqual(
        activitiesStates.map((state) => state.identity.location.spaceId),
        [dayRoom.id],
      );
      assert.equal(
        fnStates.some((state) => state.identity.location.spaceId === dayRoom.id),
        false,
      );
      assert.ok(fnStates.every((state) => state.identity.location.departmentId === fn.id));

      for (const states of [activitiesStates, fnStates]) {
        const board = presentExceptionFirstLocationBoard({
          states,
          spaceOrder: states.map((state) => state.identity.location.spaceId),
        });
        assert.equal(attentionFromRuntimeLocations(states).length, board.attentionCount);
      }

      const activitiesBoard = presentExceptionFirstLocationBoard({
        states: activitiesStates,
        spaceOrder: [dayRoom.id],
      });
      const attention = await loadAttention({ viewer: activitiesViewer, facts: activitiesPack, size: "L" });
      const locationItems =
        attention.state === "ready" ? attention.attention.filter((item) => item.source === "location") : [];
      assert.equal(locationItems.length, activitiesBoard.attentionCount);
      assert.ok(locationItems.every((item) => item.departmentId === activities.id));

      const activitiesWork = await activitiesPack.expectedWork(activities.id);
      const fnWork = await fnPack.expectedWork(fn.id);
      assert.equal(activitiesWork.hasPublishedWorkPlans, true);
      assert.equal(fnWork.hasPublishedWorkPlans, false);
      const card = await loadExpectedWork({ viewer: activitiesViewer, facts: activitiesPack, size: "M" });
      const fromPage = presentExpectedWork(activitiesWork);
      assert.deepEqual(card, fromPage);
      assertExpectedCounts(activitiesWork, card);
    });
  } finally {
    if (previousFlag === undefined) delete process.env[CDA_FLAG];
    else process.env[CDA_FLAG] = previousFlag;

    await prisma.repair.deleteMany({ where: { unit: inTestFacility } });
    await prisma.assignmentOverride.deleteMany({ where: { employee: inTestFacility } });
    await prisma.scheduleEntry.deleteMany({ where: { employee: inTestFacility } });
    await prisma.knowledgeArticle.deleteMany({ where: inTestFacility });
    await prisma.departmentRequestRoute.deleteMany({ where: inTestFacility });
    await prisma.departmentWorkPlan.deleteMany({ where: inTestFacility });
    await prisma.unitSpaceResponsibility.deleteMany({ where: { department: inTestFacility } });
    await prisma.unitSpace.deleteMany({ where: inTestFacility });
    await prisma.department.updateMany({ where: inTestFacility, data: { headEmployeeId: null } });
    await prisma.employee.deleteMany({ where: inTestFacility });
    await prisma.departmentOperatorRelationship.deleteMany({ where: { department: inTestFacility } });
    await prisma.department.deleteMany({ where: inTestFacility });
    await prisma.unit.deleteMany({ where: inTestFacility });
    await prisma.facility.deleteMany({ where: { organization: { name: { contains: suffix } } } });
    await prisma.organization.deleteMany({ where: { name: { contains: suffix } } });
    await prisma.$disconnect();
  }
});
