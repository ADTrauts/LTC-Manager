import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { assignmentsFromBindings } from "@/lib/operational-cycles/load-operational-type-targets";

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
const serveryPm = team({
  id: "t-servery-pm",
  displayName: "Servery PM",
  applicableOperationalTypeKeys: ["servery"],
});
const retailTeam = team({
  id: "t-retail",
  displayName: "Retail Team",
  applicableOperationalTypeKeys: ["retail"],
});
const production = team({
  id: "t-production",
  displayName: "Production",
  applicableOperationalTypeKeys: ["main_kitchen"],
});
const utility = team({
  id: "t-utility",
  displayName: "Utility",
  applicableOperationalTypeKeys: ["main_kitchen"],
});
const training = team({
  id: "t-training",
  displayName: "Training Team",
  explicitSpaceIds: ["3a-servery"],
});

describe("Team Operational Type applicability", () => {
  it("one Team applies to one Operational Type", () => {
    const match = matchTeamToLocation(serveryAm, ctx({ spaceId: "s1", operationalTypeKey: "servery" }));
    assert.equal(match.length, 1);
    assert.equal(match[0]!.source, "OPERATIONAL_TYPE_DEFAULT");
    assert.equal(match[0]!.detail, "Inherited from Operational Type: Servery");
    assert.equal(overlaySourceFromTeamMatch(match[0]!.source), "OPERATIONAL_TYPE_DEFAULT");
  });

  it("one Team can target multiple Operational Types", () => {
    const float = team({
      id: "t-float",
      displayName: "Float",
      applicableOperationalTypeKeys: ["servery", "retail"],
    });
    assert.ok(matchTeamToLocation(float, ctx({ spaceId: "s1", operationalTypeKey: "servery" })).length);
    assert.ok(matchTeamToLocation(float, ctx({ spaceId: "r1", operationalTypeKey: "retail" })).length);
    assert.deepEqual(matchTeamToLocation(float, ctx({ spaceId: "k1", operationalTypeKey: "main_kitchen" })), []);
  });

  it("multiple Teams can apply to one Operational Type", () => {
    assert.deepEqual(labels([serveryAm, serveryPm], ctx({ spaceId: "s1", operationalTypeKey: "servery" })), [
      "Servery AM",
      "Servery PM",
    ]);
  });

  it("explicit location membership remains additive and is not copied as room rows", () => {
    const match = matchTeamToLocation(
      training,
      ctx({ spaceId: "3a-servery", operationalTypeKey: null }),
    );
    assert.equal(match.length, 1);
    assert.equal(match[0]!.source, "EXPLICIT_LOCATION");
    assert.equal(match[0]!.detail, "Applied directly to this location");
    assert.deepEqual(training.explicitSpaceIds, ["3a-servery"]);
    assert.deepEqual(serveryAm.explicitSpaceIds, []);
  });

  it("untyped locations receive no Operational Type Teams", () => {
    assert.deepEqual(
      labels([serveryAm, retailTeam, production], ctx({ spaceId: "u1", operationalTypeKey: null })),
      [],
    );
    assert.deepEqual(
      labels([training], ctx({ spaceId: "u1", operationalTypeKey: null })),
      [],
    );
    assert.deepEqual(
      labels([training], ctx({ spaceId: "3a-servery", operationalTypeKey: null })),
      ["Training Team"],
    );
  });
});

describe("representative isolation", () => {
  const configured = [serveryAm, serveryPm, retailTeam, production, utility];

  it("keeps Servery, Retail, and Main Kitchen Teams isolated", () => {
    assert.deepEqual(labels(configured, ctx({ spaceId: "s1", operationalTypeKey: "servery" })), [
      "Servery AM",
      "Servery PM",
    ]);
    assert.deepEqual(labels(configured, ctx({ spaceId: "r1", operationalTypeKey: "retail" })), [
      "Retail Team",
    ]);
    assert.deepEqual(labels(configured, ctx({ spaceId: "k1", operationalTypeKey: "main_kitchen" })), [
      "Production",
      "Utility",
    ]);
    assert.deepEqual(labels(configured, ctx({ spaceId: "u1", operationalTypeKey: null })), []);
  });
});

