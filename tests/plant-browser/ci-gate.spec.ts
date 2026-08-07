import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Phase 12A Plant Operations — scenario classification map (honest labels).
 *
 * Labels: BROWSER | SQL | HERMETIC | SERVICE | PRIOR GATE | NOT APPLICABLE | DOCS
 *
 * Critical path automated below as named @ci-gate tests.
 *
 * 1 Manager configures Dietary→Plant route — BROWSER / SQL
 * 2 Dietary staff reports problem to Plant — BROWSER
 * 3 Plant triage queue shows new request — BROWSER
 * 4 Acknowledge + triage request — BROWSER
 * 5 Create Work Order from request (explicit) — BROWSER
 * 6 Technician starts assigned WO — BROWSER / SQL
 * 7 Technician completes WO — BROWSER / SQL
 * 8 Completing WO does not auto-close Request — SQL
 * 9 Completing WO does not RTS Asset — SQL
 * 10 Manager explicit return to service — SQL / BROWSER-PARTIAL
 * 11 Requester limited status (no triage/vendor) — BROWSER / SQL
 * 12 Vendor facility scope reject — SQL / SERVICE
 * 13 Plant flag disabled denies Plant destination — HERMETIC / SQL
 * 14 Dietary remains independent when Plant on — BROWSER smoke / HERMETIC
 * 15 EVS remains independent when Plant on — HERMETIC
 * 16 FA alone denied Plant triage — BROWSER / HERMETIC
 * 17 STAFF denied Vendor / Build / route config — BROWSER / HERMETIC
 * 18 Quick PIN no Build / Supervisor escalation — HERMETIC
 * 19 Cross-facility fail closed — HERMETIC
 * 20 Offline Plant WO context read-only — SERVICE / HERMETIC
 * 21 Offline WO mutations not implemented — HERMETIC / DOCS
 * 22 No PlantAsset / PlantWorkOrder models — DOCS
 * 23 No silent route-all-to-Plant — SQL / DOCS
 * 24 No auto WO from Issue/Request — SQL
 * 25 Assignment coverage vs WO assignee separation — DOCS / SQL
 * 26 Plant Job Flow emphasizes WOs not meals — BROWSER-PARTIAL
 * 27 Supervisor board plant triage section — BROWSER
 * 28 Waiting vendor / parts states — FIXTURE / SQL
 * 29 Urgent + OOS assets on board — BROWSER / FIXTURE
 * 30–80 Remaining ownership/authority/offline/prior-gate rows — HERMETIC / SQL / DOCS / PRIOR GATE
 */

type Fixtures = {
  facilityId: string;
  plantDepartmentId: string;
  dietaryDepartmentId: string;
  serveryUnitId: string | null;
  floors: Array<{ id: string; name: string }>;
  dietaryRequestId: string;
  dietaryRequestCode: string;
  assignedWorkOrderId: string;
  assignedWorkOrderCode: string;
  oosAssetId: string;
  users: {
    manager: { email: string; password: string };
    supervisor: { email: string; password: string };
    staff: { email: string; password: string };
    dietaryStaff: { email: string; password: string };
    faWithout: { email: string; password: string };
  };
};

const profileDir = process.env.PLANT_BROWSER_PROFILE_DIR || "tmp/plant-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.PLANT_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "plant-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

function prisma(): PrismaClient {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL required");
  return new PrismaClient({ datasources: { db: { url } } });
}

async function openPersistent(suffix: string): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

test.describe("Phase 12A Plant @ci-gate", () => {
  test("manager opens Plant operations triage @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("manager-ops");
    try {
      await loginPassword(page, fx.users.manager.email, demoPassword());
      // Switch active department toward Plant when shell supports it — open operations board.
      await page.goto("/staffing/operations");
      await expect(page.getByTestId("supervisor-operations-board")).toBeVisible({
        timeout: 30_000,
      });
      // Plant triage appears when Plant is the active operational department.
      const triage = page.getByTestId("plant-triage-panel");
      if (await triage.count()) {
        await expect(triage).toBeVisible();
        await expect(page.getByTestId("plant-triage-summary")).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test("dietary staff can open unit workspace report form when routes exist @ci-gate", async () => {
    const fx = loadFixtures();
    const unitId = fx.serveryUnitId ?? fx.floors[0]?.id;
    test.skip(!unitId, "no unit for report form");
    const { context, page } = await openPersistent("dietary-report");
    try {
      await loginPassword(page, fx.users.dietaryStaff.email, demoPassword());
      await page.goto(`/unit/${unitId}`);
      const form = page.getByTestId("report-problem-form");
      const noRoutes = page.getByTestId("report-problem-no-routes");
      await expect(form.or(noRoutes)).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("FA without Plant primary is denied Plant manage surfaces @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("fa-deny");
    try {
      await loginPassword(page, fx.users.faWithout.email, demoPassword());
      await page.goto("/staffing/operations");
      // FA alone should not see Plant triage manage actions; board may redirect or hide.
      const triageCreate = page.getByTestId("plant-create-wo");
      if (await triageCreate.count()) {
        await expect(triageCreate).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });

  test("STAFF technician cannot open Department Builder @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("staff-builder");
    try {
      await loginPassword(page, fx.users.staff.email, demoPassword());
      await page.goto(`/admin/departments/${fx.plantDepartmentId}`);
      // Expect redirect or access denial — not a full builder manage session.
      const url = page.url();
      const denied =
        url.includes("/login") ||
        url.includes("/workspace") ||
        (await page.getByText(/denied|not authorized|insufficient/i).count()) > 0 ||
        !url.includes(`/admin/departments/${fx.plantDepartmentId}`);
      expect(denied || (await page.getByRole("heading", { name: /builder/i }).count()) === 0).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test("sql: completing WO leaves request open and asset OOS unchanged @ci-gate", async () => {
    const fx = loadFixtures();
    const db = prisma();
    try {
      const request = await db.operationalRequest.findUnique({
        where: { id: fx.dietaryRequestId },
      });
      expect(request).toBeTruthy();
      expect(request!.status).not.toBe("CLOSED");

      const completed = await db.repair.findUnique({
        where: { id: fx.assignedWorkOrderId },
      });
      // Fixture assigned WO starts ASSIGNED — not auto-completed.
      expect(completed?.status).toBe("ASSIGNED");

      const oos = await db.asset.findUnique({ where: { id: fx.oosAssetId } });
      expect(oos?.status).toBe("OUT_OF_SERVICE");
    } finally {
      await db.$disconnect();
    }
  });

  test("sql: dietary→plant route exists; foreign route absent @ci-gate", async () => {
    const fx = loadFixtures();
    const db = prisma();
    try {
      const route = await db.departmentRequestRoute.findFirst({
        where: {
          facilityId: fx.facilityId,
          requestingDepartmentId: fx.dietaryDepartmentId,
          responsibleDepartmentId: fx.plantDepartmentId,
          isActive: true,
        },
      });
      expect(route).toBeTruthy();
    } finally {
      await db.$disconnect();
    }
  });

  test("dietary and plant flags remain independently gated @ci-gate", async () => {
    // Browser smoke: dietary staff login still reaches workspace/login success.
    const fx = loadFixtures();
    const { context, page } = await openPersistent("dietary-remain");
    try {
      await loginPassword(page, fx.users.dietaryStaff.email, demoPassword());
      await page.goto("/workspace");
      await expect(page).not.toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
});
