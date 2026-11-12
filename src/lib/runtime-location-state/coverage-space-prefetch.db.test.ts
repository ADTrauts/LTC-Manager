/** PF-2D-001: exercise persisted targets through the real RLS and Dashboard loaders. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import type { FacilitySession } from "@/lib/auth";
import { loadCoverage } from "@/lib/dashboard/cards/load";
import { createDashboardFactPack } from "@/lib/dashboard/facts";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";
import { loadEmployeeTeamRoomView } from "@/lib/department-teams/team-room-membership";
import { pruneTeamRoomsAfterResponsibilityRemoved } from "@/lib/department-teams/service";
import { prisma } from "@/lib/prisma";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { loadRuntimeLocationStates } from "./load";
import { prefetchRuntimeLocationInputs } from "./prefetch";

const url = process.env.VERIFY_DATABASE_URL;
if (url) {
  assertDisposableDatabaseUrl(url);
  if (process.env.DATABASE_URL !== url) throw new Error("RLS tests require matching disposable database URLs.");
}

test("PF-2D-001: persisted Space Coverage reaches RLS and Dashboard", {
  skip: url ? false : "set VERIFY_DATABASE_URL to a disposable migrated database",
}, async (t) => {
  const previousAuthority = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "true";
  const tag = randomBytes(5).toString("hex");
  const serviceDate = new Date("2026-11-10T00:00:00Z");
  const now = new Date("2026-11-10T17:00:00Z");
  const effectiveFrom = new Date("2020-01-01T00:00:00Z");

  try {
    const organization = await prisma.organization.create({ data: { name: `PF2D ${tag}` } });
    const facility = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `PF2D ${tag}`, timezone: "America/New_York" },
    });
    const foreignFacility = await prisma.facility.create({
      data: { organizationId: organization.id, displayName: `PF2D foreign ${tag}`, timezone: "America/New_York" },
    });
    const department = await prisma.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "PF2D Dietary", showInEmployeeApp: true },
    });
    const evs = await prisma.department.create({
      data: { facilityId: facility.id, key: "EVS", name: "PF2D EVS", showInEmployeeApp: true },
    });
    const foreignDepartment = await prisma.department.create({
      data: { facilityId: foreignFacility.id, key: "DIETARY", name: "PF2D foreign Dietary" },
    });
    const floor = await prisma.unit.create({
      data: { facilityId: facility.id, name: "PF2D floor", unitType: "OTHER", hierarchyRole: "FLOOR" },
    });
    async function neighborhood(name: string, facilityId = facility.id) {
      return prisma.unit.create({ data: {
        facilityId, name, unitType: "SERVERY", hierarchyRole: "NEIGHBORHOOD",
        parentUnitId: facilityId === facility.id ? floor.id : null,
      } });
    }
    const unit = await neighborhood("PF2D precise");
    const wideUnit = await neighborhood("PF2D Unit control");
    const foreignUnit = await neighborhood("PF2D foreign", foreignFacility.id);
    async function room(name: string, unitId = unit.id, facilityId = facility.id) {
      return prisma.unitSpace.create({ data: { facilityId, unitId, name, spaceType: "SERVICE_AREA" } });
    }
    const target = await room("PF2D shared target");
    const unconfigured = await room("PF2D unconfigured sibling");
    const wideA = await room("PF2D wide A", wideUnit.id);
    const wideB = await room("PF2D wide B", wideUnit.id);
    const foreignRoom = await room("PF2D foreign room", foreignUnit.id, foreignFacility.id);
    for (const space of [target, unconfigured, wideA, wideB]) {
      await prisma.unitSpaceResponsibility.create({ data: { departmentId: department.id, spaceId: space.id } });
    }
    await prisma.unitSpaceResponsibility.create({ data: { departmentId: evs.id, spaceId: target.id } });
    await prisma.unitSpaceResponsibility.create({ data: { departmentId: foreignDepartment.id, spaceId: foreignRoom.id } });

    async function cycle(facilityId: string, departmentId: string, spaceIds: string[]) {
      await prisma.departmentOperationalCycle.create({ data: {
        facilityId, departmentId, stableKey: `pf2d-cycle-${tag}`, label: "PF2D active Cycle",
        nodeKind: "PERIOD", cycleType: "SERVICE", status: "PUBLISHED", publishedAt: effectiveFrom,
        effectiveFrom, startLocal: "00:00", endLocal: "23:59", applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        locationMode: "EXPLICIT_UNITS", locations: { create: spaceIds.map((spaceId) => ({ spaceId })) },
      } });
    }
    await cycle(facility.id, department.id, [target.id, unconfigured.id, wideA.id, wideB.id]);
    await cycle(facility.id, evs.id, [target.id]);
    await cycle(foreignFacility.id, foreignDepartment.id, [foreignRoom.id]);

    async function template(facilityId: string, departmentId: string, count: number, place: { spaceId?: string; unitId?: string }) {
      return prisma.operationalAssignmentTemplate.create({ data: {
        facilityId, departmentId, stableKey: `pf2d-${tag}-${count}`, name: "PF2D explicit need",
        status: "PUBLISHED", publishedAt: effectiveFrom, effectiveFrom,
        items: { create: { roleKey: "SERVER", roleLabel: "PF2D Server", requiredCount: count,
          ...place } },
      }, include: { items: true } });
    }
    const precise = await template(facility.id, department.id, 2, { spaceId: target.id });
    await template(facility.id, evs.id, 4, { spaceId: target.id });
    await template(foreignFacility.id, foreignDepartment.id, 9, { spaceId: foreignRoom.id });
    const plan = await prisma.operationalAssignmentPlan.create({ data: {
      facilityId: facility.id, departmentId: department.id, serviceDate, status: "CONFIRMED",
    } });
    await prisma.operationalAssignmentPlan.create({ data: {
      facilityId: facility.id, departmentId: evs.id, serviceDate, status: "CONFIRMED",
    } });
    const managerRole = await prisma.role.upsert({ where: { key: "MANAGER" }, update: {}, create: { key: "MANAGER", name: "Manager" } });
    const user = await prisma.user.create({ data: {
      email: `pf2d-${tag}@example.invalid`, displayName: "PF2D manager", facilityId: facility.id,
      roleId: managerRole.id, primaryDepartmentId: department.id, emailVerifiedAt: effectiveFrom,
    } });
    await ensureUserFacilityAccessGrant(prisma, { userId: user.id, facilityId: facility.id, roleKey: "MANAGER" });
    const manager = await prisma.employee.create({ data: {
      facilityId: facility.id, userId: user.id, firstName: "PF2D", lastName: "Manager",
      roleType: "MANAGER", status: "ACTIVE", primaryDepartmentId: department.id,
    } });
    async function assign(lastName: string) {
      const employee = await prisma.employee.create({ data: {
        facilityId: facility.id, firstName: "PF2D", lastName, roleType: "STAFF", status: "ACTIVE", primaryDepartmentId: department.id,
      } });
      await prisma.operationalAssignment.create({ data: {
        facilityId: facility.id, departmentId: department.id, planId: plan.id, employeeId: employee.id,
        unitId: unit.id, serviceDate, roleKey: "SERVER", roleLabel: "PF2D Server", status: "ACTIVE",
        startsAt: new Date("2026-11-10T05:00:00Z"), endsAt: new Date("2026-11-11T04:59:00Z"),
        locations: { create: { unitSpaceId: target.id, unitId: unit.id } },
      } });
    }
    await assign("one");
    const session: FacilitySession = {
      uid: user.id, name: "PF2D manager", email: user.email, authKind: "user", authMethod: "PASSWORD",
      scopeKind: "facility", facilityId: facility.id, role: "MANAGER", primaryDepartmentId: department.id,
    };
    const resolution = await resolveDashboardViewer(session, {}, { db: prisma, now, resolveEmployeeId: async () => manager.id });
    assert.equal(resolution.kind, "viewer");
    if (resolution.kind !== "viewer") throw new Error("Missing authorized fixture viewer");
    const viewer = resolution.viewer;
    const refs = [{ departmentId: department.id, spaceId: target.id }];
    async function states(spaceRefs = refs) {
      return (await loadRuntimeLocationStates({ facilityId: facility.id, spaceRefs, now })).states;
    }
    async function dashboard() {
      return loadCoverage({ viewer, facts: createDashboardFactPack(viewer, { now: () => now }), size: "M" });
    }

    await t.test("persisted explicit target survives actual Prisma prefetch", async () => {
      const persisted = await prisma.operationalAssignmentTemplateItem.findUniqueOrThrow({ where: { id: precise.items[0].id } });
      assert.equal(persisted.spaceId, target.id);
      assert.equal(persisted.unitId, null);
      const loaded = await prefetchRuntimeLocationInputs({ facilityId: facility.id, spaceRefs: refs, now });
      assert.equal(loaded.coverageTemplatesByDepartmentId.get(department.id)?.[0].items[0].spaceId, target.id);
    });
    await t.test("active Cycle and visible plan yield 2 required / 1 filled / AT_RISK", async () => {
      const state = (await states())[0];
      assert.equal(state.operation.state, "ACTIVE");
      assert.equal(state.coverage.planLifecycle, "RUNTIME_VISIBLE");
      assert.equal(state.coverage.slots.length, 1);
      assert.equal(state.coverage.slots[0].requiredCount, 2);
      assert.equal(state.coverage.slots[0].filledCount, 1);
      assert.equal(state.coverage.slots[0].state, "AT_RISK");
    });
    await t.test("Dashboard consumes that real shortfall instead of its quiet success", async () => {
      const card = await dashboard();
      assert.equal(card.state, "ready");
      if (card.state !== "ready") throw new Error("Coverage shortfall must not render quiet success");
      assert.equal(card.model.metrics.find((m) => m.label === "Coverage gaps")?.value, 1);
      assert(card.model.lines.some((line) => line.detail?.includes("at risk")));
      assert(!JSON.stringify(card).includes("Coverage is in place"));
    });
    await t.test("unconfigured sibling has no invented requirement", async () => {
      const state = (await states([{ departmentId: department.id, spaceId: unconfigured.id }]))[0];
      assert.equal(state.coverage.slots.length, 0);
      assert.equal(state.answers.responsible.need.length, 0);
    });
    await t.test("two actual assignees fully staff the Space without false gaps", async () => {
      await assign("two");
      const slot = (await states())[0].coverage.slots[0];
      assert(slot, "Configured slot must remain present when staffed");
      assert.equal(slot.requiredCount, 2);
      assert.equal(slot.filledCount, 2);
      assert.equal(slot.state, "COVERED");
      assert.equal((await dashboard()).state, "quiet");
    });
    await t.test("explicit Unit need expands to its two rooms only", async () => {
      await template(facility.id, department.id, 1, { unitId: wideUnit.id });
      const rooms = await states([target, unconfigured, wideA, wideB].map((space) => ({ departmentId: department.id, spaceId: space.id })));
      for (const space of [wideA, wideB]) {
        const slots = rooms.find((state) => state.identity.location.spaceId === space.id)!.coverage.slots;
        assert.equal(slots.length, 1);
        assert.equal(slots[0].requiredCount, 1);
        assert.equal(slots[0].state, "UNCOVERED");
      }
      assert.equal(rooms.find((state) => state.identity.location.spaceId === unconfigured.id)!.coverage.slots.length, 0);
      const card = await dashboard();
      assert.equal(card.state, "ready");
      if (card.state === "ready") assert.equal(card.model.metrics.find((m) => m.label === "Coverage gaps")?.value, 2);
    });
    await t.test("shared Space layers stay Department-scoped and unauthorized fact calls fail", async () => {
      const own = (await states())[0];
      const other = (await states([{ departmentId: evs.id, spaceId: target.id }]))[0];
      assert.equal(own.coverage.slots[0].requiredCount, 2);
      assert.equal(other.coverage.slots.length, 1);
      assert.equal(other.coverage.slots[0].requiredCount, 4);
      assert(!other.coverage.slots.some((slot) => slot.templateStableKey === precise.stableKey));
      const facts = createDashboardFactPack(viewer, { now: () => now });
      await assert.rejects(() => facts.dailyCoverage(evs.id), /outside the viewer's scope/);
      const payload = await facts.runtimeLocations();
      assert(payload.length > 0);
      assert(payload.every((state) => state.identity.location.departmentId === department.id));
    });
    await t.test("foreign Facility Space and Department cannot contribute Coverage", async () => {
      assert.deepEqual(await states([{ departmentId: foreignDepartment.id, spaceId: foreignRoom.id }]), []);
      const facts = createDashboardFactPack(viewer, { now: () => now });
      await assert.rejects(() => facts.dailyCoverage(foreignDepartment.id), /outside the viewer's scope/);
      assert(!(await facts.runtimeLocations()).some((state) => state.identity.location.facilityId !== facility.id));
    });
    await t.test("explicit Team room view stays inside authorized Department and Facility", async () => {
      const role = await prisma.role.upsert({ where: { key: "SUPERVISOR" }, update: {}, create: { key: "SUPERVISOR", name: "Supervisor" } });
      const supervisorUser = await prisma.user.create({ data: {
        email: `pf2d-super-${tag}@example.invalid`, displayName: "Team Supervisor", facilityId: facility.id,
        primaryDepartmentId: department.id, roleId: role.id, emailVerifiedAt: effectiveFrom,
      } });
      await ensureUserFacilityAccessGrant(prisma, { userId: supervisorUser.id, facilityId: facility.id, roleKey: "SUPERVISOR" });
      const supervisor = await prisma.employee.create({ data: { facilityId: facility.id, userId: supervisorUser.id,
        firstName: "Team", lastName: "Supervisor", primaryDepartmentId: department.id, roleType: "SUPERVISOR" } });
      const team = await prisma.departmentTeam.create({ data: { facilityId: facility.id, departmentId: department.id,
        displayName: "Explicit rooms", roomMemberships: { create: [{ spaceId: target.id }, { spaceId: foreignRoom.id }] } } });
      await prisma.employeeTeamMembership.create({ data: { employeeId: supervisor.id, teamId: team.id } });
      for (const space of [target, unconfigured]) {
        const asset = await prisma.asset.create({ data: { assetCode: `TEAM-${tag}-${space.id}`, name: "Team scope asset",
          equipmentType: "EQUIPMENT", unitId: unit.id, spaceId: space.id, departmentId: department.id, criticality: "ROUTINE" } });
        await prisma.repair.create({ data: { repairCode: `TEAM-${tag}-${space.id}`, title: "Team scope maintenance",
          description: "Explicit-room regression", assetId: asset.id, unitId: unit.id, spaceId: space.id,
          requestingDepartmentId: department.id, responsibleDepartmentId: department.id } });
      }
      const configured = await loadEmployeeTeamRoomView(prisma, { facilityId: facility.id, departmentId: department.id, employeeId: supervisor.id });
      assert.deepEqual(configured.roomIds, [target.id]);
      const supervisorSession: FacilitySession = { ...session, uid: supervisorUser.id, email: supervisorUser.email, role: "SUPERVISOR" };
      const resolved = await resolveDashboardViewer(supervisorSession, { scopeParam: `team:${department.id}` }, {
        db: prisma, now, resolveEmployeeId: async () => supervisor.id,
      });
      assert.equal(resolved.kind, "viewer");
      if (resolved.kind !== "viewer") throw new Error("Expected authorized Team view");
      assert.equal(resolved.viewer.scope?.kind, "TEAM");
      const teamFacts = createDashboardFactPack(resolved.viewer, { now: () => now });
      const payload = await teamFacts.runtimeLocations();
      assert(payload.length > 0);
      assert(payload.every(row => row.identity.location.spaceId === target.id && row.identity.location.departmentId === department.id));
      assert.deepEqual((await teamFacts.workOrders(department.id)).map(row => row.workOrder.spaceId), [target.id]);
      const exceptions = await teamFacts.assetExceptions(department.id);
      assert.equal(exceptions.length, 1);
      assert.equal(exceptions[0].workOrderId, (await teamFacts.workOrders(department.id))[0].workOrder.id);
      await prisma.unitSpaceResponsibility.deleteMany({ where: { spaceId: target.id, departmentId: department.id } });
      assert.equal(await pruneTeamRoomsAfterResponsibilityRemoved(prisma, { spaceId: target.id, departmentId: department.id }), 1);
      assert.deepEqual((await loadEmployeeTeamRoomView(prisma, { facilityId: facility.id, departmentId: department.id, employeeId: supervisor.id })).roomIds, []);
    });
  } finally {
    if (previousAuthority === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
    else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previousAuthority;
    await prisma.$disconnect();
  }
});
