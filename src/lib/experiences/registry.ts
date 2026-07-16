/**
 * Experience + Operational Area registry helpers.
 *
 * Single lookup surface for the catalogs. Future Projection, Sidebar, and
 * Department Administration consume these helpers — never duplicate catalogs.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";

import { EXPERIENCE_CATALOG } from "./experience-catalog";
import { OPERATIONAL_AREA_CATALOG } from "./operational-area-catalog";
import { isExperienceToolKey } from "./tools";
import type {
  ExperienceDefinition,
  ExperienceStatus,
  OperationalAreaDefinition,
} from "./types";

const experienceByKey = new Map<string, ExperienceDefinition>(
  EXPERIENCE_CATALOG.map((experience) => [experience.key, experience]),
);

const areaByKey = new Map<string, OperationalAreaDefinition>(
  OPERATIONAL_AREA_CATALOG.map((area) => [area.key, area]),
);

/** Registry catalog version — bump when the foundation vocabulary ships a breaking change. */
export const EXPERIENCE_REGISTRY_VERSION = 1;

// ---------------------------------------------------------------------------
// Experience lookups
// ---------------------------------------------------------------------------

export function getExperience(key: string): ExperienceDefinition | undefined {
  return experienceByKey.get(key);
}

export function requireExperience(key: string): ExperienceDefinition {
  const experience = experienceByKey.get(key);
  if (!experience) {
    throw new Error(`Unknown Experience key: ${key}`);
  }
  return experience;
}

export function listExperiences(): ExperienceDefinition[] {
  return [...EXPERIENCE_CATALOG];
}

export function listExperiencesByDepartment(
  departmentKey: OperationalDepartmentKey | string,
): ExperienceDefinition[] {
  return EXPERIENCE_CATALOG.filter((experience) =>
    experience.departments.includes(departmentKey as OperationalDepartmentKey),
  );
}

export function listExperiencesByArea(areaKey: string): ExperienceDefinition[] {
  const area = areaByKey.get(areaKey);
  if (!area) return [];
  return area.experienceKeys
    .map((key) => experienceByKey.get(key))
    .filter((experience): experience is ExperienceDefinition => experience != null);
}

export function listExperiencesByStatus(
  status: ExperienceStatus,
): ExperienceDefinition[] {
  return EXPERIENCE_CATALOG.filter((experience) => experience.status === status);
}

export function isExperienceKey(value: string): boolean {
  return experienceByKey.has(value);
}

export function experienceSupportsDepartment(
  experienceKey: string,
  departmentKey: OperationalDepartmentKey | string,
): boolean {
  const experience = experienceByKey.get(experienceKey);
  if (!experience) return false;
  return experience.departments.includes(departmentKey as OperationalDepartmentKey);
}

// ---------------------------------------------------------------------------
// Operational Area lookups
// ---------------------------------------------------------------------------

export function getOperationalArea(
  key: string,
): OperationalAreaDefinition | undefined {
  return areaByKey.get(key);
}

export function requireOperationalArea(key: string): OperationalAreaDefinition {
  const area = areaByKey.get(key);
  if (!area) {
    throw new Error(`Unknown Operational Area key: ${key}`);
  }
  return area;
}

export function listOperationalAreas(): OperationalAreaDefinition[] {
  return [...OPERATIONAL_AREA_CATALOG].sort((a, b) => {
    if (a.departmentKey === b.departmentKey) return a.order - b.order;
    return a.departmentKey.localeCompare(b.departmentKey);
  });
}

export function listOperationalAreasForDepartment(
  departmentKey: OperationalDepartmentKey | string,
): OperationalAreaDefinition[] {
  return OPERATIONAL_AREA_CATALOG.filter(
    (area) => area.departmentKey === departmentKey,
  ).sort((a, b) => a.order - b.order);
}

/**
 * Resolve which Operational Area owns an Experience within a department.
 * Returns undefined when the Experience is not placed in that department's areas.
 */
export function findAreaForExperience(
  departmentKey: OperationalDepartmentKey | string,
  experienceKey: string,
): OperationalAreaDefinition | undefined {
  return listOperationalAreasForDepartment(departmentKey).find((area) =>
    area.experienceKeys.includes(experienceKey),
  );
}

export function isOperationalAreaKey(value: string): boolean {
  return areaByKey.has(value);
}

// ---------------------------------------------------------------------------
// Validation helpers (used by tests and future profile certification)
// ---------------------------------------------------------------------------

export type ExperienceRegistryIssue = {
  code: string;
  message: string;
};

/**
 * Validate catalog integrity: uniqueness, tool/icon/department referential
 * integrity, and one Experience per Area within each department.
 */
