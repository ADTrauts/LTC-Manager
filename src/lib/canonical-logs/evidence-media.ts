/**
 * Evidence photos, files, and signatures.
 * Policy and storage stay here. Rule evaluation only needs to know a field has media.
 * Bytes are not stored on OperationalEvidenceRecord.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

import { absoluteUploadPath } from "@/lib/facility-uploads";
import {
  getPrivateObjectStore,
  isDeployedAppRuntime,
  isPrivateObjectStorageConfigured,
  type PrivateObjectStore,
} from "@/lib/storage/private-object-store";

export const EVIDENCE_MEDIA_KINDS = ["PHOTO", "FILE", "SIGNATURE"] as const;
export type EvidenceMediaKind = (typeof EVIDENCE_MEDIA_KINDS)[number];

export const EVIDENCE_MEDIA_MAX_BYTES = 4 * 1024 * 1024;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const FILE_TYPES = new Set([
  ...PHOTO_TYPES,
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export type EvidenceMediaInput = {
  fieldKey: string;
  kind: EvidenceMediaKind;
  filename?: string | null;
  contentType?: string | null;
  dataBase64?: string | null;
};

export type PreparedEvidenceMedia = {
  fieldKey: string;
  kind: EvidenceMediaKind;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  bytes: Uint8Array;
  extension: string;
};

export type EvidenceMediaStore = {
  put(input: { storageKey: string; bytes: Uint8Array; contentType: string }): Promise<void>;
  get(storageKey: string): Promise<Uint8Array | null>;
  remove(storageKey: string): Promise<void>;
};

export type EvidenceObjectBackend = "blob" | "development-filesystem" | "unavailable";

export function isEvidenceMediaFieldType(fieldType: string): boolean {
  return fieldType === "PHOTO" || fieldType === "FILE" || fieldType === "SIGNATURE";
}

export function evidenceMediaStorageKey(input: {
  facilityId: string;
  recordId: string;
  attachmentId: string;
  extension: string;
}): string {
  const facilityId = safeId(input.facilityId, "facility");
  const recordId = safeId(input.recordId, "record");
  const attachmentId = safeId(input.attachmentId, "attachment");
  const extension = input.extension.startsWith(".") ? input.extension : `.${input.extension}`;
  if (!/^\.[a-z0-9]{1,8}$/.test(extension)) {
    throw new Error("Unsupported evidence file type.");
  }
  return `evidence/${facilityId}/${recordId}/${attachmentId}${extension}`;
}

export function inspectEvidenceMedia(input: {
  kind: string;
  filename?: string | null;
  contentType?: string | null;
  bytes: Uint8Array;
}): { ok: true; contentType: string; filename: string; extension: string } | { ok: false; message: string } {
  if (!EVIDENCE_MEDIA_KINDS.includes(input.kind as EvidenceMediaKind)) {
    return { ok: false, message: "Unsupported evidence attachment type." };
  }
  if (input.bytes.byteLength <= 0) {
    return { ok: false, message: "The file is empty." };
  }
  if (input.bytes.byteLength > EVIDENCE_MEDIA_MAX_BYTES) {
    return { ok: false, message: "Each file must be 4 MB or smaller." };
  }
  const contentType = normalizeContentType(input.contentType);
  const kind = input.kind as EvidenceMediaKind;
  if (kind === "PHOTO" && !PHOTO_TYPES.has(contentType)) {
    return { ok: false, message: "Photos must be JPEG, PNG, WebP, or GIF." };
  }
  if (kind === "SIGNATURE" && contentType !== "image/png") {
    return { ok: false, message: "Signatures are stored as PNG images." };
  }
  if (kind === "FILE" && !FILE_TYPES.has(contentType)) {
    return { ok: false, message: "That file type is not allowed." };
  }
  if (looksExecutable(input.bytes) || looksLikeMarkup(input.bytes)) {
    return { ok: false, message: "That file type is not allowed." };
  }
  const filename = sanitizeFilename(input.filename, kind);
  return { ok: true, contentType, filename, extension: EXT_BY_TYPE[contentType] ?? ".bin" };
}

export function decodeEvidenceMediaBase64(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length > Math.ceil(EVIDENCE_MEDIA_MAX_BYTES / 3) * 4 + 8) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const bytes = Buffer.from(compact, "base64");
  return bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
}

export function prepareEvidenceMedia(
  items: readonly EvidenceMediaInput[],
  allowedFieldKeys: ReadonlySet<string>,
): { ok: true; items: PreparedEvidenceMedia[] } | { ok: false; message: string } {
  const prepared: PreparedEvidenceMedia[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!allowedFieldKeys.has(item.fieldKey)) {
      return { ok: false, message: "An attachment does not belong to a visible field." };
    }
    if (seen.has(item.fieldKey)) {
      return { ok: false, message: "Each evidence field accepts one attachment." };
    }
    seen.add(item.fieldKey);
    const bytes = decodeEvidenceMediaBase64(item.dataBase64);
    if (!bytes) return { ok: false, message: "The file could not be read." };
    const inspected = inspectEvidenceMedia({
      kind: item.kind,
      filename: item.filename,
      contentType: item.contentType,
      bytes,
    });
    if (!inspected.ok) return inspected;
    prepared.push({
      fieldKey: item.fieldKey,
      kind: item.kind,
      originalFilename: inspected.filename,
      contentType: inspected.contentType,
      sizeBytes: bytes.byteLength,
      bytes,
      extension: inspected.extension,
    });
  }
  return { ok: true, items: prepared };
}

export function newEvidenceAttachmentId(): string {
  return `emat_${randomBytes(12).toString("hex")}`;
}

export function createMemoryEvidenceMediaStore(
  objects?: Map<string, Uint8Array>,
): EvidenceMediaStore & { objects: Map<string, Uint8Array> } {
  const backing = objects ?? new Map<string, Uint8Array>();
  return adaptPrivateObjectStore({
    objects: backing,
    async put(input) {
      backing.set(input.key, Uint8Array.from(input.bytes));
      return { storageKey: input.key };
    },
    async get(key) {
      const value = backing.get(key);
      return value ? Uint8Array.from(value) : null;
    },
    async delete(key) {
      backing.delete(key);
    },
  });
}

export function adaptPrivateObjectStore(
  store: PrivateObjectStore & { objects?: Map<string, Uint8Array> },
): EvidenceMediaStore & { objects: Map<string, Uint8Array> } {
  const objects = store.objects ?? new Map<string, Uint8Array>();
  return {
    objects,
    async put(input) {
      await store.put({
        key: input.storageKey,
        bytes: input.bytes,
        contentType: input.contentType,
      });
    },
    get: (storageKey) => store.get(storageKey),
    remove: (storageKey) => store.delete(storageKey),
  };
}

/**
 * Explicit local-development adapter. Not selected in production or on Vercel.
 * Object keys stay provider-neutral (`evidence/...`); files sit under `uploads/`.
 */
