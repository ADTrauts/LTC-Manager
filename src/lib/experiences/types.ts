/**
 * Experience Registry — foundational types.
 *
 * Wave 14A: canonical operational vocabulary only.
 * No runtime consumers, Projection, Sidebar, or UI.
 *
 * Product Constitution: engines serve homes; Experiences are the reusable
 * operational building blocks that future homes will compose.
 */

import type { AppIconKey } from "@/lib/design-system/icons";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

/** Stable lifecycle for a catalog Experience. */
export type ExperienceStatus = "active" | "draft" | "deprecated";

/**
 * Coarse catalog grouping for authoring and reporting.
 * Not an Operational Area — Areas are department-scoped (see OperationalAreaDefinition).
 */
export type ExperienceCategory =
  | "SERVICE"
  | "FOOD_SAFETY"
  | "CLEANING"
  | "ROOM_STATUS"
  | "EQUIPMENT"
  | "ASSETS"
  | "MAINTENANCE"
  | "UTILITIES"
  | "PEOPLE"
  | "PRODUCTION"
  | "QUALITY"
  | "COMPLIANCE"
  | "DOCUMENTATION";

/**
 * Tools are instruments exposed inside Experiences — never top-level Experiences.
 * Logs, Knowledge, Forms, Tasks, Records.
 */
export type ExperienceToolKey =
  | "LOGS"
  | "KNOWLEDGE"
  | "FORMS"
  | "TASKS"
  | "RECORDS";

export type ExperienceToolDefinition = {
  /** Stable identity (same as key for the tool catalog). */
  id: ExperienceToolKey;
  key: ExperienceToolKey;
  name: string;
  description: string;
};

/**
 * Canonical Experience — one definition in the shared catalog.
 * Departments select Experiences; they do not author new catalog IDs.
 */
export type ExperienceDefinition = {
  /** Stable identity — equals `key` for this registry wave. */
  id: string;
  /** Stable uppercase snake key used by all consumers. */
  key: string;
  name: string;
  description: string;
  /** Departments eligible to activate this Experience. */
  departments: readonly OperationalDepartmentKey[];
  /** Default chrome icon — AppIconKey, never a Lucide import. */
  icon: AppIconKey;
  status: ExperienceStatus;
  /** Tools this Experience may expose in context. */
  tools: readonly ExperienceToolKey[];
  category: ExperienceCategory;
  /** Catalog version for this definition. */
  version: number;
};

/**
 * Operational Area — department-scoped grouping of Experiences.
 * Manager mental model: Service, Food Safety, Cleaning, Work Orders, etc.
 */
export type OperationalAreaDefinition = {
  /** Stable identity — equals `key`. */
  id: string;
  /** Stable key, unique within the area registry (includes department). */
  key: string;
  name: string;
  description: string;
  departmentKey: OperationalDepartmentKey;
  /** Ordered Experience keys belonging to this area for this department. */
  experienceKeys: readonly string[];
  /** Display / resolution order within the department. */
  order: number;
  status: ExperienceStatus;
  version: number;
};

export type { OperationalDepartmentKey, AppIconKey };
