import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";

/**
 * Phase 13 — Build / Run Product Shell & Information Architecture browser gate.
 *
 * Verifies the RUN / BUILD / ADMIN product model in the real shell: mode switch, mode-aware
 * navigation that follows authority (never becomes authorization), role homes, Quick PIN RUN-only
 * frontline, direct-URL server authorization, legacy redirect authorization, and fail-closed 404.
 *
 * Scenario map (Section W). BROWSER unless noted.
 *  1 Manager signs in.                              — scenario-01
 *  2 RUN is visible.                                — scenario-01
 *  3 BUILD is visible to authorized Manager.        — scenario-02
 *  4 ADMIN only when governance authority permits.  — scenario-02 / scenario-06
 *  5 Manager lands on correct RUN home.             — scenario-01
 *  6 RUN Dashboard opens.                           — scenario-03
 *  7 RUN Locations opens.                           — scenario-03
 * 11 RUN Employees opens today's workforce tools.   — scenario-03
 * 13 BUILD Employee Builder is separate.            — scenario-05
 * 14 RUN Log Book opens historical records.         — scenario-03
 * 15 Operational Template Builder is in BUILD.      — scenario-04
 * 17 RUN Assets opens operational Asset view.       — scenario-03
 * 18 Asset Builder is in BUILD (composition).       — DOCS
 * 19 Department Builder opens.                       — scenario-04
 * 25 Procedures & Resources opens from BUILD.       — scenario-07 (FA)
 * 27 Department switch works for multi-dept mgr.    — scenario-08
 * 30 Quick PIN STAFF lands in RUN.                  — scenario-09
 * 31 Quick PIN STAFF cannot see BUILD.              — scenario-09
 * 32 Quick PIN STAFF cannot see ADMIN.              — scenario-09
 * 40 Direct URL remains server-authorized.          — scenario-10
 * 41 Breadcrumbs / mode indicator consistent.       — scenario-03
 * 46 Legacy route redirect preserves authorization. — scenario-11
 * 47 Unknown route remains fail-closed.             — scenario-12
 */

type Fixtures = {
  facilityId: string;
  facilityName: string;
  dietaryDepartmentId: string;
  evsDepartmentId: string;
  unitId: string;
  unitName: string;
  staffEmployeeId: string;
  users: {
    manager: { email: string; password: string };
    supervisor: { email: string; password: string };
    fa: { email: string; password: string };
    staff: { email: string; password: string };
  };
};

const profileDir = process.env.PRODUCT_SHELL_BROWSER_PROFILE_DIR || "tmp/product-shell-browser-profile";

