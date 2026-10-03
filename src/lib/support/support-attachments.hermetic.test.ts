import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  contentDispositionAttachment,
  describeSupportAttachmentType,
  formatSupportAttachmentSize,
  isBlockedSupportAttachmentType,
  looksLikeExecutableContent,
  sanitizeDownloadFilename,
  SUPPORT_ATTACHMENT_MAX_BYTES,
} from "./attachment-limits";
import { presentSupportAttachment } from "./attachment-presentation";
import { createMemorySupportAttachmentStore, supportAttachmentObjectKey } from "./attachment-store";
import { decideSupportAttachmentDownload, supportAttachmentDownloadHeaders } from "./attachments";
import { postmarkInboundPayload } from "./fixtures/postmark-inbound";
import { parsePostmarkInbound, readInboundAttachmentContents } from "./inbound-email";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("support attachments — size limit stays under Postmark and the webhook cap", () => {
  assert.equal(SUPPORT_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024);
  assert.ok(SUPPORT_ATTACHMENT_MAX_BYTES < 35 * 1024 * 1024);
  assert.ok(SUPPORT_ATTACHMENT_MAX_BYTES < 50 * 1024 * 1024);
});

test("support attachments — dangerous types are blocked without trusting the extension alone", () => {
  assert.equal(isBlockedSupportAttachmentType({ filename: "note.txt", contentType: "text/html" }), true);
  assert.equal(isBlockedSupportAttachmentType({ filename: "logo.svg", contentType: "image/svg+xml" }), true);
  assert.equal(isBlockedSupportAttachmentType({ filename: "payload.exe", contentType: "application/octet-stream" }), true);
  assert.equal(isBlockedSupportAttachmentType({ filename: "screenshot.png", contentType: "image/png" }), false);
  assert.equal(isBlockedSupportAttachmentType({ filename: "report.pdf", contentType: "application/pdf" }), false);
  assert.equal(looksLikeExecutableContent(Buffer.from([0x4d, 0x5a, 0x90])), true);
  assert.equal(looksLikeExecutableContent(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
});

test("support attachments — download filenames cannot become paths or header injections", () => {
  assert.equal(sanitizeDownloadFilename("../../etc/passwd"), "etc_passwd");
  assert.equal(sanitizeDownloadFilename("report\r\nLocation: evil.pdf"), "reportLocation: evil.pdf");
  assert.equal(sanitizeDownloadFilename(""), "attachment");
  const header = contentDispositionAttachment('quote"name.pdf');
  assert.match(header, /^attachment;/);
  assert.doesNotMatch(header, /\r|\n/);
  assert.match(header, /filename\*=UTF-8''/);
});

test("support attachments — only Harbor staff can download a CLEAN file", () => {
  const clean = { scanStatus: "CLEAN" as const, storageKey: "support/t/m/a" };
  assert.equal(decideSupportAttachmentDownload({ actor: "anonymous", attachment: clean }).outcome, "unauthenticated");
  assert.equal(decideSupportAttachmentDownload({ actor: "facility", attachment: clean }).outcome, "forbidden");
  assert.equal(decideSupportAttachmentDownload({ actor: "harbor_staff", attachment: null }).outcome, "not_found");
  assert.equal(
    decideSupportAttachmentDownload({
      actor: "harbor_staff",
      attachment: { scanStatus: "PENDING", storageKey: "support/t/m/a" },
    }).outcome,
    "not_downloadable",
  );
  assert.equal(decideSupportAttachmentDownload({ actor: "harbor_staff", attachment: clean }).outcome, "ok");
});

test("support attachments — stored files stay PENDING until a real scan exists", () => {
  const view = presentSupportAttachment({
    id: "a1",
    filename: "screenshot.png",
    contentType: "image/png",
    sizeBytes: 842 * 1024,
    scanStatus: "PENDING",
    rejectionReason: null,
  });
  assert.equal(view.filename, "screenshot.png");
  assert.match(view.detail, /842 KB/);
  assert.equal(view.statusLabel, "Security scan pending");
  assert.equal(view.downloadHref, null);
  assert.equal(
    presentSupportAttachment({
      id: "a2",
      filename: "malware.exe",
      contentType: "application/x-msdownload",
      sizeBytes: 12,
      scanStatus: "BLOCKED",
      rejectionReason: "BLOCKED_TYPE",
    }).statusLabel,
    "Blocked",
  );
});

test("support attachments — object keys are opaque and memory store round-trips bytes", async () => {
  const key = supportAttachmentObjectKey({ ticketId: "t1", messageId: "m1", attachmentId: "a1" });
  assert.equal(key, "support/t1/m1/a1");
  const store = createMemorySupportAttachmentStore();
  const bytes = new Uint8Array([1, 2, 3]);
  const stored = await store.put({ key, bytes, contentType: "image/png" });
  assert.equal(stored.storageKey, key);
  assert.deepEqual(await store.get(key), bytes);
  assert.equal(await store.get("missing"), null);
});

test("support attachments — inbound parse still strips Content from the email object", () => {
  const raw = postmarkInboundPayload();
  const parsed = parsePostmarkInbound(raw);
  assert.ok(parsed.ok);
  assert.equal(JSON.stringify(parsed.email).includes("iVBORw0KGgo"), false);
  const contents = readInboundAttachmentContents(raw);
  assert.equal(contents.length, 2);
  assert.ok(contents[0]?.startsWith("iVBORw0KGgo"));
  assert.equal(describeSupportAttachmentType("application/pdf"), "PDF");
  assert.equal(formatSupportAttachmentSize(48), "48 B");
});

test("support attachments — download headers force attachment and never use the reported MIME for rendering", () => {
  const headers = supportAttachmentDownloadHeaders("report.pdf", "text/html");
  assert.equal(headers["Content-Type"], "application/octet-stream");
  assert.match(headers["Content-Disposition"], /^attachment;/);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Reported-Content-Type"], "text/html");
});

test("support attachments — download route requires Harbor staff and never labels files CLEAN here", () => {
  const route = source("src/app/api/console/support-attachments/[attachmentId]/route.ts");
  assert.match(route, /getHarborSession/);
  assert.match(route, /decideSupportAttachmentDownload/);
  assert.match(route, /actorKind/);
  assert.doesNotMatch(route, /scanStatus = "CLEAN"/);
  assert.doesNotMatch(route, /requireFacilitySession/);
  const persist = source("src/lib/support/attachments.ts");
  assert.match(persist, /scanStatus = "PENDING"/);
  assert.doesNotMatch(persist, /scanStatus = "CLEAN"/);
});
