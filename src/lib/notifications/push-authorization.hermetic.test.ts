import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { browserLogoutAccepted } from "./browser-push-client";
import {
  capPushAuthorizationUntil,
  logoutClearsSession,
  PUSH_AUTHORIZATION_TTL_MS,
  pushSendAuthorization,
} from "./push-authorization";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("the push lease matches the signed session lifetime and fails closed", () => {
  const auth = source("src/lib/auth.ts");
  assert.match(auth, /const SESSION_TTL_SECONDS = 60 \* 60 \* 12;/);
  assert.equal(PUSH_AUTHORIZATION_TTL_MS, 12 * 60 * 60 * 1000);
  const now = new Date("2026-11-04T12:00:00.000Z");
  const sessionEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  assert.equal(capPushAuthorizationUntil(now, sessionEnd)?.toISOString(), sessionEnd.toISOString());
  assert.equal(capPushAuthorizationUntil(now, now), null);
  const tooLong = new Date(now.getTime() + PUSH_AUTHORIZATION_TTL_MS + 60_000);
  assert.equal(capPushAuthorizationUntil(now, tooLong)?.toISOString(), new Date(now.getTime() + PUSH_AUTHORIZATION_TTL_MS).toISOString());
  assert.equal(
    pushSendAuthorization({ revokedAt: null, authorizedUntil: sessionEnd, userActive: true, now }),
    "allowed",
  );
  assert.equal(
    pushSendAuthorization({ revokedAt: now, authorizedUntil: sessionEnd, userActive: true, now }),
    "revoked",
  );
  assert.equal(
    pushSendAuthorization({ revokedAt: null, authorizedUntil: now, userActive: true, now }),
    "expired",
  );
  assert.equal(
    pushSendAuthorization({ revokedAt: null, authorizedUntil: null, userActive: true, now }),
    "unbound",
  );
  assert.equal(
    pushSendAuthorization({ revokedAt: null, authorizedUntil: sessionEnd, userActive: false, now }),
    "user_inactive",
  );
});

test("logout revokes the User without an endpoint, and the client does not gate on one", () => {
  const logout = source("src/app/api/auth/logout/route.ts");
  const client = source("src/lib/notifications/browser-push-client.ts");
  assert.match(logout, /revokeAuthenticatedUserPush/);
  assert.doesNotMatch(logout, /releasePushEndpoint/);
  assert.doesNotMatch(logout, /endpoint &&/);
  assert.match(logout, /status: 503/);
  assert.match(client, /const signedOut = await postLogout\(action, endpoint\)/);
  assert.match(client, /status === 200 && body\?\.outcome === "revoked"/);
  assert.doesNotMatch(client, /opaqueredirect/);
  assert.doesNotMatch(client, /signedOutAlready/);
  assert.match(logout, /outcome: "anonymous"/);
  assert.match(logout, /logoutClearsSession\(outcome\)/);
  assert.equal(logoutClearsSession("skipped"), false);
  assert.equal(logoutClearsSession("revoked"), true);
  assert.equal(browserLogoutAccepted(303, null), false);
  assert.equal(browserLogoutAccepted(200, { outcome: "anonymous" }), false);
  assert.equal(browserLogoutAccepted(401, { outcome: "anonymous" }), false);
  assert.equal(browserLogoutAccepted(200, { outcome: "revoked" }), true);
  const kept = logout.slice(logout.indexOf("if (!logoutClearsSession"));
  assert.ok(kept.indexOf('outcome: "anonymous"') < kept.indexOf("clearSessionCookies"));
  assert.equal(kept.slice(0, kept.indexOf("clearSessionCookies")).includes("maxAge: 0"), false);
  const signOut = client.slice(client.indexOf("export async function completeBrowserSignOut"));
  assert.match(signOut, /endpoint = null/);
  assert.ok(signOut.indexOf("postLogout") < signOut.indexOf("unsubscribeCurrentPush"));
});

test("session replacement and credential revocation share the User push revoke", () => {
  for (const path of [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/pin-login/route.ts",
    "src/app/api/console/auth/login/route.ts",
  ]) {
    const text = source(path);
    assert.match(text, /revokePushForDepartingUser/, path);
    assert.match(text, /status: 503/, path);
  }
  assert.match(source("src/app/api/auth/password-reset/confirm/route.ts"), /revokeAllPushSubscriptionsForUser/);
  assert.match(source("src/lib/session-revocation/administrative-revoke.ts"), /revokeAllPushSubscriptionsForUser/);
  assert.match(source("src/app/api/auth/logout-full/route.ts"), /revokeAllPushSubscriptionsForUser/);
  assert.match(source("src/app/account/security/actions.ts"), /revokeAllPushSubscriptionsForUser/);
  assert.doesNotMatch(source("src/lib/facility-access/assert-user-facility-access.ts"), /revokeAllPushSubscriptionsForUser/);
  assert.match(source("src/lib/organization-membership/service.ts"), /revokeAllPushSubscriptionsForUser/);
});

test("release cannot target another User, and delivery rechecks authorization before the network", () => {
  const release = source("src/app/api/notifications/push-subscription/release/route.ts");
  const delivery = source("src/lib/notifications/push-delivery.ts");
  assert.match(release, /userId: session\.userId/);
  assert.doesNotMatch(release, /releasePushEndpoint\(prisma, \{ endpoint/);
  assert.match(delivery, /userHasActiveFacilityAccess/);
  assert.match(delivery, /suppressUnauthorized/);
  const send = delivery.indexOf("result = await transport");
  const recheck = delivery.indexOf("suppressUnauthorized");
  assert.ok(recheck > 0 && recheck < send);
  assert.doesNotMatch(delivery, /notificationRecipient\.delete|notification\.delete/);
});

test("registration takes the lease from the session and Quick PIN still cannot register", () => {
  const route = source("src/app/api/notifications/push-subscription/route.ts");
  const rules = source("src/lib/notifications/push-registration-session.ts");
  assert.match(route, /authorizedSessionVersion: session\.sessionVersion/);
  assert.match(route, /capPushAuthorizationUntil/);
  assert.doesNotMatch(route, /body\.authorizedUntil|body\.authorizedSessionVersion/);
  assert.match(rules, /authMethod === "QUICK_PIN"/);
  assert.match(rules, /authKind !== "user"/);
});
