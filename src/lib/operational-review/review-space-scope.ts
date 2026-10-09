import type { Prisma } from "@prisma/client";

/**
 * Department-scoped Review rooms come from UnitSpaceResponsibility.
 * A null department keeps the Facility-wide space set used by all-Department Review.
 * Parent neighborhood labels travel with an authorized room. Unrelated rooms are not loaded.
 */
export function operationalReviewSpaceWhere(
  facilityId: string,
  departmentId: string | null | undefined,
): Prisma.UnitSpaceWhereInput {
  if (departmentId) {
    return {
      facilityId,
      isActive: true,
      responsibilities: { some: { departmentId } },
    };
  }
  return { facilityId, isActive: true };
}
