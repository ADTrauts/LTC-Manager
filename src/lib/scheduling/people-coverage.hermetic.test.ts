import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { peopleChangeIsMove } from "./people-coverage";

test("a call-off is not a move", () => {
  assert.equal(peopleChangeIsMove("call-off"), false);
  assert.equal(peopleChangeIsMove("no-call-no-show"), false);
  assert.equal(peopleChangeIsMove("late-arrival"), false);
  assert.equal(peopleChangeIsMove(null), false);
});

test("a reassignment is a move", () => {
  assert.equal(peopleChangeIsMove("reassigned-for-coverage"), true);
  assert.equal(peopleChangeIsMove("emergency-coverage"), true);
});

test("the people action does not write an assignment override", () => {
  const source = readFileSync("src/app/(protected)/staffing/actions.ts", "utf8");
  assert.equal(source.includes("assignmentOverride.create"), false);
  assert.match(source, /markShiftsCalledOff/);
  assert.match(source, /moveDayAssignment/);
});

const SKIP_DIR = new Set(["node_modules", "migrations", ".next", "dist"]);
const EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);

function filesContaining(token: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const dot = name.lastIndexOf(".");
      if (!EXT.has(dot >= 0 ? name.slice(dot) : "")) continue;
      if (readFileSync(path, "utf8").includes(token)) found.push(path);
    }
  };
  for (const root of ["src", "scripts", "prisma"]) walk(root);
  return found.sort();
}

test("nothing creates an assignment override", () => {
  assert.deepEqual(
    filesContaining("assignmentOverride.create(").filter((path) => path !== "src/lib/scheduling/people-coverage.hermetic.test.ts"),
    [],
  );
});

test("schedule rows are created only by the canonical shift service", () => {
  const creators = filesContaining("scheduleEntry.create(").filter(
    (path) => !path.includes(".test.") && !path.includes(".hermetic.") && !path.startsWith("scripts/") && path !== "prisma/seed.mjs",
  );
  assert.deepEqual(creators, ["src/lib/scheduling/canonical-shift-service.ts"]);
});
