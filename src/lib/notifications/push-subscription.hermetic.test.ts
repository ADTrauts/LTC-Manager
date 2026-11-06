import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { authorizeRoute } from "@/lib/route-registry/authorize";
import { browserAlertStatusLabel, presentBrowserAlerts } from "@/lib/notifications/browser-alerts-state";
import { BROWSER_ALERT_BODY, BROWSER_ALERT_TITLE, browserAlertClickPath } from "@/lib/notifications/push-display";
import { canReleaseBrowserPush, pushRegistrationUserId } from "@/lib/notifications/push-registration-session";
import { PushSubscriptionError, registerPushSubscription } from "@/lib/notifications/push-subscription";
import { isWebPushSendingEnabled, readVapidPublicKey } from "@/lib/notifications/web-push-config";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const FLAGS = {};
const USER_PATHS = [
  "/account/notifications",
  "/api/notifications/push-subscription",
  "/api/notifications/push-subscription/disable",
  "/api/notifications/push-subscription/status",
  "/api/notifications/push-subscription/public-key",
];

test("push registration accepts a full User session and refuses PIN, Harbor, and a missing user", () => {
  const user = { authKind: "user", authMethod: "PASSWORD", uid: "user_1" };
  assert.equal(pushRegistrationUserId(user), "user_1");
  assert.equal(pushRegistrationUserId({ authKind: "employee", authMethod: "QUICK_PIN", uid: "employee_1" }), null);
  assert.equal(pushRegistrationUserId({ authKind: "harbor_staff", authMethod: "PASSWORD", uid: "staff_1" }), null);
  assert.equal(pushRegistrationUserId({ authKind: "user", authMethod: "QUICK_PIN", uid: "user_1" }), null);
  assert.equal(pushRegistrationUserId({ authKind: "user", authMethod: "PASSWORD", uid: "" }), null);
  assert.equal(pushRegistrationUserId(null), null);
  assert.equal(canReleaseBrowserPush({ authKind: "employee", uid: "employee_1" }), true);
  assert.equal(canReleaseBrowserPush({ authKind: "harbor_staff", uid: "staff_1" }), true);
  assert.equal(canReleaseBrowserPush({ authKind: "user", uid: "user_1" }), true);
  assert.equal(canReleaseBrowserPush(null), false);

  for (const pathname of USER_PATHS) {
    assert.equal(
      authorizeRoute({ pathname, role: "STAFF", authKind: "user", sessionScope: "facility", featureFlags: FLAGS }).outcome,
      "ALLOW",
      pathname,
    );
    assert.equal(
      authorizeRoute({ pathname, role: "STAFF", authKind: "employee", sessionScope: "facility", featureFlags: FLAGS }).outcome,
      "DENY",
      pathname,
    );
    assert.equal(
      authorizeRoute({ pathname, role: "STAFF", authKind: "harbor_staff", sessionScope: "facility", featureFlags: FLAGS }).outcome,
      "DENY",
      pathname,
    );
    assert.equal(
      authorizeRoute({ pathname, role: null, featureFlags: FLAGS }).outcome,
      "REQUIRE_AUTHENTICATION",
      pathname,
    );
  }
});

