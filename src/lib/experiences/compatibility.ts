/**
 * Compatibility helpers — translate legacy module / capability names into
 * canonical Experiences and tools.
 *
 * Translation only. Does not modify Facility Builder, domains, or runtime.
 * Existing capability arrays remain migration-only compatibility data.
 */

import type { CapabilityKey } from "@/lib/facility-builder/load-facility-hierarchy";
import { CAPABILITY_KEYS } from "@/lib/facility-builder/load-facility-hierarchy";

import { getExperience, isExperienceKey } from "./registry";
import { getExperienceTool, isExperienceToolKey } from "./tools";
import type { ExperienceDefinition, ExperienceToolDefinition, ExperienceToolKey } from "./types";

/** What a legacy concept resolves to in the new vocabulary. */
export type CompatibilityTargetKind = "experience" | "tool" | "area_hint";

export type CompatibilityMapping = {
  /** Legacy identifier (capability key, module name, or alias). */
  legacyKey: string;
  /** Human label for the legacy concept. */
  legacyLabel: string;
  kind: CompatibilityTargetKind;
  /** Experience key, tool key, or Operational Area key depending on kind. */
  targetKey: string;
  /**
   * When kind is experience and the legacy concept was really a tool,
   * optional tool that should be emphasized inside the Experience.
   */
  emphasizedTool?: ExperienceToolKey;
  notes?: string;
};

/**
 * Canonical legacy → Experience/tool translations.
 * Keys are matched case-insensitively via normalizeLegacyKey.
 */
export const COMPATIBILITY_MAPPINGS: readonly CompatibilityMapping[] = [
  // Capability keys
  {
    legacyKey: "MEAL_SERVICE",
    legacyLabel: "Meal service",
    kind: "experience",
    targetKey: "MEAL_SERVICE",
  },
  {
    legacyKey: "FOOD_SAFETY",
    legacyLabel: "Food safety",
    kind: "experience",
    targetKey: "TEMPERATURE_MONITORING",
    notes:
      "Legacy FOOD_SAFETY capability maps primarily to Temperature Monitoring; Food Safety area also includes Sanitation, HACCP, and Corrective Actions.",
  },
  {
    legacyKey: "SERVICE_LOGS",
    legacyLabel: "Service logs",
    kind: "experience",
    targetKey: "TEMPERATURE_MONITORING",
    emphasizedTool: "LOGS",
    notes: "Temperature / service logs are tools inside Temperature Monitoring.",
  },
  {
    legacyKey: "SERVICE_OPERATIONS",
    legacyLabel: "Service operations",
    kind: "experience",
    targetKey: "MEAL_SERVICE",
    notes: "Broad legacy grouping; Meal Service is the primary Experience.",
  },
  {
    legacyKey: "CLEANING",
    legacyLabel: "Cleaning",
    kind: "experience",
    targetKey: "CLEANING",
  },
  {
    legacyKey: "ROOM_STATUS",
    legacyLabel: "Room status",
    kind: "experience",
    targetKey: "ROOM_STATUS",
  },
  {
    legacyKey: "ASSET_MANAGEMENT",
    legacyLabel: "Asset management",
    kind: "experience",
    targetKey: "ASSETS",
  },
  {
    legacyKey: "BUILDING_MAINTENANCE",
    legacyLabel: "Building maintenance",
    kind: "experience",
    targetKey: "PREVENTIVE_MAINTENANCE",
    notes: "Also related to Work Orders for reactive work.",
  },
  {
    legacyKey: "INSPECTIONS",
    legacyLabel: "Inspections",
    kind: "experience",
    targetKey: "INSPECTIONS",
  },
  {
    legacyKey: "REPAIRS",
    legacyLabel: "Repairs",
    kind: "experience",
    targetKey: "WORK_ORDERS",
    notes: "Repairs resolve to the Work Orders Experience.",
  },
  {
    legacyKey: "WORK_QUEUE",
    legacyLabel: "Work queue",
    kind: "experience",
    targetKey: "ASSIGNMENTS",
  },
  {
    legacyKey: "KNOWLEDGE",
    legacyLabel: "Knowledge",
    kind: "tool",
    targetKey: "KNOWLEDGE",
    notes: "Knowledge is a tool, not an Experience.",
  },

  // Human aliases — normalized keys must not collide with capability keys above.
  {
    legacyKey: "Repair",
    legacyLabel: "Repair",
    kind: "experience",
    targetKey: "WORK_ORDERS",
  },
  {
    legacyKey: "Temperature Logs",
    legacyLabel: "Temperature Logs",
    kind: "experience",
    targetKey: "TEMPERATURE_MONITORING",
    emphasizedTool: "LOGS",
  },
  {
    legacyKey: "Cleaning Lists",
    legacyLabel: "Cleaning Lists",
    kind: "experience",
    targetKey: "CLEANING_LISTS",
  },
  {
    legacyKey: "Assignments",
    legacyLabel: "Assignments",
    kind: "experience",
    targetKey: "ASSIGNMENTS",
  },
  {
    legacyKey: "Logs",
    legacyLabel: "Logs",
    kind: "tool",
    targetKey: "LOGS",
  },
  {
    legacyKey: "Forms",
    legacyLabel: "Forms",
    kind: "tool",
    targetKey: "FORMS",
  },
  {
    legacyKey: "PM",
    legacyLabel: "Preventive Maintenance",
    kind: "experience",
    targetKey: "PREVENTIVE_MAINTENANCE",
  },
  {
    legacyKey: "Work Orders",
    legacyLabel: "Work Orders",
    kind: "experience",
    targetKey: "WORK_ORDERS",
  },
  {
    legacyKey: "Assets",
    legacyLabel: "Assets",
    kind: "experience",
    targetKey: "ASSETS",
  },
] as const;

