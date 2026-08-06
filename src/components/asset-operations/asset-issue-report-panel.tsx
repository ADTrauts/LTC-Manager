"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { reportAssetIssueAction } from "@/app/(protected)/asset-issues/actions";
import {
  fetchAndStoreBundle,
  generateClientCommandId,
  getOfflineRuntimeSnapshot,
  initializeDeviceContext,
  queueOfflineAssetIssueCommand,
  runSyncBatch,
  startSyncEngine,
} from "@/lib/offline/sync-engine";
import { loadPendingCommands } from "@/lib/offline/local-store";

export type AssetIssueReportAssetOption = {
  id: string;
  name: string;
  assetCode: string;
  statusLabel?: string;
  openIssueAlreadyReported?: boolean;
};

type Props = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  assets: AssetIssueReportAssetOption[];
  defaultAssetId?: string | null;
  evidenceRecordId?: string | null;
  deviceFacilityId?: string | null;
  deviceBoundUnitId?: string | null;
  actorRef?: string | null;
  sessionVersion?: number;
  compact?: boolean;
};

const IMPACT_OPTIONS = [
  { value: "NO_IMMEDIATE_IMPACT", label: "No immediate service impact" },
  { value: "WORKAROUND_AVAILABLE", label: "Workaround available" },
  { value: "SERVICE_AT_RISK", label: "Service at risk" },
  { value: "EQUIPMENT_UNAVAILABLE", label: "Equipment unavailable" },
] as const;

function nowLocalInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssetIssueReportPanel({
  facilityId,
  departmentId,
  unitId,
  assets,
  defaultAssetId = null,
  evidenceRecordId = null,
  deviceFacilityId = null,
  deviceBoundUnitId = null,
  actorRef = null,
  sessionVersion = 0,
  compact = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assetId, setAssetId] = useState(defaultAssetId ?? assets[0]?.id ?? "");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [observedAt, setObservedAt] = useState(nowLocalInputValue);
  const [impact, setImpact] = useState<(typeof IMPACT_OPTIONS)[number]["value"]>(
    "NO_IMMEDIATE_IMPACT",
  );
  const [usable, setUsable] = useState(true);
  const [workaround, setWorkaround] = useState("");
  const [comment, setComment] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [localStatus, setLocalStatus] = useState<
    "IDLE" | "SAVED_ON_THIS_TABLET" | "SYNCHRONIZING" | "SYNCHRONIZED" | "CONFLICT" | "REJECTED"
  >("IDLE");

  const selected = assets.find((a) => a.id === assetId);
  const openDuplicateWarn = Boolean(selected?.openIssueAlreadyReported) && !allowDuplicate;

  const refreshOffline = useCallback(async () => {
    const navigatorOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    setIsOfflineMode(navigatorOffline);
    const pendingCmds = await loadPendingCommands();
    const forAsset = pendingCmds.filter(
      (c) =>
        c.commandType === "REPORT_ASSET_ISSUE" &&
        c.assetIssue?.assetId === assetId &&
        c.unitId === unitId,
    );
    const latest = forAsset[forAsset.length - 1];
    if (latest?.queueState === "PENDING" || latest?.queueState === "RETRY_REQUIRED") {
      setLocalStatus("SAVED_ON_THIS_TABLET");
    } else if (latest?.queueState === "SYNCHRONIZING") {
      setLocalStatus("SYNCHRONIZING");
    } else if (latest?.queueState === "ACCEPTED" || latest?.queueState === "ALREADY_ACCEPTED") {
      setLocalStatus("SYNCHRONIZED");
    } else if (latest?.queueState === "CONFLICT_REVIEW_REQUIRED") {
      setLocalStatus("CONFLICT");
    } else if (latest?.queueState === "REJECTED") {
      setLocalStatus("REJECTED");
    } else if (!latest) {
      setLocalStatus("IDLE");
    }
  }, [assetId, unitId]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void (async () => {
      if (deviceFacilityId && actorRef) {
        await initializeDeviceContext({
          deviceFacilityId,
          deviceBoundUnitId,
          actorRef,
          sessionVersion,
          deviceRevokedLocally: false,
          signedOut: false,
          lastServerVerificationAt: new Date().toISOString(),
        });
      }
      await fetchAndStoreBundle(unitId);
      await refreshOffline();
      stop = startSyncEngine(unitId, () => void refreshOffline());
    })();
    const onOffline = () => {
      setIsOfflineMode(true);
      void refreshOffline();
    };
    const onOnline = () => {
      setIsOfflineMode(false);
      void runSyncBatch(unitId).then(() => refreshOffline());
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      stop?.();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [
    unitId,
    refreshOffline,
    deviceFacilityId,
    deviceBoundUnitId,
    actorRef,
    sessionVersion,
  ]);

  function submit() {
    setError(null);
    setNotice(null);
    if (!assetId) {
      setError("Select an Asset.");
      return;
    }
    if (summary.trim().length < 3 || description.trim().length < 3) {
      setError("Summary and description are required.");
      return;
    }
    startTransition(async () => {
      try {
        const observed = new Date(observedAt);
        if (Number.isNaN(observed.getTime())) {
          throw new Error("Observed time is invalid.");
        }

        if (isOfflineMode || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          const snap = await getOfflineRuntimeSnapshot();
          if (!snap.bundle) {
            throw new Error("No offline bundle. Open Unit Workspace online first.");
          }
          const scoped = snap.bundle.assetContext?.assets.find((a) => a.id === assetId);
          if (!scoped) {
            throw new Error("This Asset is not in the offline bundle for this Unit.");
          }
          await queueOfflineAssetIssueCommand({
            bundle: snap.bundle,
            assetIssue: {
              assetId,
              summary: summary.trim(),
              description: description.trim(),
              operationalImpact: impact,
              equipmentRemainsUsable: usable,
              workaroundInstruction: workaround.trim() || null,
              evidenceRecordId: evidenceRecordId ?? null,
              comment: comment.trim() || null,
              allowDuplicateOpen: allowDuplicate,
              priority: "MEDIUM",
            },
            occurredAt: observed,
          });
          setLocalStatus("SAVED_ON_THIS_TABLET");
          setNotice("Issue saved on this tablet. It will synchronize when online.");
          await refreshOffline();
          return;
        }

        const result = await reportAssetIssueAction({
          facilityId,
          departmentId,
          assetId,
          unitId,
          summary: summary.trim(),
          description: description.trim(),
          observedAt: observed.toISOString(),
          operationalImpact: impact,
          equipmentRemainsUsable: usable,
          workaroundInstruction: workaround.trim() || undefined,
          evidenceRecordId: evidenceRecordId ?? undefined,
          comment: comment.trim() || undefined,
          allowDuplicateOpen: allowDuplicate,
          clientCommandId: generateClientCommandId(),
        });

        if (result.duplicateOf && !result.idempotent) {
          setNotice(
            `An open Issue already covers this condition (${result.issueCode}). Review it instead of creating a duplicate.`,
          );
          router.push(`/asset-issues/${result.issueId}`);
          return;
        }

        setSummary("");
        setDescription("");
        setComment("");
        setAllowDuplicate(false);
        setNotice(`Issue ${result.issueCode} reported.`);
        router.refresh();
        router.push(`/asset-issues/${result.issueId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Report failed.");
      }
    });
  }

  return (
    <section
      className={`rounded-md border border-zinc-200 bg-white ${compact ? "p-3" : "p-4"}`}
      data-testid="asset-issue-report-panel"
      data-offline-mode={isOfflineMode ? "true" : "false"}
      data-local-status={localStatus}
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-zinc-900">Report Asset Issue</h2>
        <p className="text-xs text-zinc-600">
          Describe the observed condition. This does not create a Work Order.
        </p>
        <p className="text-xs text-zinc-500" data-testid="asset-issue-offline-status">
          {isOfflineMode ? "Offline" : "Online"}
          {localStatus === "SAVED_ON_THIS_TABLET" ? " · Saved on This Tablet" : ""}
          {localStatus === "SYNCHRONIZING" ? " · Synchronizing" : ""}
          {localStatus === "SYNCHRONIZED" ? " · Synchronized" : ""}
          {localStatus === "CONFLICT" ? " · Review required" : ""}
          {localStatus === "REJECTED" ? " · Rejected" : ""}
        </p>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
          <span className="font-medium text-zinc-900">Asset</span>
          <select
            data-testid="asset-issue-asset"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Select asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assetCode} · {a.name}
                {a.statusLabel ? ` (${a.statusLabel})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
          <span className="font-medium text-zinc-900">Summary</span>
          <input
            data-testid="asset-issue-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Short description"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
          <span className="font-medium text-zinc-900">Description</span>
          <textarea
            data-testid="asset-issue-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="What was observed?"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Observed time</span>
          <input
            data-testid="asset-issue-observed-at"
            type="datetime-local"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          <span className="font-medium text-zinc-900">Operational impact</span>
          <select
            data-testid="asset-issue-impact"
            value={impact}
            onChange={(e) =>
              setImpact(e.target.value as (typeof IMPACT_OPTIONS)[number]["value"])
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {IMPACT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            data-testid="asset-issue-usable"
            type="checkbox"
            checked={usable}
            onChange={(e) => setUsable(e.target.checked)}
          />
          Equipment remains usable
        </label>

        {impact === "WORKAROUND_AVAILABLE" || !usable ? (
          <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
            <span className="font-medium text-zinc-900">Workaround / instruction</span>
            <input
              data-testid="asset-issue-workaround"
              value={workaround}
              onChange={(e) => setWorkaround(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm text-zinc-700 sm:col-span-2">
          <span className="font-medium text-zinc-900">Comment (optional)</span>
          <input
            data-testid="asset-issue-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        {openDuplicateWarn ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2"
            data-testid="asset-issue-duplicate-warn"
          >
            An open Issue may already cover this Asset. Confirm before reporting a distinct problem.
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
                data-testid="asset-issue-allow-duplicate"
              />
              This is a distinct problem — allow another open Issue
            </label>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert" data-testid="asset-issue-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-sm text-emerald-800" data-testid="asset-issue-notice">
          {notice}
        </p>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          data-testid="asset-issue-submit"
          disabled={pending}
          onClick={submit}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : isOfflineMode ? "Save on this tablet" : "Report Issue"}
        </button>
      </div>
    </section>
  );
}
