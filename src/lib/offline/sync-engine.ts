import {
  applySyncResults,
  countOpenConflicts,
  countPendingCommands,
  enqueueCommand,
  loadActiveBundle,
  loadPendingCommands,
  purgeAcceptedCommands,
  saveActiveBundle,
  saveDeviceContext,
  updateCommand,
  type OfflineDeviceContext,
} from "./local-store";
import { nextRetryAfterIso } from "./queue-policy";
import type {
  OfflineCommandEnvelope,
  OfflineCommandType,
  OfflineQueuedCommand,
  OfflineRuntimeBundle,
  OfflineSyncResponse,
} from "./types";

function toSyncEnvelope(command: OfflineQueuedCommand): OfflineCommandEnvelope {
  return {
    clientCommandId: command.clientCommandId,
    commandType: command.commandType,
    facilityId: command.facilityId,
    departmentId: command.departmentId,
    unitId: command.unitId,
    operationalDate: command.operationalDate,
    mealType: command.mealType,
    occurredAt: command.occurredAt,
    locallyRecordedAt: command.locallyRecordedAt,
    deviceBoundUnitId: command.deviceBoundUnitId,
    actorRef: command.actorRef,
    authMethod: command.authMethod,
    role: command.role,
    bundleVersion: command.bundleVersion,
    expectedServerRevision: command.expectedServerRevision,
    deviceTimezoneOffsetMinutes: command.deviceTimezoneOffsetMinutes,
  };
}
import { OFFLINE_ACCEPTED_RETENTION_HOURS } from "./types";

let syncInFlight = false;
let retryTimer: ReturnType<typeof setInterval> | null = null;

export async function probeConnectivity(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  // Short-circuit before fetch: offline probes must not hang waiting on a network timeout.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch("/api/auth/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function generateClientCommandId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchAndStoreBundle(unitId: string): Promise<OfflineRuntimeBundle | null> {
  const res = await fetch("/api/offline/runtime-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ unitId }),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { bundle: OfflineRuntimeBundle };
  await saveActiveBundle(data.bundle);
  return data.bundle;
}

export async function queueOfflineMilestoneCommand(input: {
  bundle: OfflineRuntimeBundle;
  commandType: OfflineCommandType;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER";
  occurredAt?: Date;
}): Promise<OfflineQueuedCommand> {
  const now = new Date();
  const occurredAt = input.occurredAt ?? now;
  const envelope: OfflineCommandEnvelope = {
    clientCommandId: generateClientCommandId(),
    commandType: input.commandType,
    facilityId: input.bundle.facilityId,
    departmentId: input.bundle.departmentId,
    unitId: input.bundle.unitId,
    operationalDate: input.bundle.operationalDate,
    mealType: input.mealType,
    occurredAt: occurredAt.toISOString(),
    locallyRecordedAt: now.toISOString(),
    deviceBoundUnitId: input.bundle.deviceBoundUnitId,
    actorRef: input.bundle.actor.actorRef,
    authMethod: input.bundle.actor.authMethod,
    role: input.bundle.actor.role,
    bundleVersion: input.bundle.bundleVersion,
    expectedServerRevision: input.bundle.serverRevision,
    deviceTimezoneOffsetMinutes: -now.getTimezoneOffset(),
  };
  const command: OfflineQueuedCommand = {
    ...envelope,
    queueState: "PENDING",
    attemptCount: 0,
    lastAttemptAt: null,
    retryAfterAt: null,
    lastErrorCategory: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  // Static import only — dynamic import() of local-store fails while offline if the chunk
  // was not already in Cache Storage / module graph.
  await enqueueCommand(command);
  return command;
}

export async function runSyncBatch(unitId: string): Promise<OfflineSyncResponse | null> {
  if (syncInFlight) return null;
  syncInFlight = true;
  try {
    const online = await probeConnectivity();
    if (!online) return null;

    const pending = await loadPendingCommands();
    const due = pending.filter(
      (c) => !c.retryAfterAt || new Date(c.retryAfterAt).getTime() <= Date.now(),
    );
    if (due.length === 0) return null;

    for (const cmd of due) {
      cmd.queueState = "SYNCHRONIZING";
      cmd.attemptCount += 1;
      cmd.lastAttemptAt = new Date().toISOString();
      await updateCommand(cmd);
    }

    const res = await fetch("/api/offline/runtime-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId,
        commands: due.map(toSyncEnvelope),
      }),
      cache: "no-store",
      credentials: "same-origin",
    });

    if (res.status === 401) {
      return {
        results: [],
        bundle: null,
        reauthenticationRequired: true,
        deviceRevoked: false,
      };
    }
    if (!res.ok) {
      for (const cmd of due) {
        cmd.queueState = "RETRY_REQUIRED";
        cmd.retryAfterAt = nextRetryAfterIso(cmd.attemptCount);
        cmd.lastErrorCategory = "SYNC_HTTP_ERROR";
        await updateCommand(cmd);
      }
      return null;
    }

    const data = (await res.json()) as OfflineSyncResponse;
    await applySyncResults(data.results);
    if (data.bundle) {
      await saveActiveBundle(data.bundle);
    }
    await purgeAcceptedCommands(OFFLINE_ACCEPTED_RETENTION_HOURS);
    return data;
  } finally {
    syncInFlight = false;
  }
}

export function startSyncEngine(unitId: string, onChange?: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const tick = async () => {
    await runSyncBatch(unitId);
    onChange?.();
  };

  void tick();

  const onOnline = () => void tick();
  const onOffline = () => {
    // Connectivity UI must flip immediately when the browser reports offline; sync ticks alone
    // only run on the online event and the 30s interval.
    onChange?.();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void tick();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  retryTimer = setInterval(() => void tick(), 30_000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.catch(() => {});
  }

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    if (retryTimer) clearInterval(retryTimer);
  };
}

export async function initializeDeviceContext(ctx: OfflineDeviceContext): Promise<void> {
  await saveDeviceContext(ctx);
}

export async function getOfflineRuntimeSnapshot() {
  const [bundle, pendingCount, conflictCount, probeOnline] = await Promise.all([
    loadActiveBundle(),
    countPendingCommands(),
    countOpenConflicts(),
    probeConnectivity(),
  ]);
  return {
    bundle,
    pendingCount,
    conflictCount,
    probeOnline,
    navigatorOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
}
