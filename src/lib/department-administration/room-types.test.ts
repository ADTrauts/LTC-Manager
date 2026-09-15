import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { recommendArchetypeKey } from "./archetype-recommendation";
import type { DepartmentActionableLocation } from "./department-locations";
import {
  buildRoomTypeExperienceGroups,
  classifyRoomTypeExperienceForUi,
  customizedAssociatedRoomCount,
  departmentArchetypeForRoomType,
  groupAssignedRoomsByRoomType,
  roomTypeSupportsDepartmentConfiguration,
  sharedRoomTypeDescription,
} from "./room-types";
import type { ProfileSnapshot } from "./profile-types";

function room(
  partial: Partial<DepartmentActionableLocation> &
    Pick<DepartmentActionableLocation, "id" | "name" | "roomTypeKey" | "roomTypeLabel">,
): DepartmentActionableLocation {
  return {
    kind: "room",
    source: "space_responsibility",
    displayName: partial.name,
    floorName: "Floor 1",
    parentUnitId: "nbhd",
    parentNeighborhoodName: "Naval Park",
    parentNeighborhoodId: "nbhd",
    isActive: true,
    patternKey: null,
    patternLabel: null,
    hasPattern: false,
    hasOverrides: false,
    status: "assigned",
    unitType: null,
    hierarchyRole: null,
    spaceTypeLabel: partial.roomTypeLabel,
    recommendedPatternKey: null,
    ...partial,
  };
}

function dietaryProfile(): ProfileSnapshot {
  return {
    id: "prof",
    facilityId: "f1",
    departmentId: "d1",
    departmentKey: "DIETARY",
    name: "Dietary",
    version: 1,
    status: "DRAFT",
    baselineKey: "DIETARY",
    areas: [
      {
        id: "area-service",
        key: "dietary_service",
        name: "Service",
        description: null,
        sortOrder: 10,
        isActive: true,
        experiences: [
          {
            id: "ae-meal",
            experienceKey: "MEAL_SERVICE",
            sortOrder: 10,
            isActive: true,
            configuration: null,
          },
          {
            id: "ae-times",
            experienceKey: "MEAL_TIMES",
            sortOrder: 20,
            isActive: true,
            configuration: null,
          },
        ],
      },
      {
        id: "area-safety",
        key: "dietary_food_safety",
        name: "Food Safety",
        description: null,
        sortOrder: 20,
        isActive: true,
        experiences: [
          {
            id: "ae-temp",
            experienceKey: "TEMPERATURE_MONITORING",
            sortOrder: 10,
            isActive: true,
            configuration: null,
          },
        ],
      },
    ],
    archetypes: [
      {
        id: "arch-servery",
        key: "servery",
        name: "Servery",
        description: "Meal setup and service.",
        isActive: true,
        sortOrder: 10,
        experiences: [
          {
            id: "sel-1",
            areaExperienceId: "ae-meal",
            isActive: true,
            sortOrder: 10,
            configuration: null,
          },
          {
            id: "sel-2",
            areaExperienceId: "ae-temp",
            isActive: true,
            sortOrder: 20,
            configuration: null,
          },
        ],
      },
    ],
  };
}

