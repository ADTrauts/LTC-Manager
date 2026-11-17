import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, HEAD } from "@/app/console/assistance/route";
import { POST as command } from "@/app/api/console/assistance/route";
import { POST as consent } from "@/app/api/harbor-assistance/consent/route";
import { getAssistancePilot, acceptsAssistanceDocument } from "./assistance-pilot";
import { proxy } from "@/proxy";

test("only the opt-in loopback disposable configuration opens the synthetic gate", () => {
  const env = {
    HARBOR_ASSISTANCE_LOCAL: "1", DATABASE_URL: "postgresql://127.0.0.1/ltc_test_structure",
    HARBOR_ASSISTANCE_FACILITIES: "a,b", HARBOR_ASSISTANCE_STAFF: "viewer,owner",
    HARBOR_ASSISTANCE_VIEWERS: "viewer", HARBOR_ASSISTANCE_APPROVERS: "owner",
  };
  assert.ok(getAssistancePilot("127.0.0.1:3021", env));
  assert.equal(getAssistancePilot("private.example", env), null);
  assert.equal(getAssistancePilot("127.0.0.1:3021", { ...env, DATABASE_URL: "postgresql://127.0.0.1/customer" }), null);
  assert.equal(getAssistancePilot("127.0.0.1:3021", { ...env, HARBOR_ASSISTANCE_VIEWERS: "unlisted" }), null);
  assert.equal(getAssistancePilot("127.0.0.1:3021", { ...env, HARBOR_ASSISTANCE_REVIEWERS: "owner" }), null);
  for (const environment of ["production", "preview"]) {
    assert.equal(getAssistancePilot("preview.vercel.app", {
      ...env, VERCEL: "1", VERCEL_ENV: environment, VERCEL_URL: "preview.vercel.app",
      HARBOR_ASSISTANCE_PROTECTED_PREVIEWS: "preview.vercel.app",
    }), null);
  }
});

test("the hosted boundary fails before parsing cookies, commands or an assistance query", async () => {
  const host = "https://preview.example.invalid";
  const endpoints = [
    ["/console/assistance", GET, "GET"],
    ["/console/assistance", HEAD, "HEAD"],
    ["/api/console/assistance", command, "POST"],
    ["/api/harbor-assistance/consent", consent, "POST"],
  ] as const;
  for (const [path, handler, method] of endpoints) {
    const request = new NextRequest(host + path, {
      method, headers: { cookie: "harbor_session=unread; ltc_session=unread; harbor_work=unread" },
    });
    for (const result of [await handler(request), await proxy(request)]) {
      assert.equal(result.status, 404);
      assert.match(result.headers.get("cache-control") ?? "", /no-store/);
    }
  }
  assert.equal(acceptsAssistanceDocument(new Headers({ "Sec-Purpose": "prefetch;prerender" })), false);
  assert.equal(acceptsAssistanceDocument(new Headers({ RSC: "1" })), false);
  assert.equal(acceptsAssistanceDocument(new Headers()), true);
});
