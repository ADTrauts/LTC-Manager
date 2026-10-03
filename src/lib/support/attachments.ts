import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient, SupportAttachmentRejectionReason, SupportAttachmentScanStatus } from "@prisma/client";

import {
  contentDispositionAttachment,
  isBlockedSupportAttachmentType,
  looksLikeExecutableContent,
  normalizeReportedContentType,
  sanitizeDownloadFilename,
  SUPPORT_ATTACHMENT_MAX_BASE64_CHARS,
  SUPPORT_ATTACHMENT_MAX_BYTES,
} from "./attachment-limits";
import {
  getSupportAttachmentStore,
  supportAttachmentObjectKey,
  type SupportAttachmentStore,
} from "./attachment-store";
import type { SupportAttachmentManifestEntry } from "./inbound-email";

type Logger = Pick<Console, "info" | "warn" | "error">;

export type SupportAttachmentRecord = {
  id: string;
  messageId: string;
  position: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  scanStatus: SupportAttachmentScanStatus;
  rejectionReason: SupportAttachmentRejectionReason | null;
};

export type PersistInboundAttachmentsInput = {
  ticketId: string;
  messageId: string;
  attachments: SupportAttachmentManifestEntry[];
  contents?: Array<string | null>;
  store?: SupportAttachmentStore | null;
  logger?: Logger;
};

function newAttachmentId(): string {
  return `satt_${randomBytes(16).toString("hex")}`;
}

function decodeBase64(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length > SUPPORT_ATTACHMENT_MAX_BASE64_CHARS) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  try {
    const bytes = Buffer.from(compact, "base64");
    return bytes.length > 0 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decideSupportAttachmentDownload(input: {
  actor: "harbor_staff" | "facility" | "anonymous";
  attachment: { scanStatus: SupportAttachmentScanStatus; storageKey: string | null } | null;
}):
  | { outcome: "unauthenticated" }
  | { outcome: "forbidden" }
  | { outcome: "not_found" }
  | { outcome: "not_downloadable"; scanStatus: SupportAttachmentScanStatus }
  | { outcome: "ok" } {
  if (input.actor === "anonymous") return { outcome: "unauthenticated" };
  if (input.actor === "facility") return { outcome: "forbidden" };
  if (!input.attachment) return { outcome: "not_found" };
  if (input.attachment.scanStatus !== "CLEAN" || !input.attachment.storageKey) {
    return { outcome: "not_downloadable", scanStatus: input.attachment.scanStatus };
  }
  return { outcome: "ok" };
}

export function supportAttachmentDownloadHeaders(filename: string, contentType: string): Record<string, string> {
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": contentDispositionAttachment(filename),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "X-Reported-Content-Type": normalizeReportedContentType(contentType),
  };
}

