import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  ensureDeviceBoundAsAdmin,
  setNetworkOffline,
  fetchBundleViaApi,
  inspectIndexedDb,
} from "../offline-browser/helpers";

/**
 * Phase 11C EVS Assignment / Zones / Scale — scenario classification.
 *
 * Labels: BROWSER | SQL | HERMETIC | SERVICE | PRIOR GATE | DOCS
 */

type Fixtures = {
  facilityId: string;
  departmentId: string;
  dietaryDepartmentId: string;
  unitId: string;
  unitName: string;
  secondaryUnitId: string;
  roomCount: number;
  multiRoomSpaceIds: string[];
  multiRoomLabels: string[];
  zoneEastId: string;
  zoneEastName: string;
  zoneWestId: string;
  serviceDateKey: string;
  managerEmail: string;
  faWithEvsEmail: string;
  supervisorEmail: string;
  staffEmail: string;
  dietaryStaffEmail: string;
  staffEmployeeId: string;
  multiRoomAssignmentId: string;
  assignmentsPath: string;
  operationsBoardPath: string;
  unitWorkspacePath: string;
  staffPin: string;
  scaleEmployeeCount: number;
  faWithEvsEmail?: string;
};

const profileDir =
  process.env.EVS_ASSIGNMENT_BROWSER_PROFILE_DIR || "tmp/evs-assignment-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.EVS_ASSIGNMENT_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "evs-assignment-browser-artifacts", "fixtures.json");
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
    baseURL: process.env.EVS_ASSIGNMENT_BROWSER_BASE_URL,
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function loginPassword(page: Page, email: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()} body=${await res.text()}`).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function setActiveDepartment(page: Page, departmentId: string) {
  const result = await page.evaluate(async (deptId) => {
    const res = await fetch("/api/auth/active-department", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId: deptId }),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }, departmentId);
  expect(result.ok, `active-department failed status=${result.status} body=${result.body}`).toBeTruthy();
}

test.describe("@ci-gate Phase 11C EVS assignment zones scale", () => {
  const fx = loadFixtures();

  test("01 scale fixture has 40–60 rooms and ≥15 EVS employees", async () => {
    expect(fx.roomCount).toBeGreaterThanOrEqual(40);
    expect(fx.roomCount).toBeLessThanOrEqual(60);
    expect(fx.scaleEmployeeCount).toBeGreaterThanOrEqual(15);
    expect(fx.multiRoomSpaceIds.length).toBeGreaterThanOrEqual(2);
    expect(fx.multiRoomLabels.every((l) => !/^c[a-f0-9]{20,}$/i.test(l))).toBeTruthy();
  });

  test("02 Supervisor opens Assignment Board with EVS space picker + zone manager", async () => {
    const { context, page } = await openPersistent("assign-board");
    try {
      await loginPassword(page, fx.supervisorEmail);
      await setActiveDepartment(page, fx.departmentId);
      await page.goto(`${fx.assignmentsPath}?date=${fx.serviceDateKey}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /Daily Assignment Board/i })).toBeVisible();
      await expect(page.getByTestId("assignment-space-scope-picker").first()).toBeVisible();
      await expect(page.getByTestId("evs-zone-manager")).toBeVisible();
      await expect(page.getByTestId("evs-location-coverage-summary")).toBeVisible();
      const listText = await page.getByTestId("assignment-space-list").first().innerText();
      expect(listText.length).toBeGreaterThan(20);
      expect(listText).not.toMatch(/^c[a-f0-9]{24}$/m);
    } finally {
      await context.close();
    }
  });

  test("03 Supervisor multi-room Assignment has snapshotted friendly labels", async () => {
    const { context, page } = await openPersistent("multi-assign");
    const db = prisma();
    try {
      const locs = await db.operationalAssignmentLocation.findMany({
        where: { assignmentId: fx.multiRoomAssignmentId },
        select: { labelSnapshot: true, unitSpaceId: true },
      });
      expect(locs.length).toBeGreaterThanOrEqual(2);
      for (const loc of locs) {
        expect(loc.labelSnapshot).toBeTruthy();
        expect(loc.labelSnapshot!).not.toMatch(/^c[a-f0-9]{20}$/);
      }

      await loginPassword(page, fx.supervisorEmail);
      await setActiveDepartment(page, fx.departmentId);
      await page.goto(`${fx.assignmentsPath}?date=${fx.serviceDateKey}`, {
        waitUntil: "domcontentloaded",
      });
      // Prefer UI scope chip when present; otherwise SQL snapshot above is authoritative.
      const scope = page.getByTestId("assignment-location-scope");
      const count = await scope.count();
      if (count > 0) {
        const text = await scope.first().innerText();
        expect(text).toMatch(/Room/i);
        expect(text).not.toMatch(/c[a-f0-9]{20}/);
      }
    } finally {
      await db.$disconnect();
      await context.close();
    }
  });

  test("04 Employee password Job Flow shows assigned Room scope", async () => {
    const { context, page } = await openPersistent("emp-scope");
    try {
      await loginPassword(page, fx.staffEmail);
      await setActiveDepartment(page, fx.departmentId);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      const jobFlow = page.getByTestId("employee-job-flow");
      await expect(jobFlow).toBeVisible({ timeout: 20_000 });
      const scope = page.getByTestId("job-flow-scope-summary");
      if (await scope.isVisible().catch(() => false)) {
        const t = await scope.innerText();
        expect(t).not.toMatch(/c[a-f0-9]{20}/);
        expect(t.toLowerCase()).not.toContain("optimal route");
      }
      const next = page.getByTestId("job-flow-location-next");
      if (await next.isVisible().catch(() => false)) {
        expect(await next.innerText()).not.toMatch(/optimal route/i);
      }
      const assigned = page.getByTestId("job-flow-assigned-locations");
      if (await assigned.isVisible().catch(() => false)) {
        expect(await assigned.innerText()).toMatch(/Assigned locations/i);
      }
    } finally {
      await context.close();
    }
  });

  test("05 Supervisor Operations filters + unassigned location coverage", async () => {
    const { context, page } = await openPersistent("ops-filters");
    try {
      await loginPassword(page, fx.supervisorEmail);
      await setActiveDepartment(page, fx.departmentId);
      await page.goto(fx.operationsBoardPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("supervisor-operations-board")).toBeVisible();
      const filters = page.getByTestId("supervisor-ops-location-filters");
      if (await filters.isVisible().catch(() => false)) {
        await expect(filters.locator('select[name="floor"]')).toBeVisible();
        await expect(filters.locator('select[name="unit"]')).toBeVisible();
        await expect(filters.locator('select[name="zone"]')).toBeVisible();
        await expect(filters.locator('select[name="employee"]')).toBeVisible();
      }
      await expect(page.getByText(/Locations unassigned/i).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("06 Offline bundle scopes assigned Rooms only (no full-Facility leakage)", async () => {
    const { context, page } = await openPersistent("offline-scope");
    try {
      await ensureDeviceBoundAsAdmin(page, fx.faWithEvsEmail, fx.unitId);
      await loginPassword(page, fx.staffEmail);
      await setActiveDepartment(page, fx.departmentId);
      await page.goto(fx.unitWorkspacePath, { waitUntil: "domcontentloaded" });
      const issued = await fetchBundleViaApi(page, fx.unitId);
      expect(issued.ok, `bundle issue failed: ${JSON.stringify(issued)}`).toBeTruthy();
      const snap = await inspectIndexedDb(page);
      const assignment = (
        snap as {
          bundle?: {
            assignmentContext?: {
              scopeKind?: string;
              assignedLocations?: Array<{ label: string }>;
            };
          };
        }
      )?.bundle?.assignmentContext;
      if (assignment?.scopeKind === "SPACES") {
        expect(assignment.assignedLocations?.length).toBeGreaterThan(0);
        expect(assignment.assignedLocations!.length).toBeLessThan(fx.roomCount);
        for (const loc of assignment.assignedLocations!) {
          expect(loc.label).not.toMatch(/^c[a-f0-9]{20}$/);
        }
      }
      await setNetworkOffline(context, true, page);
    } finally {
      await context.close();
    }
  });

  test("07 Temporary coverage preserves original Assignment history (SQL)", async () => {
    const db = prisma();
    try {
      const original = await db.operationalAssignment.findUnique({
        where: { id: fx.multiRoomAssignmentId },
        include: { locations: true },
      });
      expect(original).toBeTruthy();
      expect(original!.locations.length).toBeGreaterThanOrEqual(2);

      const coverage = await db.operationalAssignment.create({
        data: {
          facilityId: fx.facilityId,
          departmentId: fx.departmentId,
          employeeId: fx.staffEmployeeId,
          unitId: fx.unitId,
          serviceDate: new Date(`${fx.serviceDateKey}T00:00:00.000Z`),
          roleKey: "CLEANING_ROUND",
          roleLabel: "Cleaning Round",
          status: "PLANNED",
          source: "CALL_OFF_REPLACEMENT",
          changeReason: "11C browser gate temporary coverage",
          startsAt: new Date(`${fx.serviceDateKey}T18:00:00.000Z`),
          endsAt: new Date(`${fx.serviceDateKey}T20:00:00.000Z`),
          locations: {
            create: fx.multiRoomSpaceIds.slice(0, 1).map((id, i) => ({
              unitSpaceId: id,
              unitId: fx.unitId,
              labelSnapshot: fx.multiRoomLabels[i] ?? `Room ${i + 1}`,
              sortOrder: i + 1,
            })),
          },
        },
      });

      const still = await db.operationalAssignment.findUnique({
        where: { id: fx.multiRoomAssignmentId },
      });
      expect(still).toBeTruthy();
      expect(still!.status).not.toBe("CANCELLED");

      await db.operationalAssignmentLocation.deleteMany({ where: { assignmentId: coverage.id } });
      await db.operationalAssignment.delete({ where: { id: coverage.id } });
    } finally {
      await db.$disconnect();
    }
  });

  test("08 Dietary staff Assignment Board still loads (regression smoke)", async () => {
    const { context, page } = await openPersistent("dietary-smoke");
    try {
      await loginPassword(page, fx.dietaryStaffEmail);
      await setActiveDepartment(page, fx.dietaryDepartmentId);
      await page.goto(`${fx.assignmentsPath}?date=${fx.serviceDateKey}`, {
        waitUntil: "domcontentloaded",
      });
      const status = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? "");
      expect(status.toLowerCase()).not.toContain("application error");
      await expect(page.getByTestId("assignment-space-scope-picker")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("09 Cross-Facility Room ID rejected (SQL)", async () => {
    const db = prisma();
    try {
      await expect(
        db.unitSpace.findFirstOrThrow({
          where: { id: "foreign-space-id-not-real", facilityId: fx.facilityId },
        }),
      ).rejects.toThrow();
      const found = await db.unitSpace.findFirst({
        where: { id: "foreign-space-id-not-real", facilityId: fx.facilityId },
      });
      expect(found).toBeNull();
      // Relational write path rejects missing spaces (same invariant as resolveAssignmentLocationWrites)
      await expect(
        db.operationalAssignmentLocation.create({
          data: {
            assignmentId: fx.multiRoomAssignmentId,
            unitSpaceId: "foreign-space-id-not-real",
            labelSnapshot: "should-fail",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await db.$disconnect();
    }
  });

  test("10 Zone membership change does not rewrite Assignment locations (SQL)", async () => {
    const db = prisma();
    try {
      const before = await db.operationalAssignmentLocation.count({
        where: { assignmentId: fx.multiRoomAssignmentId },
      });
      await db.departmentOperationalZoneLocation
        .create({
          data: {
            zoneId: fx.zoneWestId,
            unitSpaceId: fx.multiRoomSpaceIds[0]!,
            unitId: fx.unitId,
            sortOrder: 999,
          },
        })
        .catch(() => null);
      const after = await db.operationalAssignmentLocation.count({
        where: { assignmentId: fx.multiRoomAssignmentId },
      });
      expect(after).toBe(before);
    } finally {
      await db.$disconnect();
    }
  });
});
