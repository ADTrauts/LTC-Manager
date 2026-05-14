import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";

const UPLOADS_DIR = "uploads";

export function getUploadsRoot(): string {
  return path.join(process.cwd(), UPLOADS_DIR);
}

/** Relative path segments under `uploads/` (no leading slash). */
export function facilityHandbookRelativePath(facilityId: string, safeBasename: string): string {
  return path.join("facilities", facilityId, safeBasename).split(path.sep).join("/");
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
  const dir = path.join(getUploadsRoot(), "facilities", facilityId);
  await mkdir(dir, { recursive: true });
  const abs = path.join(dir, storedBasename);
  await writeFile(abs, buffer);
  return {
    relativePath: facilityHandbookRelativePath(facilityId, storedBasename),
    storedBasename,
  };
}

export async function removeFileIfExists(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  const abs = path.join(getUploadsRoot(), ...relativePath.split("/"));
  try {
    await unlink(abs);
  } catch {
    // ignore missing file
  }
}

export function absoluteUploadPath(relativePath: string): string {
  return path.join(getUploadsRoot(), ...relativePath.split("/"));
}
