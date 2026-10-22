import assert from "node:assert/strict";
import test from "node:test";

import {
  listVendorArchive,
  retireOperatorPeriodSetup,
  vendorPeriodEndsNow,
  vendorPeriodIdOnDate,
  whereForOperationPeriod,
  type OperatorPeriodRow,
} from "./operator-period";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const facility = "org-facility";
const metz = "org-metz";
const next = "org-next";

function period(partial: Partial<OperatorPeriodRow> & Pick<OperatorPeriodRow, "id" | "organizationId">): OperatorPeriodRow {
  return {
    effectiveFrom: day("2026-01-01"),
    effectiveTo: null,
    ...partial,
  };
}

test("a facility-operated range and a gap leave the stamp null", () => {
  const periods = [
    period({ id: "facility-era", organizationId: facility, effectiveTo: day("2026-06-30") }),
  ];
  assert.equal(
    vendorPeriodIdOnDate({ facilityOrganizationId: facility, serviceDate: day("2026-03-01"), periods }),
    null,
  );
  assert.equal(
    vendorPeriodIdOnDate({ facilityOrganizationId: facility, serviceDate: day("2026-08-01"), periods }),
    null,
  );
});

test("a vendor period stamps only inside its dates, and the later contract wins an overlap", () => {
  const periods = [
    period({ id: "metz", organizationId: metz, effectiveFrom: day("2026-07-01"), effectiveTo: day("2026-12-31") }),
    period({ id: "next", organizationId: next, effectiveFrom: day("2027-01-01") }),
  ];
  assert.equal(
    vendorPeriodIdOnDate({ facilityOrganizationId: facility, serviceDate: day("2026-06-30"), periods }),
    null,
  );
  assert.equal(
    vendorPeriodIdOnDate({ facilityOrganizationId: facility, serviceDate: day("2026-07-01"), periods }),
    "metz",
  );
  assert.equal(
    vendorPeriodIdOnDate({ facilityOrganizationId: facility, serviceDate: day("2027-02-01"), periods }),
    "next",
  );
});

function withoutEnforcement<T>(run: () => Promise<T> | T): Promise<T> {
  const previous = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  const restore = () => {
    if (previous === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
    else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previous;
  };
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

test("closing a period does not retire setup while enforcement is off", async () => {
  await withoutEnforcement(() =>
    retireOperatorPeriodSetup(new Proxy({}, { get() { throw new Error("database"); } }) as never, "period"),
  );
});

test("the archive stays closed while enforcement is off", async () => {
  const periods = await withoutEnforcement(() =>
    listVendorArchive(new Proxy({}, { get() { throw new Error("database"); } }) as never, "org-metz"),
  );
  assert.deepEqual(periods, []);
});

test("a vendor handover retires menus, work plans, and cycles once the replacement has started", async () => {
  assert.equal(
    vendorPeriodEndsNow({
      organizationId: metz,
      facilityOrganizationId: facility,
      replacementStartsOn: "2027-01-01",
      serviceDateKey: "2026-10-22",
    }),
    false,
  );
  assert.equal(
    vendorPeriodEndsNow({
      organizationId: facility,
      facilityOrganizationId: facility,
      replacementStartsOn: "2026-10-22",
      serviceDateKey: "2026-10-22",
    }),
    false,
  );
  assert.equal(
    vendorPeriodEndsNow({
      organizationId: metz,
      facilityOrganizationId: facility,
      replacementStartsOn: "2026-10-22",
      serviceDateKey: "2026-10-22",
    }),
    true,
  );

  const previous = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "true";
  const calls: string[] = [];
  const db = {
    menu: {
      updateMany: async (args: { where: { operatorPeriodId: string }; data: { status: string } }) => {
        calls.push(`menu:${args.where.operatorPeriodId}:${args.data.status}`);
      },
    },
    departmentWorkPlan: {
      updateMany: async (args: { data: { status: string } }) => {
        calls.push(`plan:${args.data.status}`);
      },
    },
    departmentOperationalCycle: {
      updateMany: async (args: { data: { status: string } }) => {
        calls.push(`cycle:${args.data.status}`);
      },
    },
  };
  try {
    await retireOperatorPeriodSetup(db as never, "metz");
  } finally {
    if (previous === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
    else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previous;
  }
  assert.deepEqual(calls, ["menu:metz:INACTIVE", "plan:RETIRED", "cycle:RETIRED"]);
});

test("operating reads keep the current vendor period and otherwise keep the facility period", () => {
  assert.deepEqual(whereForOperationPeriod({ vendorPeriodId: "metz", facilityPeriodIds: ["facility-era"] }), {
    operatorPeriodId: "metz",
  });
  assert.deepEqual(whereForOperationPeriod({ vendorPeriodId: null, facilityPeriodIds: ["facility-era"] }), {
    OR: [{ operatorPeriodId: null }, { operatorPeriodId: { in: ["facility-era"] } }],
  });
});