describe("Department Room Types projection", () => {
  it("groups assigned rooms by canonical Facility Room Type and counts them", () => {
    const groups = groupAssignedRoomsByRoomType([
      room({
        id: "s1",
        name: "Naval Park Servery",
        roomTypeKey: "servery",
        roomTypeLabel: "Servery",
      }),
      room({
        id: "s2",
        name: "Lighthouse Servery",
        roomTypeKey: "servery",
        roomTypeLabel: "Servery",
        hasOverrides: true,
      }),
      room({
        id: "store",
        name: "Storage",
        roomTypeKey: "storage",
        roomTypeLabel: "Storage",
      }),
    ]);

    assert.deepEqual(
      groups.map((g) => [g.label, g.rooms.length]),
      [
        ["Servery", 2],
        ["Storage", 1],
      ],
    );
    assert.equal(customizedAssociatedRoomCount(groups[0]!.rooms), 1);
  });

  it("exposes shared Servery description from Facility presets", () => {
    assert.match(sharedRoomTypeDescription("servery") ?? "", /point-of-service/i);
    assert.equal(sharedRoomTypeDescription("custom:nourishment pantry"), null);
  });

  it("preserves experience membership helpers without making them primary UI", () => {
    const profile = dietaryProfile();
    const archetype = departmentArchetypeForRoomType({
      departmentKey: "DIETARY",
      roomTypeKey: "servery",
      profile,
    });
    const groups = buildRoomTypeExperienceGroups({ profile, archetype });
    assert.equal(groups.length, 2);
    const meal = groups[0]!.experiences.find((e) => e.experienceKey === "MEAL_SERVICE")!;
    assert.equal(meal.included, true);
    assert.equal(classifyRoomTypeExperienceForUi("MEAL_SERVICE"), "APPLICABILITY_ONLY");
    assert.equal(classifyRoomTypeExperienceForUi("HACCP"), "LEGACY_REMOVE_FROM_PRIMARY_UI");
    assert.equal(
      classifyRoomTypeExperienceForUi("TEMPERATURE_MONITORING"),
      "APPLICABILITY_ONLY",
    );
  });

  it("maps Dietary Servery Room Type to the baseline servery archetype", () => {
    assert.equal(recommendArchetypeKey("DIETARY", "servery"), "servery");
    assert.equal(roomTypeSupportsDepartmentConfiguration("servery"), true);
    assert.equal(roomTypeSupportsDepartmentConfiguration("custom:x"), false);
  });

  it("Room Type detail: editable About, department defaults, no experience dump, rooms collapsed", () => {
    const panel = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/room-types-panel.tsx",
      ),
      "utf8",
    );
    const aboutAt = panel.indexOf('data-testid="room-type-about"');
    const defaultsAt = panel.indexOf('data-testid="room-type-department-defaults"');
    const roomsAt = panel.indexOf('data-testid="room-type-associated-rooms"');
    assert.ok(aboutAt > 0);
    assert.ok(defaultsAt > aboutAt);
    assert.ok(roomsAt > defaultsAt);
    assert.match(panel, /useState\(false\)/);
    assert.match(panel, /Associated rooms/);
    assert.match(panel, /edit-room-type-about/);
    assert.match(panel, /room-type-about-input/);
    assert.match(panel, /save-room-type-about/);
    assert.match(panel, /cancel-room-type-about/);
    assert.match(panel, /defaults/);
    assert.match(panel, /About this Room Type/);
    assert.equal(/Related builders/.test(panel), false);
    assert.equal(/room-type-link-cycles/.test(panel), false);
    assert.equal(/room-type-link-work-plans/.test(panel), false);
    assert.equal(/room-type-link-templates/.test(panel), false);
    assert.equal(/room-type-link-knowledge/.test(panel), false);
    assert.equal(/Manage Room Type in Facility Builder/.test(panel), false);
    assert.equal(/Department configuration/.test(panel), false);
    assert.equal(/Not used/.test(panel), false);
    assert.equal(/Included/.test(panel), false);
    assert.equal(/Experience Registry/.test(panel), false);
    assert.equal(/HACCP/.test(panel), false);
    assert.equal(/Forecasting/.test(panel), false);
    assert.equal(/Competencies/.test(panel), false);
    assert.equal(/Run does not consume/.test(panel), false);
    assert.equal(/Operational [Tt]ype/.test(panel), false);
    assert.equal(/\bArchetype\b/.test(panel), false);
    assert.equal(/setRoomTypeExperiencesAction/.test(panel), false);
  });

  it("primary Department Builder page no longer mounts Room Types", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(protected)/admin/departments/[departmentId]/page.tsx"),
      "utf8",
    );
    assert.equal(/RoomTypesPanel/.test(page), false);
    assert.match(page, /requestedTab === "room-types"/);
  });

  it("department-use save redirects preserve roomType after DRAFT fork", () => {
    const form = readFileSync(
      join(
        process.cwd(),
        "src/app/(protected)/admin/departments/[departmentId]/action-form.tsx",
      ),
      "utf8",
    );
    assert.match(form, /roomType/);
    assert.match(form, /encodeURIComponent\(profileRedirect\.roomType\)/);
  });
});
