import assert from "node:assert/strict";
import test from "node:test";

import { APP_ROLES, type AppRole } from "@/lib/access";
import { roleMayAccessRoute } from "@/lib/route-registry";

const FLAGS = { todaysWorkEnabled: true };

test("/admin/knowledge keeps the FACILITY_ADMINISTRATOR gate of the Administration area", () => {
  assert.equal(roleMayAccessRoute("/admin/knowledge", "FACILITY_ADMINISTRATOR" as AppRole, FLAGS), true);
  for (const role of APP_ROLES.filter((r) => r !== "FACILITY_ADMINISTRATOR")) {
    assert.equal(roleMayAccessRoute("/admin/knowledge", role, FLAGS), false, `${role} denied`);
  }
});

test("unregistered /admin/knowledge descendants are denied for every role", () => {
  for (const role of APP_ROLES) {
    assert.equal(roleMayAccessRoute("/admin/knowledge/clxyz", role, FLAGS), false, `${role} denied`);
  }
});
