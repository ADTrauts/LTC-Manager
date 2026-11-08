import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { guidePath, readSetupDraft, setupDraftKey } from "./draft";
import { assertSetupInvitationActor, setupInvitationStatus } from "./manager-invitations";
import type { FacilitySession } from "@/lib/auth";

test("versioned drafts resume multiple AVAILABLE Products in one Facility only", () => {
  const raw = JSON.stringify({ version: 5, facilityId: "a", step: "products", reached: "products", selectedKeys: ["PLANT", "DIETARY", "EVS", "PLANT", "unknown"] });
  assert.deepEqual(readSetupDraft(raw, "a", ["PLANT", "DIETARY"], "site"), { version: 5, facilityId: "a", step: "products", reached: "products", selectedKeys: ["PLANT", "DIETARY"], approach: null });
  assert.deepEqual(readSetupDraft(raw, "b", ["PLANT", "DIETARY"], "site").selectedKeys, []);
  assert.notEqual(setupDraftKey("user", "a"), setupDraftKey("user", "b"));
  assert.notEqual(setupDraftKey("user", "a"), setupDraftKey("other", "a"));
  assert.equal(guidePath(["PLANT"], []).includes("department:PLANT"), true);
});
test("malformed, legacy and out-of-date draft data fails closed", () => {
  for (const raw of [null, "{", "null", JSON.stringify({ version: 3, facilityId: "a", view: "builders", selectedKeys: ["PLANT"] }), JSON.stringify({ version: 4, facilityId: "a", step: "bogus", reached: "bogus", selectedKeys: "PLANT" })]) {
    const draft = readSetupDraft(raw, "a", ["PLANT"], "site"); assert.equal(draft.step, "site"); assert.deepEqual(draft.selectedKeys, []);
  }
  assert.deepEqual(guidePath([], []), ["site", "products", "building", "equipment", "people", "finish"]);
});
test("delivery, expiry and acceptance are distinct from historical notice rows", () => {
  const now = new Date("2026-10-17T00:00:00Z"), expiresAt = new Date(+now + 1000);
  const row = { expiresAt, grantAcceptedAt: null, deliveryStatus: "SENT" };
  assert.equal(setupInvitationStatus(row, now), "PENDING");
  assert.equal(setupInvitationStatus({ ...row, deliveryStatus: "FAILED" }, now), "DELIVERY_FAILED");
  assert.equal(setupInvitationStatus({ ...row, deliveryStatus: "NOT_CONFIGURED" }, now), "DELIVERY_NOT_CONFIGURED");
  assert.equal(setupInvitationStatus(row, expiresAt), "EXPIRED");
  assert.equal(setupInvitationStatus({ ...row, expiresAt: null }, now), "LEGACY_NOTICE");
  assert.equal(setupInvitationStatus({ ...row, grantAcceptedAt: now }, now), "ACCEPTED");
});
test("invitation attribution rejects Console, PIN, partner, non-admin and stale-Facility contexts", () => {
  const session = { facilityId: "a", scopeKind: "facility", authKind: "user", authMethod: "PASSWORD", role: "FACILITY_ADMINISTRATOR" } as FacilitySession;
  assert.doesNotThrow(() => assertSetupInvitationActor(session, "a"));
  for (const patch of [{ authKind: "harbor_staff" }, { authKind: "employee" }, { authMethod: "QUICK_PIN" }, { scopeKind: "organization" }, { role: "MANAGER" }]) {
    assert.throws(() => assertSetupInvitationActor({ ...session, ...patch } as FacilitySession, "a"));
  }
  assert.throws(() => assertSetupInvitationActor(session, "b"), /Facility changed/);
});
test("legacy writer is explicitly retired and workspace delegates intake and publication", () => {
  const locations = readFileSync("src/app/api/onboarding/locations/route.ts", "utf8");
  assert.match(locations, /status: 410/); assert.doesNotMatch(locations, /prisma|\.create\(|\.update\(/);
  const workspace = readFileSync("src/components/setup-wizard.tsx", "utf8");
  assert.doesNotMatch(workspace, /api\/onboarding\/locations|api\/onboarding\/departments/);
  assert.match(workspace, /admin\/facility\/builder\?onboarding=workspace/);
  assert.match(workspace, /assets\/builder\?onboarding=workspace/);
  assert.doesNotMatch(workspace, /build\/departments\//);
  assert.match(workspace, /Who runs/);
  const lead = readFileSync("src/components/setup-department-lead.tsx", "utf8");
  assert.match(lead, /Name and invite/);
  assert.doesNotMatch(lead, /Save Department head|Invite the head/);
  const invitations = readFileSync("src/lib/onboarding/manager-invitations.ts", "utf8");
  assert.match(invitations, /headEmployeeId: result\.employeeId/);
  assert.doesNotMatch(workspace, /builder\?onboarding=workspace" onClick/);
  assert.match(workspace, /expectedFacilityId/); assert.match(workspace, /onboarding\/draft/);
});
