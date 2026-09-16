import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildTemporalTicks,
  selectVisibleTickLabels,
} from "@/lib/design-system/temporal-strip-math";

function formatLabel(absoluteMinutes: number): string {
  const normalized = ((absoluteMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

test("selectVisibleTickLabels always keeps start and end", () => {
  const ticks = buildTemporalTicks({
    trackStartMinutes: 5 * 60 + 30,
    durationMinutes: 4 * 60 + 30,
    formatLabel,
  });
  const visible = selectVisibleTickLabels({
    ticks,
    durationMinutes: 4 * 60 + 30,
    trackWidthPx: 280,
    minLabelWidthPx: 76,
  });
  assert.equal(visible[0]?.offset, 0);
  assert.equal(visible[visible.length - 1]?.offset, 4 * 60 + 30);
  assert.ok(visible.length < ticks.length);
  assert.ok(visible.length >= 2);
});

test("selectVisibleTickLabels is deterministic and prefers fewer labels on narrow tracks", () => {
  const ticks = buildTemporalTicks({
    trackStartMinutes: 5 * 60 + 30,
    durationMinutes: 4 * 60 + 30,
    formatLabel,
  });
  const narrow = selectVisibleTickLabels({
    ticks,
    durationMinutes: 4 * 60 + 30,
    trackWidthPx: 320,
    minLabelWidthPx: 76,
  });
  const wide = selectVisibleTickLabels({
    ticks,
    durationMinutes: 4 * 60 + 30,
    trackWidthPx: 960,
    minLabelWidthPx: 76,
  });
  assert.deepEqual(
    selectVisibleTickLabels({
      ticks,
      durationMinutes: 4 * 60 + 30,
      trackWidthPx: 320,
      minLabelWidthPx: 76,
    }),
    narrow,
  );
  assert.ok(wide.length >= narrow.length);
});

test("selectVisibleTickLabels never duplicates the first tick", () => {
  const ticks = [
    { offset: 0, label: "5:30 AM" },
    { offset: 30, label: "6:00 AM" },
    { offset: 90, label: "7:00 AM" },
    { offset: 270, label: "10:00 AM" },
  ];
  const visible = selectVisibleTickLabels({
    ticks,
    durationMinutes: 270,
    trackWidthPx: 400,
    minLabelWidthPx: 76,
  });
  const firstCount = visible.filter((t) => t.offset === 0).length;
  assert.equal(firstCount, 1);
});

test("tick labels are single-line clock strings", () => {
  const ticks = buildTemporalTicks({
    trackStartMinutes: 15 * 60 + 30,
    durationMinutes: 4 * 60 + 30,
    formatLabel,
  });
  for (const tick of ticks) {
    assert.match(tick.label, /^\d{1,2}:\d{2} (AM|PM)$/);
    assert.equal(tick.label.includes("\n"), false);
  }
});

test("TemporalStrip applies nowrap and visible-tick filtering", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/design-system/TemporalStrip.tsx"),
    "utf8",
  );
  assert.match(source, /selectVisibleTickLabels/);
  assert.match(source, /whitespace-nowrap/);
  assert.match(source, /ResizeObserver/);
});

test("SubNav communicates horizontal overflow with fades and scrolls active tab", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/design-system/SubNav.tsx"),
    "utf8",
  );
  assert.match(source, /subnav-fade-right/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /shell-nav-scroller/);
  assert.match(source, /aria-current/);
});