test("registration route binds the session user and returns no subscription material", () => {
  const route = source("src/app/api/notifications/push-subscription/route.ts");
  const parser = source("src/lib/notifications/push-subscription-http.ts");
  assert.match(route, /session\.sessionVersion/);
  assert.match(route, /session\.exp/);
  assert.doesNotMatch(route, /body\.authorizedSessionVersion|body\.sessionVersion/);
  assert.doesNotMatch(route, /body\.userId|formData/);
  assert.doesNotMatch(parser, /record\.userId|body\.userId/);
  assert.match(route, /return pushJson\(result\)/);
  assert.doesNotMatch(route, /return pushJson\(\{[^}]*endpoint/);
});

test("invalid subscription errors do not echo the endpoint", async () => {
  await assert.rejects(
    () =>
      registerPushSubscription({} as PrismaClient, {
        userId: "user_1",
        endpoint: "https://push.example.test/secret-token-value",
        p256dh: "short",
        auth: "abcdefghijklmnop",
        now: new Date("2026-11-03T12:00:00.000Z"),
        authorizedSessionVersion: 1,
        authorizedUntil: new Date("2026-11-03T18:00:00.000Z"),
      }),
    (error: unknown) => {
      assert.ok(error instanceof PushSubscriptionError);
      assert.equal(error.message.includes("secret-token-value"), false);
      assert.equal(error.message.includes("https://"), false);
      return true;
    },
  );
});

test("browser alert presentation covers default, granted, denied, and unsupported", () => {
  assert.equal(
    presentBrowserAlerts({
      supported: true,
      permission: "default",
      browserSubscribed: false,
      serverEnabled: false,
      publicKeyAvailable: true,
    }),
    "not_enabled",
  );
  assert.equal(
    presentBrowserAlerts({
      supported: true,
      permission: "granted",
      browserSubscribed: true,
      serverEnabled: true,
      publicKeyAvailable: true,
    }),
    "enabled",
  );
  assert.equal(
    presentBrowserAlerts({
      supported: true,
      permission: "denied",
      browserSubscribed: false,
      serverEnabled: false,
      publicKeyAvailable: true,
    }),
    "blocked",
  );
  assert.equal(
    presentBrowserAlerts({
      supported: false,
      permission: "unsupported",
      browserSubscribed: false,
      serverEnabled: false,
      publicKeyAvailable: true,
    }),
    "unavailable",
  );
  assert.equal(browserAlertStatusLabel("not_enabled"), "Not enabled");
  assert.equal(browserAlertStatusLabel("enabled"), "Enabled on this device");
  assert.equal(browserAlertStatusLabel("blocked"), "Blocked by browser");
  assert.equal(browserAlertStatusLabel("unavailable"), "Not available on this device");
});

test("permission is requested only from the enable control", () => {
  const client = source("src/lib/notifications/browser-push-client.ts");
  const panel = source("src/components/notifications/browser-alerts-panel.tsx");
  assert.equal(client.split("requestPermission").length - 1, 1);
  const enable = client.slice(client.indexOf("export async function enableBrowserAlerts"));
  assert.match(enable, /requestPermission/);
  assert.doesNotMatch(panel, /requestPermission/);
  assert.match(panel, /Enable alerts on this device/);
  assert.match(panel, /Do not enable personal alerts on a shared facility tablet/);
  assert.match(panel, /Signing out turns browser alerts off on every device for this account/);
  assert.match(panel, /onClick=\{\(\) => \{\s*void onEnable\(\);/);
});

test("manifest and browser notification identity are Vssyl", () => {
  const manifest = source("public/manifest.webmanifest");
  const worker = source("public/sw.js");
  assert.equal(BROWSER_ALERT_TITLE, "Vssyl");
  assert.equal(BROWSER_ALERT_BODY, "Operational attention requires review");
  assert.match(manifest, /"name": "Vssyl"/);
  assert.match(manifest, /"short_name": "Vssyl"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(manifest, /"start_url": "\/"/);
  assert.match(manifest, /"scope": "\/"/);
  assert.match(worker, /const PUSH_TITLE = "Vssyl"/);
  assert.match(worker, /const PUSH_BODY = "Operational attention requires review"/);
  assert.equal(browserAlertClickPath("cm1234567890abcd"), "/notifications?attention=cm1234567890abcd");
  assert.equal(browserAlertClickPath("nope"), "/notifications");
  assert.doesNotMatch(manifest, /LTC Manager/);
  assert.doesNotMatch(worker, /LTC Manager/);
});

test("the existing service worker stays the only worker and does not decide attention", () => {
  const worker = source("public/sw.js");
  const register = source("src/components/pwa-register.tsx");
  assert.match(worker, /ltc-offline-shell-v4/);
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /isProtectedHtmlPath/);
  assert.match(worker, /addEventListener\("push"/);
  assert.match(worker, /addEventListener\("notificationclick"/);
  assert.match(worker, /\/notifications\?attention=/);
  assert.doesNotMatch(worker, /acknowledge/);
  assert.doesNotMatch(worker, /evaluateDeliveryEligibility/);
  assert.doesNotMatch(worker, /parsed\.title/);
  assert.doesNotMatch(worker, /parsed\.body/);
  assert.match(register, /register\("\/sw\.js"/);
  assert.doesNotMatch(register, /push-sw\.js/);
  assert.match(source("src/app/layout.tsx"), /title: "Vssyl"/);
});

test("subscription credentials and the VAPID private key are not logged or sent", () => {
  const files = [
    "src/lib/notifications/push-subscription.ts",
    "src/lib/notifications/push-subscription-http.ts",
    "src/lib/notifications/web-push-config.ts",
    "src/lib/notifications/browser-push-client.ts",
    "src/app/api/notifications/push-subscription/route.ts",
    "src/app/api/notifications/push-subscription/public-key/route.ts",
    "src/app/api/notifications/push-subscription/release/route.ts",
    "src/app/api/notifications/push-subscription/reconcile/route.ts",
    "src/app/api/auth/logout/route.ts",
  ];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /console\.(log|info|debug|error|warn)/, file);
  }
  const client = source("src/lib/notifications/browser-push-client.ts");
  const panel = source("src/components/notifications/browser-alerts-panel.tsx");
  assert.doesNotMatch(client, /VAPID_PRIVATE_KEY/);
  assert.doesNotMatch(panel, /VAPID_PRIVATE_KEY/);
  const publicKey = source("src/app/api/notifications/push-subscription/public-key/route.ts");
  assert.match(publicKey, /publicKey/);
  assert.doesNotMatch(publicKey, /VAPID_PRIVATE_KEY|VAPID_SUBJECT|WEB_PUSH_SENDING_ENABLED/);
  const subscription = source("src/lib/notifications/push-subscription.ts");
  assert.doesNotMatch(subscription, /WEB_PUSH|NotificationDelivery|PushDispatch|from "web-push"/);
  assert.doesNotMatch(client, /from "web-push"/);
  assert.match(source("src/lib/notifications/push-sender.ts"), /from "web-push"/);
  assert.doesNotMatch(source("src/lib/notifications/push-sender.ts"), /console\./);
});

test("sending stays off unless the flag is exactly true, and a public key is not enough", () => {
  const previousSend = process.env.WEB_PUSH_SENDING_ENABLED;
  const previousPublic = process.env.VAPID_PUBLIC_KEY;
  try {
    delete process.env.WEB_PUSH_SENDING_ENABLED;
    assert.equal(isWebPushSendingEnabled(), false);
    process.env.WEB_PUSH_SENDING_ENABLED = "false";
    assert.equal(isWebPushSendingEnabled(), false);
    process.env.WEB_PUSH_SENDING_ENABLED = "true";
    assert.equal(isWebPushSendingEnabled(), true);
    process.env.VAPID_PUBLIC_KEY = "not-a-key";
    assert.equal(readVapidPublicKey(), null);
    const bytes = Buffer.alloc(65, 7);
    bytes[0] = 0x04;
    const publicKey = bytes.toString("base64url");
    process.env.VAPID_PUBLIC_KEY = publicKey;
    assert.equal(readVapidPublicKey(), publicKey);
  } finally {
    if (previousSend === undefined) delete process.env.WEB_PUSH_SENDING_ENABLED;
    else process.env.WEB_PUSH_SENDING_ENABLED = previousSend;
    if (previousPublic === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublic;
  }
  const schema = source("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model PushSubscription"), schema.indexOf("model DashboardLayout"));
  assert.doesNotMatch(model, /facilityId/);
  assert.match(model, /userId/);
  assert.match(source("src/components/sign-out-controls.tsx"), /completeBrowserSignOut/);
  assert.match(source("src/components/global-user-menu.tsx"), /completeBrowserSignOut/);
  assert.match(source("src/components/harbor-console/harbor-console-shell.tsx"), /completeBrowserSignOut/);
  const logout = source("src/app/api/auth/logout/route.ts");
  assert.equal(logout.includes(".catch(() => undefined)"), false);
  assert.match(logout, /status: 503/);
});
