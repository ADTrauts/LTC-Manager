/**
 * Phase 4.1 — evidence media uses private object storage, not instance disk.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createMemoryPrivateObjectStore } from "@/lib/storage/private-object-store";

import {
  EVIDENCE_MEDIA_MAX_BYTES,
  createMemoryEvidenceMediaStore,
  evidenceMediaStorageKey,
  inspectEvidenceMedia,
  prepareEvidenceMedia,
  putEvidenceObjects,
  selectEvidenceObjectBackend,
} from "./evidence-media";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function source(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("Phase 4.1 — a second store instance reads the same private object", async () => {
  const backing = new Map<string, Uint8Array>();
  const writer = createMemoryEvidenceMediaStore(backing);
  const reader = createMemoryEvidenceMediaStore(backing);
  const key = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_1",
    attachmentId: "emat_photo",
    extension: ".png",
  });
  await writer.put({
    storageKey: key,
    bytes: new Uint8Array(PNG),
    contentType: "image/png",
  });
  assert.deepEqual(await reader.get(key), new Uint8Array(PNG));
  assert.equal(await reader.get("evidence/other/rec_1/emat_photo.png"), null);
});

test("Phase 4.1 — failed writes and invalid files do not leave objects", async () => {
  const store = createMemoryEvidenceMediaStore();
  let calls = 0;
  const flaky = {
    async put(input: { storageKey: string; bytes: Uint8Array; contentType: string }) {
      calls += 1;
      if (calls === 2) throw new Error("storage unavailable");
      await store.put(input);
    },
    get: store.get.bind(store),
    remove: store.remove.bind(store),
  };
  const first = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_1",
    attachmentId: "emat_a",
    extension: ".png",
  });
  const second = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_1",
    attachmentId: "emat_b",
    extension: ".png",
  });
  await assert.rejects(
    putEvidenceObjects(flaky, [
      { storageKey: first, bytes: new Uint8Array(PNG), contentType: "image/png" },
      { storageKey: second, bytes: new Uint8Array(PNG), contentType: "image/png" },
    ]),
    /storage unavailable/,
  );
  assert.equal(await store.get(first), null);
  assert.equal(await store.get(second), null);
  assert.equal(calls, 2);

  const oversize = inspectEvidenceMedia({
    kind: "PHOTO",
    filename: "big.jpg",
    contentType: "image/jpeg",
    bytes: new Uint8Array(EVIDENCE_MEDIA_MAX_BYTES + 1),
  });
  assert.equal(oversize.ok, false);
  const html = prepareEvidenceMedia(
    [
      {
        fieldKey: "condition_photo",
        kind: "PHOTO",
        filename: "x.html",
        contentType: "text/html",
        dataBase64: Buffer.from("<html></html>").toString("base64"),
      },
    ],
    new Set(["condition_photo"]),
  );
  assert.equal(html.ok, false);
  assert.equal(store.objects.size, 0);
});

test("Phase 4.1 — signature and recheck objects stay independent", async () => {
  const shared = createMemoryPrivateObjectStore();
  const store = createMemoryEvidenceMediaStore(shared.objects);
  const original = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_55",
    attachmentId: "emat_a",
    extension: ".png",
  });
  const followUp = evidenceMediaStorageKey({
    facilityId: "fac_1",
    recordId: "rec_38",
    attachmentId: "emat_b",
    extension: ".png",
  });
  assert.notEqual(original, followUp);
  await store.put({ storageKey: original, bytes: new Uint8Array([1]), contentType: "image/png" });
  await store.put({ storageKey: followUp, bytes: new Uint8Array([2]), contentType: "image/png" });
  assert.deepEqual(await shared.get(original), new Uint8Array([1]));
  assert.deepEqual(await shared.get(followUp), new Uint8Array([2]));
});

test("Phase 4.1 — production cannot select local disk, and retries skip new writes", () => {
  assert.equal(selectEvidenceObjectBackend({ NODE_ENV: "production" }), "unavailable");
  assert.equal(
    selectEvidenceObjectBackend({
      NODE_ENV: "production",
      EVIDENCE_MEDIA_DEV_STORE: "filesystem",
    }),
    "unavailable",
  );
  assert.equal(
    selectEvidenceObjectBackend({ VERCEL_ENV: "preview", EVIDENCE_MEDIA_DEV_STORE: "filesystem" }),
    "unavailable",
  );
  assert.equal(
    selectEvidenceObjectBackend({ NODE_ENV: "development", EVIDENCE_MEDIA_DEV_STORE: "filesystem" }),
    "development-filesystem",
  );
  assert.equal(selectEvidenceObjectBackend({ NODE_ENV: "development" }), "unavailable");
  assert.equal(
    selectEvidenceObjectBackend({ NODE_ENV: "production", BLOB_READ_WRITE_TOKEN: "token" }),
    "blob",
  );
  assert.equal(
    selectEvidenceObjectBackend({ VERCEL_ENV: "production", VERCEL_OIDC_TOKEN: "oidc" }),
    "blob",
  );

  const submit = source("src/lib/canonical-logs/submit-canonical-log.ts");
  const early = submit.indexOf("if (existing) return existing");
  const write = submit.indexOf("await putEvidenceObjects");
  const unavailable = submit.indexOf("throw new Error(EVIDENCE_STORAGE_UNAVAILABLE)");
  const create = submit.indexOf("operationalEvidenceRecord.create");
  assert.ok(early >= 0 && write > early && write < create);
  assert.ok(unavailable > early && unavailable < create);
  assert.match(source("src/app/api/evidence-attachments/[id]/route.ts"), /facilityId: session.facilityId/);
  assert.match(source("src/lib/support/attachment-store.ts"), /getPrivateObjectStore/);
  assert.doesNotMatch(source("src/lib/storage/private-object-store.ts"), /access: "public"/);
});
