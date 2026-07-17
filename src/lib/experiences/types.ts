/**
 * Experience Registry — foundational types.
 *
 * Wave 14A: canonical operational vocabulary.
 * Wave 15AC: Experience Contracts (declarative composition) on every Experience.
 *
 * No React, Projection, Shell, or UI consumers in this wave.
 */

import type { AppIconKey } from "@/lib/design-system/icons";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

import type { ExperienceContracts } from "./contracts";

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
 *
 * Operational Area placement remains owned by OPERATIONAL_AREA_CATALOG
 * (department-scoped). Contracts describe composition for Projection/homes later.
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
  /** Catalog version for this definition (identity/metadata). */
  version: number;
  /**
   * Declarative Experience Contracts (Wave 15AC).
   * Required for every catalog entry. No React / rendering.
   */
  contracts: ExperienceContracts;
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

export type { OperationalDepartmentKey, AppIconKey, ExperienceContracts };