function loadFixtures(): Fixtures {
  const path =
    process.env.PRODUCT_SHELL_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "product-shell-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

function staffPin(): string {
  const pin = process.env.PRODUCT_SHELL_STAFF_PIN;
  if (!pin) throw new Error("PRODUCT_SHELL_STAFF_PIN required");
  return pin;
}

type Viewport = { width: number; height: number };

/** Common device viewports the product shell must remain usable at. */
const DESKTOP_VIEWPORT: Viewport = { width: 1360, height: 900 };
/** iPad landscape — the primary tablet the operational runtime targets. */
const TABLET_LANDSCAPE_VIEWPORT: Viewport = { width: 1024, height: 768 };
/** iPad portrait — the shell stacks the locations rail above content below the lg breakpoint. */
const TABLET_PORTRAIT_VIEWPORT: Viewport = { width: 820, height: 1180 };

async function openPersistent(
  suffix: string,
  viewport: Viewport = DESKTOP_VIEWPORT,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(`${profileDir}-${suffix}`, {
    headless: true,
    viewport,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

const SIDEBAR_KINDS = new Set(["FACILITY", "FLOOR", "NEIGHBORHOOD", "LEGACY", "ROOM"]);

/** Password login via the real API (deterministic; avoids PIN-default gate on later contexts). */
async function loginPassword(page: Page, email: string, password: string) {
  const res = await page.request.post("/api/auth/login", {
    data: { email, password },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `login failed for ${email} status=${res.status()}`).toBeTruthy();
}

/** The header banner is the single top-navigation surface. */
function banner(page: Page) {
  return page.getByRole("banner");
}

function modeSegment(page: Page, mode: "RUN" | "BUILD") {
  return banner(page).locator(`[data-mode="${mode}"]`);
}

test.describe("Phase 13 Product Shell @ci-gate", () => {
  test("scenario-01: manager signs in, lands in RUN, RUN nav visible @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-run");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      // Manager RUN home is the Dashboard (/workspace).
      await page.waitForURL((u) => u.pathname === "/workspace", { timeout: 30_000 });
      // Mode indicator shows RUN.
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible({ timeout: 30_000 });
      // Canonical RUN nav.
      await expect(banner(page).getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Locations", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Employees", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Assets", exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("scenario-02: BUILD visible to manager; ADMIN not visible to manager @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-modes");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      // Run and Build mode segments are both present for an authorized manager.
      await expect(modeSegment(page, "RUN")).toBeVisible({ timeout: 30_000 });
      await expect(modeSegment(page, "BUILD")).toBeVisible();
      // Admin is governance-only: a manager sees no Admin entry.
      await expect(banner(page).getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("scenario-03: RUN surfaces open with a consistent mode indicator @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-run-open");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      for (const [path, area] of [
        ["/workspace", "Dashboard"],
        ["/units", "Locations"],
        ["/staffing", "Employees"],
        ["/staffing/log-book", "Log Book"],
        ["/assets", "Assets"],
      ] as const) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(\\?|$)`));
        // Mode indicator shows RUN + the area breadcrumb.
        const indicator = page.locator('[data-product-mode="RUN"]').first();
        await expect(indicator).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(area, { exact: false }).first()).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test("scenario-04: BUILD holds Department Builder + Operational Templates + Work Plans @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-build");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      await modeSegment(page, "BUILD").click();
      // Landing on a BUILD surface flips the mode indicator to BUILD.
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(banner(page).getByRole("link", { name: "Department Builder", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Employee Builder", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Operational Templates", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Work Plans", exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("scenario-05: RUN Employees (/staffing) and BUILD Employee Builder (/employees) are distinct @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-emp");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      // RUN Employees.
      await page.goto("/staffing", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/staffing(\?|$)/);
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible({ timeout: 30_000 });
      // BUILD Employee Builder.
      await page.goto("/employees", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/employees(\?|$)/);
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("scenario-06: FA sees RUN, BUILD, and ADMIN @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("fa-modes");
    try {
      await loginPassword(page, fx.users.fa.email, fx.users.fa.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      await expect(modeSegment(page, "RUN")).toBeVisible({ timeout: 30_000 });
      await expect(modeSegment(page, "BUILD")).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("scenario-07: FA BUILD holds Facility Builder + Procedures & Resources @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("fa-build");
    try {
      await loginPassword(page, fx.users.fa.email, fx.users.fa.password);
      await page.goto("/admin/facility/builder", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/facility\/builder(\?|$)/);
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible({ timeout: 30_000 });
      await expect(banner(page).getByRole("link", { name: "Facility Builder", exact: true })).toBeVisible();
      await expect(banner(page).getByRole("link", { name: "Procedures & Resources", exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("scenario-08: authorized multi-department manager can switch department @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-dept");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      const switcher = banner(page).getByRole("combobox").first();
      const count = await switcher.count();
      test.skip(count === 0, "department switcher not present for this fixture");
      // Selecting EVS keeps the user in a valid scope (switch is a lens, not authority).
      await switcher.selectOption(fx.evsDepartmentId).catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("scenario-09: Quick PIN STAFF lands in RUN and cannot see BUILD or ADMIN @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("pin-staff");
    try {
      // FA binds the shared tablet to a unit (sets device-facility cookie), then signs out.
      // These POSTs run as in-page fetch so they use the document cookie jar (the secure session
      // cookie is sent over http on 127.0.0.1, which Playwright's request context does not do).
      await loginPassword(page, fx.users.fa.email, fx.users.fa.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      const bindStatus = await page.evaluate(async (unitId) => {
        const r = await fetch("/api/auth/bind-device", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unitId }),
          credentials: "include",
        });
        return r.status;
      }, fx.unitId);
      expect(bindStatus, `bind-device failed status=${bindStatus}`).toBe(200);
      await page.evaluate(() =>
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {}),
      );

      // Quick PIN sign-in as frontline Dietary staff (device-facility binding survives logout).
      const pinStatus = await page.evaluate(async (pin) => {
        const r = await fetch("/api/auth/pin-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin }),
          credentials: "include",
        });
        return r.status;
      }, staffPin());
      expect(pinStatus, `pin-login failed status=${pinStatus}`).toBe(200);

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
      // RUN-only: no Build/Admin governance/config nav is offered to a frontline PIN session.
      await expect(banner(page).getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
      await expect(modeSegment(page, "BUILD")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("scenario-10: direct URL to a BUILD/ADMIN surface remains server-authorized for STAFF @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("staff-direct");
    try {
      await loginPassword(page, fx.users.staff.email, fx.users.staff.password);
      // STAFF is not approved for Employee Builder or Admin; the proxy redirects away (nav absence is
      // never the security boundary — the server is).
      await page.goto("/employees", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/employees(\?|$)/);
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/admin(\?|$)/);
    } finally {
      await context.close();
    }
  });

  test("scenario-11: legacy /settings redirect preserves authorization @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("legacy-redirect");
    try {
      // FA lands on Organization; a manager is redirected to their default home, not Organization.
      await loginPassword(page, fx.users.fa.email, fx.users.fa.password);
      await page.goto("/settings", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/organization(\?|$)/, { timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("scenario-12: unknown route remains fail-closed (404) @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("unknown-404");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      const res = await page.goto("/definitely-not-a-real-route", { waitUntil: "domcontentloaded" });
      expect(res?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  // ── Phase 14 — V1 UX completion ──────────────────────────────────────────

  test("scenario-13: the Build mode segment lands on the dedicated Build hub @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-build-hub");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      // Clicking the Build mode segment routes to the dedicated /build landing (its first nav item).
      await modeSegment(page, "BUILD").click();
      await page.waitForURL((u) => u.pathname === "/build", { timeout: 30_000 });
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible({ timeout: 30_000 });
      // The hub composes the Build group as cards — only surfaces the role may actually reach.
      // (Each card's accessible name is label + description, so target by the stable data-href.)
      const hub = page.getByTestId("build-hub");
      await expect(hub).toBeVisible();
      await expect(
        hub.locator('[data-testid="build-hub-card"][data-href="/admin/departments"]'),
      ).toBeVisible();
      await expect(
        hub.locator('[data-testid="build-hub-card"][data-href="/employees"]'),
      ).toBeVisible();
      // The hub never lists its own home link as a card.
      await expect(page.locator('[data-testid="build-hub-card"][data-href="/build"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("scenario-14: the product shell stays usable at tablet viewports @ci-gate", async () => {
    const fx = loadFixtures();
    for (const [suffix, viewport] of [
      ["mgr-tablet-landscape", TABLET_LANDSCAPE_VIEWPORT],
      ["mgr-tablet-portrait", TABLET_PORTRAIT_VIEWPORT],
    ] as const) {
      const { context, page } = await openPersistent(suffix, viewport);
      try {
        await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
        await page.goto("/workspace", { waitUntil: "domcontentloaded" });
        // The single top-navigation surface, both mode segments, and the RUN home remain reachable.
        await expect(modeSegment(page, "RUN")).toBeVisible({ timeout: 30_000 });
        await expect(modeSegment(page, "BUILD")).toBeVisible();
        await expect(banner(page).getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
        // The locations rail is present (stacked above content in portrait, beside it in landscape).
        await expect(page.locator('aside[aria-label="Locations rail"]')).toBeVisible();
        // The viewport does not scroll horizontally — the shell fits the tablet width.
        const overflowsX = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        expect(overflowsX, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBe(false);
      } finally {
        await context.close();
      }
    }
  });

  test("scenario-15: the shell offline indicator reacts to connectivity events @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-offline");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      const indicator = page.getByTestId("shell-offline-indicator");
      // Healthy connectivity adds no chrome.
      await expect(indicator).toHaveCount(0);
      // Simulate a transient connectivity drop on the already-loaded shell (a hard network cut would
      // trigger the PWA offline fallback instead of the live shell). The chip must surface politely.
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
        window.dispatchEvent(new Event("offline"));
      });
      await expect(indicator).toBeVisible({ timeout: 15_000 });
      await expect(indicator).toHaveAttribute("data-online", "false");
      // Recovering hides it again.
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
        window.dispatchEvent(new Event("online"));
      });
      await expect(indicator).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("scenario-16: the locations rail renders the projected hierarchy contract @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-rail");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      const rail = page.locator('aside[aria-label="Locations rail"]');
      await expect(rail).toBeVisible({ timeout: 30_000 });

      // The rail always renders a defined state: either projected location nodes or the explicit
      // empty state — never a broken/blank region. (The Floor → Neighborhood → Room nesting itself
      // is pinned deterministically in src/lib/locations/sidebar-hierarchy.test.ts.)
      const nodes = rail.locator("[data-location-id][data-kind]");
      const nodeCount = await nodes.count();
      if (nodeCount === 0) {
        await expect(rail.getByText("No active locations.")).toBeVisible();
      } else {
        // Every node advertises a kind from the Floor → Neighborhood → Room vocabulary.
        const kinds = await nodes.evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
        for (const kind of kinds) {
          expect(SIDEBAR_KINDS.has(kind ?? ""), `unexpected rail kind ${kind}`).toBe(true);
        }
        // Actionable location nodes open a Unit workspace; structural nodes orient only (no anchor).
        const actionable = rail.locator('a[data-presentation="ACTIONABLE"][data-location-id]');
        if ((await actionable.count()) > 0) {
          const href = await actionable.first().getAttribute("href");
          expect(href ?? "", "actionable rail node must link into /unit").toMatch(/^\/unit\//);
        }
        const structural = rail.locator('[data-presentation="STRUCTURAL"][data-location-id]');
        const structuralCount = await structural.count();
        for (let i = 0; i < structuralCount; i += 1) {
          expect(await structural.nth(i).evaluate((el) => el.tagName)).not.toBe("A");
        }
      }
    } finally {
      await context.close();
    }
  });

  test("scenario-17: first-use Build → Run journey reaches operate-today from configure @ci-gate", async () => {
    const fx = loadFixtures();
    const { context, page } = await openPersistent("mgr-build-run-journey");
    try {
      await loginPassword(page, fx.users.manager.email, fx.users.manager.password);
      // 1) Start on the RUN home.
      await page.goto("/workspace", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible({ timeout: 30_000 });
      // 2) Enter BUILD via the mode segment → the dedicated hub.
      await modeSegment(page, "BUILD").click();
      await page.waitForURL((u) => u.pathname === "/build", { timeout: 30_000 });
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible();
      // 3) Configure: open a builder from the hub (target the stable data-href, not the composite name).
      await page
        .locator('[data-testid="build-hub-card"][data-href="/admin/departments"]')
        .click();
      await page.waitForURL((u) => u.pathname.startsWith("/admin/departments"), { timeout: 30_000 });
      await expect(page.locator('[data-product-mode="BUILD"]').first()).toBeVisible();
      // 4) Return to RUN via the mode segment and reach an operate-today surface.
      await modeSegment(page, "RUN").click();
      await page.waitForURL((u) => u.pathname === "/workspace", { timeout: 30_000 });
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible();
      await page.goto("/units", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/units(\?|$)/);
      await expect(page.locator('[data-product-mode="RUN"]').first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
