/**
 * Waves F–I — leftover readers gone, leftover doors moved, Harbor kinds expanded.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("Run loaders read Location Functions from the shared runtime resolver", () => {
  const files = [
    "src/lib/operational-cycles/load-supervisor-cycle-overview.ts",
    "src/lib/operational-cycles/load-employee-cycle-context.ts",
    "src/lib/operational-cycles/load-run-operation-presentation.ts",
    "src/lib/offline/build-runtime-bundle.ts",
    "src/lib/canonical-logs/load-run-requirements.ts",
    "src/lib/canonical-logs/load-target-run-logs.ts",
  ];
  for (const file of files) {
    const text = source(file);
    assert.equal(text.includes("loadSpaceOperationalTypeAssignments"), true, file);
    assert.match(text, /perspective:\s*"runtime"/, file);
  }
  assert.equal(
    source("src/lib/scheduling/operational-assignments/build-coverage-summary.ts").includes(
      "loadSpaceOperationalTypeAssignments",
    ),
    false,
  );
});

test("Today's Work and workspace adapters do not require the Experience catalog", () => {
  assert.equal(
    source("src/lib/todays-work/projection/adapt-projection.ts").includes("requireExperience"),
    false,
  );
  assert.equal(
    source("src/lib/business-workspace/projection/adapt-projection.ts").includes(
      "requireExperience",
    ),
    false,
  );
  assert.equal(
    source("src/lib/projection/pipeline.ts").includes("getExperience"),
    false,
  );
  assert.equal(
    source("src/lib/department-administration/certification.ts").includes("isExperienceKey"),
    false,
  );
});

test("Department Builder and Procedures live under Build", () => {
  const href = source("src/lib/department-administration/admin-nav.ts");
  assert.match(href, /\/build\/departments/);
  assert.doesNotMatch(href, /`\/admin\/departments/);
  const surface = source("src/lib/knowledge/surface.ts");
  assert.match(surface, /PROCEDURES_RESOURCES_VISIBLE = true/);
  assert.match(surface, /\/build\/knowledge/);
});

test("Harbor catalog installs inspections and procedures", () => {
  const install = source("src/lib/canonical-logs/facility-catalog-install.ts");
  assert.match(install, /INSPECTION/);
  assert.match(install, /PROCEDURE/);
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /enum CatalogLogPurposeType/);
  assert.match(schema, /INSPECTION/);
  assert.match(schema, /PROCEDURE/);
});
