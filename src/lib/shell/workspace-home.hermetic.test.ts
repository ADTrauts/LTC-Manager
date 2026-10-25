import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  resolveWorkspaceHomeHref,
  workspaceHomeBackLabel,
} from "@/lib/shell/workspace-home";
import type { AppJwtPayload } from "@/lib/auth";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const common = {
  uid: "user-1",
  authKind: "user" as const,
  authMethod: "PASSWORD" as const,
  name: "Ada",
  email: "ada@example.com",
  sessionVersion: 1,
};

test("workspace home — Facility Dashboard, partner Dashboard, org Portfolio, account My Access", () => {
  assert.equal(
    resolveWorkspaceHomeHref({
      ...common,
      scopeKind: "facility",
      facilityId: "fac-1",
      role: "FACILITY_ADMINISTRATOR",
    } as AppJwtPayload),
    "/dashboard",
  );
  assert.equal(
    resolveWorkspaceHomeHref({
      ...common,
      scopeKind: "facility",
      accessKind: "partner",
      facilityId: "fac-1",
      partnerOrganizationId: "org-1",
      facilityPartnerOrganizationId: "fpo-1",
    } as AppJwtPayload),
    "/partner",
  );
  assert.equal(
    resolveWorkspaceHomeHref({
      ...common,
      scopeKind: "organization",
      organizationId: "org-9",
    } as AppJwtPayload),
    "/organization/org-9",
  );
  assert.equal(
    resolveWorkspaceHomeHref({
      ...common,
      scopeKind: "account",
    } as AppJwtPayload),
    "/access",
  );
  assert.equal(
    resolveWorkspaceHomeHref({
      uid: "emp-1",
      authKind: "employee",
      authMethod: "QUICK_PIN",
      name: "Pat",
      email: "",
      sessionVersion: 1,
      scopeKind: "facility",
      facilityId: "fac-1",
      role: "STAFF",
    } as AppJwtPayload),
    "/logs",
  );
});

test("workspace home — identity pages offer Back to Dashboard only with a workspace", () => {
  assert.equal(
    workspaceHomeBackLabel({
      ...common,
      scopeKind: "facility",
      facilityId: "fac-1",
      role: "MANAGER",
    } as AppJwtPayload),
    "Back to Dashboard",
  );
  assert.equal(
    workspaceHomeBackLabel({
      ...common,
      scopeKind: "account",
    } as AppJwtPayload),
    null,
  );
  assert.equal(
    workspaceHomeBackLabel({
      ...common,
      scopeKind: "organization",
      organizationId: "org-9",
    } as AppJwtPayload),
    "Back to Portfolio",
  );
});

test("Vssyl brand and identity chrome use the workspace home href", () => {
  const brand = source("src/components/shell-brand-block.tsx");
  const identity = source("src/components/global-user-layout.tsx");
  const facility = source("src/components/app-shell.tsx");
  const partner = source("src/components/partner/partner-facility-shell.tsx");
  const org = source("src/app/(organization-account)/layout.tsx");
  assert.match(brand, /href\?:/);
  assert.match(brand, /data-testid="shell-brand"/);
  assert.match(identity, /resolveWorkspaceHomeHref/);
  assert.match(identity, /workspaceHomeBackLabel/);
  assert.match(identity, /back-to-workspace/);
  assert.match(facility, /ShellBrandBlock/);
  assert.match(facility, /homeHref/);
  assert.match(partner, /homeHref/);
  assert.match(org, /homeHref/);
});
