import {
  detectOfflineCryptoCapability,
  decryptJson,
  encryptJson,
  getOrCreateDeviceLocalKey,
  type EncryptedBlob,
} from "./crypto";
import { applySyncResultToQueueState } from "./queue-policy";
import { OFFLINE_STORE_VERSION } from "./types";
import type {
  OfflineQueuedCommand,
  OfflineRuntimeBundle,
  OfflineSyncCommandResult,
} from "./types";

/** IndexedDB row shape when the command payload is AES-GCM sealed. */
type SealedCommandRow = {
  clientCommandId: string;
  sealed: EncryptedBlob | OfflineQueuedCommand;
};

const DB_NAME = "ltc-offline-runtime";
const STORE_META = "meta";
const STORE_DEVICE = "deviceContext";
const STORE_BUNDLE = "bundle";
const STORE_COMMANDS = "commands";
const STORE_CONFLICTS = "conflicts";

export type OfflineDeviceContext = {
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  actorRef: string;
  sessionVersion: number;
  deviceRevokedLocally: boolean;
  signedOut: boolean;
  lastServerVerificationAt: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, OFFLINE_STORE_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      if (!db.objectStoreNames.contains(STORE_DEVICE)) db.createObjectStore(STORE_DEVICE);
      if (!db.objectStoreNames.contains(STORE_BUNDLE)) db.createObjectStore(STORE_BUNDLE);
      if (!db.objectStoreNames.contains(STORE_COMMANDS))
        db.createObjectStore(STORE_COMMANDS, { keyPath: "clientCommandId" });
      if (!db.objectStoreNames.contains(STORE_CONFLICTS))
        db.createObjectStore(STORE_CONFLICTS, { keyPath: "clientCommandId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function txGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("read failed"));
  });
}

async function txPut(store: string, key: IDBValidKey, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("write failed"));
  });
}

async function txDeleteAll(store: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clear failed"));
  });
}

async function txGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("getAll failed"));
  });
}

async function protectWrite<T>(value: T): Promise<EncryptedBlob | T> {
  const cap = detectOfflineCryptoCapability();
  if (!cap.subtle) return value;
  const key = await getOrCreateDeviceLocalKey();
  return encryptJson(value, key);
}

async function protectRead<T>(blob: EncryptedBlob | T): Promise<T> {
  if (blob && typeof blob === "object" && "v" in blob && "iv" in blob && "ct" in blob) {
    const key = await getOrCreateDeviceLocalKey();
    return decryptJson<T>(blob as EncryptedBlob, key);
  }
  return blob as T;
}

export async function getStoreSchemaVersion(): Promise<number> {
  const v = await txGet<number>(STORE_META, "schemaVersion");
  return v ?? OFFLINE_STORE_VERSION;
}

export async function saveDeviceContext(ctx: OfflineDeviceContext): Promise<void> {
  await txPut(STORE_DEVICE, "current", await protectWrite(ctx));
}

export async function loadDeviceContext(): Promise<OfflineDeviceContext | null> {
  const raw = await txGet<EncryptedBlob | OfflineDeviceContext>(STORE_DEVICE, "current");
  if (!raw) return null;
  return protectRead<OfflineDeviceContext>(raw);
}

export async function saveActiveBundle(bundle: OfflineRuntimeBundle): Promise<void> {
  await txPut(STORE_BUNDLE, "active", await protectWrite(bundle));
  await txPut(STORE_META, "lastBundleVersion", bundle.bundleVersion);
}

export async function loadActiveBundle(): Promise<OfflineRuntimeBundle | null> {
  const raw = await txGet<EncryptedBlob | OfflineRuntimeBundle>(STORE_BUNDLE, "active");
  if (!raw) return null;
  try {
    return await protectRead<OfflineRuntimeBundle>(raw);
  } catch {
    return null;
  }
}

export async function enqueueCommand(command: OfflineQueuedCommand): Promise<void> {
  // Object store uses keyPath clientCommandId. Encrypted blobs must be wrapped so the keyPath
  // remains present — otherwise IndexedDB rejects the write when AES-GCM sealing is active.
  const sealed = await protectWrite(command);
  const row: SealedCommandRow = { clientCommandId: command.clientCommandId, sealed };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_COMMANDS, "readwrite");
    tx.objectStore(STORE_COMMANDS).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("command write failed"));
  });
}

