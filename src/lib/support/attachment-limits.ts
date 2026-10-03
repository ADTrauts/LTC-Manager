/** Postmark inbound is 35 MB including base64. Keep one file well under that and the 50 MB webhook cap. */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_MAX_BASE64_CHARS = Math.ceil(SUPPORT_ATTACHMENT_MAX_BYTES * (4 / 3)) + 8;

const BLOCKED_MIME = new Set([
  "application/hta",
  "application/javascript",
  "application/vnd.microsoft.portable-executable",
  "application/wasm",
  "application/x-bat",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-msi",
  "application/x-ms-shortcut",
  "application/x-sh",
  "application/x-shellscript",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "text/x-shellscript",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".exe",
  ".hta",
  ".htm",
  ".html",
  ".js",
  ".jse",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
  ".vbe",
  ".vbs",
  ".wsf",
  ".wsh",
]);

export function normalizeReportedContentType(value: string | null | undefined): string {
  const raw = value?.split(";")[0]?.trim().toLowerCase() ?? "";
  return raw || "application/octet-stream";
}

export function isBlockedSupportAttachmentType(input: {
  filename: string;
  contentType: string | null | undefined;
}): boolean {
  const mime = normalizeReportedContentType(input.contentType);
  if (BLOCKED_MIME.has(mime)) return true;
  if (mime.startsWith("application/x-ms") && mime.includes("executable")) return true;
  const ext = filenameExtension(input.filename);
  return ext ? BLOCKED_EXTENSIONS.has(ext) : false;
}

export function looksLikeExecutableContent(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
  if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return true;
  }
  if (bytes.length >= 4 && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) {
    return true;
  }
  if (bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21) return true;
  return false;
}

export function sanitizeDownloadFilename(raw: string | null | undefined): string {
  const stripped = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[/\\]/)
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("_")
    .replace(/^\.+/, "")
    .trim();
  return stripped.slice(0, 180) || "attachment";
}

export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeDownloadFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii || "attachment"}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function formatSupportAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 0 : 1).replace(/\.0$/, "")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

export function describeSupportAttachmentType(contentType: string): string {
  const mime = normalizeReportedContentType(contentType);
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return `${mime.slice("image/".length).toUpperCase()} image`;
  if (mime.startsWith("text/")) return "Text";
  return mime;
}

function filenameExtension(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const index = base.lastIndexOf(".");
  if (index <= 0) return null;
  return base.slice(index).toLowerCase();
}
