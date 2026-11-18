import type { Prisma } from "@prisma/client";

export type ImplementationWorkFilter = "open" | "unassigned";

export function implementationWorkWhere(filter: ImplementationWorkFilter): Prisma.ImplementationEngagementWhereInput {
  return {
    acceptedAt: null,
    ...(filter === "unassigned" ? { responsibleStaffId: null } : {}),
  };
}
