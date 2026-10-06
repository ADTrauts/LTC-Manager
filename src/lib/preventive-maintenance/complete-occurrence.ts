/**
 * PM occurrence completion. Satisfied only by a completed PREVENTIVE Work Order
 * linked to the occurrence. Same transaction as Work Order closeout.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function completePmOccurrenceForWorkOrder(
  client: DbClient,
  repair: {
    id: string;
    workOrderKind: string;
    pmOccurrenceId: string | null;
  },
  now: Date,
) {
  if (repair.workOrderKind !== "PREVENTIVE" || !repair.pmOccurrenceId) return;
  const occurrence = await client.preventiveMaintenanceOccurrence.findFirst({
    where: { id: repair.pmOccurrenceId },
  });
  if (!occurrence) return;
  if (occurrence.status === "COMPLETED" && occurrence.completedWorkOrderId === repair.id) {
    return;
  }
  if (occurrence.status === "SKIPPED") return;
  await client.preventiveMaintenanceOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: "COMPLETED",
      completedAt: now,
      completedWorkOrderId: repair.id,
    },
  });
}
