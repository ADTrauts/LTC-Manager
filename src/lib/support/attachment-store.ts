import {
  createMemoryPrivateObjectStore,
  createVercelBlobPrivateObjectStore,
  getPrivateObjectStore,
  isPrivateObjectStorageConfigured,
} from "@/lib/storage/private-object-store";

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
  const shared = createMemoryPrivateObjectStore();
  return {
    objects: shared.objects,
    put: (input) => shared.put(input),
    get: (storageKey) => shared.get(storageKey),
  };
}

export function isSupportAttachmentStorageConfigured(): boolean {
  return isPrivateObjectStorageConfigured();
}

export function createVercelBlobSupportAttachmentStore(): SupportAttachmentStore {
  const shared = createVercelBlobPrivateObjectStore();
  return {
    put: (input) => shared.put(input),
    get: (storageKey) => shared.get(storageKey),
  };
}

export function getSupportAttachmentStore(): SupportAttachmentStore | null {
  const shared = getPrivateObjectStore();
  if (!shared) return null;
  return {
    put: (input) => shared.put(input),
    get: (storageKey) => shared.get(storageKey),
  };
}
