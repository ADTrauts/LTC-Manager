/**
 * Assets Phase 1 — BUILD / RUN ownership projections (no schema change).
 *
 * Canonical product split (literal):
 * - BUILD · Asset Builder (`/assets/builder`): what the asset is, where it normally
 *   belongs, who is responsible, active vs retired, recurring maintenance expectations.
 * - RUN · Assets (`/assets`, `/assets/[assetId]`): what is happening now — condition,
 *   open issues, open repairs/work orders, recent history.
 *
 * Single registry: Prisma `Asset`. AssetIssue = reported problem. Repair = work order.
 * Do not invent a second asset identity or a workflow engine here.
 */

import type { Prisma } from "@prisma/client";

/** Surfaces that may create / permanently reconfigure Asset identity. */
export const ASSET_BUILD_PATH = "/assets/builder" as const;

/** Surfaces that project operational Asset state. */
export const ASSET_RUN_PATH = "/assets" as const;

export type AssetOwnershipSurface = "BUILD" | "RUN";

export function resolveAssetOwnershipSurface(pathname: string): AssetOwnershipSurface {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === ASSET_BUILD_PATH || path.startsWith(`${ASSET_BUILD_PATH}/`)) {
    return "BUILD";
  }
  return "RUN";
}

/**
 * Prisma `where` fragment for RUN lists when the shell has a concrete Department.
 *
 * - Concrete department: assets owned by that department, plus unassigned (`null`)
 *   so operators still see equipment that needs a responsible department set.
 * - All Departments / no active department: no filter (facility-wide via caller).
 *
 * Does not invent a second Department selector — callers must pass the shell
 * active department from `resolveActiveDepartmentForShell`.
 */
export function assetResponsibleDepartmentWhere(
  activeDepartmentId: string | null | undefined,
): Prisma.AssetWhereInput {
  if (!activeDepartmentId) {
    return {};
  }
  return {
    OR: [{ departmentId: activeDepartmentId }, { departmentId: null }],
  };
}

/** Lifecycle end-state on Asset (distinct from day-to-day operational condition). */
export const ASSET_LIFECYCLE_RETIRED = "RETIRED" as const;

/**
 * Day-to-day operational condition values (stored on Asset.status today).
 * RETIRED is lifecycle; ACTIVE is legacy synonym for OPERATIONAL.
 */
export const ASSET_CONDITION_VALUES = [
  "OPERATIONAL",
  "DEGRADED",
  "OUT_OF_SERVICE",
] as const;

export type AssetConditionValue = (typeof ASSET_CONDITION_VALUES)[number];

export function isAssetLifecycleRetired(status: string): boolean {
  return status === ASSET_LIFECYCLE_RETIRED;
}

export function isAssetOperationalCondition(status: string): status is AssetConditionValue {
  return (ASSET_CONDITION_VALUES as readonly string[]).includes(status);
}
