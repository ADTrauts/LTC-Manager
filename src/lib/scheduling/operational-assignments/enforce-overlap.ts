import type { Prisma, PrismaClient } from "@prisma/client";

import { responsibilityWindowsOverlap } from "./responsibility-window";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type OverlapCandidate = {
  id: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
};

/**
 * Write-time overlap check for the same employee on the same operational date.
 * Excludes CANCELLED/COMPLETED and optionally an assignment being edited.
 */
export async function assertNoOverlappingActiveAssignments(
  client: DbClient,
  input: {
    facilityId: string;
    employeeId: string;
    serviceDate: Date;
    startsAt: Date | null;
    endsAt: Date | null;
    excludeAssignmentId?: string;
  },
): Promise<void> {
  const existing = await client.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      employeeId: input.employeeId,
      serviceDate: input.serviceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
      ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
    },
    select: { id: true, startsAt: true, endsAt: true, status: true, roleLabel: true },
  });

  for (const row of existing) {
    if (
      responsibilityWindowsOverlap(
        input.startsAt,
        input.endsAt,
        row.startsAt,
        row.endsAt,
      )
    ) {
      throw new Error(
        `Overlapping Assignment is not allowed. Conflicts with "${row.roleLabel}" (${row.id}).`,
      );
    }
  }
}

/**
 * Acquire a per-employee advisory lock inside a transaction to serialize overlap checks.
 * Uses PostgreSQL hashtext of a stable key.
 */
export async function lockEmployeeAssignmentDay(
  client: DbClient,
  employeeId: string,
  serviceDateKey: string,
): Promise<void> {
  const key = `oa:${employeeId}:${serviceDateKey}`;
  await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
