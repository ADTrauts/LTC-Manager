/**
 * Phase 12A Operational Requests — hermetic authority / routing validation.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  isDepartmentAssetOperationsEnabled,
  isDepartmentJobFlowEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import {
  decideOperationalRequestAuthority,
  presentRequestAuthority,
  presentRequesterStatus,
  requesterVisibleStatusLabel,
} from "@/lib/operational-requests";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("shared engines stay on for Dietary, EVS, and Plant keys", () => {
  assert.equal(isDepartmentJobFlowEnabled("PLANT"), true);
  assert.equal(isDepartmentWorkPlansEnabled("PLANT"), true);
  assert.equal(isDepartmentAssetOperationsEnabled("PLANT"), true);
  assert.equal(isDepartmentJobFlowEnabled("EVS"), true);
  assert.equal(isDepartmentWorkPlansEnabled("DIETARY"), true);
  assert.equal(isDepartmentJobFlowEnabled(null), false);
});

test("Plant authority: FA alone denied; STAFF report only; SUPERVISOR triage; MANAGER routes", () => {
  withEnv("PLANT_OPERATIONS_ENABLED", "true", () => {
    const base = {
      flagEnabled: true,
      authMethod: "PASSWORD" as const,
      sessionFacilityId: "fac1",
      facilityId: "fac1",
      departmentId: "plant1",
      departmentExists: true,
      departmentKey: "PLANT",
      primaryDepartmentId: null as string | null,
    };

    const fa = decideOperationalRequestAuthority({
      ...base,
      role: "FACILITY_ADMINISTRATOR",
      primaryDepartmentId: "other",
    });
    assert.equal(fa.canTriage, false);
    assert.equal(fa.canManageWorkOrders, false);
    assert.match(fa.reason ?? "", /Facility Administrator status alone/);

    const staff = decideOperationalRequestAuthority({
      ...base,
      role: "STAFF",
    });
    assert.equal(staff.canReport, true);
    assert.equal(staff.canTriage, false);
    assert.equal(staff.canManageWorkOrders, false);
    assert.equal(staff.canConfigureRoutes, false);

    const techAssigned = decideOperationalRequestAuthority({
      ...base,
      role: "STAFF",
      isAssignedTechnician: true,
    });
    assert.equal(techAssigned.canActOnAssignedWorkOrder, true);

    const supervisor = decideOperationalRequestAuthority({
      ...base,
      role: "SUPERVISOR",
    });
    assert.equal(supervisor.canTriage, true);
    assert.equal(supervisor.canManageWorkOrders, true);
    assert.equal(supervisor.canConfigureRoutes, false);

    const manager = decideOperationalRequestAuthority({
      ...base,
      role: "MANAGER",
    });
    assert.equal(manager.canConfigureRoutes, true);
    assert.equal(manager.canManageVendors, true);
    assert.equal(manager.canReturnAssetToService, true);
  });
});

test("Quick PIN never grants Plant Build / WO manage / RTS", () => {
  withEnv("PLANT_OPERATIONS_ENABLED", "true", () => {
    const pinManager = decideOperationalRequestAuthority({
      flagEnabled: true,
      role: "MANAGER",
      authMethod: "QUICK_PIN",
      sessionFacilityId: "fac1",
      facilityId: "fac1",
      departmentId: "plant1",
      departmentExists: true,
      departmentKey: "PLANT",
      primaryDepartmentId: "plant1",
    });
    assert.equal(pinManager.canReport, true);
    assert.equal(pinManager.canManageWorkOrders, false);
    assert.equal(pinManager.canConfigureRoutes, false);
    assert.equal(pinManager.canReturnAssetToService, false);
    assert.equal(pinManager.canManageVendors, false);
  });
});

test("cross-facility Plant authority fails closed", () => {
  const denied = decideOperationalRequestAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "facA",
    facilityId: "facB",
    departmentId: "plant1",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant1",
  });
  assert.equal(denied.canReport, false);
  assert.match(denied.reason ?? "", /Cross-facility/);
});

test("requester-visible status labels avoid private triage language", () => {
  assert.equal(requesterVisibleStatusLabel("REPORTED"), "Reported");
  assert.equal(requesterVisibleStatusLabel("UNDER_REVIEW"), "Under review");
  assert.equal(requesterVisibleStatusLabel("WAITING_ON_VENDOR"), "Waiting on vendor");
  assert.equal(requesterVisibleStatusLabel("WORK_IN_PROGRESS"), "Work in progress");
  assert.doesNotMatch(requesterVisibleStatusLabel("UNDER_REVIEW"), /triage/i);
});

test("authoritative Request state is not Work Order execution", () => {
  assert.equal(presentRequestAuthority("UNDER_REVIEW"), "ACCEPTED");
  assert.equal(
    presentRequesterStatus({
      status: "UNDER_REVIEW",
      workOrderStatus: "IN_PROGRESS",
    }),
    "IN_PROGRESS",
  );
});

test("request authority denies when the caller passes the engine off", () => {
  const denied = decideOperationalRequestAuthority({
    flagEnabled: false,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "fac1",
    facilityId: "fac1",
    departmentId: "plant1",
    departmentExists: true,
    departmentKey: "PLANT",
    primaryDepartmentId: "plant1",
  });
  assert.equal(denied.canTriage, false);
  assert.equal(denied.canManageWorkOrders, false);
});

test("Dietary requester department key does not grant Plant triage", () => {
  const dietary = decideOperationalRequestAuthority({
    flagEnabled: true,
    role: "MANAGER",
    authMethod: "PASSWORD",
    sessionFacilityId: "fac1",
    facilityId: "fac1",
    departmentId: "dietary1",
    departmentExists: true,
    departmentKey: "DIETARY",
    primaryDepartmentId: "dietary1",
  });
  assert.equal(dietary.canReport, true);
  assert.equal(dietary.canTriage, false);
  assert.equal(dietary.canManageWorkOrders, false);
  assert.equal(dietary.canConfigureRoutes, false);
});
