import type { Prisma, PrismaClient } from "@prisma/client";

import type { FacilitySession } from "@/lib/auth";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

import {
  DepartmentAccessError,
  requireDepartmentManage,
  type DepartmentAccess,
} from "./access";
import { resolveDepartmentAccess, type DepartmentAccessSession } from "./resolve";
import { resolveDepartmentStaffManagerIds } from "./staff-managers";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * CDA-04 changes. The flag off leaves every decision as the role rules computed it.
 * MANAGE is a ceiling: role, PIN and feature rules still apply.
 * VIEW keeps view fields and clears writes. SUMMARY and NONE clear both.
 */
export function applyDepartmentChangeCeiling<T extends { reason: string | null }>(
  decision: T,
  access: DepartmentAccess | null,
  spec: { writes: readonly (keyof T)[]; views: readonly (keyof T)[] },
): T {
  if (!access || access.mode === "MANAGE") return decision;
  const next = { ...decision };
  let cleared = false;
  const clear = (keys: readonly (keyof T)[]) => {
    for (const key of keys) {
      if (next[key] === true) {
        (next as Record<keyof T, unknown>)[key] = false;
        cleared = true;
      }
    }
  };
  clear(spec.writes);
  if (access.mode !== "VIEW") clear(spec.views);
  if (cleared) next.reason = access.reason;
  return next;
}

/** Null when enforcement is off, so callers keep today's decisions. */
export async function loadDepartmentChangeAccess(
  db: DbClient,
  session: DepartmentAccessSession,
  input: { facilityId: string; departmentId: string },
): Promise<DepartmentAccess | null> {
  if (!isContractedDepartmentAuthorityEnabled()) return null;
  if (session.facilityId !== input.facilityId) return null;
  return resolveDepartmentAccess(db, session, input);
}

export async function withDepartmentChangeCeiling<T extends { reason: string | null }>(
  db: DbClient,
  session: DepartmentAccessSession,
  input: { facilityId: string; departmentId: string },
  decision: T,
  spec: { writes: readonly (keyof T)[]; views: readonly (keyof T)[] },
): Promise<T> {
  const access = await loadDepartmentChangeAccess(db, session, input);
  return applyDepartmentChangeCeiling(decision, access, spec);
}

export const PEOPLE_CHANGE_REASON =
  "Only this Department's head, and the managers the head allows, can add staff and set roles.";

/**
 * Adding staff and setting roles. With the flag off, the caller's role check stands.
 * A head may. A manager may only while the head's mark counts.
 */
export async function assertCanChangeDepartmentPeople(
  db: DbClient,
  session: FacilitySession,
  departmentId: string,
): Promise<void> {
  const access = await loadDepartmentChangeAccess(db, session, {
    facilityId: session.facilityId,
    departmentId,
  });
  if (!access) return;
  requireDepartmentManage(access);
  if (access.isHead) return;
  const employee = await db.employee.findFirst({
    where:
      session.authKind === "employee"
        ? { id: session.uid, facilityId: session.facilityId }
        : { userId: session.uid, facilityId: session.facilityId },
    select: { id: true },
  });
  const allowed = employee
    ? await resolveDepartmentStaffManagerIds(db, { facilityId: session.facilityId, departmentId })
    : [];
  if (!employee || !allowed.includes(employee.id)) {
    throw new DepartmentAccessError({ departmentId, mode: "VIEW", reason: PEOPLE_CHANGE_REASON });
  }
}
