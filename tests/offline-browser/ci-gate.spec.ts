import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import {
  ensureDeviceBoundAsAdmin,
  expectOfflineControlsReady,
  fetchBundleViaApi,
  gotoUnitWorkspace,
  inspectCaches,
  inspectIndexedDb,
  loadFixtures,
  loginPassword,
  recordServeryReadyOffline,
  setNetworkOffline,
  signOut,
  waitForBundle,
  waitForOfflineStatus,
  waitForServiceWorker,
  clickRetrySync,
  prisma,
} from "./helpers";

const profileDir = process.env.OFFLINE_BROWSER_PROFILE_DIR || "tmp/offline-browser-profile";

async function openPersistent(suffix = "default"): Promise<{ context: BrowserContext; page: Page }> {
  const dir = `${profileDir}-${suffix}`;
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    baseURL: process.env.OFFLINE_BROWSER_BASE_URL,
    serviceWorkers: "allow",
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

test.describe.configure({ mode: "default" });

test("scenario-02 @ci-gate: Service worker installs and activates", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("sw");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForServiceWorker(page);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      return {
        scope: reg?.scope ?? null,
        active: reg?.active?.state ?? null,
      };
    });
    expect(state.active).toBe("activated");
    expect(state.scope).toContain("/");
  } finally {
    await context.close();
  }
});

test("scenario-03 @ci-gate: Application shell reloads offline", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("shell");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await page.goto("/offline.html", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate(async () => {
      const cache = await caches.open("ltc-offline-shell-v1");
      for (const url of [
        "/offline.html",
        "/manifest.webmanifest",
        "/icons/icon-192.svg",
        "/icons/icon-512.svg",
      ]) {
        const res = await fetch(url, { cache: "reload" });
        if (res.ok) await cache.put(url, res.clone());
      }
    });
    await setNetworkOffline(context, true, page);
    await page.goto("/offline.html", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.locator(".status")).toHaveText(/Offline/i, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(/reconnect|offline bundle|saved on this tablet/i);
  } finally {
    await setNetworkOffline(context, false, page).catch(() => {});
    await context.close();
  }
});

test("scenario-05 @ci-gate: Authorized Unit Workspace bundle is cached through IndexedDB", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("bundle");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await gotoUnitWorkspace(page, fx.serveryUnitId);
    await expectOfflineControlsReady(page);
    await fetchBundleViaApi(page, fx.serveryUnitId).catch(async (err) => {
      // Surface API denial clearly instead of hanging later.
      throw err;
    });
    await waitForBundle(page);
    const idb = await inspectIndexedDb(page);
    expect(idb.stores).toEqual(
      expect.arrayContaining(["meta", "deviceContext", "bundle", "commands", "conflicts"]),
    );
    expect(idb.bundle.present).toBe(true);
    expect(idb.bundle.hasPassword).not.toBe(true);
    expect(idb.bundle.hasPin).not.toBe(true);
    expect(idb.bundle.hasJwt).not.toBe(true);
    expect(idb.bundle.hasAuthSecret).not.toBe(true);
  } finally {
    await context.close();
  }
});