describe("deduplication and department scope", () => {
  it("collapses the same Team from Operational Type and direct membership", () => {
    const both = team({
      id: "t-servery-am",
      displayName: "Servery AM",
      applicableOperationalTypeKeys: ["servery"],
      explicitSpaceIds: ["3a-servery"],
    });
    const deduped = dedupeTeamLocationMatches(
      matchTeamToLocation(both, ctx({ spaceId: "3a-servery", operationalTypeKey: "servery" })),
    );
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0]!.team.id, "t-servery-am");
    assert.equal(deduped[0]!.source, "EXPLICIT_LOCATION");
    assert.match(deduped[0]!.detail, /Applied directly to this location/);
    assert.match(deduped[0]!.detail, /inherited from Operational Type: Servery/i);
  });

  it("does not leak Teams across Departments", () => {
    const evsTeam = team({
      id: "t-evs",
      displayName: "EVS Servery",
      departmentId: evs,
      applicableOperationalTypeKeys: ["servery"],
    });
    assert.deepEqual(
      matchTeamToLocation(evsTeam, ctx({ spaceId: "s1", operationalTypeKey: "servery" })),
      [],
    );
  });

  it("ignores archived Teams", () => {
    const archived = team({
      id: "t-old",
      displayName: "Retired Servery",
      status: "ARCHIVED",
      applicableOperationalTypeKeys: ["servery"],
    });
    assert.deepEqual(
      matchTeamToLocation(archived, ctx({ spaceId: "s1", operationalTypeKey: "servery" })),
      [],
    );
  });
});

describe("publication boundary and identity", () => {
  it("Build preview can see a draft Operational Type while runtime-effective rooms stay on ACTIVE", () => {
    const runtimeAssignments = new Map([
      ["s1", { key: "servery" }],
      ["r1", { key: "retail" }],
    ]);
    const workingAssignments = new Map([
      ["s1", { key: "retail" }],
      ["r1", { key: "retail" }],
    ]);

    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: [],
        applicableOperationalTypeKeys: ["servery"],
        runtimeAssignments,
      }),
      ["s1"],
    );
    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: [],
        applicableOperationalTypeKeys: ["retail"],
        runtimeAssignments,
      }),
      ["r1"],
    );
    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: [],
        applicableOperationalTypeKeys: ["servery"],
        runtimeAssignments: workingAssignments,
      }),
      [],
    );

    const workingPreview = labels(
      [serveryAm, retailTeam],
      ctx({ spaceId: "s1", operationalTypeKey: "retail", operationalTypeName: "Retail" }),
    );
    const runtimeEffective = labels(
      [serveryAm, retailTeam],
      ctx({ spaceId: "s1", operationalTypeKey: "servery", operationalTypeName: "Servery" }),
    );
    assert.deepEqual(workingPreview, ["Retail Team"]);
    assert.deepEqual(runtimeEffective, ["Servery AM"]);
  });

  it("renaming an Operational Type display name does not break key matching", () => {
    const match = matchTeamToLocation(
      serveryAm,
      ctx({
        spaceId: "s1",
        operationalTypeKey: "servery",
        operationalTypeName: "Neighborhood Servery",
      }),
    );
    assert.equal(match[0]!.source, "OPERATIONAL_TYPE_DEFAULT");
    assert.equal(match[0]!.detail, "Inherited from Operational Type: Neighborhood Servery");
  });

  it("retired / inactive Operational Types stop OT-derived Team applicability", () => {
    const inactiveBindings = assignmentsFromBindings([
      { unitSpaceId: "s1", archetype: { key: "servery", name: "Servery", isActive: false } },
    ]);
    assert.equal(inactiveBindings.size, 0);
    assert.deepEqual(
      configuredTeamSpaceIds({
        explicitSpaceIds: ["direct-1"],
        applicableOperationalTypeKeys: ["servery"],
        runtimeAssignments: inactiveBindings,
      }),
      ["direct-1"],
    );
    assert.deepEqual(
      labels([serveryAm, training], ctx({ spaceId: "3a-servery", operationalTypeKey: null })),
      ["Training Team"],
    );
  });

  it("does not invent Operational Type from physical Room Type or Unit.unitType", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/department-teams/team-operational-type-applicability.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /unitType/);
    assert.doesNotMatch(source, /roomTypeKey/);
    assert.doesNotMatch(source, /facilityRoomType/);
    assert.deepEqual(
      matchTeamToLocation(serveryAm, ctx({ spaceId: "kitchenette-1", operationalTypeKey: null })),
      [],
    );
  });
});

