/**
 * Provider-neutral private object storage.
 * Production uses private Vercel Blob. Tests use memory.
 * Callers keep their own key scheme and never receive a public URL.
 */

export type PrivateObjectPut = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export type PrivateObjectStore = {
  put(input: PrivateObjectPut): Promise<{ storageKey: string }>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

export function isPrivateObjectStorageConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN?.trim() || env.VERCEL_OIDC_TOKEN?.trim());
}

export function isDeployedAppRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview"
  );
}

export function createMemoryPrivateObjectStore(
  objects: Map<string, Uint8Array> = new Map(),
): PrivateObjectStore & { objects: Map<string, Uint8Array> } {
  return {
    objects,
    async put(input) {
      objects.set(input.key, Uint8Array.from(input.bytes));
      return { storageKey: input.key };
    },
    async get(key) {
      const value = objects.get(key);
      return value ? Uint8Array.from(value) : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

export function createVercelBlobPrivateObjectStore(): PrivateObjectStore {
  return {
    async put(input) {
      const { put } = await import("@vercel/blob");
      await put(input.key, Buffer.from(input.bytes), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: input.contentType,
      });
      return { storageKey: input.key };
    },
    async get(key) {
      const { get } = await import("@vercel/blob");
      const result = await get(key, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
    async delete(key) {
      const { del } = await import("@vercel/blob");
      await del(key);
    },
  };
}

export function getPrivateObjectStore(
  env: NodeJS.ProcessEnv = process.env,
): PrivateObjectStore | null {
  if (!isPrivateObjectStorageConfigured(env)) return null;
  return createVercelBlobPrivateObjectStore();
}