export async function persistInboundSupportAttachments(
  db: PrismaClient,
  input: PersistInboundAttachmentsInput,
): Promise<SupportAttachmentRecord[]> {
  if (input.attachments.length === 0) return [];
  const logger = input.logger ?? console;
  const existing = await db.supportTicketAttachment.findMany({
    where: { messageId: input.messageId },
    select: {
      id: true,
      messageId: true,
      position: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      contentId: true,
      scanStatus: true,
      rejectionReason: true,
    },
  });
  const byPosition = new Map(existing.map((row) => [row.position, row]));
  const store = input.store === undefined ? getSupportAttachmentStore() : input.store;
  const records: SupportAttachmentRecord[] = [];

  for (const [position, manifest] of input.attachments.entries()) {
    const already = byPosition.get(position);
    if (already) {
      records.push(already);
      continue;
    }

    const filename = sanitizeDownloadFilename(manifest.name);
    const contentType = normalizeReportedContentType(manifest.contentType);
    const contentId = manifest.contentId;
    const declared = manifest.contentLength;
    const rawContent = input.contents?.[position] ?? null;

    let scanStatus: SupportAttachmentScanStatus = "BLOCKED";
    let rejectionReason: SupportAttachmentRejectionReason | null = "INVALID_BASE64";
    let sizeBytes = typeof declared === "number" && declared >= 0 ? declared : 0;
    let storageKey: string | null = null;
    let checksumSha256: string | null = null;

    if (typeof declared === "number" && declared > SUPPORT_ATTACHMENT_MAX_BYTES) {
      rejectionReason = "OVERSIZE";
      sizeBytes = declared;
      logger.warn("support.attachment.rejected", {
        messageId: input.messageId,
        position,
        reason: "OVERSIZE",
        sizeBytes,
        contentType,
      });
    } else if (isBlockedSupportAttachmentType({ filename, contentType })) {
      rejectionReason = "BLOCKED_TYPE";
      logger.warn("support.attachment.rejected", {
        messageId: input.messageId,
        position,
        reason: "BLOCKED_TYPE",
        sizeBytes,
        contentType,
      });
    } else {
      const bytes = decodeBase64(rawContent);
      if (!bytes) {
        rejectionReason = "INVALID_BASE64";
        logger.warn("support.attachment.rejected", {
          messageId: input.messageId,
          position,
          reason: "INVALID_BASE64",
          sizeBytes,
          contentType,
        });
      } else if (bytes.byteLength > SUPPORT_ATTACHMENT_MAX_BYTES || looksLikeExecutableContent(bytes)) {
        rejectionReason = bytes.byteLength > SUPPORT_ATTACHMENT_MAX_BYTES ? "OVERSIZE" : "BLOCKED_TYPE";
        sizeBytes = bytes.byteLength;
        logger.warn("support.attachment.rejected", {
          messageId: input.messageId,
          position,
          reason: rejectionReason,
          sizeBytes,
          contentType,
        });
      } else if (!store) {
        sizeBytes = bytes.byteLength;
        checksumSha256 = sha256Hex(bytes);
        rejectionReason = "STORAGE_UNAVAILABLE";
        logger.warn("support.attachment.rejected", {
          messageId: input.messageId,
          position,
          reason: "STORAGE_UNAVAILABLE",
          sizeBytes,
          contentType,
        });
      } else {
        const attachmentId = newAttachmentId();
        const key = supportAttachmentObjectKey({
          ticketId: input.ticketId,
          messageId: input.messageId,
          attachmentId,
        });
        try {
          const stored = await store.put({ key, bytes, contentType });
          storageKey = stored.storageKey;
          checksumSha256 = sha256Hex(bytes);
          sizeBytes = bytes.byteLength;
          scanStatus = "PENDING";
          rejectionReason = null;
          const created = await insertAttachmentRow(db, {
            id: attachmentId,
            messageId: input.messageId,
            position,
            filename,
            contentType,
            sizeBytes,
            storageKey,
            checksumSha256,
            contentId,
            scanStatus,
            rejectionReason,
          });
          if (created) records.push(created);
          continue;
        } catch (error) {
          sizeBytes = bytes.byteLength;
          checksumSha256 = sha256Hex(bytes);
          rejectionReason = "STORAGE_FAILED";
          logger.error("support.attachment.storage_failed", {
            messageId: input.messageId,
            position,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    }

    const created = await insertAttachmentRow(db, {
      id: newAttachmentId(),
      messageId: input.messageId,
      position,
      filename,
      contentType,
      sizeBytes,
      storageKey,
      checksumSha256,
      contentId,
      scanStatus,
      rejectionReason,
    });
    if (created) records.push(created);
  }

  return records;
}

async function insertAttachmentRow(
  db: PrismaClient,
  data: {
    id: string;
    messageId: string;
    position: number;
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageKey: string | null;
    checksumSha256: string | null;
    contentId: string | null;
    scanStatus: SupportAttachmentScanStatus;
    rejectionReason: SupportAttachmentRejectionReason | null;
  },
): Promise<SupportAttachmentRecord | null> {
  try {
    return await db.supportTicketAttachment.create({
      data,
      select: {
        id: true,
        messageId: true,
        position: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        contentId: true,
        scanStatus: true,
        rejectionReason: true,
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return db.supportTicketAttachment.findUnique({
        where: { messageId_position: { messageId: data.messageId, position: data.position } },
        select: {
          id: true,
          messageId: true,
          position: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          contentId: true,
          scanStatus: true,
          rejectionReason: true,
        },
      });
    }
    throw error;
  }
}

export { contentDispositionAttachment, sanitizeDownloadFilename };
