import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AppIcons } from "@/lib/design-system/icons";
import { CAPABILITY_KEYS } from "@/lib/facility-builder/load-facility-hierarchy";

import { EXPERIENCE_CATALOG } from "./experience-catalog";
import { OPERATIONAL_AREA_CATALOG } from "./operational-area-catalog";
import {
  EXPERIENCE_REGISTRY_VERSION,
  assertExperienceRegistryValid,
  experienceSupportsDepartment,
  findAreaForExperience,
  getExperience,
  getOperationalArea,
  isExperienceKey,
  isOperationalAreaKey,
  listExperiences,
  listExperiencesByArea,
  listExperiencesByDepartment,
  listExperiencesByStatus,
  listOperationalAreas,
  listOperationalAreasForDepartment,
  requireExperience,
  requireOperationalArea,
  validateExperienceRegistry,
} from "./registry";
import {
  EXPERIENCE_TOOL_KEYS,
  getExperienceTool,
  isExperienceToolKey,
  listExperienceTools,
} from "./tools";

describe("Experience Registry — validity", () => {
  it("passes full registry validation with zero issues", () => {
    assert.deepEqual(validateExperienceRegistry(), []);
    assert.doesNotThrow(() => assertExperienceRegistryValid());
  });

  it("has unique Experience ids and keys", () => {
    const ids = EXPERIENCE_CATALOG.map((e) => e.id);
    const keys = EXPERIENCE_CATALOG.map((e) => e.key);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(keys).size, keys.length);
    for (const experience of EXPERIENCE_CATALOG) {
      assert.equal(experience.id, experience.key);
    }
  });

  it("has unique Operational Area ids and keys", () => {
    const ids = OPERATIONAL_AREA_CATALOG.map((a) => a.id);
    const keys = OPERATIONAL_AREA_CATALOG.map((a) => a.key);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("uses UPPER_SNAKE Experience keys and valid AppIconKey icons", () => {
    const icons = new Set(Object.keys(AppIcons));
    for (const experience of EXPERIENCE_CATALOG) {
      assert.match(experience.key, /^[A-Z][A-Z0-9_]*$/);
      assert.ok(icons.has(experience.icon), experience.icon);
      assert.ok(experience.name.trim().length > 0);
      assert.ok(experience.description.trim().length > 0);
      assert.ok(experience.version >= 1);
      assert.ok(["active", "draft", "deprecated"].includes(experience.status));
    }
  });

  it("declares only known tools on Experiences", () => {
    for (const experience of EXPERIENCE_CATALOG) {
      for (const tool of experience.tools) {
        assert.ok(isExperienceToolKey(tool), `${experience.key} tool ${tool}`);
      }
    }
  });

  it("exposes a registry version for future versioning", () => {
    assert.equal(EXPERIENCE_REGISTRY_VERSION, 1);
  });
});

describe("Experience tools", () => {
  it("defines Logs, Knowledge, Forms, Tasks, and Records as tools", () => {
    assert.deepEqual([...EXPERIENCE_TOOL_KEYS].sort(), [
      "FORMS",
      "KNOWLEDGE",
      "LOGS",
      "RECORDS",
      "TASKS",
    ]);
    assert.equal(listExperienceTools().length, 5);
    assert.equal(getExperienceTool("KNOWLEDGE")?.name, "Knowledge");
    assert.equal(getExperienceTool("LOGS")?.key, "LOGS");
  });

  it("does not treat tools as Experiences", () => {
    for (const tool of EXPERIENCE_TOOL_KEYS) {
      assert.equal(isExperienceKey(tool), false, `${tool} must not be an Experience`);
    }
  });
});

describe("Experience lookups", () => {
  it("looks up by key", () => {
    const meal = getExperience("MEAL_SERVICE");
    assert.ok(meal);
    assert.equal(meal.name, "Meal Service");
    assert.deepEqual([...meal.departments], ["DIETARY"]);
    assert.equal(requireExperience("WORK_ORDERS").key, "WORK_ORDERS");
    assert.equal(getExperience("NOT_REAL"), undefined);
    assert.throws(() => requireExperience("NOT_REAL"));
  });

  it("lists Experiences by department", () => {
    const dietary = listExperiencesByDepartment("DIETARY");
    const evs = listExperiencesByDepartment("EVS");
    const plant = listExperiencesByDepartment("PLANT");
    assert.ok(dietary.some((e) => e.key === "MEAL_SERVICE"));
    assert.ok(!dietary.some((e) => e.key === "ROOM_STATUS"));
    assert.ok(evs.some((e) => e.key === "ROOM_STATUS"));
    assert.ok(plant.some((e) => e.key === "PREVENTIVE_MAINTENANCE"));
    assert.ok(experienceSupportsDepartment("ASSIGNMENTS", "DIETARY"));
    assert.ok(experienceSupportsDepartment("ASSIGNMENTS", "EVS"));
    assert.ok(experienceSupportsDepartment("ASSIGNMENTS", "PLANT"));
  });

  it("lists Experiences by Operational Area in area order", () => {
    const service = listExperiencesByArea("dietary_service");
    assert.deepEqual(
      service.map((e) => e.key),
      [
        "MEAL_SERVICE",
        "MEAL_TIMES",
        "MENUS",
        "RECIPES",
        "PRODUCTION",
        "NOURISHMENTS",
        "TRAY_ACCURACY",
      ],
    );
    assert.deepEqual(listExperiencesByArea("missing"), []);
  });

  it("lists active Experiences and preserves catalog order from listExperiences", () => {
    assert.deepEqual(
      listExperiences().map((e) => e.key),
      EXPERIENCE_CATALOG.map((e) => e.key),
    );
    assert.ok(listExperiencesByStatus("active").length === EXPERIENCE_CATALOG.length);
  });

  it("returns defensive copies from list helpers", () => {
    const listed = listExperiences();
    listed.pop();
    assert.equal(listExperiences().length, EXPERIENCE_CATALOG.length);
  });
});

describe("Operational Area composition", () => {
  it("lists Areas for Dietary, EVS, and Plant in stable order", () => {
    const dietary = listOperationalAreasForDepartment("DIETARY");
    assert.deepEqual(
      dietary.map((a) => a.name),
      [
        "Service",
        "Food Safety",
        "Equipment",
        "People",
        "Documentation",
        "Production",
        "Quality",
      ],
    );

    const evs = listOperationalAreasForDepartment("EVS");
    assert.deepEqual(
      evs.map((a) => a.name),
      ["Cleaning", "Room Status", "Equipment", "Compliance", "People"],
    );

    const plant = listOperationalAreasForDepartment("PLANT");
    assert.deepEqual(
      plant.map((a) => a.name),
      [
        "Assets",
        "Work Orders",
        "Preventive Maintenance",
        "Utilities",
        "Compliance",
        "People",
      ],
    );
  });

  it("places each Experience in exactly one Area per department", () => {
    for (const department of ["DIETARY", "EVS", "PLANT"] as const) {
      const ownership = new Map<string, string>();
      for (const area of listOperationalAreasForDepartment(department)) {
        for (const key of area.experienceKeys) {
          assert.equal(
            ownership.has(key),
            false,
            `${department}: ${key} already in ${ownership.get(key)}`,
          );
          ownership.set(key, area.key);
        }
      }
    }
  });

  it("resolves Area for Experience within a department", () => {
    assert.equal(
      findAreaForExperience("DIETARY", "TEMPERATURE_MONITORING")?.key,
      "dietary_food_safety",
    );
    assert.equal(
      findAreaForExperience("PLANT", "WORK_ORDERS")?.key,
      "plant_work_orders",
    );
    assert.equal(findAreaForExperience("EVS", "MEAL_SERVICE"), undefined);
  });

  it("looks up Areas by key", () => {
    assert.equal(getOperationalArea("evs_cleaning")?.name, "Cleaning");
    assert.equal(requireOperationalArea("plant_assets").departmentKey, "PLANT");
    assert.equal(isOperationalAreaKey("dietary_service"), true);
    assert.equal(isOperationalAreaKey("nope"), false);
    assert.throws(() => requireOperationalArea("nope"));
  });

  it("lists all Areas sorted by department then order", () => {
    const areas = listOperationalAreas();
    assert.equal(areas.length, OPERATIONAL_AREA_CATALOG.length);
    for (let i = 1; i < areas.length; i++) {
      const prev = areas[i - 1]!;
      const curr = areas[i]!;
      if (prev.departmentKey === curr.departmentKey) {
        assert.ok(prev.order <= curr.order);
      } else {
        assert.ok(prev.departmentKey < curr.departmentKey);
      }
    }
  });

  it("never leaves an Area empty", () => {
    for (const area of OPERATIONAL_AREA_CATALOG) {
      assert.ok(area.experienceKeys.length > 0, area.key);
    }
  });
});

describe("Experience Registry — no capability leakage", () => {
  it("does not re-export CAPABILITY_KEYS as Experiences", () => {
    // Knowledge capability is a tool; SERVICE_OPERATIONS is not a catalog Experience.
    assert.equal(isExperienceKey("KNOWLEDGE"), false);
    assert.equal(isExperienceKey("SERVICE_OPERATIONS"), false);
    assert.equal(isExperienceKey("SERVICE_LOGS"), false);
    assert.equal(isExperienceKey("WORK_QUEUE"), false);
    assert.ok(CAPABILITY_KEYS.includes("KNOWLEDGE"));
  });
});
