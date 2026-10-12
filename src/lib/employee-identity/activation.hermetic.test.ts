import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_ACTIVATION_GRACE_MS,
  ACCOUNT_ACTIVATION_REQUIRED_MESSAGE,
  getAccountActivationDeadline,
  isGlobalAccountActivated,
  isWithinPinActivationGrace,
  pinActivationDenied,
  presentEmployeeAccountState,
} from "./activation";

const createdAt = new Date("2026-01-01T00:00:00.000Z");

test("isGlobalAccountActivated requires active + password + verified email", () => {
  assert.equal(
    isGlobalAccountActivated({
      isActive: true,
      passwordHash: "hash",
      emailVerifiedAt: new Date(),
    }),
    true,
  );
  assert.equal(
    isGlobalAccountActivated({
      isActive: false,
      passwordHash: "hash",
      emailVerifiedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    isGlobalAccountActivated({
      isActive: true,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    }),
    false,
  );
  assert.equal(
    isGlobalAccountActivated({
      isActive: true,
      passwordHash: "hash",
      emailVerifiedAt: null,
    }),
    false,
  );
});

test("PIN grace is 30 days from User.createdAt and is not per Facility", () => {
  const deadline = getAccountActivationDeadline({ createdAt });
  assert.equal(deadline.getTime() - createdAt.getTime(), ACCOUNT_ACTIVATION_GRACE_MS);
  assert.equal(isWithinPinActivationGrace({ createdAt }, new Date(createdAt.getTime() + 29 * 24 * 60 * 60 * 1000)), true);
  assert.equal(isWithinPinActivationGrace({ createdAt }, deadline), true);
  assert.equal(
    isWithinPinActivationGrace({ createdAt }, new Date(deadline.getTime() + 1)),
    false,
  );
});

test("historical unlinked Employees are not activation-gated", () => {
  assert.equal(pinActivationDenied(null, null), false);
  assert.equal(
    pinActivationDenied(null, {
      isActive: true,
      passwordHash: null,
      emailVerifiedAt: null,
      createdAt,
    }),
    false,
  );
});

test("pending User after deadline is denied; activated User is not", () => {
  const pending = {
    isActive: true,
    passwordHash: null,
    emailVerifiedAt: null,
    createdAt,
  };
  assert.equal(pinActivationDenied("user_1", pending, new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)), false);
  assert.equal(
    pinActivationDenied("user_1", pending, new Date(createdAt.getTime() + ACCOUNT_ACTIVATION_GRACE_MS + 1)),
    true,
  );
  assert.equal(
    pinActivationDenied(
      "user_1",
      { ...pending, passwordHash: "hash", emailVerifiedAt: new Date() },
      new Date(createdAt.getTime() + ACCOUNT_ACTIVATION_GRACE_MS + 1),
    ),
    false,
  );
  assert.equal(ACCOUNT_ACTIVATION_REQUIRED_MESSAGE, "Account activation required");
});

test("employer-facing account copy uses activation language", () => {
  assert.equal(presentEmployeeAccountState(null).label, "Account not linked");
  assert.equal(
    presentEmployeeAccountState({
      isActive: true,
      passwordHash: "hash",
      emailVerifiedAt: new Date(),
      createdAt,
    }).label,
    "Account active",
  );
  const pending = presentEmployeeAccountState(
    {
      isActive: true,
      passwordHash: null,
      emailVerifiedAt: null,
      createdAt,
    },
    new Date(createdAt.getTime() + 12 * 24 * 60 * 60 * 1000),
  );
  assert.equal(pending.kind, "pending");
  assert.match(pending.label, /Activation pending/);
  assert.equal(
    presentEmployeeAccountState(
      {
        isActive: true,
        passwordHash: null,
        emailVerifiedAt: null,
        createdAt,
      },
      new Date(createdAt.getTime() + ACCOUNT_ACTIVATION_GRACE_MS + 1),
    ).kind,
    "overdue",
  );
});
