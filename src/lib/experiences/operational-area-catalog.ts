/**
 * Operational Area catalog — department-scoped Experience groupings.
 *
 * Areas own ordered Experience references. Within a department, each Experience
 * belongs to exactly one Area. Shared Experiences (e.g. ASSIGNMENTS) appear in
 * each department's People area independently.
 */

import type { OperationalAreaDefinition } from "./types";

/**
 * Canonical Operational Area registry.
 * Keys are department-prefixed for global uniqueness (dietary_service, evs_cleaning).
 */
export const OPERATIONAL_AREA_CATALOG: readonly OperationalAreaDefinition[] = [
  // -------------------------------------------------------------------------
  // Dietary
  // -------------------------------------------------------------------------
  {
    id: "dietary_service",
    key: "dietary_service",
    name: "Service",
    description: "Meal service, menus, recipes, nourishments, and tray accuracy.",
    departmentKey: "DIETARY",
    experienceKeys: [
      "MEAL_SERVICE",
      "MEAL_TIMES",
      "MENUS",
      "RECIPES",
      "PRODUCTION",
      "NOURISHMENTS",
      "TRAY_ACCURACY",
    ],
    order: 10,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_food_safety",
    key: "dietary_food_safety",
    name: "Food Safety",
    description: "Temperature monitoring, sanitation, HACCP, and corrective actions.",
    departmentKey: "DIETARY",
    experienceKeys: [
      "TEMPERATURE_MONITORING",
      "SANITATION",
      "HACCP",
      "CORRECTIVE_ACTIONS",
    ],
    order: 20,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_equipment",
    key: "dietary_equipment",
    name: "Equipment",
    description: "Food-service equipment awareness and care.",
    departmentKey: "DIETARY",
    experienceKeys: ["EQUIPMENT", "ASSETS"],
    order: 30,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_people",
    key: "dietary_people",
    name: "People",
    description: "Assignments, scheduling, and competencies for Dietary.",
    departmentKey: "DIETARY",
    experienceKeys: ["ASSIGNMENTS", "SCHEDULING", "COMPETENCIES"],
    order: 40,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_documentation",
    key: "dietary_documentation",
    name: "Documentation",
    description:
      "Cleaning lists and related documentation Experiences. Logs, Knowledge, and Forms remain tools inside Experiences.",
    departmentKey: "DIETARY",
    experienceKeys: ["CLEANING_LISTS", "CLEANING"],
    order: 50,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_production",
    key: "dietary_production",
    name: "Production",
    description: "Forecasting and batch records beyond core production execution.",
    departmentKey: "DIETARY",
    experienceKeys: ["FORECASTING", "BATCH_RECORDS"],
    order: 60,
    status: "active",
    version: 1,
  },
  {
    id: "dietary_quality",
    key: "dietary_quality",
    name: "Quality",
    description: "Rounding, satisfaction, audits, and inspections.",
    departmentKey: "DIETARY",
    experienceKeys: ["ROUNDING", "SATISFACTION", "AUDITS", "INSPECTIONS"],
    order: 70,
    status: "active",
    version: 1,
  },

  // -------------------------------------------------------------------------
  // EVS
  // -------------------------------------------------------------------------
  {
    id: "evs_cleaning",
    key: "evs_cleaning",
    name: "Cleaning",
    description: "Room cleaning, project cleaning, and cleaning lists.",
    departmentKey: "EVS",
    experienceKeys: ["ROOM_CLEANING", "PROJECT_CLEANING", "CLEANING_LISTS", "CLEANING"],
    order: 10,
    status: "active",
    version: 1,
  },
  {
    id: "evs_room_status",
    key: "evs_room_status",
    name: "Room Status",
    description: "Bed tracking, turnover, and room readiness.",
    departmentKey: "EVS",
    experienceKeys: ["ROOM_STATUS"],
    order: 20,
    status: "active",
    version: 1,
  },
  {
    id: "evs_equipment",
    key: "evs_equipment",
    name: "Equipment",
    description: "EVS equipment and department assets.",
    departmentKey: "EVS",
    experienceKeys: ["EQUIPMENT", "ASSETS"],
    order: 30,
    status: "active",
    version: 1,
  },
  {
    id: "evs_compliance",
    key: "evs_compliance",
    name: "Compliance",
    description: "Infection control, audits, and inspections.",
    departmentKey: "EVS",
    experienceKeys: ["INFECTION_CONTROL", "AUDITS", "INSPECTIONS"],
    order: 40,
    status: "active",
    version: 1,
  },
  {
    id: "evs_people",
    key: "evs_people",
    name: "People",
    description: "Assignments, scheduling, competencies, and rounding.",
    departmentKey: "EVS",
    experienceKeys: ["ASSIGNMENTS", "SCHEDULING", "COMPETENCIES", "ROUNDING"],
    order: 50,
    status: "active",
    version: 1,
  },

  // -------------------------------------------------------------------------
  // Plant
  // -------------------------------------------------------------------------
  {
    id: "plant_assets",
    key: "plant_assets",
    name: "Assets",
    description: "Asset registry and condition for Plant Operations.",
    departmentKey: "PLANT",
    experienceKeys: ["ASSETS"],
    order: 10,
    status: "active",
    version: 1,
  },
  {
    id: "plant_work_orders",
    key: "plant_work_orders",
    name: "Work Orders",
    description: "Reactive repairs and maintenance requests.",
    departmentKey: "PLANT",
    experienceKeys: ["WORK_ORDERS"],
    order: 20,
    status: "active",
    version: 1,
  },
  {
    id: "plant_preventive_maintenance",
    key: "plant_preventive_maintenance",
    name: "Preventive Maintenance",
    description: "PM schedules and preventive rounds.",
    departmentKey: "PLANT",
    experienceKeys: ["PREVENTIVE_MAINTENANCE"],
    order: 30,
    status: "active",
    version: 1,
  },
  {
    id: "plant_utilities",
    key: "plant_utilities",
    name: "Utilities",
    description: "Generators, boilers, water systems, and related utilities.",
    departmentKey: "PLANT",
    experienceKeys: ["UTILITIES"],
    order: 40,
    status: "active",
    version: 1,
  },
  {
    id: "plant_compliance",
    key: "plant_compliance",
    name: "Compliance",
    description: "Life safety, audits, and inspections.",
    departmentKey: "PLANT",
    experienceKeys: ["LIFE_SAFETY", "AUDITS", "INSPECTIONS"],
    order: 50,
    status: "active",
    version: 1,
  },
  {
    id: "plant_people",
    key: "plant_people",
    name: "People",
    description: "Assignments, scheduling, competencies, and rounding.",
    departmentKey: "PLANT",
    experienceKeys: ["ASSIGNMENTS", "SCHEDULING", "COMPETENCIES", "ROUNDING"],
    order: 60,
    status: "active",
    version: 1,
  },
] as const;
