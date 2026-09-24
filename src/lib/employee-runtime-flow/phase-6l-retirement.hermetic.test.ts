/**
 * Phase 6L — stop new Operational Template evidence in Harbor mode.
 * Source + contract checks. Does not flip flags or migrate data.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

test("leftover offline producer is gated off when Harbor is on", () => {
  const bundleSrc = read("src/lib/offline/build-runtime-bundle.ts");
  assert.match(
    bundleSrc,
    /!jobFlowEnabled &&\s*!canonicalLogsEnabled &&\s*isDepartmentOperationalEvidenceEnabled/,
  );
  const leftoverIdx = bundleSrc.search(
    /!jobFlowEnabled &&\s*!canonicalLogsEnabled &&\s*isDepartmentOperationalEvidenceEnabled/,
  );
  const leftoverCall = bundleSrc.indexOf("resolveUnitEvidenceRequirements", leftoverIdx);
  assert.ok(leftoverIdx >= 0);
  assert.ok(leftoverCall > leftoverIdx);
  assert.ok(
    bundleSrc.includes("do not invent a"),
    "leftover Harbor-on path must omit template context rather than invent a second Harbor resolver",
  );
});

test("Job Flow Harbor path still does not resolve template requirements", () => {
  const bundleSrc = read("src/lib/offline/build-runtime-bundle.ts");
  const flowSrc = read("src/lib/employee-runtime-flow/load-flow.ts");
  assert.ok(bundleSrc.includes("if (oaEnabled && !canonicalLogsEnabled"));
  assert.ok(flowSrc.includes("if (oaEnabled && !canonicalLogsEnabled && evidenceEnabled"));
});

test("offline sync keeps produce-new / consume-old dual path", () => {
  const syncSrc = read("src/lib/offline/process-sync-command.ts");
  assert.match(syncSrc, /if \(payload\.logAttachmentId\)/);
  assert.match(syncSrc, /submitCanonicalLogSubmission/);
  assert.match(syncSrc, /if \(!payload\.templateId\)/);
  assert.match(syncSrc, /submitEvidenceRecord/);
  assert.ok(syncSrc.indexOf("submitCanonicalLogSubmission") < syncSrc.indexOf("submitEvidenceRecord"));
});

test("Harbor submit still stores catalog stable key on templateStableKey", () => {
  const submitSrc = read("src/lib/canonical-logs/submit-canonical-log.ts");
  assert.match(submitSrc, /templateStableKey:\s*catalog\.stableKey/);
  assert.match(submitSrc, /logAttachmentId:\s*attachment\.id/);
  assert.match(submitSrc, /catalogDefinitionId:\s*catalog\.id/);
});

test("feature flag defaults remain independent and off", () => {
  const flags = read("src/lib/feature-flags.ts");
  const env = read(".env.example");
  assert.match(flags, /parseEnvFlag\(process\.env\.CANONICAL_LOGS_ENABLED, false\)/);
  assert.match(flags, /parseEnvFlag\(process\.env\.DIETARY_OPERATIONAL_EVIDENCE_ENABLED, false\)/);
  assert.match(env, /CANONICAL_LOGS_ENABLED=false/);
  assert.match(env, /DIETARY_OPERATIONAL_EVIDENCE_ENABLED=false/);
});

test("Template Builder and Supervisor Board remain", () => {
  const templates = read("src/app/(protected)/staffing/templates/page.tsx");
  const board = read("src/app/(protected)/staffing/operations/page.tsx");
  const boardLoad =
    read("src/lib/dietary-job-flow/load-supervisor-operations-board.ts") +
    read("src/lib/dietary-job-flow/supervisor-operations/load-facts.ts") +
    read("src/lib/dietary-job-flow/supervisor-operations/compose.ts");
  assert.match(templates, /loadBuilderTemplates/);
  assert.match(board, /loadSupervisorOperationsBoard|operations/);
  assert.match(boardLoad, /loadSupervisorOperationsBoard/);
  assert.equal(boardLoad.includes("operationalTemplate.count"), false);
  assert.equal(boardLoad.includes("Missing Template configuration"), false);
  assert.equal(board.includes("catalogStableKey"), false);
});

test("historical template evidence identity is not rewritten", () => {
  const schema = read("prisma/schema.prisma");
  const logBook = read("src/lib/operational-evidence/log-book.ts");
  assert.match(schema, /templateId\s+String\?/);
  assert.match(schema, /templateStableKey\s+String/);
  assert.match(schema, /templateSnapshotJson/);
  assert.match(schema, /logAttachmentId\s+String\?/);
  assert.match(logBook, /templateStableKey/);
  assert.equal(schema.includes("linkedCatalogStableKey"), false);
});

test("6L does not add ASSET_TYPE inference or a new evidence form", () => {
  const rlsEvidence = read("src/lib/runtime-location-state/evidence.ts");
  const present = read("src/lib/employee-runtime-flow/present.ts");
  const employeePage = read("src/app/(protected)/unit/[unitId]/employee-runtime-page.tsx");
  assert.equal(rlsEvidence.includes("ASSET_TYPE"), false);
  assert.equal(rlsEvidence.includes("SPACE_TYPE"), false);
  assert.match(present, /\/staffing\/logs\/open/);
  assert.match(employeePage, /EvidenceEntryForm/);
  assert.match(employeePage, /evidenceMode === "template"/);
});
