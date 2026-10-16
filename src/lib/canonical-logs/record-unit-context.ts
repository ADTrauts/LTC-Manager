import type { Prisma, PrismaClient } from "@prisma/client";

/** Capture asset location context without changing the Attachment's single target identity. */
export async function resolveRecordUnitContext(
  client: PrismaClient | Prisma.TransactionClient,
  input: { facilityId: string; assetId: string | null; unitId: string | null },
): Promise<string | null> {
  if (!input.assetId) return input.unitId;
  const asset = await client.asset.findFirst({
    where: { id: input.assetId, unit: { facilityId: input.facilityId } },
    select: { unitId: true },
  });
  if (!asset) throw new Error("The Record's asset is not available in this facility.");
  return asset.unitId;
}
