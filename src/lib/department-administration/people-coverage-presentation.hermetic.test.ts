import assert from "node:assert/strict";
import test from "node:test";

import { isCoverageTemplateEffectiveOnDate } from "@/lib/scheduling/coverage-expectations/publication";

import {
  groupCoverageRequirements,
  presentTodayCoverage,
  resolveDirectoryDepartmentId,
} from "./people-coverage-presentation";

test("an unconfigured day is not a fully staffed result", () => {
  const view = presentTodayCoverage({ serviceDateKey: "2026-11-06", rows: [] });
  assert.equal(view.configured, false);
  assert.equal(view.headline, "Coverage not configured");
  assert.equal(view.rows.length, 0);
});

test("one matching assignment against two required is a shortage", () => {
  const view = presentTodayCoverage({
    serviceDateKey: "2026-11-06",
    rows: [
      {
        spaceName: "1B Servery",
        unitName: "Neighborhood 1",
        cycleLabel: "Lunch",
        roleLabel: "Server",
        requiredCount: 2,
        filledCount: 1,
        state: "AT_RISK",
      },
    ],
  });
  assert.equal(view.configured, true);
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.assigned, 1);
  assert.equal(view.rows[0]?.required, 2);
  assert.equal(view.rows[0]?.shortfall, 1);
  assert.equal(view.headline, "Staffing needs attention");
});

test("requirements group by location and period label", () => {
  const groups = groupCoverageRequirements(
    [
      {
        id: "exp-1",
        status: "PUBLISHED",
        effectiveFrom: "2026-11-06",
        items: [
          {
            id: "item-1",
            roleLabel: "Server",
            requiredCount: 2,
            spaceId: "room-a",
            spaceName: "1A Servery",
            applicableOperationalCycleStableKeys: ["lunch"],
          },
        ],
      },
    ],
    [{ stableKey: "lunch", label: "Lunch" }],
  );
  assert.equal(groups[0]?.locationName, "1A Servery");
  assert.equal(groups[0]?.periods[0]?.periodLabel, "Lunch");
  assert.equal(groups[0]?.periods[0]?.rows[0]?.statusLabel, "Published");
});

test("a requested Department wins when it is visible and does not require the shell", () => {
  assert.equal(
    resolveDirectoryDepartmentId({
      requestedDepartmentId: "dietary",
      shellDepartmentId: "plant",
      visibleDepartmentIds: new Set(["dietary", "plant"]),
    }),
    "dietary",
  );
  assert.equal(
    resolveDirectoryDepartmentId({
      requestedDepartmentId: "hidden",
      shellDepartmentId: "plant",
      visibleDepartmentIds: new Set(["plant"]),
    }),
    "plant",
  );
});

test("a draft Coverage requirement is not effective on a service date", () => {
  assert.equal(
    isCoverageTemplateEffectiveOnDate(
      {
        status: "DRAFT",
        isActive: true,
        effectiveFrom: "2026-11-06",
        effectiveTo: null,
      },
      "2026-11-06",
    ),
    false,
  );
  assert.equal(
    isCoverageTemplateEffectiveOnDate(
      {
        status: "PUBLISHED",
        isActive: true,
        effectiveFrom: "2026-11-06",
        effectiveTo: null,
      },
      "2026-11-06",
    ),
    true,
  );
});
