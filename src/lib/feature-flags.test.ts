import assert from "node:assert/strict";
import test from "node:test";

import {
  isAiBriefEnabled,
  isAiRecoveryAssistantEnabled,
  isAiShiftSummaryEnabled,
  isOperationEngineEnabled,
  isOperationalAssignmentsEnabled,
  isProjectionLocationsEnabled,
  isProjectionShadowEnabled,
  isTaskSyncEnabled,
  isTodaysWorkEnabled,
} from "@/lib/feature-flags";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

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

test("isTodaysWorkEnabled defaults to true when unset", () => {
  withEnv("TODAYS_WORK_ENABLED", undefined, () => {
    assert.equal(isTodaysWorkEnabled(), true);
  });
});

test("isOperationEngineEnabled defaults to false when unset", () => {
  withEnv("OPERATION_ENGINE_ENABLED", undefined, () => {
    assert.equal(isOperationEngineEnabled(), false);
  });
});

test("isOperationEngineEnabled parses falsey env values", () => {
  for (const value of ["false", "0", "off", "no"]) {
    withEnv("OPERATION_ENGINE_ENABLED", value, () => {
      assert.equal(isOperationEngineEnabled(), false, value);
    });
  }
});

test("isTaskSyncEnabled defaults to false when unset", () => {
  withEnv("TASK_SYNC_ENABLED", undefined, () => {
    assert.equal(isTaskSyncEnabled(), false);
  });
});

test("isTaskSyncEnabled parses truthy and falsey env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("TASK_SYNC_ENABLED", value, () => {
      assert.equal(isTaskSyncEnabled(), true, value);
    });
  }
  for (const value of ["false", "0", "off", "no"]) {
    withEnv("TASK_SYNC_ENABLED", value, () => {
      assert.equal(isTaskSyncEnabled(), false, value);
    });
  }
});

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

test("isTodaysWorkEnabled parses falsey env values", () => {
  for (const value of ["false", "0", "off", "no"]) {
    withEnv("TODAYS_WORK_ENABLED", value, () => {
      assert.equal(isTodaysWorkEnabled(), false, value);
    });
  }
});

test("resolveDefaultHomePath falls back to Business Workspace when Today's Work is disabled", () => {
  withEnv("TODAYS_WORK_ENABLED", "false", () => {
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/workspace");
  });
});

test("isOperationalAssignmentsEnabled defaults to false when unset", () => {
  withEnv("OPERATIONAL_ASSIGNMENTS_ENABLED", undefined, () => {
    assert.equal(isOperationalAssignmentsEnabled(), false);
  });
});

test("isOperationalAssignmentsEnabled parses truthy env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("OPERATIONAL_ASSIGNMENTS_ENABLED", value, () => {
      assert.equal(isOperationalAssignmentsEnabled(), true, value);
    });
  }
});

test("isOperationalAssignmentsEnabled parses falsey env values", () => {
  for (const value of ["false", "0", "off", "no"]) {
    withEnv("OPERATIONAL_ASSIGNMENTS_ENABLED", value, () => {
      assert.equal(isOperationalAssignmentsEnabled(), false, value);
    });
  }
});

test("isProjectionLocationsEnabled defaults to true when unset", () => {
  withEnv("PROJECTION_LOCATIONS_ENABLED", undefined, () => {
    assert.equal(isProjectionLocationsEnabled(), true);
  });
});

test("isProjectionLocationsEnabled can be disabled for rollback", () => {
  withEnv("PROJECTION_LOCATIONS_ENABLED", "false", () => {
    assert.equal(isProjectionLocationsEnabled(), false);
  });
});

test("isProjectionShadowEnabled defaults to false when unset", () => {
  withEnv("PROJECTION_SHADOW_ENABLED", undefined, () => {
    assert.equal(isProjectionShadowEnabled(), false);
  });
});
