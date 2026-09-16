import assert from "node:assert/strict";
import test from "node:test";

import { headerNavItemsForMode } from "@/lib/product-mode";

test("compact shell — RUN header items remain available for Menu drawer", () => {
  const runItems = [
    { label: "Dashboard", href: "/workspace" },
    { label: "Today's Work", href: "/today" },
    { label: "Locations", href: "/units" },
  ];
  assert.deepEqual(headerNavItemsForMode("RUN", runItems), runItems);
});

test("compact shell — BUILD has no top-nav destinations (drawer + rail own tools)", () => {
  assert.deepEqual(
    headerNavItemsForMode("BUILD", [{ label: "Build Home", href: "/build" }]),
    [],
  );
});
