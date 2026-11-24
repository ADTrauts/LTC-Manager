import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleEmailAllowed, productionStaffLifecycleConfig, staffLifecycleConfig } from "./gate";

test("Production staff activation stays off without complete explicit policy and exact origin", () => {
  const keys = Object.keys(process.env).filter(k => k.startsWith("HARBOR_STAFF_") || ["VERCEL", "VERCEL_ENV", "POSTMARK_SERVER_TOKEN"].includes(k));
  const prior = new Map(keys.map(k => [k, process.env[k]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(productionStaffLifecycleConfig(), null);
    Object.assign(process.env, {
      HARBOR_STAFF_LIFECYCLE_MODE: "production", VERCEL: "1", VERCEL_ENV: "production",
      HARBOR_STAFF_LIFECYCLE_ORIGIN: "https://vssyl.com",
      HARBOR_STAFF_LIFECYCLE_ROSTER_APPROVER_IDS: "sole-owner", HARBOR_STAFF_LIFECYCLE_ADMIN_IDS: "sole-owner",
    });
    const disabled = productionStaffLifecycleConfig();
    assert(disabled);
    assert.equal(disabled.invitationsEnabled, false);
    assert.equal(disabled.recoveryEnabled, false);
    process.env.HARBOR_STAFF_INVITATIONS_ENABLED = "true";
    process.env.HARBOR_STAFF_RECOVERY_ENABLED = "true";
    assert.equal(productionStaffLifecycleConfig()?.invitationsEnabled, false);
    assert.equal(productionStaffLifecycleConfig()?.recoveryEnabled, false);
    Object.assign(process.env, {
      HARBOR_STAFF_LIFECYCLE_ALLOWED_EMAILS: "future.hire@example.invalid",
      HARBOR_STAFF_LIFECYCLE_RECOVERY_APPROVER_IDS: "separate-approver",
      HARBOR_STAFF_LIFECYCLE_RECOVERY_PROOF_POLICY: "independent-proof-v1",
      POSTMARK_SERVER_TOKEN: "synthetic-token-never-sent",
    });
    const configured = productionStaffLifecycleConfig();
    assert(configured);
    assert.equal(configured.invitationsEnabled, true);
    assert.equal(configured.recoveryEnabled, true);
    assert.equal(lifecycleEmailAllowed(configured, "future.hire@example.invalid"), true);
    assert.equal(lifecycleEmailAllowed(configured, "other@example.invalid"), false);
    const request = (origin: string, host = "vssyl.com") => new Request("https://vssyl.com/api/console/staff-lifecycle", { headers: { origin, host } });
    assert(staffLifecycleConfig(request("https://vssyl.com")));
    assert.equal(staffLifecycleConfig(request("https://other.example.invalid")), null);
    assert.equal(staffLifecycleConfig(request("https://vssyl.com", "preview.vercel.app")), null);
    process.env.VERCEL_ENV = "preview";
    assert.equal(productionStaffLifecycleConfig(), null);
    process.env.VERCEL_ENV = "production";
    process.env.HARBOR_STAFF_LIFECYCLE_ALLOWED_EMAILS = "*@example.invalid";
    assert.equal(lifecycleEmailAllowed(productionStaffLifecycleConfig()!, "other@example.invalid"), false);
    process.env.HARBOR_STAFF_LIFECYCLE_ORIGIN = "http://vssyl.com";
    assert.equal(productionStaffLifecycleConfig(), null);
  } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith("HARBOR_STAFF_") || ["VERCEL", "VERCEL_ENV", "POSTMARK_SERVER_TOKEN"].includes(key)) delete process.env[key];
    for (const [key, value] of prior) process.env[key] = value;
  }
});
