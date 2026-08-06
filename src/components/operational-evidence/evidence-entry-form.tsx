"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { submitUnitEvidenceAction } from "@/app/(protected)/unit/[unitId]/evidence-actions";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import {
  fetchAndStoreBundle,
  getOfflineRuntimeSnapshot,
  initializeDeviceContext,
  queueOfflineEvidenceCommand,
  runSyncBatch,
  startSyncEngine,
} from "@/lib/offline/sync-engine";
import { loadPendingCommands } from "@/lib/offline/local-store";

type Props = {
  facilityId: string;
  departmentId: string;
  unitId: string;
  requirement: EvidenceRequirement;
  readOnly?: boolean;
  deviceFacilityId?: string | null;
  deviceBoundUnitId?: string | null;
  actorRef?: string | null;
  sessionVersion?: number;
};

export function EvidenceEntryForm({
  facilityId,
  departmentId,
  unitId,
  requirement,
  readOnly = false,
  deviceFacilityId = null,
  deviceBoundUnitId = null,
  actorRef = null,
  sessionVersion = 0,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [correctiveActionText, setCorrectiveActionText] = useState("");
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [localStatus, setLocalStatus] = useState<
    "IDLE" | "SAVED_ON_THIS_TABLET" | "SYNCHRONIZING" | "SYNCHRONIZED" | "CONFLICT" | "REJECTED"
  >("IDLE");
  const [pendingLocalCount, setPendingLocalCount] = useState(0);
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);

  const refreshOffline = useCallback(async () => {
    const navigatorOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    setIsOfflineMode(navigatorOffline);
    const pendingCmds = await loadPendingCommands();
    const forReq = pendingCmds.filter(
      (c) =>
        c.commandType === "SUBMIT_OPERATIONAL_EVIDENCE" &&
        c.evidence?.requirementKey === requirement.requirementKey,
    );
    setPendingLocalCount(forReq.length);
    const latest = forReq[forReq.length - 1];
    if (latest?.queueState === "PENDING" || latest?.queueState === "RETRY_REQUIRED") {
      setLocalStatus("SAVED_ON_THIS_TABLET");
    } else if (latest?.queueState === "SYNCHRONIZING") {
      setLocalStatus("SYNCHRONIZING");
    } else if (latest?.queueState === "ACCEPTED" || latest?.queueState === "ALREADY_ACCEPTED") {
      setLocalStatus("SYNCHRONIZED");
    } else if (
      latest?.queueState === "CONFLICT_REVIEW_REQUIRED" ||
      latest?.lastErrorCategory === "CONFLICT_REVIEW_REQUIRED"
    ) {
      setLocalStatus("CONFLICT");
      setRejectedReason(latest.lastErrorCategory);
    } else if (latest?.queueState === "REJECTED") {
      setLocalStatus("REJECTED");
      setRejectedReason(latest.lastErrorCategory);
    }
  }, [requirement.requirementKey]);

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

  const completed = ["COMPLETED", "COMPLETED_WITH_CORRECTIVE_ACTION", "NEEDS_REVIEW"].includes(
    requirement.state,
  );
  const locallySaved =
    localStatus === "SAVED_ON_THIS_TABLET" ||
    localStatus === "SYNCHRONIZING" ||
    localStatus === "SYNCHRONIZED";
  const locked = readOnly || completed || locallySaved;

  const outOfStandardPreview = useMemo(() => {
    return requirement.fields.some((field) => {
      if (!field.correctiveActionTrigger) return false;
      if (field.fieldType === "TEMPERATURE" || field.fieldType === "NUMBER") {
        const n = Number(values[field.fieldKey]);
        if (!Number.isFinite(n)) return false;
        if (field.minNumber != null && n < field.minNumber) return true;
        if (field.maxNumber != null && n > field.maxNumber) return true;
      }
      if (field.fieldType === "PASS_NEEDS_ATTENTION") {
        return values[field.fieldKey] === "NEEDS_ATTENTION";
      }
      if (field.fieldType === "YES_NO") {
        return values[field.fieldKey] === "NO";
      }
      return false;
    });
  }, [requirement.fields, values]);

  const correctiveRequired = requirement.fields.some(
    (f) => f.correctiveActionRequired && f.correctiveActionTrigger,
  );

  function buildPayload() {
    return requirement.fields.map((field) => {
      const raw = values[field.fieldKey] ?? "";
      if (field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE") {
        return { fieldKey: field.fieldKey, valueNumber: raw === "" ? null : Number(raw) };
      }
      if (
        field.fieldType === "YES_NO" ||
        field.fieldType === "PASS_NEEDS_ATTENTION" ||
        field.fieldType === "ATTESTATION"
      ) {
        return { fieldKey: field.fieldKey, valueText: raw || null };
      }
      if (field.fieldType === "MULTI_SELECT") {
        return {
          fieldKey: field.fieldKey,
          valueSelections: raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [],
        };
      }
      return { fieldKey: field.fieldKey, valueText: raw || null };
    });
  }

  function submit() {
    setError(null);
    if (outOfStandardPreview && correctiveRequired && !correctiveActionText.trim()) {
      setError("Corrective action is required for out-of-standard results.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isOfflineMode || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          const snap = await getOfflineRuntimeSnapshot();
          if (!snap.bundle) {
            throw new Error("No offline bundle. Open this form online first.");
          }
          const scoped = snap.bundle.evidenceContext?.requirements.find(
            (r) => r.requirementKey === requirement.requirementKey,
          );
          if (!scoped) {
            throw new Error(
              "This evidence requirement is not in the offline bundle for this Unit.",
            );
          }
          if (scoped.templateVersion !== requirement.templateVersion) {
            setLocalStatus("CONFLICT");
            setRejectedReason("TEMPLATE_VERSION_MISMATCH");
            throw new Error(
              "Template version changed while offline. Conflict review required — do not submit against a mismatched version.",
            );
          }
          await queueOfflineEvidenceCommand({
            bundle: snap.bundle,
            evidence: {
              templateId: requirement.templateId,
              templateVersion: requirement.templateVersion,
              requirementKey: requirement.requirementKey,
              scheduleKind: requirement.scheduleKind,
              cycleStableKey: requirement.cycleStableKey,
              cycleLabel: requirement.cycleLabel,
              windowStartLocal: requirement.windowStartLocal,
              windowEndLocal: requirement.windowEndLocal,
              spaceId: requirement.spaceId,
              assetId: requirement.assetId,
              correctiveActionText: outOfStandardPreview ? correctiveActionText : null,
              values: payload,
            },
          });
          setLocalStatus("SAVED_ON_THIS_TABLET");
          await refreshOffline();
          return;
        }

        await submitUnitEvidenceAction({
          facilityId,
          departmentId,
          unitId,
          templateId: requirement.templateId,
          requirementKey: requirement.requirementKey,
          operationalDateKey: requirement.operationalDateKey,
          scheduleKind: requirement.scheduleKind,
          cycleStableKey: requirement.cycleStableKey,
          cycleLabel: requirement.cycleLabel,
          windowStartLocal: requirement.windowStartLocal,
          windowEndLocal: requirement.windowEndLocal,
          spaceId: requirement.spaceId,
          assetId: requirement.assetId,
          values: payload,
          correctiveActionText: outOfStandardPreview ? correctiveActionText : null,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submit failed.");
      }
    });
  }

  return (
    <section
      className="rounded-md border border-zinc-200 bg-white p-4"
      data-testid="evidence-entry-form"
      data-requirement-key={requirement.requirementKey}
      data-requirement-state={requirement.state}
      data-offline-mode={isOfflineMode ? "true" : "false"}
      data-local-status={localStatus}
    >
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {requirement.purposeType} · {requirement.stateLabel}
        </p>
        <h2 className="text-base font-semibold text-zinc-900">{requirement.templateName}</h2>
        <p className="text-xs text-zinc-600">
          Operational date {requirement.operationalDateKey}
          {requirement.windowStartLocal
            ? ` · ${requirement.windowStartLocal}–${requirement.windowEndLocal ?? ""}`
            : ""}
          {requirement.cycleLabel ? ` · ${requirement.cycleLabel}` : ""}
          {requirement.assetId ? ` · Asset ${requirement.assetId}` : ""}
        </p>
        {requirement.instructions ? (
          <p className="text-sm text-zinc-700">{requirement.instructions}</p>
        ) : null}
      </header>

      <div
        className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
        data-testid="evidence-offline-status"
        role="status"
      >
        {isOfflineMode ? "Offline" : "Online"}
        {pendingLocalCount > 0 ? ` · ${pendingLocalCount} pending on this tablet` : ""}
        {localStatus === "SAVED_ON_THIS_TABLET" ? " · Saved on This Tablet" : ""}
        {localStatus === "SYNCHRONIZING" ? " · Synchronizing" : ""}
        {localStatus === "SYNCHRONIZED" ? " · Synchronized" : ""}
        {localStatus === "CONFLICT" ? " · Conflict review required" : ""}
        {localStatus === "REJECTED" ? ` · Rejected${rejectedReason ? `: ${rejectedReason}` : ""}` : ""}
      </div>

      {localStatus === "CONFLICT" || localStatus === "REJECTED" ? (
        <p
          className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="evidence-conflict-banner"
        >
          {localStatus === "CONFLICT"
            ? "Conflict review required. Pending submission is preserved on this tablet and will not silently overwrite server history."
            : "Rejected command remains visible on this tablet until a supervisor resolves it."}
          {rejectedReason ? ` (${rejectedReason})` : ""}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {requirement.fields.map((field) => (
          <label key={field.fieldKey} className="block space-y-1">
            <span className="text-sm font-medium text-zinc-800">
              {field.label}
              {field.isRequired ? " *" : ""}
              {field.unitLabel ? ` (${field.unitLabel})` : ""}
            </span>
            {field.helpText ? <span className="block text-xs text-zinc-500">{field.helpText}</span> : null}
            {field.fieldType === "LONG_TEXT" || field.fieldType === "OPTIONAL_COMMENT" ? (
              <textarea
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                rows={3}
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              />
            ) : field.fieldType === "YES_NO" ||
              field.fieldType === "PASS_NEEDS_ATTENTION" ||
              field.fieldType === "ATTESTATION" ||
              field.fieldType === "SINGLE_SELECT" ? (
              <select
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              >
                <option value="">Select…</option>
                {field.fieldType === "YES_NO" ? (
                  <>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                  </>
                ) : null}
                {field.fieldType === "PASS_NEEDS_ATTENTION" ? (
                  <>
                    <option value="PASS">Pass</option>
                    <option value="NEEDS_ATTENTION">Needs Attention</option>
                  </>
                ) : null}
                {field.fieldType === "ATTESTATION" ? (
                  <option value="ATTESTED">Attested</option>
                ) : null}
                {field.allowedSelections.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={
                  field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE"
                    ? "number"
                    : field.fieldType === "DATE"
                      ? "date"
                      : field.fieldType === "TIME"
                        ? "time"
                        : "text"
                }
                inputMode={
                  field.fieldType === "NUMBER" || field.fieldType === "TEMPERATURE"
                    ? "decimal"
                    : undefined
                }
                step="any"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                disabled={locked || pending}
                value={values[field.fieldKey] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.fieldKey]: e.target.value }))}
                data-testid={`evidence-field-${field.fieldKey}`}
              />
            )}
          </label>
        ))}
      </div>

      {outOfStandardPreview ? (
        <label className="mt-4 block space-y-1" data-testid="evidence-corrective-action">
          <span className="text-sm font-medium text-amber-900">
            {correctiveRequired ? "Corrective action required" : "Corrective action"}
          </span>
          <textarea
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
            rows={3}
            disabled={locked || pending}
            value={correctiveActionText}
            onChange={(e) => setCorrectiveActionText(e.target.value)}
            data-testid="evidence-corrective-action-text"
          />
        </label>
      ) : null}

      {!locked ? (
        <button
          type="button"
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={submit}
          data-testid="evidence-submit"
        >
          {pending
            ? isOfflineMode
              ? "Saving locally…"
              : "Submitting…"
            : isOfflineMode
              ? "Save on This Tablet"
              : "Submit evidence"}
        </button>
      ) : (
        <p className="mt-4 text-sm text-zinc-600" data-testid="evidence-completed-view">
          {localStatus === "SAVED_ON_THIS_TABLET"
            ? "Saved on This Tablet — will synchronize when online."
            : localStatus === "SYNCHRONIZED"
              ? "Synchronized."
              : `Record ${requirement.stateLabel}`}
          {requirement.recordId ? ` · ${requirement.recordId}` : ""}
        </p>
      )}
    </section>
  );
}
