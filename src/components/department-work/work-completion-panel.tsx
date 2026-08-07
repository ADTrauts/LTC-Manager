"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { completeWorkRequirementAction } from "@/app/(protected)/staffing/work-plans/work-runtime-actions";
import type { WorkRequirement } from "@/lib/department-work/types";
import {
  fetchAndStoreBundle,
  generateClientCommandId,
  getOfflineRuntimeSnapshot,
  initializeDeviceContext,
  queueOfflineWorkCompletionCommand,
  runSyncBatch,
  startSyncEngine,
} from "@/lib/offline/sync-engine";
import { loadPendingCommands } from "@/lib/offline/local-store";

type Props = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  requirement: WorkRequirement;
  deviceFacilityId?: string | null;
  deviceBoundUnitId?: string | null;
  actorRef?: string | null;
  sessionVersion?: number;
};

function workStateLabel(state: string): string {
  if (state === "PAST_DUE_NOT_CONFIRMED") return "Past due — not confirmed";
  if (state === "SAVED_ON_THIS_TABLET") return "Saved on This Tablet";
  return state.replaceAll("_", " ");
}

export function WorkCompletionPanel({
  facilityId,
  departmentId,
  unitId,
  requirement,
  deviceFacilityId = null,
  deviceBoundUnitId = null,
  actorRef = null,
  sessionVersion = 0,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [offlineStatus, setOfflineStatus] = useState<string | null>(null);

  const refreshOffline = useCallback(async () => {
    const snap = await getOfflineRuntimeSnapshot();
    const pendingCmds = await loadPendingCommands();
    const workPending = pendingCmds.filter(
      (c) =>
        c.commandType === "COMPLETE_OPERATIONAL_TASK" &&
        c.workCompletion?.occurrenceKey === requirement.occurrenceKey,
    );
    if (workPending.some((c) => c.queueState === "SYNCHRONIZING")) {
      setOfflineStatus("Synchronizing");
    } else if (workPending.some((c) => c.queueState === "PENDING" || c.queueState === "RETRY_REQUIRED")) {
      setOfflineStatus("Saved on This Tablet");
    } else if (!snap?.probeOnline) {
      setOfflineStatus("Offline");
    } else {
      setOfflineStatus(null);
    }
  }, [requirement.occurrenceKey]);

  useEffect(() => {
    void refreshOffline();
    const stop = startSyncEngine(unitId, () => {
      void refreshOffline();
      router.refresh();
    });
    return stop;
  }, [unitId, refreshOffline, router]);

  const completed =
    requirement.state === "COMPLETED" || requirement.state === "COMPLETED_WITH_EVIDENCE";

  function completeOnline() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const clientCommandId = generateClientCommandId();
        await completeWorkRequirementAction({
          facilityId,
          departmentId,
          unitId,
          occurrenceKey: requirement.occurrenceKey,
          note: note.trim() || null,
          clientCommandId,
          deviceBoundUnitId,
        });
        setNotice("Work confirmed.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not complete Work.");
      }
    });
  }

  function completeOffline() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        if (deviceFacilityId) {
          await initializeDeviceContext({
            deviceFacilityId,
            deviceBoundUnitId: deviceBoundUnitId ?? null,
            actorRef: actorRef ?? "unknown",
            sessionVersion,
            deviceRevokedLocally: false,
            signedOut: false,
            lastServerVerificationAt: null,
          });
        }
        let snap = await getOfflineRuntimeSnapshot();
        if (!snap?.bundle) {
          await fetchAndStoreBundle(unitId);
          snap = await getOfflineRuntimeSnapshot();
        }
        if (!snap?.bundle) {
          throw new Error("Offline Runtime bundle unavailable.");
        }
        await queueOfflineWorkCompletionCommand({
          bundle: snap.bundle,
          workCompletion: {
            occurrenceKey: requirement.occurrenceKey,
            workPlanId: requirement.workPlanId,
            workPlanStableKey: requirement.workPlanStableKey,
            workPlanVersion: requirement.workPlanVersion,
            workItemId: requirement.workItemId,
            workItemKey: requirement.workItemKey,
            label: requirement.label,
            instructions: requirement.instructions,
            priority: requirement.priority,
            completionMode: requirement.completionMode,
            responsibilityMode: requirement.responsibilityMode,
            scheduleKind: requirement.scheduleKind,
            cycleStableKey: requirement.cycleStableKey,
            windowStartLocal: requirement.windowStartLocal,
            windowEndLocal: requirement.windowEndLocal,
            dueAt: requirement.dueAt?.toISOString?.() ?? (requirement.dueAt as unknown as string) ?? null,
            spaceId: requirement.spaceId,
            assetId: requirement.assetId,
            knowledgeArticleId: requirement.knowledgeArticleId,
            procedureTitle: requirement.procedureTitle,
            note: note.trim() || null,
            expectedAssignedEmployeeId: requirement.assignedEmployeeId,
          },
        });
        setNotice("Saved on This Tablet.");
        setOfflineStatus("Saved on This Tablet");
        void runSyncBatch(unitId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not queue offline completion.");
      }
    });
  }

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      data-testid="work-completion-panel"
      data-occurrence-key={requirement.occurrenceKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{requirement.label}</h2>
          <p className="text-xs text-zinc-600" data-testid="work-completion-state">
            {workStateLabel(requirement.state)}
            {requirement.workPlanName ? ` · ${requirement.workPlanName}` : ""}
          </p>
        </div>
        {requirement.knowledgeArticleId ? (
          <Link
            href={`/unit/${unitId}?procedure=${encodeURIComponent(requirement.knowledgeArticleId)}&work=${encodeURIComponent(requirement.occurrenceKey)}`}
            className="text-xs font-medium underline-offset-2 hover:underline"
            data-testid="work-view-procedure"
          >
            View procedure
          </Link>
        ) : null}
      </div>

      {requirement.instructions ? (
        <p className="mt-2 text-sm text-zinc-700">{requirement.instructions}</p>
      ) : null}

      {requirement.state === "PAST_DUE_NOT_CONFIRMED" ? (
        <p className="mt-2 text-xs text-zinc-600" data-testid="work-past-due-copy">
          Past due — not confirmed. This does not prove the work did not occur.
        </p>
      ) : null}

      {completed ? (
        <p className="mt-3 text-sm text-emerald-700" data-testid="work-already-complete">
          Completed
          {requirement.completedByLabel ? ` by ${requirement.completedByLabel}` : ""}.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-zinc-700">
            Note (optional)
            <textarea
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="work-completion-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              data-testid="complete-work"
              disabled={pending || requirement.completionMode === "LINKED_EVIDENCE"}
              onClick={completeOnline}
            >
              Confirm complete
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 disabled:opacity-50"
              data-testid="complete-work-offline"
              disabled={pending || requirement.completionMode === "LINKED_EVIDENCE"}
              onClick={completeOffline}
            >
              Save on this tablet
            </button>
          </div>
          {requirement.completionMode === "LINKED_EVIDENCE" ? (
            <p className="text-xs text-zinc-600">
              This Work completes when linked Evidence is accepted.
              {requirement.linkedTemplateStableKey ? (
                <>
                  {" "}
                  <Link
                    href={`/unit/${unitId}?evidence=${encodeURIComponent(requirement.linkedTemplateStableKey)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    Open Evidence
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}

      {notice ? (
        <p className="mt-2 text-sm text-emerald-700" data-testid="work-completion-notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-red-700" data-testid="work-completion-error">
          {error}
        </p>
      ) : null}
      {offlineStatus ? (
        <p className="mt-2 text-xs text-zinc-500" data-testid="work-offline-status">
          {offlineStatus}
        </p>
      ) : null}
    </section>
  );
}
