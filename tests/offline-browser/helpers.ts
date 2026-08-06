import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export type BrowserFixtures = {
  facilityId: string;
  facilityName: string;
  facilityTimezone: string;
  dietaryDepartmentId: string;
  serveryUnitId: string;
  serveryUnitName: string;
  secondUnitId: string;
  secondUnitName: string;
  adminEmail: string;
  adminUserId: string;
  supervisorEmail: string;
  supervisorUserId: string;
  staffEmail: string;
  staffUserId: string;
  leadEmail: string;
  leadUserId: string;
  managerEmail: string;
  managerUserId: string;
  faNoDietEmail: string;
  faNoDietUserId: string;
  staffEmployeeId: string;
  supervisorEmployeeId: string;
};

export function loadFixtures(): BrowserFixtures {
  const path =
    process.env.OFFLINE_BROWSER_FIXTURE_PATH ||
    join(process.cwd(), "tmp", "offline-browser-artifacts", "fixtures.json");
  return JSON.parse(readFileSync(path, "utf8")) as BrowserFixtures;
}

export function demoPassword(): string {
  const pw = process.env.SEED_DEMO_PASSWORD;
  if (!pw) throw new Error("SEED_DEMO_PASSWORD required");
  return pw;
}

export function prisma(): PrismaClient {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("VERIFY_DATABASE_URL required");
  return new PrismaClient({ datasources: { db: { url } } });
}

/**
 * Password login via the real /api/auth/login endpoint in the browser cookie jar.
 * Prefer this over the PIN-gate UI for password fixtures: LoginGate defaults to PIN
 * when device cookies exist, and password login itself re-sets the facility cookie.
 * Device unit binding cookies are preserved across the call.
 */
export async function loginPassword(page: Page, email: string) {
  const context = page.context();
  const deviceCookies = (await context.cookies()).filter(
    (c) => c.name === "ltc_device_facility" || c.name === "ltc_device_unit",
  );

  const res = await page.request.post("/api/auth/login", {
    data: { email, password: demoPassword() },
    headers: { "content-type": "application/json" },
  });
  expect(res.ok(), `password login failed status=${res.status()}`).toBeTruthy();

  // Ensure device unit binding survives login (login sets facility cookie; unit must remain).
  const unitCookie = deviceCookies.find((c) => c.name === "ltc_device_unit");
  if (unitCookie) {
    await context.addCookies([unitCookie]);
  }

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

export async function bindDevice(page: Page, unitId: string | null) {
  // Use in-page fetch so the persistent-context session cookie is always included.
  const result = await page.evaluate(async (uid) => {
    const res = await fetch("/api/auth/bind-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ unitId: uid }),
    });
    return { ok: res.ok, status: res.status };
  }, unitId);
  expect(result.ok, `bind-device failed status=${result.status}`).toBeTruthy();
}

/** Facility Administrators can bind; other roles rely on login-set facility cookie. */
export async function ensureDeviceBoundAsAdmin(page: Page, adminEmail: string, unitId: string) {
  await loginPassword(page, adminEmail);
  await bindDevice(page, unitId);
  const cookies = await page.context().cookies();
  const hasFacility = cookies.some((c) => c.name === "ltc_device_facility" && c.value.length > 0);
  expect(hasFacility, "ltc_device_facility cookie missing after bind").toBeTruthy();
}

/**
 * Issue a Runtime bundle through the real API from the page context and persist it to IndexedDB.
 * Used when the Unit Workspace mount path is available but we need a deterministic wait target.
 */
