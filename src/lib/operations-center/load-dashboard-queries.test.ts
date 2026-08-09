/**
 * RUN surface rationalization — retired-location exclusion contract.
 *
 * Root cause of the "Operations Center shows deleted Units" bug: the legacy `loadDashboardQueries`
 * loader (still the live default for Dashboard `/workspace` and Today's Work `/today` while the
 * Projection flags are off) filtered Units by `isActive: true` ONLY, so a Unit retired to the
 * builder-only `STAGED` hierarchy role — which stays `isActive: true` — leaked in as an active
 * operational location. These tests pin the corrected where-clause contract so the regression
 * cannot return.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILDER_ONLY_HIERARCHY_ROLES,
  isStagedUnit,
} from "@/lib/facility-builder/operational-visibility";

import { resolveDashboardUnitScopes } from "@/lib/operations-center/load-dashboard-queries";

const FACILITY = "facility-1";

test("legacy (non-projected) unit where excludes STAGED yet keeps active units", () => {
  const { unitWhere } = resolveDashboardUnitScopes(FACILITY, undefined);
  assert.deepEqual(unitWhere, {
    facilityId: FACILITY,
    NOT: { hierarchyRole: { in: ["STAGED"] } },
    isActive: true,
  });
  // The exclusion set is the canonical builder-only hierarchy list, not an ad-hoc literal.
  assert.deepEqual([...BUILDER_ONLY_HIERARCHY_ROLES], ["STAGED"]);
});

test("legacy unit-relation scope also excludes STAGED so joined rows can't reintroduce retired units", () => {
  const { unitRelationScope } = resolveDashboardUnitScopes(FACILITY, undefined);
  assert.deepEqual(unitRelationScope, {
    facilityId: FACILITY,
    NOT: { hierarchyRole: { in: ["STAGED"] } },
  });
});

test("a retired-to-STAGED unit is classified as staged (would be excluded by the where clause)", () => {
  const retired = { id: "u-retired", isActive: true, hierarchyRole: "STAGED" as const };
  const active = { id: "u-active", isActive: true, hierarchyRole: "NEIGHBORHOOD" as const };
  assert.equal(isStagedUnit(retired), true);
  assert.equal(isStagedUnit(active), false);
});

test("projected scope intersects by id and still excludes STAGED on the primary unit list", () => {
  const { unitWhere, unitRelationScope } = resolveDashboardUnitScopes(FACILITY, ["u-1", "u-2"]);
  assert.deepEqual(unitWhere, {
    facilityId: FACILITY,
    NOT: { hierarchyRole: { in: ["STAGED"] } },
    isActive: true,
    id: { in: ["u-1", "u-2"] },
  });
  // Projection already excluded ineligible units, so the relation scope only needs the id intersect.
  assert.deepEqual(unitRelationScope, { facilityId: FACILITY, id: { in: ["u-1", "u-2"] } });
});

test("empty projection yields an empty scope (fails closed — no units)", () => {
  const { unitWhere, unitRelationScope } = resolveDashboardUnitScopes(FACILITY, []);
  assert.deepEqual(unitWhere, {
    facilityId: FACILITY,
    NOT: { hierarchyRole: { in: ["STAGED"] } },
    isActive: true,
    id: { in: [] },
  });
  assert.deepEqual(unitRelationScope, { facilityId: FACILITY, id: { in: [] } });
});
