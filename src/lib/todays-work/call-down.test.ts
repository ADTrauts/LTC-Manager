import assert from "node:assert/strict";
import test from "node:test";

import { MealType } from "@prisma/client";

import {
  buildCallDownItems,
  formatCallDownReason,
  parseCallDownReason,
  resolveCallDownStatus,
  resolveOverrideReasonFromForm,
  summarizeCallDowns,
} from "@/lib/todays-work/call-down";

test("formatCallDownReason and parseCallDownReason round-trip template reasons", () => {
  const formatted = formatCallDownReason("call-off", "Fever");
  assert.equal(formatted, "[call-down:call-off] Fever");
  assert.deepEqual(parseCallDownReason(formatted), {
    isCallDown: true,
    templateKey: "call-off",
    templateLabel: "Call-off",
    details: "Fever",
    displayReason: "Call-off: Fever",
  });
});

test("parseCallDownReason leaves legacy free-text reasons untouched", () => {
  const parsed = parseCallDownReason("Floater pulled to north wing");
  assert.equal(parsed.isCallDown, false);
  assert.equal(parsed.displayReason, "Floater pulled to north wing");
});

test("resolveOverrideReasonFromForm prefers template reasons", () => {
  assert.equal(
    resolveOverrideReasonFromForm({
      reasonTemplate: "no-call-no-show",
      reasonDetails: "Third shift",
    }),
    "[call-down:no-call-no-show] Third shift",
  );
  assert.equal(
    resolveOverrideReasonFromForm({ reason: "Manual override note" }),
    "Manual override note",
  );
});

test("resolveCallDownStatus treats uncovered old units as open", () => {
  const coverage = new Map([
    ["gap-unit", "none" as const],
    ["covered-unit", "covered" as const],
  ]);
  assert.equal(resolveCallDownStatus({ oldUnitId: "gap-unit" }, coverage), "open");
  assert.equal(resolveCallDownStatus({ oldUnitId: "covered-unit" }, coverage), "covered");
  assert.equal(resolveCallDownStatus({ oldUnitId: null }, coverage), "open");
});

test("buildCallDownItems filters to call-down reasons and orders open first", () => {
  const items = buildCallDownItems({
    overrides: [
      {
        id: "1",
        employeeId: "e1",
        employeeFirstName: "Pat",
        employeeLastName: "Server",
        oldUnitId: "gap",
        oldUnitName: "West Servery",
        newUnitId: "north",
        newUnitName: "North Servery",
        mealType: MealType.LUNCH,
        reason: formatCallDownReason("call-off"),
        changedAt: new Date("2026-07-08T10:00:00Z"),
      },
      {
        id: "2",
        employeeId: "e2",
        employeeFirstName: "Lee",
        employeeLastName: "Cook",
        oldUnitId: "covered",
        oldUnitName: "Main Kitchen",
        newUnitId: "north",
        newUnitName: "North Servery",
        mealType: null,
        reason: formatCallDownReason("reassigned-for-coverage", "Floater"),
        changedAt: new Date("2026-07-08T11:00:00Z"),
      },
      {
        id: "3",
        employeeId: "e3",
        employeeFirstName: "Kim",
        employeeLastName: "Retail",
        oldUnitId: "shop",
        oldUnitName: "Gift Shop",
        newUnitId: "shop",
        newUnitName: "Gift Shop",
        mealType: null,
        reason: "Shift swap approved",
        changedAt: new Date("2026-07-08T12:00:00Z"),
      },
    ],
    coverageByUnitId: new Map([
      ["gap", "none"],
      ["covered", "covered"],
    ]),
    dateIso: "2026-07-08",
  });

  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, "1");
  assert.equal(items[0]?.status, "open");
  assert.equal(items[1]?.status, "covered");
  assert.match(items[0]?.staffingHref ?? "", /date=2026-07-08/);
});

test("summarizeCallDowns counts open and covered items", () => {
  const summary = summarizeCallDowns([
    {
      id: "1",
      employeeName: "Pat Server",
      templateKey: "call-off",
      templateLabel: "Call-off",
      reason: "Call-off",
      reasonDetails: null,
      oldUnitId: "gap",
      oldUnitName: "West Servery",
      newUnitId: "north",
      newUnitName: "North Servery",
      mealType: null,
      status: "open",
      statusLabel: "Needs coverage",
      changedAt: new Date(),
      staffingHref: "/staffing?date=2026-07-08#staffing-unit-gap",
      coverageHref: "/today/coverage",
    },
    {
      id: "2",
      employeeName: "Lee Cook",
      templateKey: "reassigned-for-coverage",
      templateLabel: "Reassigned for coverage",
      reason: "Reassigned for coverage",
      reasonDetails: null,
      oldUnitId: "kitchen",
      oldUnitName: "Main Kitchen",
      newUnitId: "north",
      newUnitName: "North Servery",
      mealType: null,
      status: "covered",
      statusLabel: "Covered",
      changedAt: new Date(),
      staffingHref: "/staffing?date=2026-07-08#staffing-unit-kitchen",
      coverageHref: "/today/coverage",
    },
  ]);

  assert.deepEqual(summary, { total: 2, open: 1, covered: 1 });
});
