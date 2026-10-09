import type { Prisma } from "@prisma/client";

/**
 * Partner Asset read boundary.
 * Exact Department, Facility through the Unit, and non-retired status.
 * A blank Department throws. Null Department is not a match.
 */
export function partnerAssetWhere(input: {
  facilityId: string;
  departmentId: string;
}): Prisma.AssetWhereInput {
  const departmentId = input.departmentId.trim();
  const facilityId = input.facilityId.trim();
  if (!departmentId) {
    throw new Error("Partner Assets require one Department.");
  }
  if (!facilityId) {
    throw new Error("Partner Assets require a Facility.");
  }
  return {
    departmentId,
    status: { not: "RETIRED" },
    unit: { facilityId },
  };
}
