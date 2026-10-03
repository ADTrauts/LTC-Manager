export type SupportAttachmentStore = {
  put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<{ storageKey: string }>;
  get(storageKey: string): Promise<Uint8Array | null>;
};

export function supportAttachmentObjectKey(input: {
  ticketId: string;
  messageId: string;
  attachmentId: string;
}): string {
  return `support/${input.ticketId}/${input.messageId}/${input.attachmentId}`;
}

export function createMemorySupportAttachmentStore(): SupportAttachmentStore & {
  objects: Map<string, Uint8Array>;
} {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(input) {
      objects.set(input.key, Uint8Array.from(input.bytes));
      return { storageKey: input.key };
    },
    async get(storageKey) {
      const value = objects.get(storageKey);
      return value ? Uint8Array.from(value) : null;
    },
  };
}

export function isSupportAttachmentStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function createVercelBlobSupportAttachmentStore(): SupportAttachmentStore {
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
    async get(storageKey) {
      const { get } = await import("@vercel/blob");
      const result = await get(storageKey, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
  };
}

export function getSupportAttachmentStore(): SupportAttachmentStore | null {
  if (!isSupportAttachmentStorageConfigured()) return null;
  return createVercelBlobSupportAttachmentStore();
}
