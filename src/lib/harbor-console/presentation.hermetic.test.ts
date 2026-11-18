import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  billingStatusLabel,
  departmentKeyLabel,
  isPaymentProblem,
  onboardingLabel,
} from "@/lib/harbor-console/presentation";

test("payment problems are past due or incomplete only", () => {
  assert.equal(isPaymentProblem("PAST_DUE"), true);
  assert.equal(isPaymentProblem("INCOMPLETE"), true);
  assert.equal(isPaymentProblem("ACTIVE"), false);
  assert.equal(isPaymentProblem("UNMANAGED"), false);
  assert.equal(isPaymentProblem("CANCELED"), false);
  assert.equal(isPaymentProblem(null), false);
});

test("onboarding label describes journey acknowledgement without asserting operation", () => {
  assert.equal(
    onboardingLabel({ onboardingCompletedAt: new Date(), onboardingCurrentStep: "billing" }),
    "Guided setup acknowledged",
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
  assert.equal(departmentKeyLabel("DIETARY"), "Food and Nutrition");
  assert.equal(departmentKeyLabel("PLANT"), "Facility Plant Operations");
  assert.equal(billingStatusLabel("PAST_DUE"), "Past due");
  assert.equal(billingStatusLabel(null), "No billing record");
});

test("Vssyl Console shell nav is Today, Customers, Marketplace — not Operations Center", () => {
  const shell = readFileSync(
    join(process.cwd(), "src/components/harbor-console/harbor-console-shell.tsx"),
    "utf8",
  );
  assert.match(shell, /VssylLockup/);
  assert.match(shell, /tone="inverse"/);
  assert.match(shell, /Vssyl Console/);
  assert.match(shell, /label: "Today"/);
  assert.match(shell, /label: "Customers"/);
  assert.match(shell, /label: "Marketplace"/);
  assert.doesNotMatch(shell, /label: "Catalog"/);
  assert.doesNotMatch(shell, /Operations Center/);
  assert.doesNotMatch(shell, />Harbor</);
});
