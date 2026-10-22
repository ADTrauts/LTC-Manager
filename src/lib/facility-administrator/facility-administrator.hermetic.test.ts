import assert from "node:assert/strict";
import test from "node:test";

import { RoleKey } from "@prisma/client";

import { buildFacilityAdministratorInvitationBodies } from "@/lib/email/facility-administrator-invitation";
import { PEOPLE_ASSIGNABLE_AUTHORITIES } from "@/lib/employee-hr-labels";
import {
  FACILITY_ADMINISTRATOR_ASSIGN_REFUSAL,
  FACILITY_ADMINISTRATOR_CHANGE_REFUSAL,
  facilityAdministratorRoleEditRefusal,
} from "@/lib/facility-access/administrator-seat";

import { groupFacilityAdministratorConflicts } from "./report";
import {
  DEFAULT_OUTGOING_ROLE,
  holderGoneReason,
  invitationIsLive,
  isOutgoingRoleChoice,
  organizationMayAppoint,
  OUTGOING_ROLE_CHOICES,
  type FacilityAdministratorHolder,
} from "./rules";

const holder: FacilityAdministratorHolder = {
  userId: "u1",
  displayName: "Ada",
  email: "ada@example.test",
  periodId: "p1",
  since: new Date("2026-01-01T00:00:00Z"),
};

test("outgoing role choices are General Manager, Manager or Supervisor, defaulting to Manager", () => {
  assert.deepEqual([...OUTGOING_ROLE_CHOICES], [RoleKey.GM, RoleKey.MANAGER, RoleKey.SUPERVISOR]);
  assert.equal(DEFAULT_OUTGOING_ROLE, RoleKey.MANAGER);
  for (const key of Object.values(RoleKey)) {
    assert.equal(isOutgoingRoleChoice(key), (OUTGOING_ROLE_CHOICES as readonly string[]).includes(key), key);
  }
  assert.equal(isOutgoingRoleChoice(RoleKey.FACILITY_ADMINISTRATOR), false);
  assert.equal(isOutgoingRoleChoice(null), false);
});

test("a holder is gone when the account, the facility access or the employment has ended", () => {
  assert.equal(holderGoneReason({ userActive: true, accessActive: true, employmentEnded: false }), null);
  assert.equal(holderGoneReason({ userActive: false, accessActive: true, employmentEnded: false }), "ACCOUNT_INACTIVE");
  assert.equal(holderGoneReason({ userActive: true, accessActive: false, employmentEnded: false }), "ACCESS_ENDED");
  assert.equal(holderGoneReason({ userActive: true, accessActive: true, employmentEnded: true }), "EMPLOYMENT_ENDED");
  assert.equal(holderGoneReason({ userActive: false, accessActive: false, employmentEnded: true }), "ACCOUNT_INACTIVE");
});

test("the organization may appoint only when the seat is empty or its holder is gone", () => {
  assert.equal(organizationMayAppoint({ kind: "EMPTY" }), true);
  assert.equal(organizationMayAppoint({ kind: "GONE", holder, reason: "ACCESS_ENDED" }), true);
  assert.equal(organizationMayAppoint({ kind: "HELD", holder }), false);
});

test("an invitation is live only while pending and before it expires", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const later = new Date("2026-10-22T12:00:00Z");
  assert.equal(invitationIsLive({ status: "PENDING", expiresAt: later }, now), true);
  assert.equal(invitationIsLive({ status: "PENDING", expiresAt: now }, now), false);
  for (const status of ["ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"] as const) {
    assert.equal(invitationIsLive({ status, expiresAt: later }, now), false, status);
  }
});

test("People never assigns or removes Facility Administrator", () => {
  assert.equal(PEOPLE_ASSIGNABLE_AUTHORITIES.includes(RoleKey.FACILITY_ADMINISTRATOR), false);
  assert.equal(PEOPLE_ASSIGNABLE_AUTHORITIES.length, Object.values(RoleKey).length - 1);

  const refuse = (holdsAdministratorSeat: boolean, requestedRoleType: RoleKey) =>
    facilityAdministratorRoleEditRefusal({ holdsAdministratorSeat, requestedRoleType });
  assert.equal(refuse(false, RoleKey.MANAGER), null);
  assert.equal(refuse(true, RoleKey.FACILITY_ADMINISTRATOR), null);
  assert.equal(refuse(false, RoleKey.FACILITY_ADMINISTRATOR), FACILITY_ADMINISTRATOR_ASSIGN_REFUSAL);
  assert.equal(refuse(true, RoleKey.GM), FACILITY_ADMINISTRATOR_CHANGE_REFUSAL);
  assert.equal(refuse(true, RoleKey.STAFF), FACILITY_ADMINISTRATOR_CHANGE_REFUSAL);
});

test("the rollout report lists only facilities claimed by more than one person", () => {
  const facilities = new Map([
    ["f-a", { name: "Alder", organizationName: "Org" }],
    ["f-b", { name: "Birch", organizationName: "Org" }],
  ]);
  const period = (periodId: string, facilityId: string, userId: string, startsAt: string) => ({
    periodId,
    facilityId,
    userId,
    email: `${userId}@example.test`,
    displayName: userId,
    startsAt: new Date(startsAt),
  });
  const conflicts = groupFacilityAdministratorConflicts({
    openPeriods: [
      period("p2", "f-b", "late", "2026-03-01T00:00:00Z"),
      period("p1", "f-b", "early", "2026-01-01T00:00:00Z"),
      period("p3", "f-a", "solo", "2026-01-01T00:00:00Z"),
    ],
    homeAdministrators: [
      { userId: "early", email: "early@example.test", displayName: "early", homeFacilityId: "f-b" },
      { userId: "pending", email: "pending@example.test", displayName: "pending", homeFacilityId: "f-a" },
    ],
    facilities,
  });
  assert.deepEqual(
    conflicts.map((conflict) => [conflict.facilityName, conflict.claims.map((claim) => `${claim.userId}:${claim.kind}`)]),
    [
      ["Alder", ["solo:current", "pending:home_role"]],
      ["Birch", ["early:current", "late:current"]],
    ],
  );
  assert.deepEqual(
    groupFacilityAdministratorConflicts({ openPeriods: [period("p3", "f-a", "solo", "2026-01-01T00:00:00Z")], homeAdministrators: [], facilities }),
    [],
  );
});

test("the invitation email names the facility and escapes HTML", () => {
  const bodies = buildFacilityAdministratorInvitationBodies({
    facilityDisplayName: "Oak <Hall>",
    invitedByName: "Ada",
    kind: "TRANSFER",
    reviewUrl: "https://example.test/account/facility-administrator",
    expiresInDays: 7,
  });
  assert.match(bodies.subject, /Facility Administrator of Oak <Hall>/);
  assert.match(bodies.text, /Nothing changes until you accept/);
  assert.match(bodies.html, /Oak &lt;Hall&gt;/);
  assert.doesNotMatch(bodies.html, /<Hall>/);
  const recovery = buildFacilityAdministratorInvitationBodies({
    facilityDisplayName: "Oak",
    invitedByName: "Org Admin",
    kind: "RECOVERY",
    reviewUrl: "https://example.test/account/facility-administrator",
    expiresInDays: 7,
  });
  assert.match(recovery.text, /organization/);
});
