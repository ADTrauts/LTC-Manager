import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "../../scripts/verify/lib/database-target.mjs";
import { issueEmployeeUserLinkInvitation, acceptEmployeeUserLinkInvitation } from "@/lib/employee-identity/invitations";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access/assert-user-facility-access";
import { loadRuntimeLocationStates } from "@/lib/runtime-location-state";
import type { FacilitySession } from "@/lib/auth";
import { loadCoverage } from "@/lib/dashboard/cards/load";
import { createDashboardFactPack } from "@/lib/dashboard/facts";
import { resolveDashboardViewer } from "@/lib/dashboard/viewer/resolve";
import { ensureDeviceBoundAsAdmin, loginPassword } from "../offline-browser/helpers";
import { expectCanonicalOfflinePreparation } from "../offline-browser/canonical-journey";

type Fixtures = {
  facilityId: string; dietaryDepartmentId: string; plantDepartmentId: string;
  adminEmail: string; peopleHref: string; serviceDateKey: string;
  primarySpaceId: string; primarySpaceName: string; altSpaceId: string;
  periodCycleStableKey: string; periodCycleLabel: string;
  publishedTemplateId: string; shortageAssignmentId: string; tempAssignmentId: string;
};

test.describe.configure({ mode: "serial" });

test("PF-2D-002 @coverage-builder: reachable Unit and Space authoring persists and changes runtime", async ({ page }, info) => {
  const url = process.env.VERIFY_DATABASE_URL;
  assertDisposableDatabaseUrl(url);
  if (process.env.DATABASE_URL !== url) throw new Error("Coverage browser requires the same disposable database");
  const fx: Fixtures = JSON.parse(readFileSync(process.env.PEOPLE_COVERAGE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp/people-coverage-browser-artifacts/fixtures.json"), "utf8"));
  const db = new PrismaClient();
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  const name = `PF-2D-002 UI ${randomBytes(4).toString("hex")}`;
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("SEED_DEMO_PASSWORD required");
  try {
    await db.operationalAssignment.deleteMany({ where: { facilityId: fx.facilityId,
      departmentId: fx.dietaryDepartmentId, id: { endsWith: "-pf002-future" } } });
    await db.employee.deleteMany({ where: { facilityId: fx.facilityId, OR: [
      { firstName: "Space", lastName: { startsWith: "Assignment PF-2D-002 UI " } },
      { firstName: "Unqualified", lastName: { startsWith: "PF-2D-002 UI " } },
    ] } });
    // An explicitly authorized Department head; FA alone remains read-only under CDA.
    const sourceAdmin = await db.user.findUniqueOrThrow({ where: { email: fx.adminEmail } });
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: "MANAGER" } });
    const admin = await db.user.create({ data: { email: `coverage.head.${randomBytes(4).toString("hex")}@ltc.local`,
      displayName: "Coverage Department Head", facilityId: fx.facilityId, primaryDepartmentId: fx.dietaryDepartmentId,
      roleId: managerRole.id, passwordHash: sourceAdmin.passwordHash, emailVerifiedAt: new Date() } });
    await ensureUserFacilityAccessGrant(db, { userId: admin.id, facilityId: fx.facilityId, roleKey: "MANAGER" });
    let employee = await db.employee.findFirst({ where: { userId: admin.id, facilityId: fx.facilityId } });
    if (!employee) {
      employee = await db.employee.create({ data: {
        facilityId: fx.facilityId, firstName: "Coverage", lastName: "Head", status: "ACTIVE",
        primaryDepartmentId: fx.dietaryDepartmentId, roleType: "MANAGER",
      } });
      const invitation = await issueEmployeeUserLinkInvitation(db, { employeeId: employee.id, facilityId: fx.facilityId,
        targetEmail: admin.email, intendedRoleKey: "MANAGER", invitedByUserId: admin.id });
      await acceptEmployeeUserLinkInvitation(db, { rawToken: invitation.rawToken, authenticatedUserId: admin.id });
    }
    await db.department.update({ where: { id: fx.dietaryDepartmentId }, data: { headEmployeeId: employee.id } });
    await db.operationalAssignmentTemplate.deleteMany({ where: { departmentId: fx.dietaryDepartmentId, name: { startsWith: "PF-2D-002 UI " } } });
    await db.operationalAssignmentTemplate.updateMany({
      where: { id: fx.publishedTemplateId }, data: { status: "PUBLISHED", isActive: true, effectiveTo: new Date(`${fx.serviceDateKey}T00:00:00Z`) },
    });
    // A whole-day synthetic Cycle makes this regression independent of the wall clock.
    await db.departmentOperationalCycle.updateMany({ where: {
      departmentId: fx.dietaryDepartmentId, stableKey: fx.periodCycleStableKey,
    }, data: { startLocal: "00:00", endLocal: "23:59" } });
    await db.operationalAssignment.updateMany({ where: { id: { in: [fx.shortageAssignmentId, fx.tempAssignmentId] } },
      data: { startsAt: new Date(Date.now() - 24 * 3600_000), endsAt: new Date(Date.now() + 24 * 3600_000) } });
    const alt = await db.unitSpace.findUniqueOrThrow({ where: { id: fx.altSpaceId } });

    await page.goto("/login");
    await page.locator('input[type="email"]').fill(admin.email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 90_000 });
    const response = await page.goto(fx.peopleHref, { timeout: 90_000 });
    expect(response?.status()).toBe(200);
    const panel = page.getByTestId("department-coverage-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage teams in Employee Builder" })).toBeVisible();
    await panel.getByTestId("add-coverage-expectation").click();
    await page.getByTestId("coverage-name-input").fill(name);
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page).toHaveURL(/tab=people&expectation=/);
    const editor = page.getByTestId("coverage-expectation-editor");
    await expect(editor).toBeVisible();
    const requirement = page.getByTestId("coverage-requirement-form");
    await requirement.getByTestId("coverage-role-select").selectOption("SERVER");
    await requirement.locator('input[name="requiredCount"]').fill("2");
    await requirement.getByTestId("coverage-space-select").selectOption(fx.primarySpaceId);
    await requirement.locator(`input[name="cycleStableKeys"][value="${fx.periodCycleStableKey}"]`).check();
    await requirement.getByRole("button", { name: "Add requirement", exact: true }).click();
    await expect(editor.getByTestId("coverage-requirement-list")).toContainText(`Space · ${fx.primarySpaceName}`);
    await requirement.getByLabel("Unit-wide", { exact: true }).check();
    await requirement.getByTestId("coverage-unit-select").selectOption(alt.unitId);
    await requirement.getByTestId("coverage-role-select").selectOption("SERVER");
    await requirement.locator('input[name="requiredCount"]').fill("1");
    await requirement.locator(`input[name="cycleStableKeys"][value="${fx.periodCycleStableKey}"]`).check();
    await requirement.getByRole("button", { name: "Add requirement", exact: true }).click();
    await expect(editor.getByTestId("coverage-requirement-list").getByRole("listitem")).toHaveCount(2);
    await editor.getByTestId("coverage-effective-from").fill(fx.serviceDateKey);
    await editor.getByTestId("publish-coverage-expectation").click();
    await expect(editor.getByTestId("publish-coverage-expectation")).toHaveCount(0);
    await page.reload();
    await expect(editor.getByTestId("coverage-requirement-list").getByRole("listitem")).toHaveCount(2);
    const saved = await db.operationalAssignmentTemplate.findFirstOrThrow({ where: { name }, include: { items: true } });
    expect(saved.status).toBe("PUBLISHED");
    expect(saved.items.map(row => ({ space: row.spaceId, unit: row.unitId, role: row.roleKey, count: row.requiredCount,
      cycles: row.applicableOperationalCycleStableKeys }))).toEqual(expect.arrayContaining([
      { space: fx.primarySpaceId, unit: null, role: "SERVER", count: 2, cycles: [fx.periodCycleStableKey] },
      { space: null, unit: alt.unitId, role: "SERVER", count: 1, cycles: [fx.periodCycleStableKey] },
    ]));
    await page.screenshot({ path: info.outputPath("coverage-published.png"), fullPage: true });
    // New publication applies next service day. Today keeps its existing requirement.
    expect(saved.effectiveFrom!.getTime()).toBeGreaterThan(new Date(`${fx.serviceDateKey}T00:00:00Z`).getTime());
    const plan = await db.operationalAssignmentPlan.findFirst({ where: { facilityId: fx.facilityId,
      departmentId: fx.dietaryDepartmentId, serviceDate: saved.effectiveFrom! } }) ?? await db.operationalAssignmentPlan.create({ data: { facilityId: fx.facilityId,
      departmentId: fx.dietaryDepartmentId, serviceDate: saved.effectiveFrom!, status: "CONFIRMED", confirmedAt: new Date() } });
    for (const id of [fx.shortageAssignmentId, fx.tempAssignmentId]) {
      const source = await db.operationalAssignment.findUniqueOrThrow({ where: { id }, include: { locations: true } });
      const futureAssignmentId = `${source.id}-pf002-future`;
      await db.operationalAssignment.deleteMany({ where: { id: futureAssignmentId } });
      await db.operationalAssignment.create({ data: { id: futureAssignmentId, facilityId: fx.facilityId, departmentId: fx.dietaryDepartmentId,
        employeeId: source.employeeId, unitId: source.unitId, serviceDate: saved.effectiveFrom!, planId: plan.id,
        roleKey: source.roleKey, roleLabel: source.roleLabel, status: "ACTIVE",
        startsAt: new Date(saved.effectiveFrom!.getTime() + 5 * 3600_000), endsAt: new Date(saved.effectiveFrom!.getTime() + 29 * 3600_000),
        locations: { create: source.locations.map(row => ({ unitSpaceId: row.unitSpaceId, unitId: row.unitId })) } } });
    }
    const effectiveNow = new Date(saved.effectiveFrom!.getTime() + 17 * 3600_000);
    const runtime = await loadRuntimeLocationStates({ facilityId: fx.facilityId,
      spaceRefs: [{ departmentId: fx.dietaryDepartmentId, spaceId: fx.primarySpaceId }], now: effectiveNow });
    const slot = runtime.states[0]?.coverage.slots.find(row => row.templateStableKey === saved.stableKey);
    expect(slot).toMatchObject({ requiredCount: 2, filledCount: 1, state: "AT_RISK" });
    const session: FacilitySession = { uid: admin.id, name: admin.displayName, email: admin.email,
      authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", facilityId: fx.facilityId,
      role: "MANAGER", primaryDepartmentId: fx.dietaryDepartmentId };
    const resolution = await resolveDashboardViewer(session, {}, { db, now: effectiveNow, resolveEmployeeId: async () => employee!.id });
    expect(resolution.kind).toBe("viewer");
    if (resolution.kind !== "viewer") throw new Error("Missing authorized Dashboard viewer");
    const futureCard = await loadCoverage({ viewer: resolution.viewer,
      facts: createDashboardFactPack(resolution.viewer, { now: () => effectiveNow }), size: "M" });
    expect(futureCard.state).toBe("ready");
    if (futureCard.state !== "ready") throw new Error("Missing effective Coverage card");
    expect(futureCard.model.metrics.find(row => row.label === "Coverage gaps")?.value).toBe(1);
    await page.goto(`/dashboard?scope=department:${fx.dietaryDepartmentId}`);
    const card = page.getByTestId("dashboard-card-coverage");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Coverage gaps");
    await expect(card).not.toContainText("Coverage is in place");
    await page.screenshot({ path: info.outputPath("coverage-dashboard-shortfall.png"), fullPage: true });

    // The actual Assignment form must retain Dietary Space selection and consume
    // explicit eligibility. Fill both today's need and the newly published future need.
    const assignedEmployee = await db.employee.create({ data: { facilityId: fx.facilityId,
      primaryDepartmentId: fx.dietaryDepartmentId, firstName: "Space", lastName: `Assignment ${name}`,
      roleType: "STAFF", operationalRoleQualifications: { create: { facilityId: fx.facilityId,
        departmentId: fx.dietaryDepartmentId, roleKey: "SERVER" } } } });
    const unqualifiedEmployee = await db.employee.create({ data: { facilityId: fx.facilityId,
      primaryDepartmentId: fx.dietaryDepartmentId, firstName: "Unqualified", lastName: name, roleType: "STAFF" } });
    for (const day of [saved.effectiveFrom!.toISOString().slice(0, 10), fx.serviceDateKey]) {
      await page.goto(`/staffing/assignments?department=${fx.dietaryDepartmentId}&date=${day}`);
      const assignmentForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Assignment", exact: true }) });
      await assignmentForm.getByLabel("Operational role", { exact: true }).selectOption("SERVER");
      await expect(assignmentForm.getByLabel("Employee", { exact: true }).locator(`option[value="${assignedEmployee.id}"]`)).toHaveCount(1);
      await expect(assignmentForm.getByLabel("Employee", { exact: true }).locator(`option[value="${unqualifiedEmployee.id}"]`)).toHaveCount(0);
      await assignmentForm.getByLabel("Employee", { exact: true }).selectOption(assignedEmployee.id);
      await assignmentForm.getByTestId("assignment-space-scope-picker").getByRole("checkbox", { name: new RegExp(fx.primarySpaceName) }).check();
      await assignmentForm.getByLabel("Assignment instructions").fill("Verify the service station and record completion.");
      await assignmentForm.getByRole("button", { name: "Create Assignment", exact: true }).click();
      await expect.poll(() => db.operationalAssignment.count({ where: { employeeId: assignedEmployee.id,
        serviceDate: new Date(`${day}T00:00:00Z`) } })).toBe(1);
      await page.reload();
      const persisted = await db.operationalAssignment.findFirstOrThrow({ where: { employeeId: assignedEmployee.id,
        serviceDate: new Date(`${day}T00:00:00Z`) }, include: { locations: true } });
      expect(persisted.roleLabel).toBe("Server");
      expect(persisted.notes).toBe("Verify the service station and record completion.");
      expect(persisted.locations.map(row => row.unitSpaceId)).toEqual([fx.primarySpaceId]);
      const coverageRow = page.getByTestId("assignment-coverage-rows").getByRole("listitem").filter({ hasText: fx.primarySpaceName });
      await expect(coverageRow).toContainText("2/2");
      await expect(coverageRow).toContainText("COVERED");
    }
    const filledRuntime = await loadRuntimeLocationStates({ facilityId: fx.facilityId,
      spaceRefs: [{ departmentId: fx.dietaryDepartmentId, spaceId: fx.primarySpaceId }], now: effectiveNow });
    expect(filledRuntime.states[0]?.coverage.slots.find(row => row.templateStableKey === saved.stableKey))
      .toMatchObject({ requiredCount: 2, filledCount: 2, state: "COVERED" });
    await page.goto(`/dashboard?scope=department:${fx.dietaryDepartmentId}`);
    await expect(card.getByText("0", { exact: true })).toBeVisible();
    await card.screenshot({ path: info.outputPath("coverage-gap-zero-card.png") });
    await page.screenshot({ path: info.outputPath("coverage-dashboard-filled.png"), fullPage: true });

    // Editing a published row must navigate to the DRAFT successor and leave runtime intact.
    await page.goto(`${fx.peopleHref}&expectation=${saved.id}`);
    await editor.locator('input[name="name"]').fill(`${name} successor`);
    await editor.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(`expectation=${saved.id}$`));
    const published = await db.operationalAssignmentTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.name).toBe(name);
    await expect(editor.getByTestId("publish-coverage-expectation")).toBeVisible();
    expect(browserErrors).toEqual([]);
    await page.request.post("/api/auth/logout");
    const readOnlyLogin = await page.request.post("/api/auth/login", { data: { email: fx.adminEmail, password } });
    expect(readOnlyLogin.ok()).toBeTruthy();
    await page.goto(fx.peopleHref);
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("add-coverage-expectation")).toHaveCount(0);
    await page.goto(`${fx.peopleHref}&expectation=${saved.id}`);
    await expect(editor.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  } finally { await db.$disconnect(); }
});

