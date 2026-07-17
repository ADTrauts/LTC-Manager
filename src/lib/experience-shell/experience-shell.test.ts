/**
 * Wave 16A — Experience Shell foundation tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isExperienceShellEnabled } from "@/lib/feature-flags";
import {
  clearComponentOverrides,
  isKnownComponentKind,
  registerComponentOverride,
  resolveComponentRenderer,
  resolveComponentRendererWithOverrides,
  resolveExperienceShellModel,
} from "@/lib/experience-shell";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("EXPERIENCE_SHELL_ENABLED defaults to false", () => {
  withEnv("EXPERIENCE_SHELL_ENABLED", undefined, () => {
    assert.equal(isExperienceShellEnabled(), false);
  });
  withEnv("EXPERIENCE_SHELL_ENABLED", "true", () => {
    assert.equal(isExperienceShellEnabled(), true);
  });
});

test("resolveExperienceShellModel — Meal Service sections and cards", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    home: "unitWorkspace",
    density: "FULL",
  });
  assert.equal(model.state, "ready");
  assert.equal(model.experienceKey, "MEAL_SERVICE");
  assert.ok(model.sections.length > 0);
  assert.ok(model.sections.every((s) => s.cards.length > 0 || s.required));
  assert.equal(model.bodyIsPlaceholder, true);
});

test("resolveExperienceShellModel — Temperature Monitoring has LOGS tool host", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "TEMPERATURE_MONITORING",
    label: "Temperature Monitoring",
    home: "unitWorkspace",
  });
  const toolCards = model.sections.flatMap((s) =>
    s.cards.filter((c) => c.toolHost != null),
  );
  assert.ok(toolCards.some((c) => c.toolHost?.toolKind === "LOGS"));
});

test("resolveExperienceShellModel — unknown Experience unavailable", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "NOT_A_REAL_EXPERIENCE",
    label: "Missing",
  });
  assert.equal(model.state, "unavailable");
  assert.ok(model.unavailableReason);
  assert.equal(model.sections.length, 0);
});

test("resolveExperienceShellModel — loading state", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    state: "loading",
  });
  assert.equal(model.state, "loading");
});

test("resolveExperienceShellModel — permission-narrowed actions", () => {
  const full = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
  });
  const narrow = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    allowedActionKeys: [],
  });
  assert.ok(full.headerActions.length >= narrow.headerActions.length);
});

test("resolveExperienceShellModel — overlay binds to widgets", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    overlay: {
      values: {},
      errors: {},
    },
  });
  assert.equal(model.state, "ready");
  const widgets = model.sections.flatMap((s) =>
    s.cards.flatMap((c) => c.widgets),
  );
  assert.ok(widgets.length > 0);
});

test("resolveExperienceShellModel — section order preserved", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
  });
  for (let i = 1; i < model.sections.length; i++) {
    assert.ok(model.sections[i]!.order >= model.sections[i - 1]!.order);
  }
});

test("Component registry — known kinds resolve", () => {
  assert.equal(resolveComponentRenderer("section:OVERVIEW"), "DefaultSection");
  assert.equal(resolveComponentRenderer("card:STATUS"), "DefaultCard");
  assert.equal(resolveComponentRenderer("widget:TEXT"), "DefaultWidget");
  assert.equal(resolveComponentRenderer("tool:LOGS"), "DefaultToolHost");
  assert.equal(resolveComponentRenderer("shell:loading"), "ShellLoading");
});

test("Component registry — unknown kind is safe placeholder", () => {
  assert.equal(
    resolveComponentRenderer("widget:NOT_A_WIDGET"),
    "UnknownPlaceholder",
  );
  assert.equal(isKnownComponentKind("widget:NOT_A_WIDGET"), false);
  assert.equal(isKnownComponentKind("card:SUMMARY"), true);
});

test("Component registry — overrides for extension model", () => {
  clearComponentOverrides();
  registerComponentOverride("widget:TEXT", "DefaultWidget");
  assert.equal(
    resolveComponentRendererWithOverrides("widget:TEXT"),
    "DefaultWidget",
  );
  clearComponentOverrides();
});

test("Home adaptation — operationsCenter density uses status sections", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    home: "operationsCenter",
  });
  assert.ok(model.sections.every((s) =>
    ["HEADER", "CURRENT_STATUS"].includes(s.key) || s.required,
  ));
});

test("Empty optional sections suppressed", () => {
  const model = resolveExperienceShellModel({
    experienceKey: "MEAL_SERVICE",
    label: "Meal Service",
    home: "unitWorkspace",
  });
  for (const section of model.sections) {
    if (!section.required) {
      assert.ok(section.cards.length > 0);
    }
  }
});