export async function fetchBundleViaApi(page: Page, unitId: string) {
  const result = await page.evaluate(async (uid) => {
    const res = await fetch("/api/offline/runtime-bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ unitId: uid }),
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false as const, status: res.status, body: await res.text(), unitId: null as string | null };
    }
    const data = (await res.json()) as { bundle?: { unitId?: string } };
    if (!data.bundle) return { ok: false as const, status: res.status, body: "missing bundle", unitId: null };
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ltc-offline-runtime", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of ["meta", "deviceContext", "bundle", "commands", "conflicts"]) {
          if (!db.objectStoreNames.contains(name)) {
            if (name === "commands" || name === "conflicts") {
              db.createObjectStore(name, { keyPath: "clientCommandId" });
            } else {
              db.createObjectStore(name);
            }
          }
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("bundle", "readwrite");
        tx.objectStore("bundle").put(data.bundle, "active");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    return {
      ok: true as const,
      status: res.status,
      body: "",
      unitId: typeof data.bundle.unitId === "string" ? data.bundle.unitId : null,
    };
  }, unitId);
  expect(result.ok, `runtime-bundle failed status=${result.status}`).toBeTruthy();
  return result;
}

/** Confirm the Unit Workspace has device enrollment and offline controls. */
export async function expectOfflineControlsReady(page: Page) {
  await expect(page.getByTestId("offline-runtime-status")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("offline-runtime-status")).not.toContainText(
    /Reconnect online and open this Unit Workspace/i,
  );
}

export async function gotoUnitWorkspace(page: Page, unitId: string) {
  await page.goto(`/unit/${unitId}?unitTab=overview`);
  await expect(page.getByTestId("unit-workspace")).toBeVisible({ timeout: 30_000 });
}

export async function waitForServiceWorker(page: Page) {
  const ok = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.register("/sw.js", { scope: "/" }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("register timeout")), 8_000)),
      ]);
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      const started = Date.now();
      while (!reg.active && Date.now() - started < 8_000) {
        await new Promise((r) => setTimeout(r, 100));
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      return Boolean(reg.active);
    } catch {
      return false;
    }
  });
  expect(ok, "service worker did not activate").toBeTruthy();
}

export async function waitForOfflineStatus(page: Page, text: RegExp | string) {
  const status = page.getByTestId("offline-runtime-status");
  await expect(status).toBeVisible({ timeout: 30_000 });
  await expect(status).toContainText(text, { timeout: 45_000 });
}

export async function waitForBundle(page: Page) {
  await expect
    .poll(
      async () => {
        return page.evaluate(async () => {
          return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), 2_000);
            const req = indexedDB.open("ltc-offline-runtime", 1);
            req.onerror = () => {
              clearTimeout(timer);
              resolve(false);
            };
            req.onblocked = () => {
              clearTimeout(timer);
              resolve(false);
            };
            req.onsuccess = () => {
              const db = req.result;
              if (![...db.objectStoreNames].includes("bundle")) {
                clearTimeout(timer);
                resolve(false);
                return;
              }
              const tx = db.transaction("bundle", "readonly");
              const get = tx.objectStore("bundle").get("active");
              get.onsuccess = () => {
                clearTimeout(timer);
                resolve(Boolean(get.result));
              };
              get.onerror = () => {
                clearTimeout(timer);
                resolve(false);
              };
            };
          });
        });
      },
      { timeout: 45_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
}

export async function setNetworkOffline(context: BrowserContext, offline: boolean, page?: Page) {
  await context.setOffline(offline);
  if (page) {
    try {
      const client = await context.newCDPSession(page);
      await client.send("Network.enable");
      await client.send("Network.emulateNetworkConditions", {
        offline,
        latency: 0,
        downloadThroughput: offline ? 0 : -1,
        uploadThroughput: offline ? 0 : -1,
      });
    } catch {
      // CDP may be unavailable in some environments; context.setOffline remains.
    }
    await page.evaluate((isOffline) => {
      window.dispatchEvent(new Event(isOffline ? "offline" : "online"));
    }, offline).catch(() => {});
  }
}

