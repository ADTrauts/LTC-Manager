import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

import { POST as logout } from "@/app/api/console/auth/logout/route";
import { POST as start } from "@/app/api/console/work-session/route";
import { POST as end } from "@/app/api/console/work-session/end/route";
import { verifySessionToken } from "@/lib/auth";
import { validateSessionAuthority } from "@/lib/session-revocation/session-version";
import { proxy } from "@/proxy";
import { HARBOR_WORK_CLEANUP_PATH, verifyHarborSessionToken, verifyHarborWorkToken } from "./session";

const origin = "http://localhost:3000";
process.env.AUTH_SECRET ??= "synthetic-legacy-retirement-hermetic";

async function oldToken() {
  return new SignJWT({ tokenUse: "harbor_work", staffId: "test-staff", facilityId: "test-facility" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

test("the retired start endpoint issues no cookie even when invoked directly", async () => {
  const response = start();
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("old work tokens remain decodable for denial, but cannot become a login or app session", async () => {
  const token = await oldToken();
  assert.equal((await verifyHarborWorkToken(token)).staffId, "test-staff");
  await assert.rejects(() => verifyHarborSessionToken(token), /Not a Harbor session/);
  await assert.rejects(() => verifySessionToken(token), /Not a facility session/);
  assert.deepEqual(await validateSessionAuthority({
    uid: "test-staff", name: "Legacy staff", email: "staff@example.invalid", scopeKind: "facility",
    facilityId: "test-facility", authKind: "harbor_staff", authMethod: "PASSWORD",
    role: "FACILITY_ADMINISTRATOR", sessionVersion: 0,
  }, {} as Parameters<typeof validateSessionAuthority>[1]), { valid: false, reason: "FACILITY_ACCESS_REVOKED" });
});

test("protected proxy requests with valid, invalid or empty work cookies cannot fall through", async () => {
  for (const work of [await oldToken(), "malformed", ""]) {
    const headers = { cookie: `harbor_work=${work}; ltc_session=unread` };
    const page = await proxy(new NextRequest(origin + "/admin/facility/builder", { headers }));
    assert.equal(page.status, 303);
    assert.equal(page.headers.get("location"), origin + HARBOR_WORK_CLEANUP_PATH);
    assert.equal(page.headers.get("set-cookie"), null);

    const api = await proxy(new NextRequest(origin + "/api/auth/session", { headers }));
    assert.equal(api.status, 403);
    assert.equal(api.headers.get("set-cookie"), null);
  }
});

test("cross-origin or missing origins cannot clear a legacy work cookie", async () => {
  for (const headers of [{ origin: "https://other.example.invalid" }, {}] as HeadersInit[]) {
    const response = await end(new Request(origin + "/api/console/work-session/end", { method: "POST", headers }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("Harbor sign-out verifies the browser-facing Host when Next uses an internal hostname", async () => {
  const url = `${origin}/api/console/auth/logout`;
  const browserOrigin = "http://127.0.0.1:3000";
  const host = "127.0.0.1:3000";
  const allowed = await logout(new Request(url, { method: "POST", headers: { origin: browserOrigin, host } }));
  assert.equal(allowed.status, 303);
  assert.equal(allowed.headers.get("location"), browserOrigin + "/console/login");
  assert.match(allowed.headers.get("set-cookie") ?? "", /harbor_work=;/);
  const denied = await logout(new Request(url, { method: "POST", headers: { origin, host } }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("set-cookie"), null);
});
