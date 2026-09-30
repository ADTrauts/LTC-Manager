import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignupEmailVerificationTemplateModel,
  SIGNUP_EMAIL_VERIFICATION_TEMPLATE_ALIAS,
} from "./signup-email-verification";

test("signup verification template alias is stable", () => {
  assert.equal(SIGNUP_EMAIL_VERIFICATION_TEMPLATE_ALIAS, "signup-email-verification");
});

test("signup verification template model uses Postmark variable names", () => {
  const model = buildSignupEmailVerificationTemplateModel({
    displayName: "  Ada  ",
    verifyUrl: "https://vssyl.com/verify-email?token=abc",
    expiresInHours: 24,
  });
  assert.deepEqual(model, {
    display_name: "Ada",
    verify_url: "https://vssyl.com/verify-email?token=abc",
    expires_in_hours: 24,
  });
});
