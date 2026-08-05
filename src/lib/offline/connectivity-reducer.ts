import type { OfflineConnectivityState } from "./types";

export function deriveConnectivityState(input: {
  probeOnline: boolean;
  navigatorOnline: boolean;
  synchronizing: boolean;
  pendingCount: number;
  conflictCount: number;
  reauthenticationRequired: boolean;
  hasBundle: boolean;
  lastSyncError: string | null;
}): OfflineConnectivityState {
  if (input.reauthenticationRequired) return "REAUTHENTICATION_REQUIRED";
  if (!input.hasBundle && !input.probeOnline) return "NO_BUNDLE";
  if (input.conflictCount > 0) return "CONFLICT_REVIEW_REQUIRED";
  if (input.synchronizing) return "SYNCHRONIZING";
  if (!input.probeOnline && !input.navigatorOnline) return "OFFLINE";
  if (input.pendingCount > 0 && input.lastSyncError) return "UNABLE_TO_SYNC";
  if (input.pendingCount > 0) return "OFFLINE";
  if (input.probeOnline && input.pendingCount === 0) return "SYNCHRONIZED";
  return "ONLINE";
}
