import assert from "node:assert/strict";
import test from "node:test";
import { supportAttachmentDownloadsConfigured } from "./attachment-scanner";

test("private-original downloads fail closed for absent or invalid scanner infrastructure", () => {
  const base = { NODE_ENV: "test" as const, SUPPORT_SCANNER_URL: "https://scanner.example.test/scan", SUPPORT_SCANNER_ALLOWED_HOSTS: "scanner.example.test", SUPPORT_SCANNER_BEARER_TOKEN: "test-fixture-token-with-at-least-32-characters" };
  assert.equal(supportAttachmentDownloadsConfigured({ NODE_ENV: "test" }), false);
  for (const change of [
    { SUPPORT_SCANNER_URL: "" },
    { SUPPORT_SCANNER_BEARER_TOKEN: "" },
    { SUPPORT_SCANNER_BEARER_TOKEN: "short" },
    { SUPPORT_SCANNER_URL: "http://scanner.example.test/scan" },
    { SUPPORT_SCANNER_ALLOWED_HOSTS: "unapproved.example.test" },
    { SUPPORT_SCANNER_URL: "not a URL" },
  ]) assert.equal(supportAttachmentDownloadsConfigured({ ...base, ...change }), false);
  assert.equal(supportAttachmentDownloadsConfigured(base), true);
});
