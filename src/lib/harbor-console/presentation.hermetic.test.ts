import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  billingStatusLabel,
  departmentKeyLabel,
  isPaymentProblem,
  isStuckSetup,
  onboardingLabel,
} from "@/lib/harbor-console/presentation";

test("stuck setup is any facility that has not completed onboarding", () => {
  assert.equal(isStuckSetup(null), true);
  assert.equal(isStuckSetup(undefined), true);
  assert.equal(isStuckSetup(new Date("2026-09-17T12:00:00.000Z")), false);
});

test("payment problems are past due or incomplete only", () => {
  assert.equal(isPaymentProblem("PAST_DUE"), true);
  assert.equal(isPaymentProblem("INCOMPLETE"), true);
  assert.equal(isPaymentProblem("ACTIVE"), false);
  assert.equal(isPaymentProblem("UNMANAGED"), false);
  assert.equal(isPaymentProblem("CANCELED"), false);
  assert.equal(isPaymentProblem(null), false);
});

test("onboarding label prefers Live once complete", () => {
  assert.equal(
    onboardingLabel({ onboardingCompletedAt: new Date(), onboardingCurrentStep: "billing" }),
    "Live",
  );
  assert.equal(
    onboardingLabel({ onboardingCompletedAt: null, onboardingCurrentStep: "locations" }),
    "Setup: locations",
  );
  assert.equal(
    onboardingLabel({ onboardingCompletedAt: null, onboardingCurrentStep: null }),
    "Setup not started",
  );
});

test("department and billing labels stay readable", () => {
  assert.equal(departmentKeyLabel("DIETARY"), "Dietary");
  assert.equal(billingStatusLabel("PAST_DUE"), "Past due");
  assert.equal(billingStatusLabel(null), "No billing record");
});

test("Harbor shell nav is Today, Customers, Marketplace — not Operations Center", () => {
  const shell = readFileSync(
    join(process.cwd(), "src/components/harbor-console/harbor-console-shell.tsx"),
    "utf8",
  );
  assert.match(shell, /Harbor Console/);
  assert.match(shell, /label: "Today"/);
  assert.match(shell, /label: "Customers"/);
  assert.match(shell, /label: "Marketplace"/);
  assert.doesNotMatch(shell, /label: "Catalog"/);
  assert.doesNotMatch(shell, /Operations Center/);
});