export function createDevelopmentFilesystemEvidenceStore(): EvidenceMediaStore {
  return {
    async put(input) {
      const abs = absoluteUploadPath(input.storageKey);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, input.bytes);
    },
    async get(storageKey) {
      try {
        return new Uint8Array(await readFile(absoluteUploadPath(storageKey)));
      } catch {
        return null;
      }
    },
    async remove(storageKey) {
      try {
        await unlink(absoluteUploadPath(storageKey));
      } catch {
        // Cleanup of an uncommitted attempt may race a missing file.
      }
    },
  };
}

export function selectEvidenceObjectBackend(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceObjectBackend {
  if (isPrivateObjectStorageConfigured(env)) return "blob";
  if (isDeployedAppRuntime(env)) return "unavailable";
  if (env.EVIDENCE_MEDIA_DEV_STORE === "filesystem") return "development-filesystem";
  return "unavailable";
}

export function getEvidenceMediaStore(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceMediaStore | null {
  const backend = selectEvidenceObjectBackend(env);
  if (backend === "blob") {
    const store = getPrivateObjectStore(env);
    return store ? adaptPrivateObjectStore(store) : null;
  }
  if (backend === "development-filesystem") return createDevelopmentFilesystemEvidenceStore();
  return null;
}

export async function putEvidenceObjects(
  store: EvidenceMediaStore,
  rows: ReadonlyArray<{ storageKey: string; bytes: Uint8Array; contentType: string }>,
): Promise<string[]> {
  const written: string[] = [];
  try {
    for (const row of rows) {
      await store.put(row);
      written.push(row.storageKey);
    }
    return written;
  } catch (error) {
    await Promise.all(written.map((key) => store.remove(key)));
    throw error;
  }
}

export const EVIDENCE_STORAGE_UNAVAILABLE =
  "Evidence files cannot be saved right now. Try again when storage is available.";

function safeId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(trimmed)) {
    throw new Error(`Invalid ${label} for evidence storage.`);
  }
  return trimmed;
}

function normalizeContentType(value: string | null | undefined): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function sanitizeFilename(value: string | null | undefined, kind: EvidenceMediaKind): string {
  const base = (value ?? "").split(/[/\\]/).pop()?.replace(/[^\w.\- ()]+/g, "")?.trim() ?? "";
  if (kind === "SIGNATURE") return "signature.png";
  return base.slice(0, 180) || "attachment";
}

function looksExecutable(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return true;
  }
  return false;
}

function looksLikeMarkup(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 64)).toString("utf8").trim().toLowerCase();
  return head.startsWith("<html") || head.startsWith("<svg") || head.startsWith("<script") || head.startsWith("<?php");
}
