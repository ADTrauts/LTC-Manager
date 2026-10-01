/**
 * Platform department admission vs domain capabilities.
 *
 * Admission (shared engines):
 *   An active facility Department is eligible for Operational Cycles, Work,
 *   Job Flow, Evidence, and Assets. This does not depend on a compile-time
 *   key allowlist or the Department Product registry.
 *
 * Department Product registry (separate):
 *   Answers which operational products Vssyl Inc. publishes. It is not
 *   the shared-engine admission list.
 *
 * Domain capabilities (keep closed):
 *   DIETARY → menus, servery milestones, meal overlays
 *   EVS → EVS sequencing / zone presentation
 *   PLANT → request routing, facility-wide Plant policy
 *
 * A user-created department is admitted. It does not receive domain
 * capabilities unless its key is exactly one of the reserved domain keys —
 * and user-created keys are never allowed to be those reserved keys.
 */

export const DOMAIN_DEPARTMENT_KEYS = ["DIETARY", "EVS", "PLANT"] as const;

export type DomainDepartmentKey = (typeof DOMAIN_DEPARTMENT_KEYS)[number];

const DOMAIN_KEY_SET = new Set<string>(DOMAIN_DEPARTMENT_KEYS);

const MAX_DEPARTMENT_KEY_LENGTH = 32;

export function isDomainDepartmentKey(
  key: string | null | undefined,
): key is DomainDepartmentKey {
  return key === "DIETARY" || key === "EVS" || key === "PLANT";
}

export function hasDietaryDomainCapabilities(key: string | null | undefined): boolean {
  return key === "DIETARY";
}

export function hasEvsDomainCapabilities(key: string | null | undefined): boolean {
  return key === "EVS";
}

export function hasPlantDomainCapabilities(key: string | null | undefined): boolean {
  return key === "PLANT";
}

/**
 * Shared runtime admission from persisted Department facts.
 * Inactive rows are not operated. Visibility (`showInEmployeeApp`) is HR
 * presentation, not admission.
 */
export function isDepartmentAdmittedToSharedOperations(department: {
  isActive: boolean;
} | null | undefined): boolean {
  return Boolean(department?.isActive);
}

export function parseOperationalDepartmentKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 ? key : null;
}

export function slugifyDepartmentKeyFromName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_DEPARTMENT_KEY_LENGTH)
    .replace(/_+$/g, "");
  return slug || "DEPT";
}

/**
 * Stable machine key for a user-created department.
 * Never assigns reserved domain keys (or the same strings used as
 * Department Product keys today) so a name like "Dietary" cannot
 * inherit Dietary domain capabilities or become a product installation.
 */
export function allocateDepartmentKey(
  name: string,
  existingKeys: readonly string[],
): string {
  const taken = new Set(existingKeys);
  const base = slugifyDepartmentKeyFromName(name);
  const candidates: string[] = [];
  if (!DOMAIN_KEY_SET.has(base)) {
    candidates.push(base);
  }
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `_${n}`;
    const trimmedBase = base.slice(0, Math.max(1, MAX_DEPARTMENT_KEY_LENGTH - suffix.length));
    candidates.push(`${trimmedBase}${suffix}`);
  }
  for (const candidate of candidates) {
    if (!taken.has(candidate) && !DOMAIN_KEY_SET.has(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not allocate a unique department key.");
}
