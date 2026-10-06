import assert from "node:assert/strict";
import test from "node:test";

import { isAssignedWorkOrderTechnician } from "./work-order-actor";

test("password-login Users match the assigned Employee by operational id", () => {
  assert.equal(
    isAssignedWorkOrderTechnician({
      assignedEmployeeId: "emp-1",
      operationalEmployeeId: "emp-1",
      sessionUid: "user-1",
      authKind: "user",
    }),
    true,
  );
});

test("PIN employees still match assignedEmployeeId to session uid", () => {
  assert.equal(
    isAssignedWorkOrderTechnician({
      assignedEmployeeId: "emp-1",
      operationalEmployeeId: "emp-1",
      sessionUid: "emp-1",
      authKind: "employee",
    }),
    true,
  );
});

test("a different technician is not the assignee", () => {
  assert.equal(
    isAssignedWorkOrderTechnician({
      assignedEmployeeId: "emp-1",
      operationalEmployeeId: "emp-2",
      sessionUid: "user-2",
      authKind: "user",
    }),
    false,
  );
});
