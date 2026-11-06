import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPARTMENT_OWNER_KINDS,
  resolveDepartmentOwner,
  type DepartmentOwnerKind,
} from "./owners";

type Call = { model: string; method: string; args: { where?: unknown; select?: unknown } };

/** Every delegate answers from `rows[model]` (or null) and records the query. */
function recordingDb(rows: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const db = new Proxy(
    {},
    {
      get(_target, model: string) {
        return new Proxy(
          {},
          {
            get(_inner, method: string) {
              return async (args: Call["args"]) => {
                calls.push({ model, method, args });
                return rows[model] ?? null;
              };
            },
          },
        );
      },
    },
  );
  return { db: db as never, calls };
}

const input = { facilityId: "fac_tv", id: "rec_1" };

test("owner kinds cover the CDA architecture §4 table", () => {
  const expected: DepartmentOwnerKind[] = [
    "department",
    "workforceRecord",
    "jobRole",
    "scheduleEntry",
    "callOffOverride",
    "operationalAssignment",
    "assignmentPlan",
    "assignmentTemplate",
    "departmentZone",
    "operationalCycle",
    "cycleDayExpectation",
    "keyTimeDayExpectation",
    "locationFunctionProfile",
    "roomArchetype",
    "roomBinding",
    "departmentTeam",
    "departmentTeamCycle",
    "workPlan",
    "workOccurrence",
    "menu",
    "logAttachment",
    "logTypeDefault",
    "logSuppression",
    "evidenceTemplate",
    "evidenceRecord",
    "recordWaiver",
    "operationalRequest",
    "requestRoute",
    "repair",
    "asset",
    "assetIssue",
    "pmPlan",
    "pmOccurrence",
    "inspectionDefinition",
    "knowledgeArticle",
    "legacyLogTemplate",
    "serveryMilestone",
  ];
  assert.deepEqual([...DEPARTMENT_OWNER_KINDS].sort(), [...expected].sort());
});

test("every owner resolver scopes its lookup to the facility and returns null when missing", async () => {
  const retired = new Set(["callOffOverride", "legacyLogTemplate", "evidenceTemplate", "inspectionDefinition"]);
  for (const kind of DEPARTMENT_OWNER_KINDS) {
    const { db, calls } = recordingDb();
    const owner = await resolveDepartmentOwner(db, kind, input);
    assert.equal(owner, null, `${kind}: missing record`);
    if (retired.has(kind)) continue;
    assert.ok(calls.length > 0, `${kind}: queried`);
    const first = calls[0]!;
    assert.equal(first.method, "findFirst", `${kind}: single-record lookup`);
    const where = JSON.stringify(first.args.where);
    assert.ok(where.includes('"fac_tv"'), `${kind}: facility-scoped (${where})`);
    assert.ok(where.includes('"rec_1"'), `${kind}: record id (${where})`);
  }
});

test("Department-owned records return their departmentId", async () => {
  const direct: DepartmentOwnerKind[] = [
    "jobRole",
    "operationalAssignment",
    "assignmentPlan",
    "assignmentTemplate",
    "departmentZone",
    "operationalCycle",
    "cycleDayExpectation",
    "keyTimeDayExpectation",
    "locationFunctionProfile",
    "departmentTeam",
    "departmentTeamCycle",
    "workPlan",
    "workOccurrence",
    "menu",
    "logAttachment",
    "logTypeDefault",
    "logSuppression",
    "evidenceRecord",
    "recordWaiver",
    "assetIssue",
    "pmPlan",
  ];
  for (const kind of direct) {
    const { db } = recordingDb(
      Object.fromEntries(
        [
          "departmentJobRole",
          "operationalAssignment",
          "operationalAssignmentPlan",
          "operationalAssignmentTemplate",
          "departmentOperationalZone",
          "departmentOperationalCycle",
          "operationalCycleDayExpectation",
          "operationalCycleKeyTimeDayExpectation",
          "departmentOperationalProfile",
          "departmentTeam",
          "departmentTeamCycle",
          "departmentWorkPlan",
          "departmentWorkOccurrence",
          "menu",
          "logAttachment",
          "departmentFacilityTypeLogDefault",
          "departmentLocationLogSuppression",
          "operationalTemplate",
          "operationalEvidenceRecord",
          "operationalRecordWaiver",
          "assetIssue",
          "preventiveMaintenancePlan",
        ].map((model) => [model, { departmentId: "dept_evs" }]),
      ),
    );
    assert.deepEqual(await resolveDepartmentOwner(db, kind, input), { kind: "department", departmentId: "dept_evs" }, kind);
  }
});

test("Location Function room types and bindings belong to the profile's Department", async () => {
  const { db } = recordingDb({
    departmentRoomArchetype: { profile: { departmentId: "dept_fn" } },
    departmentRoomArchetypeBinding: { profile: { departmentId: "dept_evs" } },
  });
  assert.deepEqual(await resolveDepartmentOwner(db, "roomArchetype", input), {
    kind: "department",
    departmentId: "dept_fn",
  });
  assert.deepEqual(await resolveDepartmentOwner(db, "roomBinding", input), {
    kind: "department",
    departmentId: "dept_evs",
  });
});