test("scenario-07/08/09/11/12/13 @ci-gate: Offline Ready queue, refresh, sync exactly once", async () => {
  const fx = loadFixtures();
  const db = prisma();
  const { context, page } = await openPersistent("queue");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await gotoUnitWorkspace(page, fx.serveryUnitId);
    await expectOfflineControlsReady(page);
    await fetchBundleViaApi(page, fx.serveryUnitId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectOfflineControlsReady(page);
    await waitForBundle(page);
    await waitForOfflineStatus(page, /Online|Synchronized|Offline/i);

    const before = await db.serveryMilestoneEntry.count({
      where: { milestone: "READY", event: { unitId: fx.serveryUnitId } },
    });

    await setNetworkOffline(context, true, page);
    await expect(page.getByTestId("offline-runtime-status")).toHaveText(/^Offline/i, {
      timeout: 15_000,
    });
    await page.waitForFunction(() => navigator.onLine === false);
    // Prove the offline button path is mounted (Ready is not a server-action form submit).
    const readyBtn = page
      .getByTestId("servery-meal-service-controls")
      .getByRole("button", { name: /Servery Ready/i })
      .first();
    await expect(readyBtn).toBeVisible();
    expect(await readyBtn.evaluate((el) => Boolean(el.closest("form")))).toBe(false);
    const pre = await inspectIndexedDb(page);
    expect(pre.bundle.present, "bundle must remain available while offline").toBe(true);
    await recordServeryReadyOffline(page);
    await expect(page.getByTestId("offline-runtime-status")).not.toContainText("Synchronized");
    await expect(page.getByTestId("servery-meal-service-controls")).toContainText(
      /Saved on this tablet/,
    );

    let idb = await inspectIndexedDb(page);
    expect(idb.commandCount).toBeGreaterThanOrEqual(1);

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    idb = await inspectIndexedDb(page);
    expect(idb.commandCount).toBeGreaterThanOrEqual(1);

    await setNetworkOffline(context, false, page);
    await page.goto(`/unit/${fx.serveryUnitId}?unitTab=overview`);
    await waitForOfflineStatus(page, /Online|Synchronizing|Synchronized|Unable to Sync/i);
    await clickRetrySync(page);
    await expect
      .poll(
        async () =>
          db.serveryMilestoneEntry.count({
            where: { milestone: "READY", event: { unitId: fx.serveryUnitId } },
          }),
        { timeout: 60_000 },
      )
      .toBe(before + 1);

    await waitForOfflineStatus(page, /Synchronized|Online/i);
  } finally {
    await setNetworkOffline(context, false, page).catch(() => {});
    await context.close();
    await db.$disconnect();
  }
});

test("scenario-27 @ci-gate: Sign-out does not expose the prior user’s cached data", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("signout");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await signOut(page);
    await loginPassword(page, fx.supervisorEmail);
    await gotoUnitWorkspace(page, fx.serveryUnitId);
    await waitForBundle(page);
    await signOut(page);
    const idb = await inspectIndexedDb(page);
    expect(idb.bundle.present).toBe(false);
    await loginPassword(page, fx.managerEmail);
    await gotoUnitWorkspace(page, fx.serveryUnitId);
    const after = await inspectIndexedDb(page);
    if (after.bundle.present && !after.bundle.encrypted) {
      expect(after.bundle.actorRef).not.toEqual(fx.supervisorUserId);
    }
  } finally {
    await context.close();
  }
});

test("scenario-30 @ci-gate: No offline bundle produces a safe reconnect-required state", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("nobundle");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await page.goto("/offline.html", { waitUntil: "domcontentloaded" });
    await waitForServiceWorker(page);
    await page.evaluate(async () => {
      const cache = await caches.open("ltc-offline-shell-v1");
      const res = await fetch("/offline.html", { cache: "reload" });
      if (res.ok) await cache.put("/offline.html", res.clone());
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("ltc-offline-runtime");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
    });
    await setNetworkOffline(context, true, page);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/offline|reconnect/i);
    const idb = await inspectIndexedDb(page);
    expect(idb.bundle.present).toBe(false);
    expect(idb.commandCount).toBe(0);
  } finally {
    await setNetworkOffline(context, false, page).catch(() => {});
    await context.close();
  }
});

test("scenario-04 @ci-gate: Protected HTML and auth responses are not broadly cached", async () => {
  const fx = loadFixtures();
  const { context, page } = await openPersistent("cache");
  try {
    await ensureDeviceBoundAsAdmin(page, fx.adminEmail, fx.serveryUnitId);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForServiceWorker(page);
    await page.goto(`/unit/${fx.serveryUnitId}?unitTab=overview`, { waitUntil: "domcontentloaded" });
    const caches = await inspectCaches(page);
    const allUrls = caches.entries.flatMap((e) => e.urls);
    expect(allUrls.some((u) => u.startsWith("/api/"))).toBe(false);
    expect(allUrls.some((u) => u.startsWith("/login"))).toBe(false);
    expect(allUrls.some((u) => u.startsWith("/unit/"))).toBe(false);
  } finally {
    await context.close();
  }
});
