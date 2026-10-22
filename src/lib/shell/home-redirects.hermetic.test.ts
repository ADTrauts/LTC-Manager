import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { AppRole } from "@/lib/access";
import type { AuthKind, FacilitySession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

import { resolveWorkspaceHomeHref } from "./workspace-home";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("unauthorized-role bounces go to the caller's home, not the retired /dashboard hop", () => {
  const offenders = sourceFiles(join(process.cwd(), "src")).filter((path) =>
    /redirect\(\s*["'`]\/dashboard["'`]\s*\)/.test(readFileSync(path, "utf8")),
  );
  assert.deepEqual(offenders, []);
});

test("the home a bounce lands on is the one /dashboard redirected to", () => {
  const cases: { role: AppRole; authKind: AuthKind; activeUnitId?: string }[] = [
    { role: "FACILITY_ADMINISTRATOR", authKind: "user" },
    { role: "GM", authKind: "user" },
    { role: "MANAGER", authKind: "employee" },
    { role: "SUPERVISOR", authKind: "user" },
    { role: "STAFF", authKind: "employee", activeUnitId: "unit-1" },
    { role: "LEAD_TEAM_MEMBER", authKind: "user" },
  ];
  for (const { role, authKind, activeUnitId } of cases) {
    const session = {
      uid: "u1",
      scopeKind: "facility",
      facilityId: "fac-1",
      role,
      authKind,
      activeUnitId,
    } as FacilitySession;
    assert.equal(
      resolveWorkspaceHomeHref(session),
      resolveDefaultHomePath({ authKind, role, activeUnitId }),
      `${role} ${authKind}`,
    );
  }
});
