import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { organizationMembershipGrantsFacilityAccess } from "@/lib/organization-membership";

import {
  deriveMemberInvitationDisplayStatus,
  hashOrganizationMemberInvitationToken,
  isAcceptableMemberInvitation,
  mintOrganizationMemberInvitationToken,
} from "./index";

test("pending invitation expires by time without a persisted EXPIRED status", () => {
  const now = new Date("2027-06-08T00:00:00.000Z");
  const row = {
    status: "PENDING" as const,
    expiresAt: new Date("2027-06-01T00:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
  };
  assert.equal(deriveMemberInvitationDisplayStatus(row, now), "EXPIRED");
  assert.equal(isAcceptableMemberInvitation(row, now), false);
});

test("resend mints a new hash and the previous plaintext no longer matches", () => {
  const first = mintOrganizationMemberInvitationToken(new Date("2027-01-01T00:00:00.000Z"));
  const second = mintOrganizationMemberInvitationToken(new Date("2027-01-02T00:00:00.000Z"));
  assert.notEqual(first.rawToken, second.rawToken);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(hashOrganizationMemberInvitationToken(first.rawToken), first.tokenHash);
  assert.notEqual(hashOrganizationMemberInvitationToken(first.rawToken), second.tokenHash);
});

test("member administration grants zero Facility access", () => {
  assert.equal(organizationMembershipGrantsFacilityAccess(), false);
  const service = readFileSync(
    join(process.cwd(), "src/lib/organization-member-invitations/service.ts"),
    "utf8",
  );
  assert.doesNotMatch(service, /UserFacilityAccess|grantUserFacilityAccess|PartnerUserFacilityAccess/);
  assert.match(service, /revokeSessions:\s*true/);
  assert.match(service, /facilityId must not change|must not change Facility identity/);
});
