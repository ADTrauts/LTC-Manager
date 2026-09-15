import type { NextRequest } from "next/server";

import type { AppJwtPayload } from "@/lib/auth";
import type { OperationalDepartmentKey } from "@/lib/department-nav";

/**
 * Minimal stub — full module lives on product/safety branches but is absent from main.
 * Opens department nav so proxy/shell can compile for design-lab previews.
 */
export type ActiveDepartmentNavResolution = {
  showAllDepartmentNav: boolean;
  activeDepartmentId: string | null;
  activeOperationalDepartmentKey: OperationalDepartmentKey | null;
};

const OPEN_NAV: ActiveDepartmentNavResolution = {
  showAllDepartmentNav: true,
  activeDepartmentId: null,
  activeOperationalDepartmentKey: null,
};

export async function resolveActiveDepartmentForNav(
  _request: NextRequest,
  _session: AppJwtPayload,
): Promise<ActiveDepartmentNavResolution> {
  return OPEN_NAV;
}

export async function resolveActiveDepartmentForShell(
  _session: AppJwtPayload,
  _cookieStore: { get: (name: string) => { value: string } | undefined },
): Promise<ActiveDepartmentNavResolution> {
  return OPEN_NAV;
}

export async function validateActiveDepartmentPick(
  _session: AppJwtPayload,
  _pick: string,
): Promise<boolean> {
  return true;
}
