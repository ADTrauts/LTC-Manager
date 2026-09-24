import { mkdir, unlink, writeFile } from "fs/promises";
import { randomBytes } from "node:crypto";
import path from "path";

const UPLOADS_DIR = "uploads";

export function getUploadsRoot(): string {
  return path.join(process.cwd(), UPLOADS_DIR);
}

/** Relative path segments under `uploads/` (no leading slash). */
export function facilityHandbookRelativePath(facilityId: string, safeBasename: string): string {
  return ["facilities", facilityId, safeBasename].join("/");
}

export function normalizeUploadRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes("\0") || path.isAbsolute(trimmed)) {
    throw new Error("Invalid upload path.");
  }
  const segments = trimmed.split(/[/\\]+/).filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Invalid upload path.");
  }
  return segments.join("/");
}

export function absoluteUploadPath(relativePath: string): string {
  const normalized = normalizeUploadRelativePath(relativePath);
  const root = path.resolve(getUploadsRoot());
  const abs = path.resolve(root, ...normalized.split("/"));
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error("Invalid upload path.");
  }
  return abs;
}

export async function saveUnionHandbookPdf(
  facilityId: string,
  buffer: Buffer,
  originalFilename: string,
): Promise<{ relativePath: string; storedBasename: string }> {
  const ext = path.extname(originalFilename).toLowerCase();
  if (ext !== ".pdf") {
    throw new Error("Only PDF files are allowed.");
  }
  const storedBasename = `union-handbook-${Date.now()}${ext}`;
  const relativePath = facilityHandbookRelativePath(facilityId, storedBasename);
  const abs = absoluteUploadPath(relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return {
    relativePath,
    storedBasename,
  };
}

export async function saveFacilityImage(input: {
  facilityId: string;
  folder: "assets" | "repairs";
  parentId: string;
  buffer: Buffer;
  storedExtension: string;
}): Promise<{ relativePath: string }> {
  const storedBasename = `${Date.now()}-${randomBytes(6).toString("hex")}${input.storedExtension}`;
  const relativePath = [
    "facilities",
    input.facilityId,
    input.folder,
    input.parentId,
    storedBasename,
  ].join("/");
  const abs = absoluteUploadPath(relativePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.buffer);
  return { relativePath };
}

export async function removeFileIfExists(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  try {
    await unlink(absoluteUploadPath(relativePath));
  } catch {
    // ignore missing file or invalid path
  }
}
