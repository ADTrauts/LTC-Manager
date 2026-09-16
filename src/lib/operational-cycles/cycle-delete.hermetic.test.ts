import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { buildTemporalTicks } from "@/lib/design-system/temporal-strip-math";
import {
  canDestructivelyDeleteCycle,
  orderDraftSubtreeForDelete,
} from "./cycle-service";

test("only DRAFT cycles may be destructively deleted", () => {
  assert.equal(canDestructivelyDeleteCycle("DRAFT"), true);
  assert.equal(canDestructivelyDeleteCycle("PUBLISHED"), false);
  assert.equal(canDestructivelyDeleteCycle("RETIRED"), false);
});

test("orderDraftSubtreeForDelete removes children before root", () => {
  const root = {
    id: "root",
    label: "Dinner",
    stableKey: "dinner",
    parentStableKey: null as string | null,
  };
  const phase = {
    id: "phase",
    label: "Prep",
    stableKey: "prep",
    parentStableKey: "dinner",
  };
  const key = {
    id: "key",
    label: "Due",
    stableKey: "due",
    parentStableKey: "prep",
  };
  const ordered = orderDraftSubtreeForDelete(root, [root, phase, key]);
  assert.deepEqual(ordered, ["key", "phase", "root"]);
});

test("deleteDraft cascades draft descendants and UI exposes Delete draft cycle", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /export async function deleteDraft/);
  assert.match(service, /orderDraftSubtreeForDelete/);
  assert.match(service, /Only unpublished drafts can be deleted/);
  assert.match(service, /export async function discardAllDrafts/);

  const tree = readFileSync(
    join(
      process.cwd(),
      "src/app/(protected)/admin/departments/[departmentId]/cycles-tree-list.tsx",
    ),
    "utf8",
  );
  assert.match(tree, /deleteCycleDraftAction/);
  assert.match(tree, /Delete draft cycle/);
  assert.match(tree, /Delete phase/);
  assert.match(tree, /Delete key time/);
  assert.doesNotMatch(tree, /Add child/);
  assert.match(tree, /\+ Add phase/);
  assert.match(tree, /CycleRowActionsMenu/);

  const actions = readFileSync(
    join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/cycle-actions.ts"),
    "utf8",
  );
  assert.match(actions, /deleteCycleDraftAction/);
  assert.match(actions, /discardAllCycleDraftsAction/);
  assert.match(actions, /deleteDraft/);
});

test("published removal remains retire, not destructive delete", () => {
  const service = readFileSync(join(process.cwd(), "src/lib/operational-cycles/cycle-service.ts"), "utf8");
  assert.match(service, /export async function retireCycle/);
  assert.match(service, /Only published cycles can be retired/);
  assert.doesNotMatch(service, /departmentOperationalCycle\.delete\(\s*\{[^}]*status: "PUBLISHED"/);
});

test("tick algorithm keeps start/end and uses duration-based steps", () => {
  const formatLabel = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const short = buildTemporalTicks({
    trackStartMinutes: 5 * 60 + 30,
    durationMinutes: 4 * 60 + 30,
    formatLabel,
  });
  assert.equal(short[0]?.offset, 0);
  assert.equal(short[short.length - 1]?.offset, 4 * 60 + 30);

  const mid = buildTemporalTicks({
    trackStartMinutes: 8 * 60,
    durationMinutes: 6 * 60,
    formatLabel,
  });
  assert.ok(mid.length >= 2);
  assert.equal(mid[0]?.offset, 0);
  assert.equal(mid[mid.length - 1]?.offset, 6 * 60);
});
