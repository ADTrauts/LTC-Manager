import type { AttachmentParentKind, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CreateAttachmentInput = {
  facilityId: string;
  parentKind: AttachmentParentKind;
  fileRelativePath: string;
  originalFilename: string;
  mimeType: string;
  logSubmissionId?: string | null;
  repairId?: string | null;
  createdByUserId?: string | null;
  createdByEmployeeId?: string | null;
};

/**
 * Persists attachment metadata after a file has been stored under the facility uploads root.
 * Call from upload routes once `fileRelativePath` is known (see `lib/facility-uploads.ts`).
 */
export async function registerAttachmentMetadata(
  db: PrismaClient,
  input: CreateAttachmentInput,
): Promise<{ id: string }> {
  if (!input.logSubmissionId && !input.repairId) {
    throw new Error("Attachment must reference a log submission or a repair.");
  }
  if (input.logSubmissionId) {
    const sub = await db.logSubmission.findFirst({
      where: { id: input.logSubmissionId, unit: { facilityId: input.facilityId } },
      select: { id: true },
    });
    if (!sub) throw new Error("Log submission not found for facility.");
  }
  if (input.repairId) {
    const rep = await db.repair.findFirst({
      where: { id: input.repairId, unit: { facilityId: input.facilityId } },
      select: { id: true },
    });
    if (!rep) throw new Error("Repair not found for facility.");
  }

  return db.attachment.create({
    data: {
      facilityId: input.facilityId,
      parentKind: input.parentKind,
      fileRelativePath: input.fileRelativePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      logSubmissionId: input.logSubmissionId ?? undefined,
      repairId: input.repairId ?? undefined,
      createdByUserId: input.createdByUserId ?? undefined,
      createdByEmployeeId: input.createdByEmployeeId ?? undefined,
    },
    select: { id: true },
  });
}

export async function listAttachmentsForRepair(facilityId: string, repairId: string) {
  return prisma.attachment.findMany({
    where: { facilityId, repairId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listAttachmentsForLogSubmission(facilityId: string, logSubmissionId: string) {
  return prisma.attachment.findMany({
    where: { facilityId, logSubmissionId },
    orderBy: { createdAt: "desc" },
  });
}
