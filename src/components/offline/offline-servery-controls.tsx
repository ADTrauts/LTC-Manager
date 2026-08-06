"use client";

import { useCallback, useEffect, useState } from "react";

import type { MealType } from "@prisma/client";

import { OfflineAssignmentContext } from "@/components/offline/offline-assignment-context";
import { OfflineJobFlowContext } from "@/components/offline/offline-job-flow-context";
import { ServeryMealServiceControls } from "@/components/servery-meal-service-controls";
import { deriveConnectivityState } from "@/lib/offline/connectivity-reducer";
import type { OfflineConnectivityState } from "@/lib/offline/types";
import {
  fetchAndStoreBundle,
  getOfflineRuntimeSnapshot,
  initializeDeviceContext,
  queueOfflineMilestoneCommand,
  runSyncBatch,
  startSyncEngine,
} from "@/lib/offline/sync-engine";

type MilestoneState = {
  occurredAt: string | null;
  recordedAt: string | null;
  recordedByLabel: string | null;
  corrected: boolean;
};

type OfflineServeryControlsProps = {
  unitId: string;
  facilityId: string;
  sessionVersion: number;
  actorRef: string;
  deviceFacilityId: string | null;
  deviceBoundUnitId: string | null;
  defaultMealType: MealType | null;
  returnTab: "overview" | "logs";
  returnLogTab: string;
  slots: { mealType: MealType; scheduledTime: string }[];
  eventByMeal: Partial<Record<MealType, { ready: MilestoneState; started: MilestoneState }>>;
  contextNote: string;
  canRecord: boolean;
  canCorrect: boolean;
};

function fmtConnectivity(state: OfflineConnectivityState): string {
  switch (state) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "SYNCHRONIZING":
      return "Synchronizing";
    case "SYNCHRONIZED":
      return "Synchronized";
    case "UNABLE_TO_SYNC":
      return "Unable to Sync";
    case "CONFLICT_REVIEW_REQUIRED":
      return "Conflict Review Required";
    case "REAUTHENTICATION_REQUIRED":
      return "Reauthentication Required";
    case "NO_BUNDLE":
      return "No Offline Bundle";
  }
}

export function OfflineServeryControls(props: OfflineServeryControlsProps) {
  const [connectivity, setConnectivity] = useState<OfflineConnectivityState>("ONLINE");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setConnectivity("OFFLINE");
      setIsOfflineMode(true);
    }
    const snap = await getOfflineRuntimeSnapshot();
    const navigatorOnline = snap.navigatorOnline;
    const state = deriveConnectivityState({
      probeOnline: snap.probeOnline,
      navigatorOnline,
      synchronizing: false,
      pendingCount: snap.pendingCount,
      conflictCount: snap.conflictCount,
      reauthenticationRequired: false,
      hasBundle: snap.bundle != null,
      lastSyncError: null,
    });
    // Never let a stale probe flip the UX back to online while the browser reports offline.
    if (!navigatorOnline) {
      setConnectivity(snap.bundle != null ? "OFFLINE" : "NO_BUNDLE");
      setIsOfflineMode(true);
    } else {
      setConnectivity(state);
      setIsOfflineMode(!snap.probeOnline);
    }
    setPendingCount(snap.pendingCount);
    setLastSync(snap.bundle?.lastSuccessfulSyncAt ?? null);
  }, []);

  useEffect(() => {
    if (!props.deviceFacilityId) return;
    void initializeDeviceContext({
      deviceFacilityId: props.deviceFacilityId,
      deviceBoundUnitId: props.deviceBoundUnitId,
      actorRef: props.actorRef,
      sessionVersion: props.sessionVersion,
      deviceRevokedLocally: false,
      signedOut: false,
      lastServerVerificationAt: new Date().toISOString(),
    });
    void fetchAndStoreBundle(props.unitId).then(() => refresh());
    const stop = startSyncEngine(props.unitId, refresh);
    const onOffline = () => {
      // Flip UX immediately — do not wait for an async probe that can race the offline event.
      setConnectivity("OFFLINE");
      setIsOfflineMode(true);
      void refresh();
    };
    const onOnline = () => void refresh();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      stop();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [
    props.unitId,
    props.deviceFacilityId,
    props.deviceBoundUnitId,
    props.actorRef,
    props.sessionVersion,
    refresh,
  ]);

  const handleOfflineRecord = async (input: {
    mealType: MealType;
    commandType: "RECORD_SERVERY_READY" | "RECORD_MEAL_SERVICE_STARTED";
  }) => {
    const snap = await getOfflineRuntimeSnapshot();
    if (!snap.bundle) {
      throw new Error("NO_OFFLINE_BUNDLE");
    }
    await queueOfflineMilestoneCommand({
      bundle: snap.bundle,
      commandType: input.commandType,
      mealType: input.mealType,
    });
    await refresh();
  };

  const handleRetry = async () => {
    await runSyncBatch(props.unitId);
    await refresh();
  };

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600"
        data-testid="offline-runtime-status"
        role="status"
      >
        <p>
          <span className="font-semibold text-zinc-800">{fmtConnectivity(connectivity)}</span>
          {pendingCount > 0 ? ` · ${pendingCount} pending` : null}
          {lastSync ? ` · Last sync ${new Date(lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : null}
        </p>
        {!props.deviceFacilityId ? (
          <p className="mt-1">Reconnect online and open this Unit Workspace to prepare offline use.</p>
        ) : null}
        {connectivity === "UNABLE_TO_SYNC" || pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="mt-2 min-h-9 rounded-md border border-zinc-300 bg-zinc-50 px-3 text-xs font-semibold text-zinc-800 touch-manipulation"
          >
            Retry synchronization
          </button>
        ) : null}
      </div>
      <OfflineAssignmentContext />
      <OfflineJobFlowContext />
      <ServeryMealServiceControls
        unitId={props.unitId}
        defaultMealType={props.defaultMealType}
        returnTab={props.returnTab}
        returnLogTab={props.returnLogTab}
        slots={props.slots}
        eventByMeal={props.eventByMeal}
        contextNote={props.contextNote}
        canRecord={props.canRecord}
        canCorrect={props.canCorrect}
        offline={{
          enabled: Boolean(props.deviceFacilityId),
          isOfflineMode,
          pendingCount,
          onOfflineRecord: handleOfflineRecord,
        }}
      />
    </div>
  );
}
