import type { Prisma } from "@prisma/client";
import { ImplementationError } from "./contract";

export type ImplementationWorkFilter = "open" | "unassigned" | "assigned";

/** The caller must derive staffId from live validated Harbor authority. */
export function implementationWorkWhere(filter: ImplementationWorkFilter, staffId?: string): Prisma.ImplementationEngagementWhereInput {
  if (filter === "assigned" && !staffId?.trim()) {
    throw new ImplementationError("A current Harbor staff identity is required for assigned work.");
  }
  return {
    acceptedAt: null,
    ...(filter === "unassigned" ? { responsibleStaffId: null } : {}),
    ...(filter === "assigned" ? { responsibleStaffId: staffId } : {}),
  };
}
