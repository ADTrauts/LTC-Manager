import type { JobRoleTier } from "./tiers";
import { isDepartmentJobRoleTier } from "./tiers";
import { normalizeCapabilityKeys, type OperationalCapabilityKey } from "./capabilities";

export function normalizeJobRoleDisplayName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("Job Role name is required.");
  }
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new Error("Job Role name is required.");
  }
  if (name.length > 80) {
    throw new Error("Job Role name must be 80 characters or fewer.");
  }
  return name;
}

export function normalizeJobRoleDescription(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new Error("Description must be 500 characters or fewer.");
  }
  return trimmed;
}

export function parseJobRoleTier(raw: unknown): JobRoleTier {
  if (typeof raw !== "string" || !isDepartmentJobRoleTier(raw.trim())) {
    throw new Error("Select a valid Job Role tier.");
  }
  return raw.trim() as JobRoleTier;
}

export function jobRoleNamesConflict(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function parseCapabilityFormValues(raw: readonly string[]): OperationalCapabilityKey[] {
  return normalizeCapabilityKeys(raw);
}
