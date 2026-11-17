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

test("the hosted pilot requires the approved branch, commit, opt-in, UTC cutoff, and branch hostname", () => {
  const alias = "ltc-manager-git-harbor-1b3-pilot-adtrauts-projects.vercel.app";
  const direct = "ltc-manager-abcd12345-adtrauts-projects.vercel.app";
  const commit = "a".repeat(40);
  const now = Date.parse("2030-11-16T18:00:00Z");
  const env: NodeJS.ProcessEnv = {
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "harbor-1b3-pilot", VERCEL_GIT_COMMIT_SHA: commit,
    VERCEL_BRANCH_URL: alias, VERCEL_URL: direct, HARBOR_ASSISTANCE_PROTECTED_PREVIEWS: alias,
    HARBOR_ASSISTANCE_PREVIEW: "1", HARBOR_ASSISTANCE_APPROVED_COMMIT: commit,
    HARBOR_ASSISTANCE_CUTOFF_UTC: "2030-11-16T19:00:00Z",
    HARBOR_ASSISTANCE_FACILITIES: "a,b", HARBOR_ASSISTANCE_STAFF: "viewer,owner,revoker,reviewer",
    HARBOR_ASSISTANCE_VIEWERS: "viewer", HARBOR_ASSISTANCE_APPROVERS: "owner",
    HARBOR_ASSISTANCE_REVOKERS: "revoker", HARBOR_ASSISTANCE_REVIEWERS: "reviewer",
  };
  const actual = getAssistancePilot(alias, env, now);
  assert.deepEqual(actual, {
    facilities: new Set(["a", "b"]), staff: new Set(["viewer", "owner", "revoker", "reviewer"]),
    viewers: new Set(["viewer"]), approvers: new Set(["owner"]), revokers: new Set(["revoker"]),
    reviewers: new Set(["reviewer"]),
  });

  const mismatches = {
    VERCEL: "0", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_COMMIT_SHA: "b".repeat(40),
    VERCEL_BRANCH_URL: "wrong.vercel.app", HARBOR_ASSISTANCE_PROTECTED_PREVIEWS: `${alias},wrong.vercel.app`,
    HARBOR_ASSISTANCE_PREVIEW: "0", HARBOR_ASSISTANCE_APPROVED_COMMIT: "abc",
    HARBOR_ASSISTANCE_CUTOFF_UTC: "2030-11-16T14:00:00-05:00",
    HARBOR_ASSISTANCE_FACILITIES: "", HARBOR_ASSISTANCE_STAFF: "unlisted", HARBOR_ASSISTANCE_VIEWERS: "unlisted",
  };
  for (const [key, value] of Object.entries(mismatches)) {
    assert.equal(getAssistancePilot(alias, { ...env, [key]: value }, now), null, key);
    assert.equal(getAssistancePilot(alias, { ...env, [key]: undefined }, now), null, `missing ${key}`);
  }
  assert.equal(getAssistancePilot(alias, { ...env, HARBOR_ASSISTANCE_PREVIEW: "true" }, now), null);
  assert.equal(getAssistancePilot(alias, { ...env, HARBOR_ASSISTANCE_CUTOFF_UTC: "2030-02-30T19:00:00Z" }, now), null);
  const expiry = Date.parse(env.HARBOR_ASSISTANCE_CUTOFF_UTC!);
  assert.ok(getAssistancePilot(alias, env, expiry - 1));
  assert.equal(getAssistancePilot(alias, env, expiry), null);
  assert.equal(getAssistancePilot(alias, env, expiry + 1), null);
  assert.equal(getAssistancePilot(direct, env, now), null);
  assert.equal(getAssistancePilot("ltc-manager-ten.vercel.app", env, now), null);
  assert.equal(getAssistancePilot(direct, { ...env, VERCEL_BRANCH_URL: direct, HARBOR_ASSISTANCE_PROTECTED_PREVIEWS: direct }, now), null);
  assert.equal(getAssistancePilot(alias, { ...env, HARBOR_ASSISTANCE_REVIEWERS: "owner" }, now), null);
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