export async function inspectIndexedDb(page: Page) {
  return page.evaluate(async () => {
    function openDb(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("ltc-offline-runtime", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    function getAll(db: IDBDatabase, store: string): Promise<unknown[]> {
      return new Promise((resolve, reject) => {
        if (![...db.objectStoreNames].includes(store)) {
          resolve([]);
          return;
        }
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      });
    }
    function get(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (![...db.objectStoreNames].includes(store)) {
          resolve(null);
          return;
        }
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    }

    const dbs = await indexedDB.databases?.() ?? [];
    const hasRuntime = dbs.some((d) => d.name === "ltc-offline-runtime");
    if (!hasRuntime && dbs.length === 0) {
      // databases() unsupported — try open
    }
    const db = await openDb();
    const stores = [...db.objectStoreNames];
    const commands = await getAll(db, "commands");
    const conflicts = await getAll(db, "conflicts");
    const bundleRaw = await get(db, "bundle", "active");
    const deviceRaw = await get(db, "deviceContext", "current");
    const schemaVersion = await get(db, "meta", "schemaVersion");
    db.close();

    const summarize = (value: unknown) => {
      if (value == null) return { present: false };
      if (typeof value === "object" && value !== null && "v" in value && "iv" in value && "ct" in value) {
        return { present: true, encrypted: true };
      }
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        const text = JSON.stringify(obj);
        return {
          present: true,
          encrypted: false,
          keys: Object.keys(obj),
          // Avoid false positives on authMethod: "PASSWORD" / similar enums.
          hasPassword: /passwordHash|"password"\s*:/i.test(text),
          hasPin: /pinDigest|"pin"\s*:/i.test(text),
          hasJwt: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(text),
          hasAuthSecret: /AUTH_SECRET/i.test(text),
          facilityId: typeof obj.facilityId === "string" ? obj.facilityId : null,
          unitId: typeof obj.unitId === "string" ? obj.unitId : null,
          actorRef:
            obj.actor && typeof obj.actor === "object" && obj.actor !== null
              ? String((obj.actor as { actorRef?: string }).actorRef ?? "")
              : typeof obj.actorRef === "string"
                ? obj.actorRef
                : null,
          queueState: typeof obj.queueState === "string" ? obj.queueState : null,
          commandType: typeof obj.commandType === "string" ? obj.commandType : null,
        };
      }
      return { present: true, encrypted: false };
    };

    return {
      stores,
      schemaVersion: schemaVersion ?? 1,
      commandCount: commands.length,
      conflictCount: conflicts.length,
      commands: commands.map(summarize),
      bundle: summarize(bundleRaw),
      device: summarize(deviceRaw),
      cryptoDbPresent: (await indexedDB.databases?.() ?? []).some((d) => d.name === "ltc-offline-crypto-v1"),
    };
  });
}

export async function inspectCaches(page: Page) {
  return page.evaluate(async () => {
    const keys = await caches.keys();
    const entries: { cache: string; urls: string[] }[] = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      const reqs = await cache.keys();
      entries.push({ cache: key, urls: reqs.map((r) => new URL(r.url).pathname) });
    }
    return { keys, entries };
  });
}

export async function recordServeryReadyOffline(page: Page) {
  const controls = page.getByTestId("servery-meal-service-controls");
  await expect(controls).toBeVisible();
  await expect(page.getByTestId("offline-runtime-status")).toHaveText(/^Offline/i);
  for (const meal of ["Breakfast", "Lunch", "Dinner"]) {
    await controls.getByRole("button", { name: new RegExp(`^${meal}$`, "i") }).click();
    const btn = controls.getByRole("button", { name: /Servery Ready|Saved on this tablet/i }).first();
    const label = (await btn.innerText()).trim();
    if (/Saved on this tablet/i.test(label)) return;
    if (await btn.isEnabled()) {
      await btn.click();
      // Prefer durable queue evidence; UI label follows localPending after the async enqueue.
      await expect
        .poll(async () => (await inspectIndexedDb(page)).commandCount, { timeout: 15_000 })
        .toBeGreaterThanOrEqual(1);
      await expect(controls.getByText(/Saved on this tablet|waiting to synchronize/i).first()).toBeVisible({
        timeout: 5_000,
      });
      return;
    }
  }
  throw new Error("No enabled Servery Ready control available for offline recording");
}

export async function recordMealStartedOffline(page: Page) {
  const controls = page.getByTestId("servery-meal-service-controls");
  await expect(controls).toBeVisible();
  await controls.getByRole("button", { name: /Meal Service Started/i }).click();
  await expect(controls.getByText("Saved on this tablet").first()).toBeVisible({ timeout: 15_000 });
}