export async function updateCommand(command: OfflineQueuedCommand): Promise<void> {
  await enqueueCommand(command);
}

export async function loadAllCommands(): Promise<OfflineQueuedCommand[]> {
  const rows = await txGetAll<SealedCommandRow | EncryptedBlob | OfflineQueuedCommand>(STORE_COMMANDS);
  const out: OfflineQueuedCommand[] = [];
  for (const row of rows) {
    try {
      if (row && typeof row === "object" && "sealed" in row) {
        out.push(await protectRead<OfflineQueuedCommand>((row as SealedCommandRow).sealed));
      } else if (row && typeof row === "object" && "queueState" in row && "clientCommandId" in row) {
        out.push(row as OfflineQueuedCommand);
      } else {
        out.push(await protectRead<OfflineQueuedCommand>(row as EncryptedBlob | OfflineQueuedCommand));
      }
    } catch {
      // Skip undecryptable legacy rows rather than failing the whole queue read.
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function loadPendingCommands(): Promise<OfflineQueuedCommand[]> {
  const all = await loadAllCommands();
  return all.filter(
    (c) => c.queueState === "PENDING" || c.queueState === "RETRY_REQUIRED" || c.queueState === "SYNCHRONIZING",
  );
}

export async function applySyncResults(results: OfflineSyncCommandResult[]): Promise<void> {
  const all = await loadAllCommands();
  const byId = new Map(all.map((c) => [c.clientCommandId, c]));
  for (const result of results) {
    const cmd = byId.get(result.clientCommandId);
    if (!cmd) continue;
    cmd.queueState = applySyncResultToQueueState(result.category);
    cmd.updatedAt = new Date().toISOString();
    if (result.retryAfterSeconds) {
      cmd.retryAfterAt = new Date(Date.now() + result.retryAfterSeconds * 1000).toISOString();
    }
    await updateCommand(cmd);
    if (result.category === "CONFLICT_REVIEW_REQUIRED") {
      await txPut(STORE_CONFLICTS, result.clientCommandId, {
        clientCommandId: result.clientCommandId,
        conflictCategory: result.conflictCategory,
        createdAt: new Date().toISOString(),
      });
    }
  }
}

export async function countPendingCommands(): Promise<number> {
  return (await loadPendingCommands()).length;
}

export async function countOpenConflicts(): Promise<number> {
  return (await txGetAll(STORE_CONFLICTS)).length;
}

export async function clearActiveBundle(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_BUNDLE, "readwrite");
    tx.objectStore(STORE_BUNDLE).delete("active");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
  });
}

export async function clearForSignOut(): Promise<void> {
  await clearActiveBundle();
  const ctx = await loadDeviceContext();
  if (ctx) {
    ctx.signedOut = true;
    await saveDeviceContext(ctx);
  }
}

export async function clearForDeviceRebind(): Promise<void> {
  await clearActiveBundle();
  await txDeleteAll(STORE_DEVICE);
}

export async function clearAllOfflineData(): Promise<void> {
  await txDeleteAll(STORE_META);
  await txDeleteAll(STORE_DEVICE);
  await txDeleteAll(STORE_BUNDLE);
  await txDeleteAll(STORE_COMMANDS);
  await txDeleteAll(STORE_CONFLICTS);
}

export async function purgeAcceptedCommands(retentionHours: number, now = new Date()): Promise<number> {
  const all = await loadAllCommands();
  let removed = 0;
  for (const cmd of all) {
    if (cmd.queueState !== "ACCEPTED" && cmd.queueState !== "ALREADY_ACCEPTED") continue;
    const updated = new Date(cmd.updatedAt).getTime();
    if (now.getTime() - updated < retentionHours * 3600_000) continue;
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_COMMANDS, "readwrite");
      tx.objectStore(STORE_COMMANDS).delete(cmd.clientCommandId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    });
    removed++;
  }
  return removed;
}
