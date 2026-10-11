import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { AppJwtPayload } from "@/lib/auth";

import { remintCurrentUserSession } from "./remint-current";
import { ContextEntryError } from "./types";

function userSession(overrides: Partial<AppJwtPayload> = {}): AppJwtPayload {
  return {
    uid: "sarah",
    authKind: "user",
    authMethod: "PASSWORD",
    name: "Sarah",
    email: "sarah@example.com",
    sessionVersion: 3,
    scopeKind: "account",
    ...overrides,
  } as AppJwtPayload;
}

test("remintCurrentUserSession remints account without calling enterContext", async () => {
  let enteredContext: string | null = null;
  let enteredAccount = false;
  const result = await remintCurrentUserSession(
    {} as never,
    { session: userSession({ scopeKind: "account" }) },
    {
      enterContext: async (_db, input) => {
        enteredContext = input.contextKey;
        throw new Error("enterContext should not run for account");
      },
      enterAccountContext: async () => {
        enteredAccount = true;
        return { token: "account-token", redirectPath: "/access", kind: "account" };
      },
    },
  );
  assert.equal(enteredContext, null);
  assert.equal(enteredAccount, true);
  assert.deepEqual(result, { token: "account-token", kind: "account", fallbackToAccount: false });
});

test("remintCurrentUserSession remints Organization, internal, and partner by exact key", async () => {
  const seen: string[] = [];
  const enterContext = async (_db: never, input: { contextKey: string }) => {
    seen.push(input.contextKey);
    return {
      token: `tok:${input.contextKey}`,
      redirectPath: "/workspace",
      kind: input.contextKey.startsWith("organization:")
        ? "organization"
        : input.contextKey.startsWith("facility_partner:")
          ? "facility_partner"
          : "facility_internal",
      organizationId: input.contextKey.startsWith("organization:") ? "metz" : undefined,
      facilityId: input.contextKey.includes("terrace") ? "terrace" : undefined,
      facilityPartnerOrganizationId: input.contextKey.startsWith("facility_partner:")
        ? "metz-terrace"
        : undefined,
    } as never;
  };

  const org = await remintCurrentUserSession({} as never, {
    session: userSession({ scopeKind: "organization", organizationId: "metz" }),
  }, { enterContext, enterAccountContext: async () => { throw new Error("no account"); } });
  assert.equal(org.kind, "organization");
  assert.equal(org.fallbackToAccount, false);

  const internal = await remintCurrentUserSession({} as never, {
    session: userSession({ scopeKind: "facility", facilityId: "terrace", role: "MANAGER" }),
  }, { enterContext, enterAccountContext: async () => { throw new Error("no account"); } });
  assert.equal(internal.kind, "facility_internal");

  const partner = await remintCurrentUserSession({} as never, {
    session: userSession({
      scopeKind: "facility",
      accessKind: "partner",
      facilityId: "terrace",
      partnerOrganizationId: "metz",
      facilityPartnerOrganizationId: "metz-terrace",
    }),
  }, { enterContext, enterAccountContext: async () => { throw new Error("no account"); } });
  assert.equal(partner.kind, "facility_partner");
  assert.deepEqual(seen, [
    "organization:metz",
    "facility_internal:terrace",
    "facility_partner:metz-terrace",
  ]);
});

test("remintCurrentUserSession falls back to account when the current workspace is gone", async () => {
  const result = await remintCurrentUserSession(
    {} as never,
    { session: userSession({ scopeKind: "organization", organizationId: "metz" }) },
    {
      enterContext: async () => {
        throw new ContextEntryError("CONTEXT_NOT_AVAILABLE", "That workspace is not available.");
      },
      enterAccountContext: async () => ({
        token: "account-token",
        redirectPath: "/access",
        kind: "account",
      }),
    },
  );
  assert.deepEqual(result, { token: "account-token", kind: "account", fallbackToAccount: true });
});

test("remintCurrentUserSession does not fall back on identity failure", async () => {
  await assert.rejects(
    () =>
      remintCurrentUserSession(
        {} as never,
        { session: userSession({ scopeKind: "organization", organizationId: "metz" }) },
        {
          enterContext: async () => {
            throw new ContextEntryError("SESSION_VERSION_STALE", "Session is no longer valid.");
          },
          enterAccountContext: async () => {
            throw new Error("must not recover");
          },
        },
      ),
    (error: unknown) => error instanceof ContextEntryError && error.code === "SESSION_VERSION_STALE",
  );
});

test("remintCurrentUserSession rejects PIN and Harbor", async () => {
  await assert.rejects(
    () =>
      remintCurrentUserSession({} as never, {
        session: userSession({
          authKind: "employee",
          scopeKind: "facility",
          facilityId: "terrace",
          role: "STAFF",
          authMethod: "QUICK_PIN",
        }),
      }),
    (error: unknown) => error instanceof ContextEntryError,
  );
  await assert.rejects(
    () =>
      remintCurrentUserSession({} as never, {
        session: userSession({
          authKind: "harbor_staff",
          scopeKind: "facility",
          facilityId: "terrace",
          role: "FACILITY_ADMINISTRATOR",
        }),
      }),
    (error: unknown) => error instanceof ContextEntryError,
  );
});

test("remint helper does not list available contexts", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/context-entry/remint-current.ts"), "utf8");
  assert.equal(source.includes("listAvailableContexts"), false);
  assert.match(source, /currentContextKeyFromSession/);
  assert.match(source, /enterContext/);
  assert.match(source, /enterAccountContext/);
  assert.match(source, /applyContextTransitionCookies/);
  assert.match(source, /applyAccountSessionCookies/);
  assert.equal(source.includes("session.role"), false);
  assert.equal(source.includes("employee"), false);
  assert.equal(source.includes("harbor"), false);
});
