import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { platformNavItemsForRole } from "@/lib/route-registry";

import {
  RECORD_ENGINE_AUTHORITY,
  legacyRecordWriteDecision,
} from "./record-engine";
import { applyCanonicalLogsNavRewrite } from "./run-nav";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("Phase 0 — flag default stays off", () => {
  const prev = process.env.CANONICAL_LOGS_ENABLED;
  try {
    delete process.env.CANONICAL_LOGS_ENABLED;
    assert.equal(isCanonicalLogsEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.CANONICAL_LOGS_ENABLED;
    else process.env.CANONICAL_LOGS_ENABLED = prev;
  }
  assert.match(source(".env.example"), /CANONICAL_LOGS_ENABLED=true/);
});

test("Phase 0 — forward authority chain is Catalog → install → attachment → derived → fact", () => {
  assert.deepEqual(RECORD_ENGINE_AUTHORITY, {
    definition: "CatalogLogDefinition",
    install: "FacilityCatalogInstall",
    requirementSegment: "LogAttachment",
    expectedSlots: "derived",
    fact: "OperationalEvidenceRecord",
    logBook: "projection",
    review: "derived",
  });
  const engine = source("src/lib/canonical-logs/record-engine.ts");
  assert.match(engine, /CatalogLogDefinition/);
  assert.match(engine, /FacilityCatalogInstall/);
  assert.match(engine, /LogAttachment/);
  assert.match(engine, /OperationalEvidenceRecord/);
  assert.match(engine, /OperationalTemplate is NOT the next layer after CatalogLogDefinition/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model FormDefinition/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model RuntimeRequirement/);
  assert.doesNotMatch(source("prisma/schema.prisma"), /model Finding\b/);
});

test("Phase 0 — flag OFF keeps legacy writers; flag ON fences competing writers", () => {
  for (const writer of [
    "LOG_TEMPLATE",
    "LOG_ASSIGNMENT",
    "LOG_SUBMISSION",
    "INSPECTION_SUBMISSION",
    "OPERATIONAL_TEMPLATE",
  ] as const) {
    assert.equal(legacyRecordWriteDecision({ productRecordEngine: false, writer }).allowed, true);
    assert.equal(legacyRecordWriteDecision({ productRecordEngine: true, writer }).allowed, false);
  }

  assert.equal(existsSync("src/app/(protected)/logs/actions.ts"), false);
  assert.equal(existsSync("src/app/(protected)/admin/inspections/actions.ts"), false);
  assert.equal(existsSync("src/app/(protected)/staffing/templates/actions.ts"), false);

  assert.doesNotMatch(source("src/lib/operational-evidence/submit-evidence.ts"), /OPERATIONAL_TEMPLATE/);
  assert.doesNotMatch(source("src/lib/operational-evidence/template-service.ts"), /OPERATIONAL_TEMPLATE/);
  assert.match(source("src/app/(protected)/unit/[unitId]/evidence-actions.ts"), /OPERATIONAL_TEMPLATE/);
  assert.match(source("src/lib/offline/process-sync-command.ts"), /LEGACY_TEMPLATE_EVIDENCE_FENCED/);
  assert.doesNotMatch(source("src/lib/work/inspections/submit-inspection.ts"), /inspectionSubmission/);
  assert.doesNotMatch(source("src/lib/work/inspections/generate-due-inspection-work.ts"), /inspectionDefinition/);
  const logsPage = source("src/app/(protected)/logs/page.tsx");
  assert.match(logsPage, /activeTab === "assignments"/);
  assert.match(logsPage, /activeTab === "templates" \|\| activeTab === "submit"/);
  assert.match(logsPage, /redirect\("\/staffing\/logs"\)/);
});

test("Phase 0 — Log Book reads OperationalEvidenceRecord; Review stays derived", () => {
  const logBook = source("src/lib/operational-evidence/log-book.ts");
  assert.match(logBook, /operationalEvidenceRecord\.(count|findMany)/);
  assert.doesNotMatch(logBook, /logSubmission\.create/);
  assert.doesNotMatch(logBook, /operationalEvidenceRecord\.create/);

  const reviewTypes = source("src/lib/operational-review/types.ts");
  assert.match(reviewTypes, /Derived historical Review model/);
  assert.match(reviewTypes, /Not persisted/);
  assert.doesNotMatch(source("src/lib/operational-review/compose-operational-review-day.ts"), /prisma\.\w+\.create/);
  assert.doesNotMatch(source("src/lib/operational-review/present-operational-review-day.ts"), /prisma\.\w+\.create/);
});

test("Phase 0 — canonical ON navigation distinguishes due Logs from Log Book", () => {
  const supervisor = applyCanonicalLogsNavRewrite(
    platformNavItemsForRole("SUPERVISOR", {
      canonicalLogsEnabled: true,
      dietaryOperationalEvidenceEnabled: true,
    }),
    true,
    { canViewLogBook: true },
  );
  assert.equal(supervisor.some((item) => item.href === "/staffing/logs"), true);
  assert.equal(supervisor.some((item) => item.href === "/staffing/log-book"), true);
  assert.equal(supervisor.some((item) => item.href === "/logs"), false);

  const staff = applyCanonicalLogsNavRewrite(
    platformNavItemsForRole("STAFF", {
      canonicalLogsEnabled: true,
    }),
    true,
    { canViewLogBook: false },
  );
  assert.equal(staff.some((item) => item.href === "/staffing/logs"), true);
  assert.equal(staff.some((item) => item.href === "/staffing/log-book"), false);

  const managerBuild = platformNavItemsForRole("MANAGER", {
    canonicalLogsEnabled: true,
  });
  assert.equal(managerBuild.some((item) => item.href === "/build/logs"), true);

  const flagOff = applyCanonicalLogsNavRewrite(
    platformNavItemsForRole("STAFF", { canonicalLogsEnabled: false }),
    false,
  );
  assert.equal(flagOff.some((item) => item.href === "/logs"), true);
  assert.equal(flagOff.some((item) => item.href === "/staffing/logs"), false);
});

test("Phase 0 — documentation names the forward chain and legacy /logs status", () => {
  const constitution = source("docs/product/01_PRODUCT_CONSTITUTION.md");
  assert.match(constitution, /CatalogLogDefinition/);
  assert.match(constitution, /FacilityCatalogInstall/);
  assert.match(constitution, /LogAttachment/);
  assert.match(constitution, /`CANONICAL_LOGS_ENABLED` remains a code flag/);
  assert.match(constitution, /legacy log, inspection, and operational-template tables were dropped/);

  const register = source("docs/product/LEGACY_SURFACE_REGISTER.md");
  assert.match(register, /\*\*RETIRED in LEG-06\.\*\*/);
  assert.match(register, /\| 2 \| `\/logs` \| \*\*RETIRED\*\*/);
  assert.doesNotMatch(
    register.split("\n").find((line) => line.includes("| `/logs` |")) ?? "",
    /ACTIVE AUTHORITY/,
  );

  const buildGuide = source("docs/product/LTC_MANAGER_BUILD_GUIDE.md");
  assert.match(buildGuide, /\/build\/logs/);
  assert.match(buildGuide, /not the next layer after `CatalogLogDefinition`/);
  assert.doesNotMatch(
    buildGuide,
    /\/staffing\/templates` is the clear authoritative Build experience/,
  );
});
