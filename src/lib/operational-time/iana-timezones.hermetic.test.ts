import assert from "node:assert/strict";
import test from "node:test";

import { listIanaTimezoneGroups, savedTimezoneGroup } from "./iana-timezones";
import { isValidIanaTimezone } from "./resolve-facility-timezone";

test("the timezone list includes every region a facility can operate in", () => {
  const groups = listIanaTimezoneGroups("America/New_York");
  const values = groups.flatMap((group) => group.zones.map((zone) => zone.value));
  assert.ok(values.length > 100);
  for (const zone of ["UTC", "America/New_York", "America/Chicago", "Europe/London", "Pacific/Auckland"]) {
    assert.ok(values.includes(zone), zone);
  }
  assert.ok(groups.some((group) => group.region === "America" && group.zones.length > 1));
  assert.equal(listIanaTimezoneGroups("America/New_York"), groups);
  for (const zone of values) assert.equal(isValidIanaTimezone(zone), true);
});

test("a saved timezone remains selectable before the full list hydrates", () => {
  const groups = savedTimezoneGroup("America/Chicago");
  assert.deepEqual(groups, [
    {
      region: "America",
      zones: [{ value: "America/Chicago", label: groups[0]!.zones[0]!.label }],
    },
  ]);
  assert.match(groups[0]!.zones[0]!.label, /America\/Chicago|Central/);
  assert.equal(savedTimezoneGroup("America/Chicago"), groups);
});
