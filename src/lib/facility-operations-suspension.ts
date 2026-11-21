import type { Prisma } from "@prisma/client";

type Db = Pick<Prisma.TransactionClient, "facility">;

export const FACILITY_OPERATIONS_PAUSED_MESSAGE =
  "Operational changes are paused for this Facility. Existing data, billing and Support remain available.";

/** Fresh state only: never put this decision in a cookie, bundle, cache or entitlement mirror. */
export async function facilityOperationsAreSuspended(db: Db, facilityId: string): Promise<boolean> {
  const facility = await db.facility.findUnique({
    where: { id: facilityId }, select: { operationsSuspendedAt: true },
  });
  if (!facility) throw new Error("Facility not found.");
  return facility.operationsSuspendedAt !== null;
}

/** UX preflight. The database triggers remain the commit-time enforcement for every writer. */
export async function assertFacilityOperationsAvailable(db: Db, facilityId: string) {
  if (await facilityOperationsAreSuspended(db, facilityId)) {
    throw new Error(FACILITY_OPERATIONS_PAUSED_MESSAGE);
  }
}

/** Mutating customer requests that must remain available during a pause. */
export function facilityPauseAllowsMutation(pathname: string): boolean {
  return pathname === "/admin/offboarding" || /^\/admin\/offboarding\/[^/]+$/.test(pathname) ||
    pathname === "/admin/exports" || /^\/api\/customer-exports\/[^/]+\/download$/.test(pathname) || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/billing/") ||
    pathname.startsWith("/api/support/") || pathname === "/access/enter" ||
    pathname === "/access" || pathname === "/partner" ||
    pathname === "/admin/billing" || pathname.startsWith("/admin/billing/") ||
    pathname === "/help" || pathname.startsWith("/help/") ||
    pathname === "/account" || pathname.startsWith("/account/") ||
    pathname === "/notifications" || pathname.startsWith("/api/notifications/");
}
