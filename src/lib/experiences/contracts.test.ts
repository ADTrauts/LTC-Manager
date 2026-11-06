/**
 * Wave 15AC — Experience Contract expansion tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  EXPERIENCE_CARD_KINDS,
  EXPERIENCE_SECTION_KEYS,
  FORBIDDEN_SECTION_KEYS,
  buildExperienceContracts,
  isExperienceSectionKey,
  validateExperienceContracts,
} from "./contracts";
import { EXPERIENCE_CATALOG } from "./experience-catalog";
import {
  EXPERIENCE_REGISTRY_VERSION,
  assertExperienceRegistryValid,
  findAreaForExperience,
  getExperience,
  validateExperienceRegistry,
} from "./registry";

describe("Wave 15AC — contract completeness on catalog", () => {
  it("registry remains valid with contracts", () => {
    assert.deepEqual(validateExperienceRegistry(), []);
    assert.doesNotThrow(() => assertExperienceRegistryValid());
  });

  it("every Experience declares contracts", () => {
    for (const experience of EXPERIENCE_CATALOG) {
      assert.ok(experience.contracts, experience.key);
      assert.ok(experience.contracts.sections.length >= 2, experience.key);
      assert.ok(experience.contracts.cards.length >= 1, experience.key);
      assert.ok(experience.contracts.widgets.length >= 1, experience.key);
      assert.ok(experience.contracts.overlayKeys.length >= 1, experience.key);
      assert.ok(experience.contracts.workspaceContribution);
      assert.ok(experience.contracts.unitWorkspaceContribution);
      assert.ok(experience.contracts.operationsCenterContribution);
      assert.ok(experience.contracts.businessWorkspaceContribution);
      assert.ok(Array.isArray(experience.contracts.navigationContribution.entries));
      assert.ok(experience.contracts.permissions.readKeys.length >= 1);
      assert.ok(experience.contracts.analyticsKeys.length >= 1);
      assert.ok(Array.isArray(experience.contracts.aiContextKeys));
      assert.ok(experience.contracts.queryScope.domains.length >= 1);
      assert.ok(experience.contracts.statusContracts);
      assert.ok(Array.isArray(experience.contracts.actions));
      assert.ok(experience.contracts.extensionPoints.length >= 1);
      assert.ok(experience.contracts.relationships);
    }
  });

  it("golden Experiences expose richer contracts", () => {
    const temp = getExperience("TEMPERATURE_MONITORING");
    assert.ok(temp);
    assert.ok(temp.contracts.sections.some((s) => s.key === "CURRENT_STATUS"));
    assert.ok(temp.contracts.sections.some((s) => s.key === "LOGS"));
    assert.ok(temp.contracts.sections.some((s) => s.key === "RESOURCES"));
    assert.ok(temp.contracts.aiContextKeys.length > 0);
    assert.ok(
      temp.contracts.analyticsKeys.includes(
        "temperature_monitoring.compliance_rate",
      ),
    );
    assert.ok(
      temp.contracts.relationships.relatedExperienceKeys.includes("MEAL_SERVICE"),
    );

    const meal = getExperience("MEAL_SERVICE");
    assert.ok(meal);
    assert.equal(meal.contracts.businessWorkspaceContribution.density, "COMPACT");
    assert.equal(meal.contracts.unitWorkspaceContribution.density, "FULL");
    assert.equal(meal.contracts.operationsCenterContribution.density, "STATUS");

    const cleaning = getExperience("CLEANING");
    assert.ok(cleaning);
    assert.ok(cleaning.contracts.toolHosts.some((h) => h.toolKind === "LOGS"));
    assert.ok(cleaning.departments.includes("EVS"));
    assert.ok(cleaning.departments.includes("DIETARY"));
  });

  it("Operational Area placement remains area-catalog owned (no duplicate area field)", () => {
    const area = findAreaForExperience("DIETARY", "TEMPERATURE_MONITORING");
    assert.equal(area?.key, "dietary_food_safety");
    assert.equal(
      (getExperience("TEMPERATURE_MONITORING") as { operationalArea?: string })
        .operationalArea,
      undefined,
    );
  });
});

describe("Wave 15AC — contract integrity rules", () => {
  it("rejects forbidden sections", () => {
    const base = buildExperienceContracts({
      experienceKey: "TEMPERATURE_MONITORING",
      experienceName: "Temperature Monitoring",
      tools: ["LOGS"],
      domains: ["temperature_logs"],
      grain: "ROOM",
    });
    const broken = {
      ...base,
      sections: [
        ...base.sections,
        {
          key: "NOTIFICATIONS_INBOX" as (typeof EXPERIENCE_SECTION_KEYS)[number],
          order: 99,
          required: false,
          cardKeys: [],
        },
      ],
    };
    // Force forbidden key past the type system
    (
      broken.sections as unknown as {
        key: string;
        order: number;
        required: boolean;
        cardKeys: string[];
      }[]
    ).push({
      key: FORBIDDEN_SECTION_KEYS[0],
      order: 100,
      required: false,
      cardKeys: [],
    });
    const issues = validateExperienceContracts(
      "TEMPERATURE_MONITORING",
      ["LOGS"],
      broken,
    );
    assert.ok(issues.some((i) => i.code === "forbidden_section"));
  });

  it("rejects unknown related Experiences", () => {
    const base = buildExperienceContracts({
      experienceKey: "MEAL_SERVICE",
      experienceName: "Meal Service",
      tools: ["TASKS"],
      domains: ["meal_service"],
      grain: "ROOM",
      relatedExperienceKeys: ["NOT_A_REAL_EXPERIENCE"],
    });
    const issues = validateExperienceContracts(
      "MEAL_SERVICE",
      ["TASKS"],
      base,
      new Set(["MEAL_SERVICE"]),
    );
    assert.ok(issues.some((i) => i.code === "unknown_related_experience"));
  });

  it("rejects self-related Experiences", () => {
    const base = buildExperienceContracts({
      experienceKey: "MEAL_SERVICE",
      experienceName: "Meal Service",
      tools: ["TASKS"],
      domains: ["meal_service"],
      grain: "ROOM",
      relatedExperienceKeys: ["MEAL_SERVICE"],
    });
    const issues = validateExperienceContracts(
      "MEAL_SERVICE",
      ["TASKS"],
      base,
      new Set(["MEAL_SERVICE"]),
    );
    assert.ok(issues.some((i) => i.code === "self_related_experience"));
  });

  it("rejects missing HEADER/OVERVIEW", () => {
    const base = buildExperienceContracts({
      experienceKey: "CLEANING",
      experienceName: "Cleaning",
      tools: ["LOGS"],
      domains: ["cleaning"],
      grain: "ROOM",
    });
    const withoutOverview = {
      ...base,
      sections: base.sections.filter((s) => s.key !== "OVERVIEW"),
    };
    const issues = validateExperienceContracts("CLEANING", ["LOGS"], withoutOverview);
    assert.ok(issues.some((i) => i.code === "missing_overview_section"));
  });

  it("rejects tool host for undeclared tool", () => {
    const base = buildExperienceContracts({
      experienceKey: "CLEANING",
      experienceName: "Cleaning",
      tools: ["LOGS"],
      domains: ["cleaning"],
      grain: "ROOM",
    });
    const broken = {
      ...base,
      toolHosts: [
        ...base.toolHosts,
        {
          key: "cleaning.tool_forms",
          toolKind: "FORMS" as const,
          sectionKey: "FORMS" as const,
          bindingSlot: "x",
        },
      ],
    };
    const issues = validateExperienceContracts("CLEANING", ["LOGS"], broken);
    assert.ok(issues.some((i) => i.code === "tool_host_tool_not_declared"));
  });

  it("rejects home contribution referencing undeclared section", () => {
    const base = buildExperienceContracts({
      experienceKey: "ASSETS",
      experienceName: "Assets",
      tools: ["RECORDS"],
      domains: ["assets"],
      grain: "FACILITY",
    });
    const broken = {
      ...base,
      businessWorkspaceContribution: {
        ...base.businessWorkspaceContribution,
        sectionKeys: ["HEADER", "METRICS"] as const,
      },
    };
    const issues = validateExperienceContracts("ASSETS", ["RECORDS"], broken);
    assert.ok(issues.some((i) => i.code === "home_section_not_declared"));
  });

  it("rejects duplicate section/card/widget/action/overlay keys", () => {
    const base = buildExperienceContracts({
      experienceKey: "AUDITS",
      experienceName: "Audits",
      tools: ["FORMS"],
      domains: ["audits"],
      grain: "DEPARTMENT",
    });
    const issues = validateExperienceContracts("AUDITS", ["FORMS"], {
      ...base,
      overlayKeys: [...base.overlayKeys, base.overlayKeys[0]!],
    });
    assert.ok(issues.some((i) => i.code === "duplicate_overlay_key"));
  });

  it("rejects empty analytics keys", () => {
    const base = buildExperienceContracts({
      experienceKey: "MENUS",
      experienceName: "Menus",
      tools: ["RECORDS"],
      domains: ["menus"],
      grain: "DEPARTMENT",
      includeStatus: false,
      includeOutstandingWork: false,
    });
    const issues = validateExperienceContracts("MENUS", ["RECORDS"], {
      ...base,
      analyticsKeys: [],
    });
    assert.ok(issues.some((i) => i.code === "analytics_keys_empty"));
  });

  it("rejects readiness signals without CURRENT_STATUS", () => {
    const base = buildExperienceContracts({
      experienceKey: "RECIPES",
      experienceName: "Recipes",
      tools: ["KNOWLEDGE"],
      domains: ["recipes"],
      grain: "DEPARTMENT",
      includeStatus: false,
      includeOutstandingWork: false,
      includeHistory: false,
    });
    const issues = validateExperienceContracts("RECIPES", ["KNOWLEDGE"], {
      ...base,
      statusContracts: {
        readinessSignalKeys: ["recipes.readiness"],
        statusKeys: ["READY"],
      },
    });
    assert.ok(issues.some((i) => i.code === "status_without_section"));
  });

  it("rejects invalid section keys outside vocabulary", () => {
    assert.equal(isExperienceSectionKey("OVERVIEW"), true);
    assert.equal(isExperienceSectionKey("NOT_A_SECTION"), false);
    assert.ok(EXPERIENCE_SECTION_KEYS.includes("HEADER"));
    assert.ok(EXPERIENCE_CARD_KINDS.includes("TOOL_HOST"));
  });
});

describe("Wave 15AC — backwards compatibility", () => {
  it("preserves Wave 14A identity fields and lookups", () => {
    assert.equal(EXPERIENCE_REGISTRY_VERSION, 2);
    const meal = getExperience("MEAL_SERVICE");
    assert.ok(meal);
    assert.equal(meal.id, "MEAL_SERVICE");
    assert.equal(meal.key, "MEAL_SERVICE");
    assert.equal(meal.name, "Meal Service");
    assert.deepEqual([...meal.departments], ["DIETARY"]);
    assert.equal(meal.icon, "menus");
    assert.equal(meal.status, "active");
    assert.ok(meal.tools.includes("TASKS"));
    assert.equal(meal.category, "SERVICE");
    assert.ok(meal.version >= 1);
  });

  it("keeps a single Experience registry (no parallel catalog)", () => {
    assert.equal(EXPERIENCE_CATALOG.length, 32);
    assert.equal(
      new Set(EXPERIENCE_CATALOG.map((e) => e.key)).size,
      EXPERIENCE_CATALOG.length,
    );
  });

  it("extension points are declared for every Experience", () => {
    for (const experience of EXPERIENCE_CATALOG) {
      assert.ok(
        experience.contracts.extensionPoints.some((p) =>
          p.endsWith(".sections"),
        ),
        experience.key,
      );
    }
  });
});
