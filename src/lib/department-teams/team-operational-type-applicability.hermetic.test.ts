import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  configuredTeamSpaceIds,
  dedupeTeamLocationMatches,
  describeTeamApplicability,
  matchTeamToLocation,
  overlaySourceFromTeamMatch,
  validateTeamOperationalTypeKeys,
  type TeamApplicabilityRow,
  type TeamLocationMatchContext,
} from "./team-operational-type-applicability";

const dietary = "dietary";
const evs = "evs";

function team(
  overrides: Partial<TeamApplicabilityRow> & Pick<TeamApplicabilityRow, "id" | "displayName">,
): TeamApplicabilityRow {
  return {
    departmentId: dietary,
    status: "ACTIVE",
    applicableOperationalTypeKeys: [],
    explicitSpaceIds: [],
    ...overrides,
  };
}

function ctx(
  overrides: Partial<TeamLocationMatchContext> &
    Pick<TeamLocationMatchContext, "spaceId" | "operationalTypeKey">,
): TeamLocationMatchContext {
  return {
    departmentId: dietary,
    operationalTypeName:
      overrides.operationalTypeKey === "servery"
        ? "Servery"
        : overrides.operationalTypeKey === "retail"
          ? "Retail"
          : overrides.operationalTypeKey === "main_kitchen"
            ? "Main Kitchen"
            : null,
    ...overrides,
  };
}

function labels(teams: readonly TeamApplicabilityRow[], context: TeamLocationMatchContext): string[] {
  return dedupeTeamLocationMatches(teams.flatMap((row) => matchTeamToLocation(row, context))).map(
    (match) => match.team.displayName,
  );
}

const serveryAm = team({
  id: "t-servery-am",
  displayName: "Servery AM",
  applicableOperationalTypeKeys: ["servery"],
});
const training = team({
  id: "t-training",
  displayName: "Training Team",
  explicitSpaceIds: ["3a-servery"],
});

describe("Team location applicability (Phase 2D-5)", () => {
  it("does not expand Teams from Operational Type keys", () => {
    assert.deepEqual(
      matchTeamToLocation(serveryAm, ctx({ spaceId: "s1", operationalTypeKey: "servery" })),
      [],
    );
  });

  it("matches explicit room membership only", () => {
    const match = matchTeamToLocation(
      training,
      ctx({ spaceId: "3a-servery", operationalTypeKey: null }),
    );
    assert.equal(match.length, 1);
    assert.equal(match[0]!.source, "EXPLICIT_LOCATION");
    assert.equal(match[0]!.detail, "Applied directly to this location");
    assert.equal(overlaySourceFromTeamMatch(match[0]!.source), "EXPLICIT_LOCATION");
  });

  it("ignores OT keys even when Room Type / OT would previously have expanded", () => {
    assert.deepEqual(
      labels(
        [serveryAm, training],
        ctx({ spaceId: "s1", operationalTypeKey: "servery" }),
      ),
      [],
    );
    assert.deepEqual(
      labels(
        [serveryAm, training],
        ctx({ spaceId: "3a-servery", operationalTypeKey: "servery" }),
      ),
      ["Training Team"],
    );
  });

  it("does not leak Teams across Departments", () => {
    const evsTeam = team({
      id: "t-evs",
      displayName: "EVS Servery",
      departmentId: evs,
      explicitSpaceIds: ["3a-servery"],
    });
    assert.deepEqual(
      matchTeamToLocation(evsTeam, ctx({ spaceId: "3a-servery", operationalTypeKey: null })),
      [],
    );
  });

  it("ignores archived Teams", () => {
    const archived = team({
      id: "t-old",
      displayName: "Retired",
      status: "ARCHIVED",
      explicitSpaceIds: ["3a-servery"],
    });
    assert.deepEqual(
      matchTeamToLocation(archived, ctx({ spaceId: "3a-servery", operationalTypeKey: null })),
      [],
    );
  });
});

describe("configuredTeamSpaceIds", () => {
  it("returns explicit membership only and ignores OT runtime expansion", () => {
    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: ["direct-1"],
        applicableOperationalTypeKeys: ["servery"],
        runtimeAssignments: new Map([["s1", { key: "servery" }]]),
      }),
      ["direct-1"],
    );
    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: [],
        applicableOperationalTypeKeys: ["servery"],
        runtimeAssignments: new Map([["s1", { key: "servery" }]]),
      }),
      [],
    );
  });
});

describe("forward Team OT authoring", () => {
  it("rejects new Operational Type keys", () => {
    assert.throws(
      () =>
        validateTeamOperationalTypeKeys({
          submittedKeys: ["servery"],
          allowedKeys: new Set(["servery"]),
        }),
      /explicit rooms/i,
    );
    assert.deepEqual(validateTeamOperationalTypeKeys({ submittedKeys: [] }), []);
  });

  it("keeps historical describe helpers for compatibility presentation", () => {
    assert.match(
      describeTeamApplicability({
        source: "OPERATIONAL_TYPE_DEFAULT",
        operationalTypeName: "Servery",
      }),
      /Historical Operational Type: Servery/,
    );
  });
});
