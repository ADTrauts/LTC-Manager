import { Prisma, type AttachmentParentKind, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type CreateAttachmentInput = {
  facilityId: string;
  parentKind: AttachmentParentKind;
  fileRelativePath: string;
  originalFilename: string;
  mimeType: string;
  logSubmissionId?: string | null;
  repairId?: string | null;
  assetId?: string | null;
  createdByUserId?: string | null;
  createdByEmployeeId?: string | null;
};

/**
 * Persists attachment metadata after a file has been stored under the facility uploads root.
 * Call from upload routes once `fileRelativePath` is known (see `lib/facility-uploads.ts`).
 */
export async function registerAttachmentMetadata(
  db: DbClient,
  input: CreateAttachmentInput,
): Promise<{ id: string }> {
  const parentCount = [input.logSubmissionId, input.repairId, input.assetId].filter(Boolean).length;
  if (parentCount !== 1) {
    throw new Error("Attachment must reference exactly one of: log submission, repair, or asset.");
  }
  if (input.parentKind === "LOG_SUBMISSION" && !input.logSubmissionId) {
    throw new Error("Log submission attachment is missing its parent.");
  }
  if (input.parentKind === "REPAIR" && !input.repairId) {
    throw new Error("Repair attachment is missing its parent.");
  }
  if (input.parentKind === "ASSET" && !input.assetId) {
    throw new Error("Asset attachment is missing its parent.");
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
  if (input.assetId) {
    const asset = await db.asset.findFirst({
      where: { id: input.assetId, unit: { facilityId: input.facilityId } },
      select: { id: true },
    });
    if (!asset) throw new Error("Asset not found for facility.");
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
      assetId: input.assetId ?? undefined,
      createdByUserId: input.createdByUserId ?? undefined,
      createdByEmployeeId: input.createdByEmployeeId ?? undefined,
    },
    select: { id: true },
  });
}

export type AttachmentListItem = {
  id: string;
  originalFilename: string;
  mimeType: string;
  createdAt: Date;
};

const listSelect = {
  id: true,
  originalFilename: true,
  mimeType: true,
  createdAt: true,
} as const;

export async function listAttachmentsForRepair(
  facilityId: string,
  repairId: string,
  db: DbClient = prisma,
): Promise<AttachmentListItem[]> {
  return db.attachment.findMany({
    where: { facilityId, repairId, parentKind: "REPAIR" },
    orderBy: { createdAt: "desc" },
    select: listSelect,
  });
}

export async function listAttachmentsForAsset(
  facilityId: string,
  assetId: string,
  db: DbClient = prisma,
): Promise<AttachmentListItem[]> {
  try {
    return await db.attachment.findMany({
      where: { facilityId, assetId, parentKind: "ASSET" },
      orderBy: { createdAt: "desc" },
      select: listSelect,
    });
  } catch (error) {
    if (!isMissingAttachmentAssetColumnError(error)) throw error;
    return [];
  }
}

export async function listPrimaryAssetPhotoIds(
  facilityId: string,
  assetIds: string[],
  db: DbClient = prisma,
): Promise<Map<string, string>> {
  const photoByAssetId = new Map<string, string>();
  if (assetIds.length === 0) return photoByAssetId;
  try {
    const rows = await db.attachment.findMany({
      where: {
        facilityId,
        parentKind: "ASSET",
        assetId: { in: assetIds },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, assetId: true },
    });
    for (const row of rows) {
      if (row.assetId && !photoByAssetId.has(row.assetId)) {
        photoByAssetId.set(row.assetId, row.id);
      }
    }
  } catch (error) {
    if (!isMissingAttachmentAssetColumnError(error)) throw error;
  }
  return photoByAssetId;
}

function isMissingAttachmentAssetColumnError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientValidationError) return true;
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.meta?.column ?? "").includes("assetId")
  );
}

export async function listAttachmentsForLogSubmission(facilityId: string, logSubmissionId: string) {
  return prisma.attachment.findMany({
    where: { facilityId, logSubmissionId },
    orderBy: { createdAt: "desc" },
  });
}

export function attachmentFileHref(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`;
}