export function validateExperienceRegistry(): ExperienceRegistryIssue[] {
  const issues: ExperienceRegistryIssue[] = [];
  const experienceIds = new Set<string>();
  const experienceKeys = new Set<string>();
  const areaIds = new Set<string>();
  const areaKeys = new Set<string>();
  const validIcons = new Set<string>(Object.keys(AppIcons));

  for (const experience of EXPERIENCE_CATALOG) {
    if (experience.id !== experience.key) {
      issues.push({
        code: "experience_id_key_mismatch",
        message: `${experience.key}: id must equal key in this registry wave`,
      });
    }
    if (experienceIds.has(experience.id)) {
      issues.push({
        code: "duplicate_experience_id",
        message: `Duplicate Experience id: ${experience.id}`,
      });
    }
    experienceIds.add(experience.id);

    if (experienceKeys.has(experience.key)) {
      issues.push({
        code: "duplicate_experience_key",
        message: `Duplicate Experience key: ${experience.key}`,
      });
    }
    experienceKeys.add(experience.key);

    if (!/^[A-Z][A-Z0-9_]*$/.test(experience.key)) {
      issues.push({
        code: "invalid_experience_key_format",
        message: `Experience key must be UPPER_SNAKE: ${experience.key}`,
      });
    }

    if (experience.departments.length === 0) {
      issues.push({
        code: "experience_missing_department",
        message: `${experience.key}: must declare at least one department`,
      });
    }

    if (!validIcons.has(experience.icon)) {
      issues.push({
        code: "invalid_experience_icon",
        message: `${experience.key}: unknown AppIconKey ${experience.icon}`,
      });
    }

    for (const tool of experience.tools) {
      if (!isExperienceToolKey(tool)) {
        issues.push({
          code: "invalid_experience_tool",
          message: `${experience.key}: unknown tool ${tool}`,
        });
      }
    }

    if (experience.version < 1) {
      issues.push({
        code: "invalid_experience_version",
        message: `${experience.key}: version must be >= 1`,
      });
    }
  }

  for (const area of OPERATIONAL_AREA_CATALOG) {
    if (area.id !== area.key) {
      issues.push({
        code: "area_id_key_mismatch",
        message: `${area.key}: id must equal key in this registry wave`,
      });
    }
    if (areaIds.has(area.id)) {
      issues.push({
        code: "duplicate_area_id",
        message: `Duplicate Operational Area id: ${area.id}`,
      });
    }
    areaIds.add(area.id);

    if (areaKeys.has(area.key)) {
      issues.push({
        code: "duplicate_area_key",
        message: `Duplicate Operational Area key: ${area.key}`,
      });
    }
    areaKeys.add(area.key);

    if (area.experienceKeys.length === 0) {
      issues.push({
        code: "empty_area",
        message: `${area.key}: Operational Areas must not be empty`,
      });
    }

    const seenInArea = new Set<string>();
    for (const experienceKey of area.experienceKeys) {
      if (seenInArea.has(experienceKey)) {
        issues.push({
          code: "duplicate_experience_in_area",
          message: `${area.key}: Experience ${experienceKey} listed more than once`,
        });
      }
      seenInArea.add(experienceKey);

      const experience = experienceByKey.get(experienceKey);
      if (!experience) {
        issues.push({
          code: "unknown_experience_in_area",
          message: `${area.key}: unknown Experience ${experienceKey}`,
        });
        continue;
      }
      if (!experience.departments.includes(area.departmentKey)) {
        issues.push({
          code: "experience_ineligible_for_area_department",
          message: `${area.key}: Experience ${experienceKey} is not eligible for ${area.departmentKey}`,
        });
      }
    }
  }

  for (const department of ["DIETARY", "EVS", "PLANT"] as const) {
    const ownership = new Map<string, string>();
    for (const area of listOperationalAreasForDepartment(department)) {
      for (const experienceKey of area.experienceKeys) {
        const prior = ownership.get(experienceKey);
        if (prior) {
          issues.push({
            code: "experience_multiple_areas",
            message: `${department}: Experience ${experienceKey} belongs to both ${prior} and ${area.key}`,
          });
        } else {
          ownership.set(experienceKey, area.key);
        }
      }
    }
  }

  return issues;
}

export function assertExperienceRegistryValid(): void {
  const issues = validateExperienceRegistry();
  if (issues.length > 0) {
    throw new Error(
      `Experience registry invalid:\n${issues.map((i) => `- ${i.code}: ${i.message}`).join("\n")}`,
    );
  }
}

/** Type-narrow helper for AppIconKey when reading catalog icons. */
export function isAppIconKey(value: string): value is AppIconKey {
  return Object.prototype.hasOwnProperty.call(AppIcons, value);
}