test("Team rooms @coverage-builder: real Employee Builder save and authorized Dashboard lens", async ({ page }, info) => {
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const fx: Fixtures = JSON.parse(readFileSync(process.env.PEOPLE_COVERAGE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp/people-coverage-browser-artifacts/fixtures.json"), "utf8"));
  const password = process.env.SEED_DEMO_PASSWORD;
  const db = new PrismaClient();
  try {
    await db.repair.deleteMany({ where: { responsibleDepartmentId: fx.dietaryDepartmentId, repairCode: { startsWith: "PF002 Team " } } });
    await db.asset.deleteMany({ where: { departmentId: fx.dietaryDepartmentId, assetCode: { startsWith: "PF002 Team " } } });
    const department = await db.department.findUniqueOrThrow({ where: { id: fx.dietaryDepartmentId }, include: { headEmployee: { include: { user: true } } } });
    const head = department.headEmployee?.user;
    if (!head || !password) throw new Error("Coverage workflow must initialize the explicit Department head");
    expect((await page.request.post("/api/auth/login", { data: { email: head.email, password } })).ok()).toBeTruthy();
    await page.goto(`/employees?dept=${fx.dietaryDepartmentId}`, { timeout: 90_000 });
    const panel = page.getByTestId("employee-teams-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId("add-team").click();
    const name = `PF002 Team ${randomBytes(4).toString("hex")}`;
    await panel.getByTestId("team-name-input").fill(name);
    const form = panel.locator("form").filter({ has: page.getByTestId("team-name-input") });
    await form.getByRole("checkbox", { name: new RegExp(fx.primarySpaceName) }).check();
    await form.getByRole("button", { name: "Create Team", exact: true }).click();
    await expect(panel.getByTestId("team-name-input")).toHaveCount(0);
    await page.reload();
    const row = panel.getByTestId("employee-team-row").filter({ has: page.locator(`input[value="${name}"]`) });
    await expect(row).toContainText("1 normal rooms");
    const saved = await db.departmentTeam.findFirstOrThrow({ where: { departmentId: fx.dietaryDepartmentId, displayName: name }, include: { roomMemberships: true } });
    expect(saved.roomMemberships.map(room => room.spaceId)).toEqual([fx.primarySpaceId]);
    // A room-specific maintenance fact keeps this authorization test independent
    // of whether the preceding staffing workflow has closed its Coverage gap.
    const space = await db.unitSpace.findUniqueOrThrow({ where: { id: fx.primarySpaceId } });
    const asset = await db.asset.create({ data: { assetCode: name, name: "Team-room fixture asset", equipmentType: "EQUIPMENT",
      unitId: space.unitId!, spaceId: space.id, departmentId: fx.dietaryDepartmentId, criticality: "ROUTINE" } });
    await db.repair.create({ data: { repairCode: name, title: "Team-room fixture repair", description: "Explicit room authorization control",
      assetId: asset.id, unitId: space.unitId!, spaceId: space.id, requestingDepartmentId: fx.dietaryDepartmentId,
      responsibleDepartmentId: fx.dietaryDepartmentId } });
    await page.screenshot({ path: info.outputPath("team-room-membership.png"), fullPage: true });
    const role = await db.role.findUniqueOrThrow({ where: { key: "SUPERVISOR" } });
    const user = await db.user.create({ data: { facilityId: fx.facilityId, primaryDepartmentId: fx.dietaryDepartmentId,
      email: `team.super.${randomBytes(4).toString("hex")}@ltc.local`, displayName: "Team Supervisor",
      roleId: role.id, passwordHash: head.passwordHash, emailVerifiedAt: new Date() } });
    await ensureUserFacilityAccessGrant(db, { userId: user.id, facilityId: fx.facilityId, roleKey: "SUPERVISOR" });
    const employee = await db.employee.create({ data: { facilityId: fx.facilityId, firstName: "Team", lastName: "Supervisor",
      primaryDepartmentId: fx.dietaryDepartmentId, roleType: "SUPERVISOR" } });
    const invitation = await issueEmployeeUserLinkInvitation(db, { employeeId: employee.id, facilityId: fx.facilityId,
      targetEmail: user.email, intendedRoleKey: "SUPERVISOR", invitedByUserId: head.id });
    await acceptEmployeeUserLinkInvitation(db, { rawToken: invitation.rawToken, authenticatedUserId: user.id });
    await db.employeeTeamMembership.create({ data: { employeeId: employee.id, teamId: saved.id, isPrimary: true } });
    await page.request.post("/api/auth/logout");
    expect((await page.request.post("/api/auth/login", { data: { email: user.email, password } })).ok()).toBeTruthy();
    await page.goto(`/dashboard?scope=team:${fx.dietaryDepartmentId}`);
    await expect(page.getByTestId("dashboard-lens").getByTestId(`dashboard-lens-team:${fx.dietaryDepartmentId}`)).toBeVisible();
    await expect(page.getByTestId("dashboard-scope")).toContainText(/team/i);
    const attention = page.getByTestId("dashboard-card-attention");
    await expect(attention).toHaveAttribute("data-state", "ready");
    await expect(attention).toContainText(name);
    await expect(attention).not.toContainText("1A Naval Park");
    await page.screenshot({ path: info.outputPath("team-dashboard-lens.png"), fullPage: true });
    await page.goto(`/dashboard?scope=team:${fx.plantDepartmentId}`);
    await expect(page.getByTestId("dashboard-scope")).not.toContainText("Plant");
  } finally { await db.$disconnect(); }
});

test("Assignment lifecycle @coverage-builder: employee completes, supervisor reopens, offline replay confirms once", async ({ page }, info) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  assertDisposableDatabaseUrl(process.env.VERIFY_DATABASE_URL);
  const fx: Fixtures = JSON.parse(readFileSync(process.env.PEOPLE_COVERAGE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp/people-coverage-browser-artifacts/fixtures.json"), "utf8"));
  const db = new PrismaClient();
  try {
    const department = await db.department.findUniqueOrThrow({ where: { id: fx.dietaryDepartmentId }, include: { headEmployee: { include: { user: true } } } });
    const head = department.headEmployee!.user!;
    const employee = await db.employee.findFirstOrThrow({ where: { facilityId: fx.facilityId, firstName: "Space",
      lastName: { startsWith: "Assignment PF-2D-002 UI " } }, orderBy: { createdAt: "desc" } });
    const role = await db.role.findUniqueOrThrow({ where: { key: "STAFF" } });
    const user = await db.user.create({ data: { facilityId: fx.facilityId, primaryDepartmentId: fx.dietaryDepartmentId,
      email: `assignment.worker.${randomBytes(4).toString("hex")}@ltc.local`, displayName: "Assignment Worker",
      roleId: role.id, passwordHash: head.passwordHash, emailVerifiedAt: new Date() } });
    await ensureUserFacilityAccessGrant(db, { userId: user.id, facilityId: fx.facilityId, roleKey: "STAFF" });
    const invitation = await issueEmployeeUserLinkInvitation(db, { employeeId: employee.id, facilityId: fx.facilityId,
      targetEmail: user.email, intendedRoleKey: "STAFF", invitedByUserId: head.id });
    await acceptEmployeeUserLinkInvitation(db, { rawToken: invitation.rawToken, authenticatedUserId: user.id });
    const assignment = await db.operationalAssignment.findFirstOrThrow({ where: { employeeId: employee.id,
      serviceDate: new Date(`${fx.serviceDateKey}T00:00:00Z`) } });
    const space = await db.unitSpace.findUniqueOrThrow({ where: { id: fx.primarySpaceId } });
    const href = `/unit/${space.unitId}?space=${space.id}`;
    await loginPassword(page, user.email);
    await page.goto(href);
    const completion = page.getByTestId("employee-assignment-completion");
    await expect(completion).toContainText("Verify the service station and record completion.");
    await completion.getByLabel("Completion note").fill("Finished all assigned locations online.");
    await completion.getByRole("button", { name: "Complete Assignment", exact: true }).click();
    await expect.poll(async () => (await db.operationalAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("COMPLETED");
    await page.reload();
    await expect(page.getByTestId("employee-completed-assignments")).toContainText("Server");
    expect(await db.operationalAssignmentEvent.count({ where: { assignmentId: assignment.id, eventType: "COMPLETED", actorUserId: user.id } })).toBe(1);

    await loginPassword(page, head.email);
    await page.goto(`/staffing/assignments?department=${fx.dietaryDepartmentId}&date=${fx.serviceDateKey}`);
    const history = page.getByTestId("assignment-completed-list");
    await history.locator("summary").click();
    const row = history.getByTestId(`completed-assignment-${assignment.id}`);
    await row.getByLabel("Reason to reopen Assignment").fill("Recheck the service station.");
    await row.getByRole("button", { name: "Reopen Assignment", exact: true }).click();
    await expect.poll(async () => (await db.operationalAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("ACTIVE");
    expect(await db.operationalAssignmentEvent.count({ where: { assignmentId: assignment.id, eventType: "REOPENED" } })).toBe(1);

    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, space.unitId!);
    await loginPassword(page, user.email);
    await page.goto(href);
    await expectCanonicalOfflinePreparation(page);
    await page.context().setOffline(true);
    await page.getByTestId("space-assignment-complete").click();
    await expect(page.getByTestId("space-command-result")).toContainText("pending");
    expect((await db.operationalAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("ACTIVE");
    await page.context().setOffline(false);
    await page.getByTestId("space-offline-sync").click();
    await expect(page.getByTestId("space-command-result")).toContainText("committed");
    expect((await db.operationalAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).status).toBe("COMPLETED");
    const receiptWhere = { facilityId: fx.facilityId, actorUserId: user.id, commandType: "space/1:ASSIGNMENT" };
    expect(await db.offlineSyncReceipt.count({ where: receiptWhere })).toBe(1);
    await page.getByTestId("space-offline-sync").click();
    expect(await db.offlineSyncReceipt.count({ where: receiptWhere })).toBe(1);
    expect(await db.operationalAssignmentEvent.count({ where: { assignmentId: assignment.id, eventType: "COMPLETED" } })).toBe(2);
    await page.screenshot({ path: info.outputPath("assignment-offline-receipt.png"), fullPage: true });
    await page.locator("[data-space-offline-fallback]").screenshot({ path: info.outputPath("assignment-offline-receipt-panel.png") });
    await page.getByRole("link", { name: "Return to live Space", exact: true }).click();
    await expect(page.getByTestId("employee-completed-assignments")).toContainText("Server");
    await expect(completion).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally { await page.context().setOffline(false); await db.$disconnect(); }
});