export async function clickRetrySync(page: Page) {
  const retry = page.getByRole("button", { name: /Retry synchronization/i });
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
  }
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /Sign out/i }).first().click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

/**
 * Network-failure-after-commit technique:
 * Intercept the page's fetch so the request reaches the server and completes,
 * but the first matching runtime-sync response body is discarded (thrown) so the
 * client treats it as a transport failure and retries. The second attempt receives
 * the real response (ALREADY_ACCEPTED).
 */
export async function installSyncResponseLossOnce(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    let dropped = false;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
      const res = await original(input, init);
      if (
        !dropped &&
        method === "POST" &&
        url.includes("/api/offline/runtime-sync") &&
        res.ok
      ) {
        dropped = true;
        // Consume the body so the request fully completed server-side, then fail the client.
        await res.arrayBuffer();
        throw new TypeError("offline-browser: simulated response loss after commit");
      }
      return res;
    };
  });
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export async function countMilestones(
  db: PrismaClient,
  unitId: string,
  mealType: "BREAKFAST" | "LUNCH" | "DINNER",
  milestone: "READY" | "SERVICE_STARTED",
) {
  return db.serveryMilestoneEntry.count({
    where: {
      milestone,
      event: { unitId, mealType },
    },
  });
}

/** Clear today's Servery Ready/Started state for a unit (disposable DB only). */
export async function clearTodayServeryMilestones(db: PrismaClient, unitId: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const serviceDate = new Date(Date.UTC(y, m - 1, d));

  for (const mealType of ["BREAKFAST", "LUNCH", "DINNER"] as const) {
    const existing = await db.serveryMealServiceEvent.findUnique({
      where: {
        unitId_serviceDate_mealType: { unitId, serviceDate, mealType },
      },
    });
    if (!existing) continue;
    await db.serveryMilestoneEntry.deleteMany({ where: { eventId: existing.id } });
    await db.serveryMealServiceEvent.update({
      where: { id: existing.id },
      data: {
        mealServiceReadyAt: null,
        mealServiceStartedAt: null,
        readyRecordedAt: null,
        startedRecordedAt: null,
        readyAuthMethod: null,
        startedAuthMethod: null,
        readyRecordedBy: { disconnect: true },
        startedRecordedBy: { disconnect: true },
        readyRecordedByEmployee: { disconnect: true },
        startedRecordedByEmployee: { disconnect: true },
      },
    });
  }
  return serviceDate;
}

/** Create an authoritative Ready milestone through Prisma fixture controls (disposable DB only). */
export async function createAuthoritativeReady(
  db: PrismaClient,
  input: {
    facilityId: string;
    unitId: string;
    mealType: "BREAKFAST" | "LUNCH" | "DINNER";
    userId: string;
  },
) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  const serviceDate = new Date(Date.UTC(y, m - 1, d));

  const event = await db.serveryMealServiceEvent.upsert({
    where: {
      unitId_serviceDate_mealType: {
        unitId: input.unitId,
        serviceDate,
        mealType: input.mealType,
      },
    },
    update: {
      mealServiceReadyAt: now,
      readyRecordedAt: now,
      readyRecordedById: input.userId,
      readyAuthMethod: "PASSWORD",
    },
    create: {
      unitId: input.unitId,
      serviceDate,
      mealType: input.mealType,
      mealServiceReadyAt: now,
      readyRecordedAt: now,
      readyRecordedById: input.userId,
      readyAuthMethod: "PASSWORD",
    },
  });

  await db.serveryMilestoneEntry.create({
    data: {
      eventId: event.id,
      milestone: "READY",
      kind: "ORIGINAL",
      occurredAt: now,
      recordedAt: now,
      actorUserId: input.userId,
      actorRole: "MANAGER",
      authMethod: "PASSWORD",
      clientActionId: `authoritative-browser-${Date.now()}`,
    },
  });

  return { eventId: event.id, serviceDate };
}
