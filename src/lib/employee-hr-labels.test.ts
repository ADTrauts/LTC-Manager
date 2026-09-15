import assert from "node:assert/strict";
import test from "node:test";

import { EmployeeStatus, EmploymentType } from "@prisma/client";

import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  employeeStatusLabel,
  employmentTypeLabel,
} from "@/lib/employee-hr-labels";

test("employmentTypeLabel humanizes EmploymentType enums", () => {
  assert.equal(employmentTypeLabel(EmploymentType.FULL_TIME), "Full time");
  assert.equal(employmentTypeLabel(EmploymentType.PART_TIME), "Part time");
  assert.equal(employmentTypeLabel(EmploymentType.PER_DIEM), "Per diem");
  assert.equal(EMPLOYMENT_TYPE_LABEL.FULL_TIME, "Full time");
});

test("employeeStatusLabel humanizes EmployeeStatus enums", () => {
  assert.equal(employeeStatusLabel(EmployeeStatus.ACTIVE), "Active");
  assert.equal(employeeStatusLabel(EmployeeStatus.OFF), "Off");
  assert.equal(employeeStatusLabel(EmployeeStatus.TERMINATED), "Terminated");
  assert.equal(EMPLOYEE_STATUS_LABEL.ACTIVE, "Active");
});
