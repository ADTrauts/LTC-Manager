import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isAiBriefEnabled,
  isAiRecoveryAssistantEnabled,
  isAiShiftSummaryEnabled,
  isProjectionShadowEnabled,
} from "@/lib/feature-flags";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test("isAiBriefEnabled defaults to false when unset", () => {
  withEnv("AI_BRIEF_ENABLED", undefined, () => {
    assert.equal(isAiBriefEnabled(), false);
  });
});

test("isAiBriefEnabled parses truthy env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("AI_BRIEF_ENABLED", value, () => {
      assert.equal(isAiBriefEnabled(), true, value);
    });
  }
});

test("isAiShiftSummaryEnabled defaults to false when unset", () => {
  withEnv("AI_SHIFT_SUMMARY_ENABLED", undefined, () => {
    assert.equal(isAiShiftSummaryEnabled(), false);
  });
});

test("isAiShiftSummaryEnabled parses truthy env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("AI_SHIFT_SUMMARY_ENABLED", value, () => {
      assert.equal(isAiShiftSummaryEnabled(), true, value);
    });
  }
});

test("isAiRecoveryAssistantEnabled defaults to false when unset", () => {
  withEnv("AI_RECOVERY_ASSISTANT_ENABLED", undefined, () => {
    assert.equal(isAiRecoveryAssistantEnabled(), false);
  });
});

test("isAiRecoveryAssistantEnabled parses truthy env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("AI_RECOVERY_ASSISTANT_ENABLED", value, () => {
      assert.equal(isAiRecoveryAssistantEnabled(), true, value);
    });
  }
});

test("isProjectionShadowEnabled defaults to false when unset", () => {
  withEnv("PROJECTION_SHADOW_ENABLED", undefined, () => {
    assert.equal(isProjectionShadowEnabled(), false);
  });
});

test("department capability switches are gone from the flag module", () => {
  const flags = readFileSync("src/lib/feature-flags.ts", "utf8");
  for (const name of [
    "TASK_SYNC_ENABLED",
    "isTaskSyncEnabled",
    "DEPARTMENT_OPERATIONAL_PROFILES_ENABLED",
    "isDepartmentOperationalProfilesEnabled",
    "OPERATIONAL_ASSIGNMENTS_ENABLED",
    "isOperationalAssignmentsEnabled",
    "DIETARY_OPERATIONAL_CYCLES_ENABLED",
    "isDietaryOperationalCyclesEnabled",
    "DIETARY_JOB_FLOW_ENABLED",
    "isDietaryJobFlowEnabled",
    "DIETARY_OPERATIONAL_EVIDENCE_ENABLED",
    "isDietaryOperationalEvidenceEnabled",
    "DIETARY_ASSET_OPERATIONS_ENABLED",
    "isDietaryAssetOperationsEnabled",
    "DIETARY_WORK_PLANS_ENABLED",
    "isDietaryWorkPlansEnabled",
    "EVS_OPERATIONS_ENABLED",
    "isEvsOperationsEnabled",
    "PLANT_OPERATIONS_ENABLED",
    "isPlantOperationsEnabled",
    "isPlantOperationsDevelopmentOverrideEnabled",
  ]) {
    assert.equal(flags.includes(name), false, name);
  }
});
