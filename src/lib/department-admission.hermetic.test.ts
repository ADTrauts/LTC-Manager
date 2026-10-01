import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  allocateDepartmentKey,
  hasDietaryDomainCapabilities,
  hasEvsDomainCapabilities,
  hasPlantDomainCapabilities,
  isDepartmentAdmittedToSharedOperations,
  isDomainDepartmentKey,
  parseOperationalDepartmentKey,
  slugifyDepartmentKeyFromName,
} from "@/lib/department-admission";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import {
  isAnyStaffingOperationalFeatureEnabled,
  isDepartmentAssetOperationsEnabled,
  isDepartmentJobFlowEnabled,
  isDepartmentOperationalCyclesEnabled,
  isDepartmentOperationalEvidenceEnabled,
  isDepartmentWorkPlansEnabled,
} from "@/lib/department-operations";
import { decideCycleAuthority } from "@/lib/operational-cycles/cycle-authority";
import { resolveOperationalCycle } from "@/lib/operational-cycles/resolve-operational-cycle";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";
import { resolveWorkRequirements } from "@/lib/department-work/resolve-requirements";
import { listWorkPlanPresetSummaries } from "@/lib/department-work/work-presets";
import type { PublishedWorkPlanForResolve } from "@/lib/department-work/types";
import { decideJobFlowAuthority } from "@/lib/dietary-job-flow/job-flow-authority";
import { decideOperationalRequestAuthority } from "@/lib/operational-requests";
import {
  listExperiencesByDepartment,
  listOperationalAreasForDepartment,
} from "@/lib/experiences";
import { resolveEvidenceRequirements } from "@/lib/operational-evidence/resolve-requirements";
import type { PublishedTemplateForResolve } from "@/lib/operational-evidence/types";
import { resolveProjection } from "@/lib/projection/pipeline";
import type { ProjectionSource } from "@/lib/projection/source";
import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";

/** Test-only key. Must not appear in production constants. */
const AQUATICS = "AQUATICS";

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

function aquaticsOpeningCycle(): OperationalCycleDefinition {
  return {
    id: "cycle_aquatics_open",
    stableKey: "morning_opening",
    parentStableKey: null,
    nodeKind: "PERIOD",
    version: 1,
    label: "Morning Opening",
    description: null,
    cycleType: "CUSTOM",
    displaySequence: 10,
    startLocal: "06:00",
    endLocal: "09:00",
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    mealType: null,
    locationMode: "ALL_DEPARTMENT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    roomTypeKey: null,
    expectedMilestones: [],
    status: "PUBLISHED",
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
  };
}

