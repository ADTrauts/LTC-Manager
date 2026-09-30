import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_INVITE_TEMPLATE_ALIAS,
  buildAccountInviteTemplateModel,
} from "./account-invite";

test("account invite template alias is stable", () => {
  assert.equal(ACCOUNT_INVITE_TEMPLATE_ALIAS, "account-invite");
});

test("account invite template model uses Postmark variable names", () => {
  const model = buildAccountInviteTemplateModel({
    displayName: "  Ada  ",
    facilityDisplayName: " Terrace View ",
    inviteUrl: "https://vssyl.com/accept-invite?token=abc",
    expiresInDays: 7,
  });
  assert.deepEqual(model, {
    display_name: "Ada",
    facility_name: "Terrace View",
    invite_url: "https://vssyl.com/accept-invite?token=abc",
    expires_in_days: 7,
  });
});
