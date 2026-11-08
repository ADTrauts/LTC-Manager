/**
 * Browser side of a personal Web Push subscription.
 * Permission is requested only inside enableBrowserAlerts, after the person presses Enable.
 */

import { presentBrowserAlerts, type BrowserAlertPresentation, type BrowserPermissionState } from "@/lib/notifications/browser-alerts-state";

const RELEASE_PATH = "/api/notifications/push-subscription/release";
const REGISTER_PATH = "/api/notifications/push-subscription";
const DISABLE_PATH = "/api/notifications/push-subscription/disable";
const STATUS_PATH = "/api/notifications/push-subscription/status";
const PUBLIC_KEY_PATH = "/api/notifications/push-subscription/public-key";
const RECONCILE_PATH = "/api/notifications/push-subscription/reconcile";

export type EnableBrowserAlertsResult =
  | { ok: true; state: "enabled" }
  | { ok: false; state: BrowserAlertPresentation; message: string };

export type DisableBrowserAlertsResult =
  | { ok: true; state: "not_enabled" }
  | { ok: false; state: BrowserAlertPresentation; message: string };

export function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function currentBrowserPermission(): BrowserPermissionState {
  if (!browserSupportsPush()) return "unsupported";
  const permission = Notification.permission;
  if (permission === "granted" || permission === "denied" || permission === "default") return permission;
  return "unsupported";
}

export async function readCurrentPushEndpoint(): Promise<string | null> {
  const registration = await pushRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export async function loadBrowserAlertPresentation(): Promise<BrowserAlertPresentation> {
  const supported = browserSupportsPush();
  const permission = currentBrowserPermission();
  if (!supported || permission === "unsupported") {
    return presentBrowserAlerts({
      supported: false,
      permission: "unsupported",
      browserSubscribed: false,
      serverEnabled: false,
      publicKeyAvailable: false,
    });
  }
  const publicKeyAvailable = await publicKeyAvailableForSession();
  const endpoint = await readCurrentPushEndpoint();
  const serverEnabled = endpoint ? await serverOwnsEndpoint(endpoint) : false;
  return presentBrowserAlerts({
    supported: true,
    permission,
    browserSubscribed: Boolean(endpoint),
    serverEnabled,
    publicKeyAvailable,
  });
}

export async function enableBrowserAlerts(): Promise<EnableBrowserAlertsResult> {
  if (!browserSupportsPush()) {
    return { ok: false, state: "unavailable", message: "Browser alerts are not available on this device." };
  }
  if (Notification.permission === "denied") {
    return { ok: false, state: "blocked", message: "Blocked by browser." };
  }
  const publicKey = await fetchPublicKey();
  if (!publicKey) {
    return { ok: false, state: "unavailable", message: "Browser alerts are not available right now." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      state: permission === "denied" ? "blocked" : "not_enabled",
      message: permission === "denied" ? "Blocked by browser." : "Browser alerts stay off until you allow them.",
    };
  }
  const registration = await pushRegistration();
  if (!registration) {
    return { ok: false, state: "unavailable", message: "Browser alerts are not available on this device." };
  }
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });
  }
  const keys = exportKeys(subscription);
  if (!keys) {
    return { ok: false, state: "not_enabled", message: "Browser alerts could not be saved. Try again." };
  }
  const saved = await postJson(REGISTER_PATH, keys);
  if (!saved.ok || saved.json?.state !== "enabled") {
    return { ok: false, state: "not_enabled", message: "Browser alerts could not be saved. Try again." };
  }
  return { ok: true, state: "enabled" };
}

export async function disableBrowserAlerts(): Promise<DisableBrowserAlertsResult> {
  const endpoint = await readCurrentPushEndpoint();
  if (!endpoint) {
    return { ok: true, state: "not_enabled" };
  }
  const saved = await postJson(DISABLE_PATH, { endpoint });
  if (!saved.ok || saved.json?.serverRevoked !== true) {
    return {
      ok: false,
      state: "enabled",
      message: "This device is still registered. Try again.",
    };
  }
  const unsubscribed = await unsubscribeCurrentPush();
  if (!unsubscribed) {
    return {
      ok: false,
      state: "not_enabled",
      message: "Alerts are turned off for your account. This browser could not remove its local subscription.",
    };
  }
  return { ok: true, state: "not_enabled" };
}

/** Revoke this browser's server row while the session still exists, then drop the local subscription. */
export async function releaseBrowserPushForSignOut(): Promise<void> {
  const endpoint = await readCurrentPushEndpoint();
  if (endpoint) {
    await postJson(RELEASE_PATH, { endpoint }).catch(() => undefined);
  }
  await unsubscribeCurrentPush();
}

/**
 * After a session is present, keep a local subscription only when this User owns it.
 * A signed-out page does not drop the local subscription, so the next sign-in can still revoke the server row.
 */
export async function reconcileBrowserPushSubscription(): Promise<void> {
  const endpoint = await readCurrentPushEndpoint();
  if (!endpoint) return;
  let saved: { ok: boolean; status: number; json: Record<string, unknown> | null };
  try {
    saved = await postJson(RECONCILE_PATH, { endpoint });
  } catch {
    return;
  }
  if (saved.status === 401 || saved.status === 403) return;
  if (!saved.ok || saved.json?.keep !== true) {
    await unsubscribeCurrentPush();
  }
}

/** A redirect or a 200 without this body is not an authenticated revocation. */
export function browserLogoutAccepted(status: number, body: { outcome?: string } | null): boolean {
  return status === 200 && body?.outcome === "revoked";
}

export async function postLogout(action: string, endpoint: string | null): Promise<boolean> {
  const response = await fetch(action, {
    method: "POST",
    credentials: "same-origin",
    redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  }).catch(() => null);
  if (!response) return false;
  const body = (await response.json().catch(() => null)) as { outcome?: string } | null;
  return browserLogoutAccepted(response.status, body);
}

/**
 * Finish sign-out only after the server accepts it.
 * The browser endpoint is optional. A failed server revocation keeps the session.
 * Local unsubscribe runs after that success and cannot authorize the logout by itself.
 */
export async function completeBrowserSignOut(action: string, nextPath: string): Promise<void> {
  let endpoint: string | null = null;
  try {
    endpoint = await readCurrentPushEndpoint();
  } catch {
    endpoint = null;
  }
  const signedOut = await postLogout(action, endpoint);
  if (!signedOut) {
    window.alert("Sign out did not complete. Browser alerts are still tied to this account. Stay signed in and try again.");
    return;
  }
  await unsubscribeCurrentPush();
  window.location.assign(nextPath);
}

async function pushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!browserSupportsPush()) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

async function unsubscribeCurrentPush(): Promise<boolean> {
  const registration = await pushRegistration();
  if (!registration) return true;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;
  try {
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}

async function publicKeyAvailableForSession(): Promise<boolean> {
  return (await fetchPublicKey()) !== null;
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const response = await fetch(PUBLIC_KEY_PATH, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { publicKey?: unknown } | null;
    return body && typeof body.publicKey === "string" ? body.publicKey : null;
  } catch {
    return null;
  }
}

async function serverOwnsEndpoint(endpoint: string): Promise<boolean> {
  const saved = await postJson(STATUS_PATH, { endpoint }).catch(() => null);
  return saved?.ok === true && saved.json?.state === "enabled";
}

function exportKeys(subscription: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) return null;
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: bytesToBase64Url(new Uint8Array(p256dh)),
      auth: bytesToBase64Url(new Uint8Array(auth)),
    },
  };
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok, status: response.status, json };
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