test("workforce records belong to each of their Departments", async () => {
  const { db } = recordingDb({
    employee: {
      primaryDepartmentId: "dept_evs",
      employeeDepartments: [{ departmentId: "dept_plant" }, { departmentId: "dept_evs" }],
    },
  });
  assert.deepEqual(await resolveDepartmentOwner(db, "workforceRecord", input), {
    kind: "workforce",
    primaryDepartmentId: "dept_evs",
    departmentIds: ["dept_evs", "dept_plant"],
  });
});

test("shifts: the shift's Department, else the employee's primary Department", async () => {
  const shift = recordingDb({ scheduleEntry: { departmentId: "dept_fn", employee: { primaryDepartmentId: "dept_evs" } } });
  assert.deepEqual(await resolveDepartmentOwner(shift.db, "scheduleEntry", input), {
    kind: "department",
    departmentId: "dept_fn",
  });
  const legacyEntry = recordingDb({ scheduleEntry: { departmentId: null, employee: { primaryDepartmentId: "dept_evs" } } });
  assert.deepEqual(await resolveDepartmentOwner(legacyEntry.db, "scheduleEntry", input), {
    kind: "department",
    departmentId: "dept_evs",
  });
  const orphan = recordingDb({ scheduleEntry: { departmentId: null, employee: { primaryDepartmentId: null } } });
  assert.deepEqual(await resolveDepartmentOwner(orphan.db, "scheduleEntry", input), { kind: "unowned" });
  assert.equal(await resolveDepartmentOwner(recordingDb().db, "callOffOverride", input), null);
});

test("records without a Department fall back to shared facility or unowned", async () => {
  const empty = recordingDb({
    logTemplate: { departmentId: null },
    inspectionDefinition: { departmentId: null },
    knowledgeArticle: { departmentId: null },
    asset: { departmentId: null },
    repair: { responsibleDepartmentId: null },
  });
  assert.equal(await resolveDepartmentOwner(empty.db, "legacyLogTemplate", input), null);
  assert.equal(await resolveDepartmentOwner(empty.db, "inspectionDefinition", input), null);
  assert.deepEqual(await resolveDepartmentOwner(empty.db, "knowledgeArticle", input), { kind: "sharedFacility" });
  assert.deepEqual(await resolveDepartmentOwner(empty.db, "asset", input), { kind: "unowned" });
  assert.deepEqual(await resolveDepartmentOwner(empty.db, "repair", input), { kind: "unowned" });

  const owned = recordingDb({
    asset: { departmentId: "dept_fn" },
    repair: { responsibleDepartmentId: "dept_plant" },
    operationalRequest: { responsibleDepartmentId: "dept_plant" },
    departmentRequestRoute: { responsibleDepartmentId: "dept_plant" },
  });
  assert.deepEqual(await resolveDepartmentOwner(owned.db, "asset", input), { kind: "department", departmentId: "dept_fn" });
  for (const kind of ["repair", "operationalRequest", "requestRoute"] as const) {
    assert.deepEqual(
      await resolveDepartmentOwner(owned.db, kind, input),
      { kind: "department", departmentId: "dept_plant" },
      kind,
    );
  }
});

test("PM occurrences belong to their plan's Department", async () => {
  const { db } = recordingDb({ preventiveMaintenanceOccurrence: { plan: { departmentId: "dept_plant" } } });
  assert.deepEqual(await resolveDepartmentOwner(db, "pmOccurrence", input), {
    kind: "department",
    departmentId: "dept_plant",
  });
});

test("servery milestones belong to the facility's Food & Nutrition Department", async () => {
  const found = recordingDb({ unit: { id: "unit_servery" }, department: { id: "dept_fn" } });
  assert.deepEqual(await resolveDepartmentOwner(found.db, "serveryMilestone", input), {
    kind: "department",
    departmentId: "dept_fn",
  });
  const departmentQuery = found.calls.find((call) => call.model === "department");
  assert.deepEqual(departmentQuery?.args.where, { facilityId: "fac_tv", key: "DIETARY", isActive: true });

  const missingDepartment = recordingDb({ unit: { id: "unit_servery" } });
  assert.deepEqual(await resolveDepartmentOwner(missingDepartment.db, "serveryMilestone", input), { kind: "unowned" });
});

test("the department owner confirms the Department is in the facility", async () => {
  const { db, calls } = recordingDb({ department: { id: "dept_evs" } });
  assert.deepEqual(await resolveDepartmentOwner(db, "department", input), { kind: "department", departmentId: "dept_evs" });
  assert.deepEqual(calls[0]!.args.where, { id: "rec_1", facilityId: "fac_tv" });
});