describe("department admission — shared engines vs domain capabilities", () => {
  it("admits an active department row regardless of key", () => {
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: true }), true);
    assert.equal(isDepartmentAdmittedToSharedOperations({ isActive: false }), false);
    assert.equal(isDepartmentAdmittedToSharedOperations(null), false);
  });

  it("does not treat AQUATICS as a domain module", () => {
    assert.equal(isDomainDepartmentKey(AQUATICS), false);
    assert.equal(hasDietaryDomainCapabilities(AQUATICS), false);
    assert.equal(hasEvsDomainCapabilities(AQUATICS), false);
    assert.equal(hasPlantDomainCapabilities(AQUATICS), false);
    assert.equal(hasDietaryDomainCapabilities("DIETARY"), true);
    assert.equal(hasEvsDomainCapabilities("EVS"), true);
    assert.equal(hasPlantDomainCapabilities("PLANT"), true);
  });

  it("admits custom keys to shared engines without trio flags", () => {
    withEnv("DIETARY_OPERATIONAL_CYCLES_ENABLED", "false", () => {
      withEnv("DIETARY_JOB_FLOW_ENABLED", undefined, () => {
        withEnv("DIETARY_OPERATIONAL_EVIDENCE_ENABLED", undefined, () => {
          withEnv("DIETARY_ASSET_OPERATIONS_ENABLED", undefined, () => {
            withEnv("DIETARY_WORK_PLANS_ENABLED", undefined, () => {
              withEnv("EVS_OPERATIONS_ENABLED", undefined, () => {
                withEnv("PLANT_OPERATIONS_ENABLED", undefined, () => {
                  assert.equal(isDepartmentOperationalCyclesEnabled(AQUATICS), true);
                  assert.equal(isDepartmentJobFlowEnabled(AQUATICS), true);
                  assert.equal(isDepartmentOperationalEvidenceEnabled(AQUATICS), true);
                  assert.equal(isDepartmentAssetOperationsEnabled(AQUATICS), true);
                  assert.equal(isDepartmentWorkPlansEnabled(AQUATICS), true);
                  assert.equal(isAnyStaffingOperationalFeatureEnabled("cycles", AQUATICS), true);

                  assert.equal(isDepartmentOperationalCyclesEnabled("DIETARY"), false);
                  assert.equal(isDepartmentJobFlowEnabled("EVS"), false);
                  assert.equal(isDepartmentWorkPlansEnabled("PLANT"), false);
                  assert.equal(isDepartmentOperationalCyclesEnabled(null), false);
                });
              });
            });
          });
        });
      });
    });
  });

  it("keeps Dietary / EVS / Plant release flags independent of custom admission", () => {
    withEnv("DIETARY_WORK_PLANS_ENABLED", "true", () => {
      withEnv("EVS_OPERATIONS_ENABLED", undefined, () => {
        withEnv("PLANT_OPERATIONS_ENABLED", undefined, () => {
          assert.equal(isDepartmentWorkPlansEnabled("DIETARY"), true);
          assert.equal(isDepartmentWorkPlansEnabled("EVS"), false);
          assert.equal(isDepartmentWorkPlansEnabled("PLANT"), false);
          assert.equal(isDepartmentWorkPlansEnabled(AQUATICS), true);
        });
      });
    });
  });

  it("never assigns reserved domain keys to a user-created department", () => {
    assert.equal(slugifyDepartmentKeyFromName("Aquatics"), AQUATICS);
    assert.equal(
      allocateDepartmentKey("Aquatics", ["DIETARY", "EVS", "PLANT"]),
      AQUATICS,
    );
    assert.equal(allocateDepartmentKey("Dietary", ["DIETARY"]), "DIETARY_2");
    assert.equal(allocateDepartmentKey("Dietary 2", ["DIETARY"]), "DIETARY_2");
    assert.equal(isDomainDepartmentKey(allocateDepartmentKey("Dietary", [])), false);
    assert.equal(isDomainDepartmentKey(allocateDepartmentKey("EVS", ["EVS"])), false);
    assert.equal(hasDietaryDomainCapabilities(allocateDepartmentKey("Dietary 2", ["DIETARY"])), false);
    assert.equal(
      allocateDepartmentKey("Aquatics", [AQUATICS, "DIETARY", "EVS", "PLANT"]),
      "AQUATICS_2",
    );
    assert.equal(parseOperationalDepartmentKey("  AQUATICS  "), AQUATICS);
    assert.equal(parseOperationalDepartmentKey(""), null);
  });

  it("shows shared assets nav and hides Dietary menus for a custom department", () => {
    assert.equal(pathnameAllowedForDepartmentKey("/menus", AQUATICS), false);
    assert.equal(pathnameAllowedForDepartmentKey("/menus", "DIETARY"), true);
    assert.equal(pathnameAllowedForDepartmentKey("/assets", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/asset-issues", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/repairs", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/issues", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/workspace", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/today", AQUATICS), true);
    assert.equal(pathnameAllowedForDepartmentKey("/assets", null), false);
  });

  it("does not grant Dietary / EVS / Plant catalog experiences to AQUATICS", () => {
    assert.deepEqual(listOperationalAreasForDepartment(AQUATICS), []);
    assert.deepEqual(listExperiencesByDepartment(AQUATICS), []);
    assert.ok(listOperationalAreasForDepartment("DIETARY").length > 0);
    assert.ok(listExperiencesByDepartment("DIETARY").some((e) => e.key === "MEAL_SERVICE"));
    assert.deepEqual(listWorkPlanPresetSummaries(AQUATICS), []);
    assert.ok(listWorkPlanPresetSummaries("DIETARY").length > 0);
  });

  it("resolves a generic custom cycle without a compile-time department key", () => {
    const context = resolveOperationalCycle({
      cycles: [aquaticsOpeningCycle()],
      now: new Date("2026-09-27T07:30:00.000-04:00"),
      facilityTimezone: "America/New_York",
      operationalDateKey: "2026-09-27",
      departmentApplicable: true,
    });
    assert.equal(context.state, "ACTIVE");
    if (context.state !== "ACTIVE") return;
    assert.equal(context.primary.stableKey, "morning_opening");
    assert.equal(context.primary.mealType, null);
  });

  it("derives work requirements for a custom department from a published plan", () => {
    const plan: PublishedWorkPlanForResolve = {
      id: "plan_aquatics",
      stableKey: "opening_checks",
      version: 1,
      name: "Opening checks",
      status: "PUBLISHED",
      effectiveStartDate: null,
      effectiveEndDate: null,
      weekdays: [],
      applicabilities: [
        {
          kind: "SPECIFIC_UNIT",
          unitId: "unit_pool",
          spaceId: null,
          spaceType: null,
          assetId: null,
          assetType: null,
        },
      ],
      items: [
        {
          id: "item_deck",
          itemKey: "deck_inspection",
          label: "Deck inspection",
          instructions: null,
          displaySequence: 10,
          priority: "ROUTINE",
          completionMode: "EXPLICIT_CONFIRMATION",
          responsibilityMode: "UNIT_SHARED",
          scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
          cycleStableKeys: [],
          windowStartLocal: null,
          windowEndLocal: null,
          dueOffsetKind: null,
          dueOffsetMinutes: null,
          roleKeys: [],
          unitId: null,
          spaceId: null,
          assetId: null,
          knowledgeArticleId: null,
          procedureTitleSnapshot: null,
          linkedTemplateStableKey: null,
          linkedTemplateId: null,
          supervisorVisible: true,
        },
      ],
    };

    const requirements = resolveWorkRequirements({
      facilityId: "fac_1",
      departmentId: "dept_aquatics",
      operationalDateKey: "2026-09-27",
      now: new Date("2026-09-27T11:00:00.000Z"),
      facilityTimezone: "America/New_York",
      confirmedAssignments: [{ employeeId: "e1", unitId: "unit_pool", roleKey: null }],
      publishedPlans: [plan],
      publishedCycles: [],
      existingOccurrences: [],
    });

    assert.equal(requirements.length, 1);
    assert.equal(requirements[0]?.workItemKey, "deck_inspection");
    assert.equal(requirements[0]?.unitId, "unit_pool");
  });

  it("derives evidence requirements for a custom department template", () => {
    const template: PublishedTemplateForResolve = {
      id: "tpl_chem",
      stableKey: "water_chemistry",
      version: 1,
      name: "Water chemistry",
      description: null,
      instructions: null,
      purposeType: "LOG",
      status: "PUBLISHED",
      allowAdHoc: false,
      fields: [
        {
          fieldKey: "ph",
          label: "pH",
          fieldType: "NUMBER",
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: null,
          minNumber: 7,
          maxNumber: 8,
          allowedSelections: [],
          correctiveActionTrigger: true,
          correctiveActionRequired: false,
        },
      ],
      applicabilities: [
        {
          kind: "DEPARTMENT_UNIT",
          assetId: null,
          assetType: null,
          spaceId: null,
          spaceType: null,
          unitId: "unit_pool",
        },
      ],
      schedules: [{ kind: "ONCE_PER_OPERATIONAL_DATE", cycleStableKey: null, windowStartLocal: null, windowEndLocal: null }],
    };

    const requirements = resolveEvidenceRequirements({
      facilityId: "fac_1",
      departmentId: "dept_aquatics",
      operationalDateKey: "2026-09-27",
      now: new Date("2026-09-27T11:00:00.000Z"),
      facilityTimezone: "America/New_York",
      unitId: "unit_pool",
      publishedTemplates: [template],
      publishedCycles: [],
      existingRecords: [],
    });

    assert.ok(requirements.length >= 1);
    assert.equal(requirements[0]?.templateStableKey, "water_chemistry");
  });

  it("projects an unknown department from room responsibility without Plant policy", () => {
    const departmentId = "dept_aquatics";
    const spaceId = "space_main_pool";
    const unitId = "unit_pool";
    const source: ProjectionSource = {
      request: {
        facilityId: "fac_1",
        lens: {
          mode: "DEPARTMENT",
          departmentId,
          departmentKey: AQUATICS,
        },
        accessClass: {
          key: "manager-all",
          principalKind: "USER",
          role: "MANAGER",
          allowedUnitIds: "ALL",
          permissionKeys: ["*"],
        },
        purpose: "LOCATIONS",
        asOf: "2026-09-27T12:00:00.000Z",
      },
      facility: { id: "fac_1", label: "Test Facility" },
      locations: [
        {
          id: "loc:facility",
          reference: { kind: "FACILITY", facilityId: "fac_1" },
          parentId: null,
          label: "Test Facility",
          isActive: true,
          isPlaced: true,
        },
        {
          id: "loc:pool_unit",
          reference: {
            kind: "UNIT",
            facilityId: "fac_1",
            unitId,
            hierarchyRole: "NEIGHBORHOOD",
          },
          parentId: "loc:facility",
          label: "Pool deck",
          isActive: true,
          isPlaced: true,
        },
        {
          id: "loc:main_pool",
          reference: {
            kind: "SPACE",
            facilityId: "fac_1",
            unitId,
            spaceId,
            roomRole: "pool",
          },
          parentId: "loc:pool_unit",
          label: "Main Pool",
          isActive: true,
          isPlaced: true,
        },
        {
          id: "loc:kitchen",
          reference: {
            kind: "SPACE",
            facilityId: "fac_1",
            unitId,
            spaceId: "space_kitchen",
            roomRole: "kitchen",
          },
          parentId: "loc:pool_unit",
          label: "Kitchen",
          isActive: true,
          isPlaced: true,
        },
      ],
      rooms: [
        {
          locationId: "loc:main_pool",
          context: {
            id: spaceId,
            facilityId: "fac_1",
            isActive: true,
            unitId,
            parentHierarchyRole: "NEIGHBORHOOD",
            assignedDepartmentIds: [departmentId],
          },
        },
        {
          locationId: "loc:kitchen",
          context: {
            id: "space_kitchen",
            facilityId: "fac_1",
            isActive: true,
            unitId,
            parentHierarchyRole: "NEIGHBORHOOD",
            assignedDepartmentIds: ["dept_dietary"],
          },
        },
      ],
      departments: [
        {
          id: departmentId,
          key: AQUATICS,
          label: "Aquatics",
          isActive: true,
          activeProfile: null,
          assignedRoomIds: [spaceId],
          assignedUnitIds: [],
          archetypeBindings: [],
          roomExceptions: [],
        },
      ],
      policies: [],
      revision: {
        hierarchyRevision: "h1",
        assignmentRevision: "a1",
        profileRevision: "p1",
        bindingRevision: "b1",
        policyRevision: "pol1",
        experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
        accessClassRevision: "ac1",
      },
      resolvedAt: "2026-09-27T12:00:00.000Z",
    };

    const snapshot = resolveProjection(source);
    assert.equal(snapshot.context.request.lens.mode, "DEPARTMENT");
    if (snapshot.context.request.lens.mode === "DEPARTMENT") {
      assert.equal(snapshot.context.request.lens.departmentKey, AQUATICS);
    }
    assert.equal(snapshot.plantPolicy?.applied ?? false, false);
    const labels = Object.values(snapshot.locations.byId).map((node) => node.label);
    assert.ok(labels.includes("Main Pool"));
    assert.equal(labels.includes("Kitchen"), false);
    assert.equal(
      snapshot.diagnostics.issues.some((d) => d.code === "UNKNOWN_DEPARTMENT"),
      false,
    );
  });

  it("enables cycle and job-flow authority for an admitted custom department", () => {
    const cycle = decideCycleAuthority({
      flagEnabled: isDepartmentOperationalCyclesEnabled(AQUATICS),
      role: "MANAGER",
      authMethod: "PASSWORD",
      sessionFacilityId: "fac_1",
      facilityId: "fac_1",
      departmentId: "dept_aquatics",
      departmentExists: true,
      primaryDepartmentId: "dept_aquatics",
    });
    assert.equal(cycle.canViewRuntime, true);
    assert.equal(cycle.canManage, true);

    const jobFlow = decideJobFlowAuthority({
      flagEnabled: isDepartmentJobFlowEnabled(AQUATICS),
      role: "STAFF",
      authMethod: "PASSWORD",
      sessionFacilityId: "fac_1",
      facilityId: "fac_1",
      departmentId: "dept_aquatics",
      departmentExists: true,
      primaryDepartmentId: "dept_aquatics",
    });
    assert.equal(jobFlow.canViewOwnJobFlow, true);

    const request = decideOperationalRequestAuthority({
      flagEnabled: true,
      role: "STAFF",
      authMethod: "PASSWORD",
      sessionFacilityId: "fac_1",
      facilityId: "fac_1",
      departmentId: "dept_aquatics",
      departmentExists: true,
      departmentKey: AQUATICS,
      primaryDepartmentId: "dept_aquatics",
    });
    assert.equal(request.canReport, true);
    assert.equal(request.canTriage, false);
    assert.equal(request.canConfigureRoutes, false);
    assert.equal(request.canManageWorkOrders, false);
  });

  it("keeps Dietary starter and EVS/Plant overlays as domain source, not admission", () => {
    const cyclesPanel = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/cycles-panel.tsx"),
      "utf8",
    );
    assert.match(cyclesPanel, /departmentKey === "DIETARY"/);
    assert.match(cyclesPanel, /departmentKey === "EVS"/);

    const loadFlow = readFileSync(
      join(process.cwd(), "src/lib/employee-runtime-flow/load-flow.ts"),
      "utf8",
    );
    assert.match(loadFlow, /departmentKey !== "EVS"/);
    assert.match(loadFlow, /buildPlantWorkOrderAttention/);

    const loadSource = readFileSync(
      join(process.cwd(), "src/lib/projection/load-source.ts"),
      "utf8",
    );
    assert.match(loadSource, /hasPlantDomainCapabilities/);
    assert.doesNotMatch(loadSource, /Skipping non-operational department key/);

    const seed = readFileSync(
      join(process.cwd(), "src/lib/ensure-default-departments.ts"),
      "utf8",
    );
    assert.match(seed, /installDepartmentProduct/);
    assert.match(seed, /DIETARY/);
    assert.doesNotMatch(seed, /AQUATICS/);
  });

  it("does not add AQUATICS to production constants", () => {
    const productionPaths = [
      "src/lib/department-admission.ts",
      "src/lib/department-operations.ts",
      "src/lib/department-nav.ts",
      "src/lib/ensure-default-departments.ts",
      "src/lib/department-products/registry.ts",
      "src/lib/department-products/install.ts",
      "src/lib/feature-flags.ts",
      "src/lib/experiences/operational-area-catalog.ts",
      "src/lib/experiences/experience-catalog.ts",
    ];
    for (const relative of productionPaths) {
      const source = readFileSync(join(process.cwd(), relative), "utf8");
      assert.doesNotMatch(source, /AQUATICS/, relative);
    }
  });
});
