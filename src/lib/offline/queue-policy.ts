import type { OfflineQueueState, OfflineSyncResultCategory } from "./types";

/** Bounded exponential backoff in seconds: 5, 15, 45, 120, 300 (cap). */
export function retryBackoffSeconds(attemptCount: number): number {
  const steps = [5, 15, 45, 120, 300];
  const idx = Math.max(0, Math.min(steps.length - 1, attemptCount - 1));
  return steps[idx] ?? 300;
}

export function nextRetryAfterIso(attemptCount: number, now = new Date()): string {
  const seconds = retryBackoffSeconds(attemptCount);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export function applySyncResultToQueueState(
  category: OfflineSyncResultCategory,
): OfflineQueueState {
  switch (category) {
    case "ACCEPTED":
      return "ACCEPTED";
    case "ALREADY_ACCEPTED":
      return "ALREADY_ACCEPTED";
    case "REJECTED":
      return "REJECTED";
    case "CONFLICT_REVIEW_REQUIRED":
      return "CONFLICT_REVIEW_REQUIRED";
    case "RETRY_REQUIRED":
      return "RETRY_REQUIRED";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function isTerminalQueueState(state: OfflineQueueState): boolean {
  return (
    state === "ACCEPTED" ||
    state === "ALREADY_ACCEPTED" ||
    state === "REJECTED" ||
    state === "CONFLICT_REVIEW_REQUIRED"
  );
}

export function isRetryableQueueState(state: OfflineQueueState): boolean {
  return state === "PENDING" || state === "RETRY_REQUIRED";
}

export function canCreateOfflineCommand(input: {
  bundleExpiresAt: string;
  deviceRevokedLocally: boolean;
  signedOut: boolean;
  now?: Date;
}): { ok: true } | { ok: false; reason: string } {
  if (input.signedOut) return { ok: false, reason: "SIGNED_OUT" };
  if (input.deviceRevokedLocally) return { ok: false, reason: "DEVICE_REVOKED" };
  const now = input.now ?? new Date();
  if (new Date(input.bundleExpiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "BUNDLE_EXPIRED" };
  }
  return { ok: true };
}
