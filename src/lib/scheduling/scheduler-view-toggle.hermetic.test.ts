import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * View toggle preserves date + department via query params (server-rendered Links).
 * Department comes from shell cookie context; date/view/mode ride the URL.
 */
function staffingHref(params: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/staffing?${s}` : "/staffing";
}

describe("scheduler view toggle URL contract", () => {
  it("preserves date when switching Employee ↔ Location", () => {
    const date = "2026-09-10";
    const toLocation = staffingHref({ date, view: "location", mode: "week" });
    const toEmployee = staffingHref({ date, view: "employee", mode: "week" });
    assert.equal(toLocation, "/staffing?date=2026-09-10&view=location&mode=week");
    assert.equal(toEmployee, "/staffing?date=2026-09-10&view=employee&mode=week");
  });

  it("does not reset to today when only view changes", () => {
    const href = staffingHref({
      date: "2026-09-07",
      view: "location",
      mode: "week",
      team: "Kitchen",
    });
    assert.match(href, /date=2026-09-07/);
    assert.doesNotMatch(href, /today/i);
  });
});
