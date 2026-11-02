import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { configuredTeamSpaceIds, matchTeamToLocation } from "./team-operational-type-applicability";

test("Team location matching does not expand rooms or Location Function", () => {
  assert.deepEqual(
    matchTeamToLocation(
      {
        id: "team",
        departmentId: "dietary",
        displayName: "Resident Services",
        status: "ACTIVE",
        applicableOperationalTypeKeys: ["servery"],
        explicitSpaceIds: ["room"],
      },
      {
        departmentId: "dietary",
        spaceId: "room",
        operationalTypeKey: "servery",
        operationalTypeName: "Servery",
      },
    ),
    [],
  );
  assert.deepEqual(
    configuredTeamSpaceIds({
      explicitSpaceIds: ["room"],
      applicableOperationalTypeKeys: ["servery"],
      runtimeAssignments: new Map([["room", { key: "servery" }]]),
    }),
    [],
  );
});

test("viewer placement no longer imports Team location matching", () => {
  const scope = readFileSync(
    new URL("../dashboard/viewer/viewer-team-scope.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(scope, /configuredTeamSpaceIds/);
  assert.doesNotMatch(scope, /matchTeamToLocation/);
});
