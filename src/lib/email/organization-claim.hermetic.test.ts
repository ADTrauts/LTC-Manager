import assert from "node:assert/strict";
import test from "node:test";

import {
  ORGANIZATION_CLAIM_TEMPLATE_ALIAS,
  buildOrganizationClaimTemplateModel,
  buildOrganizationClaimTransactionalBodies,
  sendOrganizationClaimEmail,
} from "@/lib/email/organization-claim";
import { resetPostmarkClientForTests } from "@/lib/email/send-transactional";

test("organization claim template model stays non-sensitive", () => {
  const model = buildOrganizationClaimTemplateModel({
    contactName: "Jane",
    organizationName: "Metz Culinary Management",
    claimUrl: "https://example.test/organization/claim/token",
    expiresInDays: 7,
  });
  assert.equal(model.contact_name, "Jane");
  assert.equal(model.organization_name, "Metz Culinary Management");
  assert.equal(model.claim_url, "https://example.test/organization/claim/token");
  assert.equal(model.expires_in_days, 7);
  assert.equal(ORGANIZATION_CLAIM_TEMPLATE_ALIAS, "organization-claim");
});

test("transactional fallback bodies include org name, expiry, and claim link only", () => {
  const bodies = buildOrganizationClaimTransactionalBodies({
    contactName: null,
    organizationName: "Metz",
    claimUrl: "https://example.test/organization/claim/abc",
    expiresInDays: 7,
  });
  assert.match(bodies.subject, /Metz/);
  assert.match(bodies.text, /https:\/\/example\.test\/organization\/claim\/abc/);
  assert.match(bodies.text, /7 days/);
  assert.doesNotMatch(bodies.text, /platformStaff|tokenHash|facilityId/i);
  assert.match(bodies.html, /Accept organization claim/);
});

test("sendOrganizationClaimEmail falls back to transactional when template send fails", async () => {
  resetPostmarkClientForTests();
  const previous = process.env.POSTMARK_SERVER_TOKEN;
  process.env.POSTMARK_SERVER_TOKEN = "test-token";

  let templateCalls = 0;
  let transactionalCalls = 0;
  const client = {
    sendEmailWithTemplate: async () => {
      templateCalls += 1;
      throw new Error("Template organization-claim not found");
    },
    sendEmail: async () => {
      transactionalCalls += 1;
      return { MessageID: "msg_claim_fallback" };
    },
  };

  try {
    const result = await sendOrganizationClaimEmail(
      {
        to: "admin@metz.example",
        contactName: "Jane",
        organizationName: "Metz",
        claimUrl: "https://example.test/organization/claim/tok",
        expiresInDays: 7,
      },
      { client: client as never },
    );
    assert.equal(result.sent, true);
    assert.equal(result.messageId, "msg_claim_fallback");
    assert.equal(templateCalls, 1);
    assert.equal(transactionalCalls, 1);
  } finally {
    if (previous === undefined) delete process.env.POSTMARK_SERVER_TOKEN;
    else process.env.POSTMARK_SERVER_TOKEN = previous;
    resetPostmarkClientForTests();
  }
});