function normalizeLegacyKey(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

const mappingByNormalizedKey = new Map<string, CompatibilityMapping>();
for (const mapping of COMPATIBILITY_MAPPINGS) {
  mappingByNormalizedKey.set(normalizeLegacyKey(mapping.legacyKey), mapping);
}

export function findCompatibilityMapping(
  legacyKey: string,
): CompatibilityMapping | undefined {
  return mappingByNormalizedKey.get(normalizeLegacyKey(legacyKey));
}

export type ResolvedCompatibility =
  | {
      kind: "experience";
      mapping: CompatibilityMapping;
      experience: ExperienceDefinition;
      emphasizedTool?: ExperienceToolDefinition;
    }
  | {
      kind: "tool";
      mapping: CompatibilityMapping;
      tool: ExperienceToolDefinition;
    }
  | {
      kind: "unmapped";
      legacyKey: string;
    };

/**
 * Resolve a legacy name or capability key to an Experience or tool.
 * Does not mutate domains or Facility Builder state.
 */
export function resolveLegacyConcept(legacyKey: string): ResolvedCompatibility {
  const mapping = findCompatibilityMapping(legacyKey);
  if (!mapping) {
    return { kind: "unmapped", legacyKey };
  }

  if (mapping.kind === "tool") {
    const tool = getExperienceTool(mapping.targetKey);
    if (!tool) {
      return { kind: "unmapped", legacyKey };
    }
    return { kind: "tool", mapping, tool };
  }

  if (mapping.kind === "experience") {
    const experience = getExperience(mapping.targetKey);
    if (!experience) {
      return { kind: "unmapped", legacyKey };
    }
    const emphasizedTool = mapping.emphasizedTool
      ? getExperienceTool(mapping.emphasizedTool)
      : undefined;
    return {
      kind: "experience",
      mapping,
      experience,
      emphasizedTool: emphasizedTool ?? undefined,
    };
  }

  return { kind: "unmapped", legacyKey };
}

/** Map a Facility Builder CapabilityKey to an Experience key when possible. */
export function experienceKeyForCapability(
  capability: CapabilityKey | string,
): string | undefined {
  const resolved = resolveLegacyConcept(capability);
  if (resolved.kind === "experience") return resolved.experience.key;
  return undefined;
}

/** Map a CapabilityKey to a tool key when the legacy concept is a tool. */
export function toolKeyForCapability(
  capability: CapabilityKey | string,
): ExperienceToolKey | undefined {
  const resolved = resolveLegacyConcept(capability);
  if (resolved.kind === "tool") return resolved.tool.key;
  if (resolved.kind === "experience" && resolved.emphasizedTool) {
    return resolved.emphasizedTool.key;
  }
  return undefined;
}

/**
 * Translate a list of capability keys into unique Experience keys.
 * Tool-only capabilities (e.g. KNOWLEDGE) are omitted from the Experience list.
 */
export function experiencesFromCapabilities(
  capabilities: readonly string[],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const capability of capabilities) {
    const experienceKey = experienceKeyForCapability(capability);
    if (!experienceKey || seen.has(experienceKey)) continue;
    seen.add(experienceKey);
    keys.push(experienceKey);
  }
  return keys;
}

/** True when every known CAPABILITY_KEYS value has a compatibility mapping. */
export function assertCapabilitiesHaveCompatibility(): string[] {
  const missing: string[] = [];
  for (const key of CAPABILITY_KEYS) {
    if (!findCompatibilityMapping(key)) {
      missing.push(key);
    }
  }
  return missing;
}

/** Guard used by tests — mapping targets must exist in the registries. */
export function assertCompatibilityTargetsValid(): string[] {
  const issues: string[] = [];
  for (const mapping of COMPATIBILITY_MAPPINGS) {
    if (mapping.kind === "experience" && !isExperienceKey(mapping.targetKey)) {
      issues.push(`${mapping.legacyKey} → unknown Experience ${mapping.targetKey}`);
    }
    if (mapping.kind === "tool" && !isExperienceToolKey(mapping.targetKey)) {
      issues.push(`${mapping.legacyKey} → unknown tool ${mapping.targetKey}`);
    }
    if (
      mapping.emphasizedTool &&
      !isExperienceToolKey(mapping.emphasizedTool)
    ) {
      issues.push(
        `${mapping.legacyKey} → unknown emphasized tool ${mapping.emphasizedTool}`,
      );
    }
  }
  return issues;
}
