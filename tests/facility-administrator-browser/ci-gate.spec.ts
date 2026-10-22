import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient, RoleKey } from "@prisma/client";

type Person = { userId: string; email: string; displayName: string };

type Fixtures = {
  organizationId: string;
  transferFacilityId: string;
  transferFacilityName: string;
  recoveryFacilityId: string;
  recoveryFacilityName: string;
  holder: Person;
  successor: Person;
  departed: Person;
  appointee: Person;
  orgAdmin: { userId: string; email: string };
};

const TRANSFER_PAGE = "/admin/organization/facility-administrator";
const INVITATIONS_PAGE = "/account/facility-administrator";

function loadFixtures(): Fixtures {
  const path =
    process.env.FACILITY_ADMINISTRATOR_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "facility-administrator-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

async function signIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: process.env.FACILITY_ADMINISTRATOR_BROWSER_BASE_URL });
  const page = await context.newPage();
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();
  return { context, page };
}

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ datasources: { db: { url: process.env.VERIFY_DATABASE_URL } } });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

async function openRoles(db: PrismaClient, facilityId: string) {
  return db.userFacilityRolePeriod.findMany({
    where: { endsAt: null, userFacilityAccess: { facilityId } },
    select: { roleKey: true, userFacilityAccess: { select: { userId: true } } },
  });
}

test.describe.configure({ mode: "serial" });

test("transfer @ci-gate: the Facility Administrator hands the role to a successor who accepts", async ({ browser }) => {
  const fx = loadFixtures();
  const holder = await signIn(browser, fx.holder.email);
  const successor = await signIn(browser, fx.successor.email);
  try {
    await holder.page.goto(TRANSFER_PAGE, { waitUntil: "domcontentloaded" });
    await expect(holder.page.getByTestId("facility-administrator-holder")).toContainText(fx.holder.displayName);
    const form = holder.page.getByTestId("facility-administrator-transfer-form");
    await form.locator('select[name="invitedUserId"]').selectOption(fx.successor.userId);
    await form.locator('select[name="outgoingRoleKey"]').selectOption(RoleKey.SUPERVISOR);
    await form.getByRole("button", { name: "Send invitation" }).click();

    const pending = holder.page.getByTestId("facility-administrator-pending");
    await expect(pending).toContainText(fx.successor.displayName);
    await expect(pending).toContainText(`${fx.holder.displayName} becomes Supervisor`);
    await expect(holder.page.getByTestId("facility-administrator-action-message")).toContainText("Invitation");
    await expect(holder.page.getByTestId("facility-administrator-transfer-form")).toHaveCount(0);
    // Nothing changes before acceptance.
    expect(
      (await withDb((db) => openRoles(db, fx.transferFacilityId))).find(
        (row) => row.roleKey === RoleKey.FACILITY_ADMINISTRATOR,
      )?.userFacilityAccess.userId,
    ).toBe(fx.holder.userId);

    await successor.page.goto(INVITATIONS_PAGE, { waitUntil: "domcontentloaded" });
    const invitation = successor.page.getByTestId("facility-administrator-invitation");
    await expect(invitation).toContainText(fx.transferFacilityName);
    await expect(invitation).toContainText(`${fx.holder.displayName} will become Supervisor`);
    await invitation.getByRole("button", { name: "Accept and become Facility Administrator" }).click();
    await expect(successor.page.getByTestId("facility-administrator-answer-message")).toContainText(
      "You are now the Facility Administrator.",
    );

    const roles = await withDb((db) => openRoles(db, fx.transferFacilityId));
    const roleOf = (userId: string) => roles.filter((row) => row.userFacilityAccess.userId === userId).map((row) => row.roleKey);
    expect(roles.filter((row) => row.roleKey === RoleKey.FACILITY_ADMINISTRATOR)).toHaveLength(1);
    expect(roleOf(fx.successor.userId)).toEqual([RoleKey.FACILITY_ADMINISTRATOR]);
    expect(roleOf(fx.holder.userId)).toEqual([RoleKey.SUPERVISOR]);

    // Both live sessions pick up the new roles without signing in again.
    await successor.page.goto(TRANSFER_PAGE, { waitUntil: "domcontentloaded" });
    await expect(successor.page.getByTestId("facility-administrator-holder")).toContainText(fx.successor.displayName);
    await expect(successor.page.getByTestId("facility-administrator-transfer-form")).toBeVisible();

    await holder.page.goto(TRANSFER_PAGE, { waitUntil: "domcontentloaded" });
    await holder.page.waitForURL((url) => url.pathname !== TRANSFER_PAGE, { timeout: 15_000 });
    await expect(holder.page.getByTestId("facility-administrator-page")).toHaveCount(0);
  } finally {
    await holder.context.close();
    await successor.context.close();
  }
});

