import assert from "node:assert/strict";
import test from "node:test";
import { RoleKey } from "@prisma/client";

import {
  INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE,
  INITIAL_FACILITY_CREATOR_USER_ROLE,
  initialFacilityCreatorRoles,
  isFacilityCreatorUserRole,
} from "./signup-facility-creator";

test("public signup assigns Facility Administrator to the creator User and Employee", () => {
  const roles = initialFacilityCreatorRoles();
  assert.equal(roles.userRoleKey, "FACILITY_ADMINISTRATOR");
  assert.equal(INITIAL_FACILITY_CREATOR_USER_ROLE, "FACILITY_ADMINISTRATOR");
  assert.equal(roles.employeeRoleType, RoleKey.FACILITY_ADMINISTRATOR);
  assert.equal(INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE, RoleKey.FACILITY_ADMINISTRATOR);
  assert.equal(isFacilityCreatorUserRole("FACILITY_ADMINISTRATOR"), true);
  assert.equal(isFacilityCreatorUserRole("GM"), false);
});
