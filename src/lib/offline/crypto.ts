/**
 * Device-local authenticated encryption for offline payloads.
 *
 * Uses a non-extractable AES-GCM key stored in IndexedDB (CryptoKey structured clone).
 * No server secret is embedded in the browser. This protects against casual disk inspection
 * of IndexedDB blobs within the same origin; it is not a substitute for server authorization.
 */

const KEY_STORE = "ltc-offline-crypto-v1";
const KEY_NAME = "device-local-aes-gcm";

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_STORE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGetKey(): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const req = tx.objectStore("keys").get(KEY_NAME);
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("key read failed"));
  });
}

async function idbPutKey(key: CryptoKey): Promise<void> {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    tx.objectStore("keys").put(key, KEY_NAME);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("key write failed"));
  });
}

export type OfflineCryptoCapability =
  | { mode: "AES_GCM_NON_EXTRACTABLE"; subtle: true }
  | { mode: "ORIGIN_ISOLATION_ONLY"; subtle: false; reason: string };

export function detectOfflineCryptoCapability(): OfflineCryptoCapability {
  if (typeof indexedDB === "undefined") {
    return { mode: "ORIGIN_ISOLATION_ONLY", subtle: false, reason: "indexedDB unavailable" };
  }
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return { mode: "ORIGIN_ISOLATION_ONLY", subtle: false, reason: "Web Crypto SubtleCrypto unavailable" };
  }
  return { mode: "AES_GCM_NON_EXTRACTABLE", subtle: true };
}

export async function getOrCreateDeviceLocalKey(): Promise<CryptoKey> {
  const existing = await idbGetKey();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await idbPutKey(key);
  return key;
}

export type EncryptedBlob = {
  v: 1;
  iv: string;
  ct: string;
};

function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encryptJson(value: unknown, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { v: 1, iv: bytesToB64(iv.buffer), ct: bytesToB64(ct) };
}

export async function decryptJson<T>(blob: EncryptedBlob, key: CryptoKey): Promise<T> {
  const iv = new Uint8Array(b64ToBytes(blob.iv));
  const ct = new Uint8Array(b64ToBytes(blob.ct));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
