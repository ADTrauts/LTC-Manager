import assert from "node:assert/strict";
import test from "node:test";

import { RepairStatus } from "@prisma/client";

import { mapRepairStatusToRecoveryStage } from "@/lib/work/issues/issue-copy";

test("report → assign → start → close recovery stages", () => {
  const stages: Array<{
    status: RepairStatus;
    assignedEmployeeId: string | null;
    expected: ReturnType<typeof mapRepairStatusToRecoveryStage>;
  }> = [
    { status: RepairStatus.OPEN, assignedEmployeeId: null, expected: "REPORTED" },
    { status: RepairStatus.OPEN, assignedEmployeeId: "e1", expected: "ASSIGNED" },
    { status: RepairStatus.IN_PROGRESS, assignedEmployeeId: "e1", expected: "IN_PROGRESS" },
    { status: RepairStatus.WAITING_PARTS, assignedEmployeeId: "e1", expected: "WAITING" },
    { status: RepairStatus.CLOSED, assignedEmployeeId: "e1", expected: "RESOLVED" },
  ];

  for (const row of stages) {
    assert.equal(
      mapRepairStatusToRecoveryStage({
        status: row.status,
        assignedEmployeeId: row.assignedEmployeeId,
      }),
      row.expected,
    );
  }
});

test("reopen mapping: closed with assignee prefers IN_PROGRESS after reopen", () => {
  assert.equal(
    mapRepairStatusToRecoveryStage({
      status: RepairStatus.IN_PROGRESS,
      assignedEmployeeId: "e1",
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    mapRepairStatusToRecoveryStage({
      status: RepairStatus.OPEN,
      assignedEmployeeId: null,
    }),
    "REPORTED",
  );
});