test("recovery @ci-gate: the organization appoints a successor after the holder has left", async ({ browser }) => {
  const fx = loadFixtures();
  const orgAdmin = await signIn(browser, fx.orgAdmin.email);
  const appointee = await signIn(browser, fx.appointee.email);
  const facilitiesPage = `/organization/${fx.organizationId}/facilities`;
  try {
    await orgAdmin.page.goto(facilitiesPage, { waitUntil: "domcontentloaded" });
    const rowFor = (facilityId: string) =>
      orgAdmin.page.locator(`[data-testid="organization-facility-administrator-row"][data-facility-id="${facilityId}"]`);

    // A held seat cannot be appointed over.
    const heldRow = rowFor(fx.transferFacilityId);
    await expect(heldRow.getByTestId("organization-facility-administrator-seat")).toContainText("Facility Administrator:");
    await expect(heldRow.getByTestId("organization-appoint-administrator-form")).toHaveCount(0);

    const recoveryRow = rowFor(fx.recoveryFacilityId);
    const seat = recoveryRow.getByTestId("organization-facility-administrator-seat");
    await expect(seat).toContainText(fx.departed.displayName);
    await expect(seat).toContainText("Account is inactive");

    const appointForm = recoveryRow.getByTestId("organization-appoint-administrator-form");
    await appointForm.locator('input[name="invitedEmail"]').fill(`nobody.${Date.now()}@cda02.local`);
    await appointForm.getByRole("button", { name: "Send invitation" }).click();
    await expect(recoveryRow.getByTestId("organization-facility-administrator-message")).toContainText(
      "No one with that email has an active account at this facility.",
    );

    await appointForm.locator('input[name="invitedEmail"]').fill(fx.appointee.email.toUpperCase());
    await appointForm.getByRole("button", { name: "Send invitation" }).click();
    await expect(recoveryRow).toContainText(`Waiting for ${fx.appointee.displayName}`);
    await expect(recoveryRow.getByTestId("organization-facility-administrator-message").first()).toContainText(
      "Invitation",
    );
    await expect(recoveryRow.getByTestId("organization-appoint-administrator-form")).toHaveCount(0);

    await appointee.page.goto(INVITATIONS_PAGE, { waitUntil: "domcontentloaded" });
    const invitation = appointee.page.getByTestId("facility-administrator-invitation");
    await expect(invitation).toContainText(fx.recoveryFacilityName);
    await expect(invitation).toContainText("of the parent organization asked you to become Facility Administrator");
    await expect(invitation).toContainText(`${fx.departed.displayName}'s Facility Administrator role ends`);
    await invitation.getByRole("button", { name: "Accept and become Facility Administrator" }).click();
    await expect(appointee.page.getByTestId("facility-administrator-answer-message")).toContainText(
      "You are now the Facility Administrator.",
    );

    const roles = await withDb((db) => openRoles(db, fx.recoveryFacilityId));
    const administrators = roles.filter((row) => row.roleKey === RoleKey.FACILITY_ADMINISTRATOR);
    expect(administrators.map((row) => row.userFacilityAccess.userId)).toEqual([fx.appointee.userId]);
    expect(roles.some((row) => row.userFacilityAccess.userId === fx.departed.userId)).toBe(false);

    await orgAdmin.page.reload({ waitUntil: "domcontentloaded" });
    await expect(rowFor(fx.recoveryFacilityId).getByTestId("organization-facility-administrator-seat")).toContainText(
      `Facility Administrator: ${fx.appointee.displayName}`,
    );
    await expect(rowFor(fx.recoveryFacilityId).getByTestId("organization-appoint-administrator-form")).toHaveCount(0);

    await appointee.page.goto(TRANSFER_PAGE, { waitUntil: "domcontentloaded" });
    await expect(appointee.page.getByTestId("facility-administrator-holder")).toContainText(fx.appointee.displayName);
  } finally {
    await orgAdmin.context.close();
    await appointee.context.close();
  }
});
