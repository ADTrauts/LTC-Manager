import assert from "node:assert/strict";
import test from "node:test";

import { OperationInstanceStatus } from "@prisma/client";

import { isOperationEngineEnabled } from "@/lib/feature-flags";
import {
  ACTIVE_OPERATION_INSTANCE_STATUSES,
  TERMINAL_OPERATION_INSTANCE_STATUSES,
  isActiveOperationInstanceStatus,
} from "@/lib/operations";

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

test("isOperationEngineEnabled defaults to false when unset", () => {
  withEnv("OPERATION_ENGINE_ENABLED", undefined, () => {
    assert.equal(isOperationEngineEnabled(), false);
  });
});

test("isOperationEngineEnabled parses truthy env values", () => {
  for (const value of ["true", "1", "on", "yes"]) {
    withEnv("OPERATION_ENGINE_ENABLED", value, () => {
      assert.equal(isOperationEngineEnabled(), true, value);
    });
  }
});

test("operation instance statuses partition active vs terminal lifecycle", () => {
  const all = Object.values(OperationInstanceStatus);
  const covered = new Set([...ACTIVE_OPERATION_INSTANCE_STATUSES, ...TERMINAL_OPERATION_INSTANCE_STATUSES]);
  assert.equal(covered.size, all.length);
  for (const status of all) {
    assert.equal(isActiveOperationInstanceStatus(status), !TERMINAL_OPERATION_INSTANCE_STATUSES.includes(status));
  }
});