describe("employee membership and coverage stay separate", () => {
  it("matching does not create or mention OperationalAssignment", () => {
    const applicability = readFileSync(
      join(process.cwd(), "src/lib/department-teams/team-operational-type-applicability.ts"),
      "utf8",
    );
    const membership = readFileSync(
      join(process.cwd(), "src/lib/employee-membership/team.ts"),
      "utf8",
    );
    const service = readFileSync(join(process.cwd(), "src/lib/department-teams/service.ts"), "utf8");
    assert.match(applicability, /Does not create employee assignments, coverage, or OperationalAssignment rows/);
    assert.doesNotMatch(applicability, /requiredHeadcount|minimumStaff|roleCount|requiredCoverage/);
    assert.doesNotMatch(applicability, /prisma\.\w*operationalAssignment/i);
    assert.doesNotMatch(membership, /OperationalAssignment/);
    assert.doesNotMatch(membership, /applicableOperationalTypeKeys/);
    assert.match(service, /Does not write[\s\S]*OperationalAssignment/);
  });

  it("validateTeamOperationalTypeKeys stays department-scoped", () => {
    assert.deepEqual(
      validateTeamOperationalTypeKeys({
        submittedKeys: ["servery", "retail", "servery"],
        allowedKeys: new Set(["servery", "retail", "main_kitchen"]),
      }),
      ["servery", "retail"],
    );
    assert.throws(() =>
      validateTeamOperationalTypeKeys({
        submittedKeys: ["housekeeping"],
        allowedKeys: new Set(["servery"]),
      }),
    );
  });
});

describe("source contracts", () => {
  it("Effective Location Program resolves Teams with provenance and does not copy membership rows", () => {
    const loader = readFileSync(
      join(process.cwd(), "src/lib/department-administration/load-effective-location-program.ts"),
      "utf8",
    );
    assert.match(loader, /matchTeamToLocation/);
    assert.match(loader, /dedupeTeamLocationMatches/);
    assert.match(loader, /overlaySourceFromTeamMatch/);
    assert.doesNotMatch(loader, /departmentTeamRoomMembership\.create/);
  });

  it("configured-team Run consumers expand rooms from ACTIVE Operational Types only", () => {
    const scope = readFileSync(
      join(process.cwd(), "src/lib/todays-work/viewer-team-scope.ts"),
      "utf8",
    );
    assert.match(scope, /configuredTeamSpaceIds/);
    assert.match(scope, /selectProfileIdForOperationalTypes/);
    assert.match(scope, /"runtime"/);
    assert.doesNotMatch(scope, /OperationalAssignment/);
    assert.doesNotMatch(scope, /perspective: "working"/);
  });

  it("does not introduce a LocationProgram model or coverage fields", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /model LocationProgram\b/);
    assert.match(schema, /applicableOperationalTypeKeys String\[]/);
    assert.doesNotMatch(schema, /requiredHeadcount|minimumStaff|requiredCoverage/);
  });

  it("describeTeamApplicability language is configured scope, not today's assignment", () => {
    assert.equal(
      describeTeamApplicability({ source: "OPERATIONAL_TYPE_DEFAULT", operationalTypeName: "Servery" }),
      "Inherited from Operational Type: Servery",
    );
    assert.equal(
      describeTeamApplicability({ source: "EXPLICIT_LOCATION" }),
      "Applied directly to this location",
    );
    assert.doesNotMatch(describeTeamApplicability({ source: "EXPLICIT_LOCATION" }), /assigned today|working now|covered/i);
  });
});
