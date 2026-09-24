import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "path";

import {
  assertAllowedImageFile,
  assertPhotoCount,
  collectImageFilesFromFormData,
  hasAllowedImageExtension,
  isAllowedImageMimeType,
  MAX_ASSET_PHOTOS,
  MAX_IMAGE_BYTES,
  resolveStoredImageExtension,
} from "./photo-attachments";
import { absoluteUploadPath, normalizeUploadRelativePath } from "./facility-uploads";

test("accepts jpeg png webp gif mime types and extensions", () => {
  assert.equal(isAllowedImageMimeType("image/jpeg"), true);
  assert.equal(isAllowedImageMimeType("image/png"), true);
  assert.equal(isAllowedImageMimeType("IMAGE/WEBP"), true);
  assert.equal(isAllowedImageMimeType("application/pdf"), false);
  assert.equal(hasAllowedImageExtension("oven.jpg"), true);
  assert.equal(hasAllowedImageExtension("oven.HEIC"), false);
});

test("rejects empty, oversized, and non-image files", () => {
  assert.throws(
    () => assertAllowedImageFile({ name: "a.jpg", type: "image/jpeg", size: 0 }),
    /empty/i,
  );
  assert.throws(
    () =>
      assertAllowedImageFile({
        name: "a.jpg",
        type: "image/jpeg",
        size: MAX_IMAGE_BYTES + 1,
      }),
    /8 MB/i,
  );
  assert.throws(
    () => assertAllowedImageFile({ name: "notes.pdf", type: "application/pdf", size: 12 }),
    /JPEG, PNG, WebP, or GIF/i,
  );
});

test("allows missing mime when the extension is an image", () => {
  assert.doesNotThrow(() =>
    assertAllowedImageFile({ name: "cooler.png", type: "", size: 1200 }),
  );
  assert.equal(resolveStoredImageExtension({ name: "cooler.PNG", type: "", size: 12 }), ".png");
  assert.equal(
    resolveStoredImageExtension({ name: "shot.jpeg", type: "image/jpeg", size: 12 }),
    ".jpg",
  );
});

test("collects photo and photos fields and skips empty files", () => {
  const formData = new FormData();
  formData.append("photos", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));
  formData.append("photo", new File([new Uint8Array([4, 5])], "b.png", { type: "image/png" }));
  formData.append("photos", new File([], "empty.jpg", { type: "image/jpeg" }));
  const files = collectImageFilesFromFormData(formData);
  assert.equal(files.length, 2);
  assert.deepEqual(
    files.map((f) => f.name),
    ["a.jpg", "b.png"],
  );
});

test("enforces photo count against existing attachments", () => {
  assert.doesNotThrow(() => assertPhotoCount(7, 1, MAX_ASSET_PHOTOS));
  assert.throws(() => assertPhotoCount(7, 2, MAX_ASSET_PHOTOS), /up to 8 photos/i);
});

test("upload paths reject traversal and stay under the uploads root", () => {
  assert.throws(() => normalizeUploadRelativePath("../secret.pdf"), /Invalid upload path/);
  assert.throws(() => normalizeUploadRelativePath("/etc/passwd"), /Invalid upload path/);
  const relative = "facilities/fac1/assets/asset1/photo.jpg";
  const abs = absoluteUploadPath(relative);
  assert.ok(abs.endsWith(path.join("uploads", "facilities", "fac1", "assets", "asset1", "photo.jpg")));
  assert.equal(path.basename(os.tmpdir()).length > 0, true);
});
