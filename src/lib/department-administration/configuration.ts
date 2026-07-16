/**
 * Bounded Experience configuration validation.
 *
 * configurationJson is Experience tuning only — never live operational data.
 * Shape: flat object; values are primitives or arrays of primitives.
 */

import type { ExperienceConfiguration } from "./profile-types";

const MAX_KEYS = 32;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_LENGTH = 64;
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export type ConfigurationIssue = { path: string; message: string };

export function validateExperienceConfiguration(
  value: unknown,
): ConfigurationIssue[] {
  if (value === null || value === undefined) return [];
  const issues: ConfigurationIssue[] = [];

  if (typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "", message: "Configuration must be a flat JSON object" }];
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_KEYS) {
    issues.push({ path: "", message: `Configuration exceeds ${MAX_KEYS} keys` });
  }

  for (const [key, entry] of entries) {
    if (!KEY_PATTERN.test(key)) {
      issues.push({ path: key, message: "Invalid configuration key format" });
    }
    if (typeof entry === "string") {
      if (entry.length > MAX_STRING_LENGTH) {
        issues.push({ path: key, message: "String value too long" });
      }
      continue;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      continue;
    }
    if (Array.isArray(entry)) {
      if (entry.length > MAX_ARRAY_LENGTH) {
        issues.push({ path: key, message: "Array value too long" });
        continue;
      }
      const allStrings = entry.every((v) => typeof v === "string");
      const allNumbers = entry.every((v) => typeof v === "number");
      if (!allStrings && !allNumbers) {
        issues.push({
          path: key,
          message: "Arrays must contain only strings or only numbers",
        });
      }
      if (
        allStrings &&
        (entry as string[]).some((v) => v.length > MAX_STRING_LENGTH)
      ) {
        issues.push({ path: key, message: "Array string value too long" });
      }
      continue;
    }
    issues.push({
      path: key,
      message: "Values must be primitives or arrays of primitives",
    });
  }

  return issues;
}

export function isValidExperienceConfiguration(
  value: unknown,
): value is ExperienceConfiguration | null {
  return validateExperienceConfiguration(value).length === 0;
}

/** Merge configurations: later layers override earlier keys (shallow). */
export function mergeExperienceConfiguration(
  ...layers: (ExperienceConfiguration | null | undefined)[]
): ExperienceConfiguration | null {
  const merged: ExperienceConfiguration = {};
  let any = false;
  for (const layer of layers) {
    if (!layer) continue;
    any = true;
    Object.assign(merged, layer);
  }
  return any ? merged : null;
}
