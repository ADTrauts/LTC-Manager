import type { AttachmentParentKind, Prisma, PrismaClient } from "@prisma/client";
import path from "path";

import type { AppJwtPayload } from "@/lib/auth";
import {
  registerAttachmentMetadata,
  type AttachmentListItem,
} from "@/lib/attachments";
import { removeFileIfExists, saveFacilityImage } from "@/lib/facility-uploads";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_ASSET_PHOTOS = 8;
export const MAX_REPAIR_PHOTOS_PER_SUBMIT = 6;

export const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/pjpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const ALLOWED_IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export type ImageFileLike = {
  name: string;
  type: string;
  size: number;
};

export function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mimeType.trim().toLowerCase());
}

export function hasAllowedImageExtension(filename: string): boolean {
  return ALLOWED_IMAGE_EXT.has(path.extname(filename).toLowerCase());
}

export function isDisplayableImageMimeType(mimeType: string): boolean {
  return isAllowedImageMimeType(mimeType);
}

export function resolveStoredImageExtension(input: ImageFileLike): string {
  const mimeExt = EXT_BY_MIME[input.type.trim().toLowerCase()];
  if (mimeExt) return mimeExt;
  const ext = path.extname(input.name).toLowerCase();
  if (ext === ".jpeg") return ".jpg";
  if (ALLOWED_IMAGE_EXT.has(ext)) return ext;
  throw new Error("Only JPEG, PNG, WebP, or GIF photos are allowed.");
}

export function assertAllowedImageFile(file: ImageFileLike): void {
  if (file.size <= 0) {
    throw new Error("Photo file is empty.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Each photo must be 8 MB or smaller.");
  }
  const mimeOk = file.type ? isAllowedImageMimeType(file.type) : false;
  const extOk = hasAllowedImageExtension(file.name);
  if (!mimeOk && !extOk) {
    throw new Error("Only JPEG, PNG, WebP, or GIF photos are allowed.");
  }
}

export function collectImageFilesFromFormData(
  formData: FormData,
  fieldNames: string[] = ["photos", "photo"],
): File[] {
  const files: File[] = [];
  const seen = new Set<File>();
  for (const name of fieldNames) {
    for (const value of formData.getAll(name)) {
      if (value instanceof File && value.size > 0 && !seen.has(value)) {
        seen.add(value);
        files.push(value);
      }
    }
  }
  return files;
}

export function assertPhotoCount(existingCount: number, incomingCount: number, maxCount: number): void {
  if (incomingCount <= 0) return;
  if (existingCount + incomingCount > maxCount) {
    throw new Error(`You can attach up to ${maxCount} photos.`);
  }
}

export function attachmentActorFromSession(session: AppJwtPayload): {
  createdByUserId: string | null;
  createdByEmployeeId: string | null;
} {
  if (session.authKind === "employee") {
    return { createdByUserId: null, createdByEmployeeId: session.uid };
  }
  return { createdByUserId: session.uid, createdByEmployeeId: null };
}

export async function savePhotosFromFormData(input: {
  formData: FormData;
  facilityId: string;
  parentKind: Extract<AttachmentParentKind, "ASSET" | "REPAIR">;
  assetId?: string | null;
  repairId?: string | null;
  session: AppJwtPayload;
  maxCount: number;
  existingCount?: number;
  client?: DbClient;
}): Promise<AttachmentListItem[]> {
  const files = collectImageFilesFromFormData(input.formData);
  if (files.length === 0) return [];

  const parentId = input.parentKind === "ASSET" ? input.assetId : input.repairId;
  if (!parentId) {
    throw new Error("Photo parent is missing.");
  }

  assertPhotoCount(input.existingCount ?? 0, files.length, input.maxCount);
  for (const file of files) {
    assertAllowedImageFile(file);
  }

  const actor = attachmentActorFromSession(input.session);
  const db = input.client ?? prisma;
  const folder = input.parentKind === "ASSET" ? "assets" : "repairs";
  const created: AttachmentListItem[] = [];

  for (const file of files) {
    const storedExtension = resolveStoredImageExtension(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { relativePath } = await saveFacilityImage({
      facilityId: input.facilityId,
      folder,
      parentId,
      buffer,
      storedExtension,
    });
    try {
      const row = await registerAttachmentMetadata(db, {
        facilityId: input.facilityId,
        parentKind: input.parentKind,
        fileRelativePath: relativePath,
        originalFilename: file.name || `photo${storedExtension}`,
        mimeType: isAllowedImageMimeType(file.type)
          ? file.type
          : MIME_BY_EXT[storedExtension] || "application/octet-stream",
        assetId: input.parentKind === "ASSET" ? parentId : null,
        repairId: input.parentKind === "REPAIR" ? parentId : null,
        createdByUserId: actor.createdByUserId,
        createdByEmployeeId: actor.createdByEmployeeId,
      });
      created.push({
        id: row.id,
        originalFilename: file.name || `photo${storedExtension}`,
        mimeType: file.type || "application/octet-stream",
        createdAt: new Date(),
      });
    } catch (error) {
      await removeFileIfExists(relativePath);
      throw error;
    }
  }

  return created;
}

export async function deleteFacilityPhotoAttachment(input: {
  facilityId: string;
  attachmentId: string;
  expectedKind: Extract<AttachmentParentKind, "ASSET" | "REPAIR">;
  expectedParentId?: string;
  client?: DbClient;
}): Promise<{ id: string; parentId: string }> {
  const db = input.client ?? prisma;
  const row = await db.attachment.findFirst({
    where: {
      id: input.attachmentId,
      facilityId: input.facilityId,
      parentKind: input.expectedKind,
    },
    select: {
      id: true,
      fileRelativePath: true,
      assetId: true,
      repairId: true,
    },
  });
  if (!row) {
    throw new Error("Photo not found.");
  }
  const parentId = input.expectedKind === "ASSET" ? row.assetId : row.repairId;
  if (!parentId || (input.expectedParentId && parentId !== input.expectedParentId)) {
    throw new Error("Photo not found.");
  }

  await db.attachment.delete({ where: { id: row.id } });
  await removeFileIfExists(row.fileRelativePath);
  return { id: row.id, parentId };
}
